import crypto from 'node:crypto'
import { consumeRateLimitRecord } from './supabaseAdmin.js'
import { sendJson } from './http.js'

// Per-instance fallback store. Only used when the shared DB limiter is
// unreachable (e.g. local dev without migrations). It still provides
// meaningful protection within a single serverless instance.
const store = new Map()

function getKey(ipAddress) {
  return ipAddress || 'unknown'
}

export function getClientIp(req) {
  // Defensive throughout: this runs before anything else on public endpoints,
  // so a request shape without `headers` (or a socket) must never throw and
  // take down the handler.
  const forwardedFor = req?.headers?.['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  return req?.socket?.remoteAddress || req?.connection?.remoteAddress || 'unknown'
}

function consumeInMemory(key, { limit, windowMs }) {
  const normalizedKey = getKey(key)
  const now = Date.now()
  const current = store.get(normalizedKey)

  if (!current || current.resetAt <= now) {
    const next = { count: 1, resetAt: now + windowMs }
    store.set(normalizedKey, next)
    return {
      allowed: true,
      remaining: Math.max(limit - next.count, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  current.count += 1
  store.set(normalizedKey, current)

  return {
    allowed: current.count <= limit,
    remaining: Math.max(limit - current.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
  }
}

/**
 * Shared, serverless-safe rate limiter backed by Postgres.
 *
 * When the database limiter is unavailable the default is to fall back to a
 * per-instance counter, so a database hiccup does not lock everyone out. That
 * fallback is deliberately weaker: instances do not share state, so an
 * attacker spread across N instances effectively gets N times the budget.
 *
 * Pass `failClosed` for anything where that trade is unacceptable — admin
 * authentication above all, where the fallback would turn "5 attempts per 15
 * minutes" into "5 per instance" precisely when monitoring is already
 * degraded. Failing closed costs nothing there: the console cannot do useful
 * work while the database is unreachable anyway.
 */
export async function consumeRateLimit(key, options = {}) {
  try {
    return await consumeRateLimitRecord(getKey(key), options)
  } catch (error) {
    if (options.failClosed) {
      console.error('[rate-limit] limiter unavailable, denying request', {
        key,
        message: error?.message || 'unknown error',
      })

      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(Number(options.windowMs || 60000) / 1000),
        degraded: true,
      }
    }

    return consumeInMemory(key, options)
  }
}

/**
 * Guard a public endpoint. Returns true when the request has been rate limited
 * and a 429 has already been sent, so callers can simply `return`.
 *
 * Every unauthenticated write path should use this: without it a single client
 * can drive unbounded database writes, provider spend (email, payment orders)
 * or CPU on the semantic search.
 */
export async function enforcePublicRateLimit(
  req,
  res,
  { scope, limit, windowMs, message = 'Too many requests. Please slow down and try again shortly.' },
) {
  const result = await consumeRateLimit(`${scope}:${getClientIp(req)}`, { limit, windowMs })

  if (result.allowed) {
    return false
  }

  res.setHeader('Retry-After', String(result.retryAfterSeconds))
  res.statusCode = 429
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(
    JSON.stringify({
      success: false,
      error: 'RATE_LIMITED',
      message,
    }),
  )
  return true
}

/**
 * Guard an authentication endpoint.
 *
 * Limits on two keys at once, because either alone is bypassable:
 *
 *   - by IP, which stops one machine hammering many accounts;
 *   - by the account being targeted, which stops a distributed attempt
 *     spreading across many IPs to grind one specific inbox.
 *
 * The identifier is lowercased and hashed rather than stored raw, so the
 * rate-limit table never becomes a list of which email addresses exist.
 *
 * `failClosed` is on by default here: if the shared limiter is unreachable,
 * falling back to a per-instance counter multiplies the real budget by the
 * number of running instances, which is precisely the wrong behaviour for a
 * credential endpoint.
 */
export async function enforceAuthRateLimit(
  req,
  res,
  {
    scope,
    identifier = '',
    ipLimit = 10,
    identifierLimit = 5,
    windowMs = 15 * 60 * 1000,
    message = 'Too many attempts. Please wait a few minutes and try again.',
  },
) {
  const checks = [consumeRateLimit(`${scope}:ip:${getClientIp(req)}`, {
    limit: ipLimit,
    windowMs,
    failClosed: true,
  })]

  const normalized = String(identifier || '').trim().toLowerCase()
  if (normalized) {
    const digest = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32)
    checks.push(
      consumeRateLimit(`${scope}:id:${digest}`, {
        limit: identifierLimit,
        windowMs,
        failClosed: true,
      }),
    )
  }

  const results = await Promise.all(checks)
  const blocked = results.find((result) => !result.allowed)

  if (!blocked) {
    return false
  }

  res.setHeader('Retry-After', String(blocked.retryAfterSeconds || Math.ceil(windowMs / 1000)))
  sendJson(res, 429, {
    success: false,
    error: 'RATE_LIMITED',
    message,
  })

  return true
}
