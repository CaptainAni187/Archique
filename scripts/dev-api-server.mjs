import http from 'node:http'
import { URL } from 'node:url'

const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '127.0.0.1'
const API_ROOT = new URL('../api/', import.meta.url)

function withAction(searchParams, action) {
  if (action) {
    searchParams.set('action', action)
  }

  return searchParams
}

function rewriteApiRequest(url) {
  const rewrittenUrl = new URL(url, 'http://localhost')
  const pathname = rewrittenUrl.pathname
  const searchParams = new URLSearchParams(rewrittenUrl.searchParams)

  let handlerImportUrl = null
  let targetPathname = pathname

  const adminMatch = pathname.match(/^\/api\/admin\/(.+)$/)
  if (adminMatch) {
    handlerImportUrl = new URL('admin.js', API_ROOT).href
  } else if (pathname === '/api/admin') {
    handlerImportUrl = new URL('admin.js', API_ROOT).href
  } else if (pathname === '/api/create-order' || pathname === '/api/payment-order') {
    handlerImportUrl = new URL('payments.js', API_ROOT).href
    targetPathname = '/api/payments'
    withAction(searchParams, 'create-order')
  } else if (pathname === '/api/verify-payment') {
    handlerImportUrl = new URL('payments.js', API_ROOT).href
    targetPathname = '/api/payments'
    withAction(searchParams, 'verify')
  } else if (pathname === '/api/upload-images') {
    handlerImportUrl = new URL('upload.js', API_ROOT).href
    targetPathname = '/api/upload'
  } else {
    const artworkStatusMatch = pathname.match(/^\/api\/artworks\/([^/]+)\/status$/)
    const artworkMatch = pathname.match(/^\/api\/artworks\/([^/]+)$/)
    const orderCodeMatch = pathname.match(/^\/api\/orders\/code\/([^/]+)$/)
    const orderStatusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/)
    const userMatch = pathname.match(/^\/api\/user\/([^/]+)$/)
    const commissionStatusMatch = pathname.match(/^\/api\/commissions\/([^/]+)\/status$/)

    if (artworkStatusMatch) {
      handlerImportUrl = new URL('artworks.js', API_ROOT).href
      targetPathname = '/api/artworks'
      searchParams.set('id', artworkStatusMatch[1])
      withAction(searchParams, 'status')
    } else if (artworkMatch) {
      handlerImportUrl = new URL('artworks.js', API_ROOT).href
      targetPathname = '/api/artworks'
      searchParams.set('id', artworkMatch[1])
    } else if (orderCodeMatch) {
      handlerImportUrl = new URL('orders.js', API_ROOT).href
      targetPathname = '/api/orders'
      searchParams.set('orderCode', orderCodeMatch[1])
      withAction(searchParams, 'code')
    } else if (orderStatusMatch) {
      handlerImportUrl = new URL('orders.js', API_ROOT).href
      targetPathname = '/api/orders'
      searchParams.set('id', orderStatusMatch[1])
      withAction(searchParams, 'status')
    } else if (userMatch) {
      handlerImportUrl = new URL('user.js', API_ROOT).href
      targetPathname = '/api/user'
      withAction(searchParams, userMatch[1])
    } else if (commissionStatusMatch) {
      handlerImportUrl = new URL('commissions.js', API_ROOT).href
      targetPathname = '/api/commissions'
      searchParams.set('id', commissionStatusMatch[1])
      withAction(searchParams, 'status')
    } else {
      const directMatch = pathname.match(/^\/api\/([^/]+)$/)

      if (directMatch) {
        const name = directMatch[1]
        handlerImportUrl = new URL(`${name}.js`, API_ROOT).href
        targetPathname = `/api/${name}`
      }
    }
  }

  if (!handlerImportUrl) {
    return null
  }

  const query = Object.fromEntries(searchParams.entries())
  const rewrittenSearch = searchParams.toString()

  return {
    handlerImportUrl,
    pathname,
    query,
    url: `${targetPathname}${rewrittenSearch ? `?${rewrittenSearch}` : ''}`,
  }
}

function attachResponseHelpers(res) {
  res.status = function status(code) {
    res.statusCode = code
    return res
  }

  res.json = function json(payload) {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }

    res.end(JSON.stringify(payload))
    return res
  }

  return res
}

async function parseRequestBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }

  const contentTypeHeader = String(req.headers['content-type'] || '').toLowerCase()

  // Leave the stream alone for routes that read it themselves.
  //
  // File uploads are parsed by formidable and the Razorpay webhook verifies
  // its signature over the raw bytes; both consume `req` directly. Draining it
  // here leaves them waiting on a stream that has already ended, which hangs
  // the request rather than failing it. Vercel passes the stream through
  // untouched, so this only ever affected local development.
  if (contentTypeHeader.includes('multipart/form-data')) {
    return undefined
  }

  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return undefined
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  if (!rawBody) {
    return undefined
  }

  if (contentTypeHeader.includes('application/json')) {
    return JSON.parse(rawBody)
  }

  return rawBody
}

const server = http.createServer(async (req, res) => {
  if ((req.url || '/') === '/' || (req.url || '').startsWith('/?')) {
    attachResponseHelpers(res)
    return res.status(200).json({
      success: true,
      message: 'Local API dev server is running.',
      usage: 'Use this server through the Vite app at http://localhost:5173 for /api/* requests.',
    })
  }

  const route = rewriteApiRequest(req.url || '/')

  if (!route) {
    attachResponseHelpers(res)
    return res.status(404).json({
      success: false,
      error: 'ROUTE_NOT_FOUND',
      message: 'Local API route not found.',
    })
  }

  try {
    const module = await import(route.handlerImportUrl)
    const handler = module.default

    if (typeof handler !== 'function') {
      throw new Error(`No default handler exported from ${route.handlerImportUrl}.`)
    }

    req.url = route.url
    req.query = route.query
    req.body = await parseRequestBody(req)

    attachResponseHelpers(res)
    await handler(req, res)

    if (!res.writableEnded) {
      res.end()
    }
  } catch (error) {
    attachResponseHelpers(res)

    if (error instanceof SyntaxError) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_JSON',
        message: 'Request body must be valid JSON.',
      })
    }

    return res.status(500).json({
      success: false,
      error: 'LOCAL_API_SERVER_ERROR',
      message: error.message || 'Unable to process local API request.',
    })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`Local API dev server listening on http://${HOST}:${PORT}`)
})
