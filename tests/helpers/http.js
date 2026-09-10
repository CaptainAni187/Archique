export function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
}

/**
 * A stand-in for fetch's Response, headers included.
 *
 * They were omitted while nothing read them; code that counts rows from
 * `Content-Range` does, and a bare object meant a TypeError deep inside the
 * handler rather than a useful failure. `rowCount` sets that header.
 */
function mockResponse(status, text, { rowCount = null } = {}) {
  const headers = new Map()
  if (rowCount !== null) {
    headers.set('content-range', `0-0/${rowCount}`)
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name) => headers.get(String(name).toLowerCase()) ?? null,
    },
    async text() {
      return text
    },
  }
}

export function createJsonResponse(payload, status = 200, options = {}) {
  return mockResponse(status, JSON.stringify(payload), options)
}

export function createEmptyResponse(status = 201, options = {}) {
  return mockResponse(status, '', options)
}

/** A HEAD response carrying only a row count, as PostgREST answers one. */
export function createCountResponse(rowCount) {
  return mockResponse(206, '', { rowCount })
}
