import crypto from 'node:crypto'

function getBasicAuthHeader(keyId, keySecret) {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  return `Basic ${credentials}`
}

async function parseRazorpayResponse(response) {
  const text = await response.text()
  const payload = text ? JSON.parse(text) : {}

  if (!response.ok) {
    const message =
      payload.error?.description ||
      payload.error?.reason ||
      payload.error?.code ||
      'Razorpay request failed.'

    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return payload
}

export function verifyRazorpaySignature({
  razorpayPaymentId,
  razorpayOrderId,
  razorpaySignature,
  razorpayKeySecret,
}) {
  const expectedSignature = crypto
    .createHmac('sha256', razorpayKeySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex')

  const received = String(razorpaySignature || '')
  // Constant-time comparison to avoid leaking the signature via timing.
  if (received.length !== expectedSignature.length) {
    return false
  }
  return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(received))
}

export async function createRazorpayOrder({
  amountInPaise,
  receipt,
  notes,
  razorpayKeyId,
  razorpayKeySecret,
}) {
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(razorpayKeyId, razorpayKeySecret),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: 'INR',
      receipt,
      notes,
    }),
  })

  return parseRazorpayResponse(response)
}

export async function fetchRazorpayPayment({
  razorpayPaymentId,
  razorpayKeyId,
  razorpayKeySecret,
}) {
  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpayPaymentId)}`,
    {
      headers: {
        Authorization: getBasicAuthHeader(razorpayKeyId, razorpayKeySecret),
      },
    },
  )

  return parseRazorpayResponse(response)
}
