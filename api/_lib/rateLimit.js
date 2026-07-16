import { consumeRateLimitRecord } from './supabaseAdmin.js'

// Per-instance fallback store. Only used when the shared DB limiter is
// unreachable (e.g. local dev without migrations). It still provides
// meaningful protection within a single serverless instance.
const store = new Map()

function getKey(ipAddress) {
  return ipAddress || 'unknown'
}

export function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown'
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

// Shared, serverless-safe rate limiter backed by Postgres. Falls back to the
// per-instance store if the DB limiter is unavailable so a DB hiccup never
// locks every user out (fail-open to a weaker-but-present limiter).
export async function consumeRateLimit(key, options) {
  try {
    return await consumeRateLimitRecord(getKey(key), options)
  } catch {
    return consumeInMemory(key, options)
  }
}
