import { getAdminToken } from './adminAuthService'

/**
 * A session that has expired or been revoked must not surface as a raw server
 * error. Clearing the stale token and sending the visitor to sign in is the
 * only useful response — leaving them staring at "Request failed (401)" reads
 * as a broken site rather than an expired login.
 *
 * The redirect carries where they were, so signing in returns them there.
 */
function handleExpiredSession(path) {
  const isAdminRoute = String(path || '').includes('/api/admin')

  try {
    if (isAdminRoute) {
      localStorage.removeItem('archique_admin_token')
    } else {
      localStorage.removeItem('archique_user_token')
      localStorage.removeItem('archique_user_profile')
    }
  } catch {
    // Storage can be unavailable in private modes; the redirect still applies.
  }

  if (typeof window === 'undefined') {
    return
  }

  const destination = isAdminRoute ? '/captain' : '/login'
  const current = `${window.location.pathname}${window.location.search}`

  // Already on the sign-in screen: redirecting again would loop.
  if (window.location.pathname === destination) {
    return
  }

  const from = current && current !== '/' ? `?from=${encodeURIComponent(current)}` : ''
  window.location.assign(`${destination}${from}`)
}

async function parseApiResponse(response, path, hadToken) {
  const text = await response.text()
  let payload = {}

  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    throw new Error('Server returned an invalid response.')
  }

  if (import.meta.env.DEV) {
    console.log('API RESPONSE:', payload)
  }

  // Only a request that carried a token can have an *expired* session. Sign-in
  // itself answers 401 for a wrong password, and that must keep saying so
  // rather than claiming the session ran out.
  if (response.status === 401 && hadToken) {
    handleExpiredSession(path)
    throw new Error(payload.message || 'Your session has expired. Please sign in again.')
  }

  if (!response.ok || payload.success === false) {
    throw new Error(payload.message || `Request failed (${response.status}).`)
  }

  return payload
}

export async function backendRequest(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
  })

  const authHeader = options.headers?.Authorization || options.headers?.authorization || ''
  const hadToken = /^Bearer\s+\S+/.test(String(authHeader))

  return parseApiResponse(response, path, hadToken)
}

/**
 * A request made as the signed-in customer.
 *
 * Buying requires an account, so the endpoints behind checkout reject requests
 * without a session. The token is read from storage rather than imported from
 * userAuthService, because that module imports this one.
 */
export async function backendUserRequest(path, options = {}) {
  let token = ''

  try {
    token = localStorage.getItem('archique_user_token') || ''
  } catch {
    // Storage unavailable; the server will answer 401 and the caller redirects.
  }

  return backendRequest(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
}

export async function backendAdminRequest(path, options = {}) {
  const token = getAdminToken()

  return backendRequest(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token || ''}`,
      ...(options.headers || {}),
    },
  })
}

export async function createPaymentOrder(selection, { couponCode, customerEmail } = {}) {
  const payloadBody =
    typeof selection === 'number'
      ? { product_id: selection }
      : {
          product_id: Number(selection?.primaryItem?.id || selection?.items?.[0]?.id || 0),
          product_ids: Array.isArray(selection?.items)
            ? selection.items.map((artwork) => Number(artwork.id))
            : undefined,
          combo_id: selection?.comboId || undefined,
          combo_title: selection?.comboTitle || undefined,
          discount_percent: selection?.pricing?.discountPercent || undefined,
          coupon_code: couponCode || undefined,
          customer_email: customerEmail || undefined,
        }
  const payload = await backendUserRequest('/api/create-order', {
    method: 'POST',
    body: JSON.stringify(payloadBody),
  })

  return payload.data?.order
}

export async function verifyPayment(paymentDetails) {
  const payload = await backendRequest('/api/verify-payment', {
    method: 'POST',
    body: JSON.stringify(paymentDetails),
  })

  return payload.data
}

export async function lookupOrderByPaymentId(paymentId) {
  const payload = await backendRequest(
    `/api/orders?payment_id=${encodeURIComponent(paymentId)}`,
  )

  return payload.data
}

export async function lookupOrderByCode(orderCode) {
  const payload = await backendUserRequest(
    `/api/orders/code/${encodeURIComponent(orderCode)}`,
  )

  return payload.data
}

export async function createVerifiedOrder(orderInput) {
  const payload = await backendUserRequest('/api/orders', {
    method: 'POST',
    body: JSON.stringify(orderInput),
  })

  return payload.data?.order
}
