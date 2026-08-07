import crypto from 'node:crypto'
import { getBackendConfig, requireConfigValues } from './_lib/env.js'
import { validateCoupon } from './_lib/coupons.js'
import { methodNotAllowed, readJson, readRawBody, sendJson } from './_lib/http.js'
import { enforcePublicRateLimit } from './_lib/rateLimit.js'
import { createPaymentLog } from './_lib/paymentLogs.js'
import {
  createRazorpayOrder,
  fetchRazorpayPayment,
  verifyRazorpaySignature,
} from './_lib/razorpay.js'
import {
  fetchArtworkById,
  fetchComboById,
  fetchOrderByPaymentId,
  fetchShopSetting,
  supabaseAdminRequest,
} from './_lib/supabaseAdmin.js'
import {
  paymentVerificationSchema,
  sendValidationError,
  validateWithSchema,
} from './_lib/validation.js'
import {
  buildPurchaseSelection,
  createArtworkSetKey,
  hydrateCombo,
  isArtworkAvailable,
  mergeUniqueArtworks,
} from '../src/utils/comboPricing.js'

const DEFAULT_SHIPPING_RATES = { canvas: 1200, sketch: 350 }

function getAction(req) {
  return String(req.query?.action || '').trim().toLowerCase()
}

async function getShippingRates() {
  const setting = await fetchShopSetting('shipping_rates').catch(() => null)
  return setting?.value || DEFAULT_SHIPPING_RATES
}

async function handleCreatePaymentOrder(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const body = await readJson(req)
  const requestedProductIds = Array.isArray(body.product_ids)
    ? body.product_ids.map((productId) => Number(productId))
    : [Number(body.product_id)]
  const uniqueProductIds = [...new Set(requestedProductIds.filter((productId) => Number.isInteger(productId) && productId > 0))]

  if (uniqueProductIds.length === 0 || uniqueProductIds.length > 5) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_PRODUCT_SELECTION',
      message: 'A valid selection of 1 to 5 artworks is required.',
    })
  }

  const artworks = await Promise.all(uniqueProductIds.map((productId) => fetchArtworkById(productId)))
  if (artworks.some((artwork) => !artwork)) {
    return sendJson(res, 404, {
      success: false,
      error: 'ARTWORK_NOT_FOUND',
      message: 'One or more selected artworks were not found.',
    })
  }

  const availableArtworks = mergeUniqueArtworks(artworks)
  if (availableArtworks.some((artwork) => !isArtworkAvailable(artwork))) {
    return sendJson(res, 409, {
      success: false,
      error: 'ARTWORK_UNAVAILABLE',
      message: 'One or more selected artworks are no longer available.',
    })
  }

  let curatedCombo = null
  const comboId = String(body.combo_id || '').trim()
  if (comboId) {
    const combo = await fetchComboById(comboId)
    if (!combo || combo.is_active === false) {
      return sendJson(res, 404, {
        success: false,
        error: 'COMBO_NOT_FOUND',
        message: 'Selected combo was not found.',
      })
    }

    const hydratedCombo = hydrateCombo(combo, availableArtworks)
    if (!hydratedCombo.isAvailable) {
      return sendJson(res, 409, {
        success: false,
        error: 'COMBO_UNAVAILABLE',
        message: 'This combo is not currently available.',
      })
    }

    if (createArtworkSetKey(hydratedCombo.artwork_ids) !== createArtworkSetKey(uniqueProductIds)) {
      return sendJson(res, 409, {
        success: false,
        error: 'COMBO_MISMATCH',
        message: 'Selected combo items do not match the request.',
      })
    }

    curatedCombo = hydratedCombo
  }

  const shippingRates = await getShippingRates()

  let appliedCoupon = null
  const couponCode = String(body.coupon_code || '').trim()
  if (couponCode) {
    const preDiscountSelection = buildPurchaseSelection(availableArtworks, {
      comboId: curatedCombo?.id || null,
      comboTitle: curatedCombo?.title || '',
      curatedDiscountPercent: curatedCombo?.discount_percent || 0,
      shippingRates,
      type: availableArtworks.length > 1 ? 'smart-pair' : 'single',
    })
    const couponResult = await validateCoupon({
      code: couponCode,
      email: body.customer_email,
      subtotal: preDiscountSelection.pricing.subtotal - preDiscountSelection.pricing.discountAmount,
    })

    if (!couponResult.valid) {
      return sendJson(res, 400, {
        success: false,
        error: 'COUPON_INVALID',
        message: couponResult.message,
      })
    }

    appliedCoupon = couponResult.coupon
  }

  const selection = buildPurchaseSelection(availableArtworks, {
    comboId: curatedCombo?.id || null,
    comboTitle: curatedCombo?.title || '',
    curatedDiscountPercent: curatedCombo?.discount_percent || 0,
    shippingRates,
    coupon: appliedCoupon,
    type: availableArtworks.length > 1 ? 'smart-pair' : 'single',
  })
  const amountInPaise = Math.round(selection.pricing.advanceAmount * 100)

  // A coupon (or a combination of discounts) that brings the payable amount
  // to zero or below can't go through Razorpay, which requires a positive
  // amount. Fail with a clear message instead of a raw provider error.
  if (amountInPaise <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_PAYABLE_AMOUNT',
      message: 'This discount brings the order to zero, which cannot be processed as a payment.',
    })
  }

  const config = getBackendConfig()

  requireConfigValues({
    RAZORPAY_KEY_ID: config.razorpayKeyId,
    RAZORPAY_KEY_SECRET: config.razorpayKeySecret,
  })

  const razorpayOrder = await createRazorpayOrder({
    amountInPaise,
    receipt: `arc-${uniqueProductIds[0]}-${Date.now()}`.slice(0, 40),
    notes: {
      product_ids: uniqueProductIds.join(','),
      product_title: selection.title,
      combo_id: curatedCombo?.id || '',
    },
    razorpayKeyId: config.razorpayKeyId,
    razorpayKeySecret: config.razorpayKeySecret,
  })

  await createPaymentLog({
    event_type: 'payment_order_created',
    status: 'created',
    razorpay_order_id: razorpayOrder.id,
    details: {
      product_ids: uniqueProductIds,
      product_title: selection.title,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    },
  })

  const orderSummary = {
    id: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
  }
  const productSummary = {
    id: uniqueProductIds[0],
    title: selection.title,
    itemIds: uniqueProductIds,
    comboId: curatedCombo?.id || null,
    discountPercent: selection.pricing.discountPercent,
    discountAmount: selection.pricing.discountAmount,
    couponCode: appliedCoupon?.code || null,
    couponDiscountAmount: selection.pricing.couponDiscountAmount,
    shippingCost: selection.pricing.shippingCost,
    totalAmount: selection.pricing.totalAmount,
    advanceAmount: selection.pricing.advanceAmount,
  }

  return sendJson(res, 200, {
    success: true,
    order: orderSummary,
    product: productSummary,
    data: {
      order: orderSummary,
      product: productSummary,
    },
  })
}

async function handleVerifyPayment(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const body = await readJson(req)
  const validatedBody = validateWithSchema(paymentVerificationSchema, body)
  const razorpayPaymentId = validatedBody.razorpay_payment_id
  const razorpayOrderId = validatedBody.razorpay_order_id
  const razorpaySignature = validatedBody.razorpay_signature

  const existingOrder = await fetchOrderByPaymentId(razorpayPaymentId)
  if (existingOrder) {
    await createPaymentLog({
      event_type: 'verify_payment',
      status: 'duplicate_payment_id',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      order_id: existingOrder.id,
      details: {
        message: 'Payment ID has already been used for an order.',
      },
    })

    return sendJson(res, 409, {
      success: false,
      verified: false,
      error: 'PAYMENT_ALREADY_USED',
      message: 'This payment has already been used.',
    })
  }

  const config = getBackendConfig()
  requireConfigValues({
    RAZORPAY_KEY_ID: config.razorpayKeyId,
    RAZORPAY_KEY_SECRET: config.razorpayKeySecret,
  })

  const signatureValid = verifyRazorpaySignature({
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
    razorpayKeySecret: config.razorpayKeySecret,
  })

  if (!signatureValid) {
    await createPaymentLog({
      event_type: 'verify_payment',
      status: 'invalid_signature',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      details: {
        message: 'Payment signature verification failed.',
      },
    })

    return sendJson(res, 400, {
      success: false,
      verified: false,
      error: 'INVALID_SIGNATURE',
      message: 'Payment signature verification failed.',
    })
  }

  const payment = await fetchRazorpayPayment({
    razorpayPaymentId,
    razorpayKeyId: config.razorpayKeyId,
    razorpayKeySecret: config.razorpayKeySecret,
  })

  const paymentStatus = payment.status || 'unknown'
  const verified = ['authorized', 'captured'].includes(paymentStatus)

  await createPaymentLog({
    event_type: 'verify_payment',
    status: verified ? 'verified' : 'unverified_payment_state',
    razorpay_payment_id: razorpayPaymentId,
    razorpay_order_id: razorpayOrderId,
    details: {
      payment_status: paymentStatus,
      amount: payment.amount ?? null,
    },
  })

  return sendJson(res, verified ? 200 : 400, {
    success: verified,
    verified,
    paymentStatus,
    ...(verified
      ? {
          data: {
            verified,
            paymentStatus,
            message: 'Payment verified successfully.',
          },
        }
      : {
          error: 'PAYMENT_NOT_VERIFIED',
          message: `Payment is not in a verified state. Current status: ${paymentStatus}.`,
        }),
  })
}

// Razorpay signs webhook payloads over the raw request body, so the platform
// body parser is disabled for this route. readJson falls back to reading the
// stream itself, so the create-order and verify actions are unaffected.
export const config = {
  api: {
    bodyParser: false,
  },
}

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

async function handleRazorpayWebhook(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const cfg = getBackendConfig()

  if (!cfg.razorpayWebhookSecret) {
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
  if (!verifyWebhookSignature(rawBody, signature, cfg.razorpayWebhookSecret)) {
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

export default async function handler(req, res) {
  try {
    const action = getAction(req)

    // Provider webhooks are authenticated by signature and are retried on
    // failure, so they must never be rate limited — a 429 would silently drop a
    // payment notification.
    if (action === 'webhook') {
      return await handleRazorpayWebhook(req, res)
    }

    // Each create-order call opens a real order with the payment provider,
    // so it must not be freely scriptable.
    const limited = await enforcePublicRateLimit(req, res, {
      scope: `payments-${action || 'unknown'}`,
      limit: 20,
      windowMs: 10 * 60 * 1000,
      message: 'Too many payment attempts. Please wait a few minutes and try again.',
    })
    if (limited) {
      return null
    }

    if (action === 'create-order') {
      return await handleCreatePaymentOrder(req, res)
    }

    if (action === 'verify') {
      return await handleVerifyPayment(req, res)
    }

    return sendJson(res, 404, {
      success: false,
      error: 'ROUTE_NOT_FOUND',
      message: 'Payment route not found.',
    })
  } catch (error) {
    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'PAYMENT_REQUEST_FAILED',
      message: error.message || 'Unable to process payment request.',
    })
  }
}
