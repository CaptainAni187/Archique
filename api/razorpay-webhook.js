import crypto from 'node:crypto'
import { getBackendConfig } from './_lib/env.js'
import { methodNotAllowed, readRawBody, sendJson } from './_lib/http.js'
import { createPaymentLog } from './_lib/paymentLogs.js'
import { fetchOrderByPaymentId, supabaseAdminRequest } from './_lib/supabaseAdmin.js'

// Razorpay signs the raw request body, so the platform body parser must be off.
export const config = {
  api: {
    bodyParser: false,
  },
}

/**
 * Server-to-server payment notifications from Razorpay.
 *
 * Without this, an order only exists if the buyer's browser survives long
 * enough to call back after paying — close the tab, lose signal or have the
 * battery die in the wrong two seconds and the money is captured with no order
 * against it. Razorpay retries this endpoint, so it is the only reliable record
 * that a payment happened.
 *
 * This handler deliberately does NOT create orders. Order creation needs the
 * customer's shipping details, which the webhook payload does not carry.
 * Instead it records every captured payment in `payment_logs` and flags any
 * that has no matching order, so nothing can be silently lost and the admin has
 * an exact list to reconcile.
 *
 * Setup (once the site is deployed):
 *   1. Razorpay Dashboard -> Settings -> Webhooks -> Add New Webhook
 *   2. URL:    https://<your-domain>/api/razorpay-webhook
 *   3. Events: payment.captured, payment.failed, refund.processed
 *   4. Copy the webhook secret into RAZORPAY_WEBHOOK_SECRET in Vercel.
 */
function verifyWebhookSignature(rawBody, signature, secret) {
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = String(signature || '')

  if (received.length !== expected.length) {
    return false
  }

  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))
}

async function markOrderPaid(order, payment) {
  // Only ever moves an order forward; never downgrades one already verified.
  if (order.payment_status === 'paid' || order.payment_verified_at) {
    return false
  }

  await supabaseAdminRequest(`orders?id=eq.${Number(order.id)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      payment_status: 'paid',
      payment_verified_at: new Date().toISOString(),
      razorpay_payment_id: payment.id,
    }),
  })

  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const config_ = getBackendConfig()

  if (!config_.razorpayWebhookSecret) {
    // Fail closed: an unverifiable webhook must never be trusted.
    console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured')
    return sendJson(res, 500, {
      success: false,
      error: 'WEBHOOK_NOT_CONFIGURED',
      message: 'Webhook secret is not configured.',
    })
  }

  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch {
    return sendJson(res, 400, { success: false, error: 'INVALID_BODY' })
  }

  const signature = req.headers['x-razorpay-signature']
  if (!verifyWebhookSignature(rawBody, signature, config_.razorpayWebhookSecret)) {
    console.warn('[razorpay-webhook] signature verification failed')
    return sendJson(res, 401, { success: false, error: 'INVALID_SIGNATURE' })
  }

  let event
  try {
    event = JSON.parse(rawBody)
  } catch {
    return sendJson(res, 400, { success: false, error: 'INVALID_JSON' })
  }

  const eventType = String(event?.event || '')
  const payment = event?.payload?.payment?.entity || null

  try {
    if (payment?.id) {
      const existingOrder = await fetchOrderByPaymentId(payment.id).catch(() => null)

      await createPaymentLog({
        event_type: `webhook:${eventType}`,
        // `orphan_payment` is the case that matters: money captured with no
        // order recorded. It is what the admin reconciliation view surfaces.
        status:
          eventType === 'payment.captured' && !existingOrder
            ? 'orphan_payment'
            : eventType.replace('payment.', ''),
        razorpay_payment_id: payment.id,
        razorpay_order_id: payment.order_id || null,
        details: {
          amount: payment.amount ?? null,
          currency: payment.currency || null,
          method: payment.method || null,
          email: payment.email || null,
          contact: payment.contact || null,
          matched_order_id: existingOrder?.id || null,
          matched_order_code: existingOrder?.order_code || null,
        },
      })

      // The browser callback may not have completed; make the order authoritative.
      if (eventType === 'payment.captured' && existingOrder) {
        const updated = await markOrderPaid(existingOrder, payment)
        if (updated) {
          console.log('[razorpay-webhook] order marked paid from webhook', {
            order_code: existingOrder.order_code,
          })
        }
      }

      if (eventType === 'payment.captured' && !existingOrder) {
        console.error('[razorpay-webhook] CAPTURED PAYMENT WITH NO ORDER', {
          payment_id: payment.id,
          amount: payment.amount,
          email: payment.email,
        })
      }
    }
  } catch (error) {
    // Log and still return 200: Razorpay retries non-2xx, and a storage blip
    // should not trigger an unbounded retry storm. The console error is the
    // signal to investigate.
    console.error('[razorpay-webhook] processing failed', {
      event: eventType,
      message: error?.message || 'unknown',
    })
  }

  // Acknowledge quickly so the provider does not retry a message we accepted.
  return sendJson(res, 200, { success: true, received: eventType })
}
