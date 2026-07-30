/**
 * The exact bytes of the request body, before any JSON parsing.
 *
 * Provider webhooks sign the raw payload, so re-serialising a parsed object
 * would change the bytes (key order, whitespace) and break verification. Any
 * route using this must also disable Vercel's body parser:
 *   export const config = { api: { bodyParser: false } }
 */
export async function readRawBody(req) {
  if (typeof req.body === 'string') {
    return req.body
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body.toString('utf8')
  }

  const chunks = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }

  if (typeof req.body === 'string' && req.body.length > 0) {
    return JSON.parse(req.body)
  }

  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody ? JSON.parse(rawBody) : {}
}

function applySecurityHeaders(res, cacheControl) {
  // Defensive headers for every API response. Anything personalised or
  // sensitive stays `no-store`; only explicitly public, non-personalised reads
  // opt into caching via sendPublicJson.
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', cacheControl || 'no-store')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  } catch {
    // Headers may already be sent in edge cases; ignore.
  }
}

export function sendJson(res, statusCode, payload) {
  applySecurityHeaders(res)
  res.status(statusCode).json(payload)
}

/**
 * For public, identical-for-everyone reads (the catalogue, testimonials).
 *
 * The CDN serves a cached copy for `sMaxAge` seconds and may keep serving a
 * stale one for `staleWhileRevalidate` while it refreshes in the background, so
 * a burst of traffic collapses into a single origin hit. Never use this for
 * anything user-specific — it would be cached and served to other visitors.
 */
export function sendPublicJson(
  res,
  statusCode,
  payload,
  { sMaxAge = 60, staleWhileRevalidate = 300 } = {},
) {
  applySecurityHeaders(
    res,
    `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
  )
  res.status(statusCode).json(payload)
}

export function unauthorized(res, message = 'Unauthorized.') {
  return sendJson(res, 401, {
    success: false,
    error: 'UNAUTHORIZED',
    message,
  })
}

export function forbidden(res, message = 'Forbidden.') {
  return sendJson(res, 403, {
    success: false,
    error: 'FORBIDDEN',
    message,
  })
}

export function methodNotAllowed(res, allowedMethods) {
  res.setHeader('Allow', allowedMethods.join(', '))
  return sendJson(res, 405, {
    success: false,
    error: 'METHOD_NOT_ALLOWED',
    message: `Method not allowed. Use ${allowedMethods.join(', ')}.`,
  })
}
