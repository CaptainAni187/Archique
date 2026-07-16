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

function applySecurityHeaders(res) {
  // Defensive headers for every API response. The API returns sensitive data,
  // so it must never be cached, framed, or MIME-sniffed.
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  } catch {
    // Headers may already be sent in edge cases; ignore.
  }
}

export function sendJson(res, statusCode, payload) {
  applySecurityHeaders(res)
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
