import { reportServerError } from './_lib/errorReporting.js'
import { requireAdminAuth } from './_lib/adminSession.js'
import { requireUserAuth } from './_lib/userSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { validateCoupon } from './_lib/coupons.js'
import { getBackendConfig } from './_lib/env.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { enforcePublicRateLimit } from './_lib/rateLimit.js'
import { notifyAdmin, notifyCustomer, notifyOrderStatusChange } from './_lib/notifications.js'
import {
  getOrderStatusTimestampPatch,
  getOrderStatusTransitionError,
} from './_lib/orderLifecycle.js'
import { createPaymentLog } from './_lib/paymentLogs.js'
import { fetchRazorpayPayment, verifyRazorpaySignature } from './_lib/razorpay.js'
import {
  createCouponRedemption,
  decrementArtworkStock,
  restoreArtworkStock,
  fetchArtworkById,
  fetchComboById,
  fetchLatestOrderCodes,
  fetchOrderByCode,
  fetchOrderById,
  fetchOrderByPaymentId,
  fetchOrders,
  fetchShopSetting,
  supabaseAdminRequest,
  updateOrderById,
  updateOrderStatusIfUnchanged,
  releaseReservationsForOrder,
} from './_lib/supabaseAdmin.js'
import {
  orderCreationSchema,
  orderUpdateSchema,
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

async function getShippingRates() {
  const setting = await fetchShopSetting('shipping_rates').catch(() => null)
  return setting?.value || DEFAULT_SHIPPING_RATES
}

function normalizeOrder(order) {
  return {
    ...order,
    total_amount: Number(order.total_amount),
    advance_amount: Number(order.advance_amount),
    processing_at: order.processing_at || null,
    shipped_at: order.shipped_at || null,
    delivered_at: order.delivered_at || null,
    payment_verified_at: order.payment_verified_at || null,
    razorpay_payment_id: order.razorpay_payment_id || null,
    razorpay_order_id: order.razorpay_order_id || null,
  }
}

/**
 * Tracking is looked up by order code alone, with no sign-in — the buyer
 * follows a link from their receipt. Order codes are sequential and therefore
 * guessable, so this response must never carry anything that would harm the
 * customer if a stranger walked the sequence. Contact details are masked to
 * the minimum that lets the real buyer confirm the order is theirs.
 */
/** First name plus an initial — recognisable to the buyer, of little use in bulk. */
function maskName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) {
    return null
  }

  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0]}.`
}

function maskEmail(value) {
  const email = String(value || '')
  const at = email.indexOf('@')

  if (at < 1) {
    return null
  }

  return `${email[0]}${'•'.repeat(Math.max(3, at - 1))}${email.slice(at)}`
}

function maskPhone(value) {
  const digits = String(value || '').replace(/\D/g, '')

  return digits.length >= 4 ? `••••••${digits.slice(-4)}` : null
}

/** Enough for the buyer to recognise the destination, not enough to find them. */
function maskAddress(value) {
  const address = String(value || '').trim()

  if (!address) {
    return null
  }

  const pincode = address.match(/\b(\d{6})\b/)
  const parts = address
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
  const locality = parts.length > 1 ? parts[parts.length - 1].replace(/\b\d{6}\b/, '').trim() : ''

  return [locality || null, pincode ? pincode[1] : null].filter(Boolean).join(' ') || null
}

function normalizeTrackingOrder(order) {
  return {
    order_code: order.order_code,
    product_title: order.product_title,
    payment_status: order.payment_status || 'pending',
    total_amount: Number(order.total_amount),
    advance_amount: Number(order.advance_amount),
    created_at: order.created_at || null,
    payment_verified_at: order.payment_verified_at || null,
    processing_at: order.processing_at || null,
    shipped_at: order.shipped_at || null,
    delivered_at: order.delivered_at || null,
    courier_name: order.courier_name || null,
    tracking_number: order.tracking_number || null,
    tracking_url: order.tracking_url || null,
    customer_name: maskName(order.customer_name),
    customer_email: maskEmail(order.customer_email),
    customer_phone: maskPhone(order.customer_phone),
    customer_address: maskAddress(order.customer_address),
  }
}

function getOrderId(req) {
  const orderId = req.query?.id
  return Array.isArray(orderId) ? Number(orderId[0]) : Number(orderId)
}

function getAction(req) {
  return String(req.query?.action || '').trim().toLowerCase()
}

function getNextOrderCode(existingCodes) {
  const currentYear = new Date().getFullYear()
  const orderNumbers = existingCodes
    .map((item) => item.order_code)
    .filter((code) => typeof code === 'string' && code.startsWith(`ARC-${currentYear}-`))
    .map((code) => Number(code.split('-').pop()))
    .filter((value) => Number.isInteger(value))

  const nextNumber = (Math.max(0, ...orderNumbers) || 0) + 1
  return `ARC-${currentYear}-${String(nextNumber).padStart(4, '0')}`
}

/**
 * True when PostgREST rejected the write because a column does not exist yet.
 *
 * Order creation is the money path, so it must not depend on a migration
 * having been applied first. If product_ids is missing the insert is retried
 * without it, and starts recording the full selection as soon as the column
 * lands.
 */
function isMissingColumnError(error, column) {
  return error?.code === 'PGRST204' && String(error?.message || '').includes(column)
}

async function createOrderRecord(payload) {
  let body = payload

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const latestCodes = await fetchLatestOrderCodes()
    const orderCode = getNextOrderCode(latestCodes)

    try {
      const response = await supabaseAdminRequest('orders', {
        method: 'POST',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          ...body,
          order_code: orderCode,
        }),
      })

      return response[0]
    } catch (error) {
      // Same tolerance as product_ids: the money path must not depend on a
      // migration having been applied first.
      if (isMissingColumnError(error, 'user_id')) {
        console.warn('[orders] user_id column missing — apply the account migration.')
        const { user_id: _noUserId, ...withoutUserId } = body
        body = withoutUserId
        continue
      }

      if (isMissingColumnError(error, 'product_ids')) {
        console.warn(
          '[orders] product_ids column missing — apply the order-items migration. ' +
            'Cancelling a multi-piece order will only restore its primary artwork until then.',
        )
        const { product_ids: _unused, ...withoutProductIds } = body
        body = withoutProductIds
        continue
      }

      if (error.code === '23505' && error.message.includes('razorpay_payment_id')) {
        const existingOrder = await fetchOrderByPaymentId(payload.razorpay_payment_id)
        if (existingOrder) {
          return existingOrder
        }
      }

      if (error.code === '23505' && error.message.includes('order_code')) {
        continue
      }

      throw error
    }
  }

  throw new Error('Unable to allocate a unique order code. Please retry.')
}

async function loadOrderSelection(validatedBody, { shippingRates, coupon } = {}) {
  const requestedProductIds = Array.isArray(validatedBody.product_ids)
    ? validatedBody.product_ids.map((productId) => Number(productId))
    : [Number(validatedBody.product_id)]
  const uniqueProductIds = [
    ...new Set(
      requestedProductIds.filter((productId) => Number.isInteger(productId) && productId > 0),
    ),
  ]
  const artworks = await Promise.all(uniqueProductIds.map((productId) => fetchArtworkById(productId)))

  if (artworks.some((artwork) => !artwork)) {
    const error = new Error('One or more selected artworks were not found.')
    error.status = 404
    error.error = 'ARTWORK_NOT_FOUND'
    throw error
  }

  const availableArtworks = mergeUniqueArtworks(artworks)
  if (availableArtworks.some((artwork) => !isArtworkAvailable(artwork))) {
    const error = new Error('One or more selected artworks are no longer available.')
    error.status = 409
    error.error = 'ARTWORK_SOLD'
    throw error
  }

  let curatedCombo = null
  const comboId = String(validatedBody.combo_id || '').trim()
  if (comboId) {
    const combo = await fetchComboById(comboId)
    if (!combo || combo.is_active === false) {
      const error = new Error('Selected combo was not found.')
      error.status = 404
      error.error = 'COMBO_NOT_FOUND'
      throw error
    }

    const hydratedCombo = hydrateCombo(combo, availableArtworks)
    if (!hydratedCombo.isAvailable) {
      const error = new Error('This combo is not currently available.')
      error.status = 409
      error.error = 'COMBO_UNAVAILABLE'
      throw error
    }

    if (createArtworkSetKey(hydratedCombo.artwork_ids) !== createArtworkSetKey(uniqueProductIds)) {
      const error = new Error('Selected combo items do not match the order request.')
      error.status = 409
      error.error = 'COMBO_MISMATCH'
      throw error
    }

    curatedCombo = hydratedCombo
  }

  // Discounts and combo titles come only from the curated combo row in the
  // database — never from the request body. `payments.js` computes the amount
  // actually charged the same way, so the two must agree exactly; trusting a
  // client-supplied discount here would make the recorded total disagree with
  // the captured payment (and, if the amount check downstream were ever
  // relaxed, would let a buyer set their own price).
  return buildPurchaseSelection(availableArtworks, {
    comboId: curatedCombo?.id || null,
    comboTitle: curatedCombo?.title || '',
    curatedDiscountPercent: curatedCombo?.discount_percent || 0,
    shippingRates,
    coupon,
    type: availableArtworks.length > 1 ? 'smart-pair' : 'single',
  })
}

async function updateArtworkByIdForRollback(id, payload) {
  const response = await supabaseAdminRequest(`artworks?id=eq.${Number(id)}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation',
    },
    body: JSON.stringify(payload),
  })

  return response?.[0] || null
}

function rollbackArtworkSelection(updatedArtworks) {
  return Promise.allSettled(
    updatedArtworks.map(({ previous }) =>
      updateArtworkByIdForRollback(previous.id, {
        quantity: previous.quantity,
        status: previous.status || 'available',
      }),
    ),
  )
}

// Atomically claims stock for every item in the selection. Returns the list
// of {previous, updated} pairs so the caller can roll everything back if a
// later step (e.g. creating the order row) fails.
async function decrementArtworkSelection(selection) {
  const updatedArtworks = []

  try {
    for (const artwork of selection.items) {
      const updatedArtwork = await decrementArtworkStock(artwork)
      updatedArtworks.push({
        previous: artwork,
        updated: updatedArtwork,
      })
    }
  } catch (error) {
    await rollbackArtworkSelection(updatedArtworks)
    throw error
  }

  return updatedArtworks
}

/**
 * Freeze the bill exactly as charged.
 *
 * An invoice is a record of a transaction, not a view over current data. If it
 * were recomputed from the catalogue, editing an artwork's price would silently
 * rewrite every past receipt. Everything the customer and the studio need to
 * settle a dispute is captured here at the moment of payment.
 */
function buildInvoiceSnapshot({ selection, order, coupon, payment }) {
  const pricing = selection.pricing || {}

  return {
    invoice_number: order.order_code,
    issued_at: new Date().toISOString(),
    currency: 'INR',
    seller: {
      name: 'Archique',
      contact_email: 'archi@archique.in',
      site: 'archique.in',
    },
    bill_to: {
      name: order.customer_name,
      email: order.customer_email,
      phone: order.customer_phone,
      address: order.customer_address,
    },
    line_items: selection.items.map((artwork) => ({
      artwork_id: Number(artwork.id),
      title: artwork.title,
      category: artwork.category || null,
      size: artwork.size || null,
      unit_price: Number(artwork.price || 0),
    })),
    totals: {
      subtotal: Number(pricing.subtotal || 0),
      pairing_discount_percent: Number(pricing.discountPercent || 0),
      pairing_discount_amount: Number(pricing.discountAmount || 0),
      coupon_code: coupon?.code || null,
      coupon_discount_amount: Number(pricing.couponDiscountAmount || 0),
      shipping: Number(pricing.shippingCost || 0),
      total: Number(pricing.totalAmount || 0),
      amount_paid: Number(pricing.advanceAmount || 0),
    },
    payment: {
      provider: 'razorpay',
      payment_id: payment?.id || null,
      method: payment?.method || null,
      captured_at: new Date().toISOString(),
    },
  }
}

async function handleCreateOrder(req, res) {
  // Buying requires an account. The browser redirects to sign-in, but that is
  // a convenience — this is the control, because the endpoint is reachable
  // directly and a payment must never be recorded without a known customer.
  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  const body = await readJson(req)
  const validatedBody = validateWithSchema(orderCreationSchema, body)
  validateWithSchema(paymentVerificationSchema, validatedBody)
  const customerName = validatedBody.customer_name
  const customerPhone = validatedBody.customer_phone
  const customerAddress = validatedBody.customer_address
  const customerEmail = validatedBody.customer_email
  const isGift = validatedBody.is_gift === true
  const giftMessage = isGift ? String(validatedBody.gift_message || '').trim() || null : null
  const giftRecipientName = isGift
    ? String(validatedBody.gift_recipient_name || '').trim() || null
    : null
  const razorpayPaymentId = validatedBody.razorpay_payment_id
  const razorpayOrderId = validatedBody.razorpay_order_id
  const razorpaySignature = validatedBody.razorpay_signature

  const existingOrder = await fetchOrderByPaymentId(razorpayPaymentId)
  if (existingOrder) {
    const normalizedOrder = normalizeOrder(existingOrder)
    await createPaymentLog({
      event_type: 'create_order',
      status: 'duplicate_payment_id',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      order_id: existingOrder.id,
      details: {
        message: 'Duplicate payment ID reused during order creation.',
      },
    })

    return sendJson(res, 200, {
      success: true,
      duplicated: true,
      order: normalizedOrder,
      data: {
        duplicated: true,
        order: normalizedOrder,
      },
    })
  }

  const shippingRates = await getShippingRates()

  // At this point the customer has already paid via Razorpay — never hard-reject
  // the order because a coupon became invalid between payment and this step
  // (e.g. its usage limit was hit by another customer in the last few seconds).
  // If that happens we simply don't apply the coupon here; the payment-amount
  // check further down (which already logs with the payment ID) is what
  // decides whether the order can proceed, so a captured payment is never
  // silently dropped without a trace for the admin to reconcile.
  let appliedCoupon = null
  const couponCode = String(validatedBody.coupon_code || '').trim()
  if (couponCode) {
    const preDiscountSelection = await loadOrderSelection(validatedBody, { shippingRates })
    const couponResult = await validateCoupon({
      code: couponCode,
      email: customerEmail,
      subtotal: preDiscountSelection.pricing.subtotal - preDiscountSelection.pricing.discountAmount,
    })

    if (couponResult.valid) {
      appliedCoupon = couponResult.coupon
    } else {
      await createPaymentLog({
        event_type: 'create_order',
        status: 'coupon_invalid_at_order_creation',
        razorpay_payment_id: razorpayPaymentId,
        razorpay_order_id: razorpayOrderId,
        details: {
          coupon_code: couponCode,
          reason: couponResult.message,
        },
      }).catch(() => null)
    }
  }

  const selection = await loadOrderSelection(validatedBody, { shippingRates, coupon: appliedCoupon })
  const primaryArtwork = selection.primaryItem

  const config = getBackendConfig()
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    throw new Error('Razorpay backend environment variables are not configured.')
  }

  const signatureValid = verifyRazorpaySignature({
    razorpayPaymentId,
    razorpayOrderId,
    razorpaySignature,
    razorpayKeySecret: config.razorpayKeySecret,
  })

  if (!signatureValid) {
    await createPaymentLog({
      event_type: 'create_order',
      status: 'invalid_signature',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      details: {
        product_ids: selection.items.map((artwork) => artwork.id),
      },
    })

    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_SIGNATURE',
      message: 'Payment signature verification failed during order creation.',
    })
  }

  const payment = await fetchRazorpayPayment({
    razorpayPaymentId,
    razorpayKeyId: config.razorpayKeyId,
    razorpayKeySecret: config.razorpayKeySecret,
  })

  if (!['authorized', 'captured'].includes(payment.status)) {
    await createPaymentLog({
      event_type: 'create_order',
      status: 'unverified_payment_state',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      details: {
        payment_status: payment.status || 'unknown',
        product_ids: selection.items.map((artwork) => artwork.id),
      },
    })

    return sendJson(res, 400, {
      success: false,
      error: 'PAYMENT_NOT_VERIFIED',
      message: `Payment is not in a verified state. Current status: ${payment.status}.`,
    })
  }

  const totalAmount = selection.pricing.totalAmount
  const advanceAmount = selection.pricing.advanceAmount
  const expectedAmountInPaise = Math.round(advanceAmount * 100)

  if (Number(payment.amount) !== expectedAmountInPaise || payment.order_id !== razorpayOrderId) {
    await createPaymentLog({
      event_type: 'create_order',
      status: 'payment_mismatch',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      details: {
        expected_amount: expectedAmountInPaise,
        received_amount: Number(payment.amount),
        payment_order_id: payment.order_id || null,
        expected_order_id: razorpayOrderId,
      },
    })

    return sendJson(res, 400, {
      success: false,
      error: 'PAYMENT_MISMATCH',
      message: 'Payment details do not match the selected artwork.',
    })
  }

  // Narrow the window for a duplicate/retried request (e.g. a flaky network
  // resending the same "Resume Confirmation" call) racing itself here: if an
  // order for this exact payment was just created by a concurrent request,
  // stop before claiming stock a second time for it.
  const concurrentOrder = await fetchOrderByPaymentId(razorpayPaymentId)
  if (concurrentOrder) {
    return sendJson(res, 200, {
      success: true,
      duplicated: true,
      order: normalizeOrder(concurrentOrder),
      data: { duplicated: true, order: normalizeOrder(concurrentOrder) },
    })
  }

  // Claim stock atomically BEFORE creating the order row. If two customers
  // both pay for the last unit of a one-of-a-kind artwork at nearly the same
  // moment, whoever loses this compare-and-swap gets a clean, immediate
  // rejection here — with no order ever created for stock that's already
  // gone — rather than an order row that was "confirmed" for a piece that
  // was simultaneously sold to someone else.
  let stockClaim
  try {
    stockClaim = await decrementArtworkSelection(selection)
  } catch (error) {
    await createPaymentLog({
      event_type: 'create_order',
      status: 'artwork_sold_race',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      details: {
        product_ids: selection.items.map((artwork) => artwork.id),
        message: error.message,
      },
    }).catch(() => null)

    return sendJson(res, 409, {
      success: false,
      error: 'ARTWORK_SOLD_RACE',
      message:
        'This artwork was just purchased by another buyer. Your payment was received — our team will contact you to refund it or offer an alternative piece.',
    })
  }

  let createdOrder
  try {
    createdOrder = await createOrderRecord({
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_address: customerAddress,
      customer_email: customerEmail,
      user_id: session.id || session.user_id || null,
      product_id: primaryArtwork.id,
      // Every piece in the order, not just the first. Cancellation reads this
      // to return the right artwork to the catalogue.
      product_ids: selection.items.map((artwork) => Number(artwork.id)),
      product_title: selection.title,
      total_amount: totalAmount,
      advance_amount: advanceAmount,
      payment_status: 'advance_paid',
      razorpay_payment_id: razorpayPaymentId,
      razorpay_order_id: razorpayOrderId,
      razorpay_signature: razorpaySignature,
      payment_provider: 'razorpay',
      payment_verified_at: new Date().toISOString(),
      coupon_code: appliedCoupon?.code || null,
      coupon_discount_amount: selection.pricing.couponDiscountAmount || 0,
      is_gift: isGift,
      gift_message: giftMessage,
      gift_recipient_name: giftRecipientName,
    })
  } catch (error) {
    await rollbackArtworkSelection(stockClaim)
    throw error
  }

  const order = normalizeOrder(createdOrder)

  // The piece is now genuinely sold, so the checkout hold has done its job.
  // Releasing it immediately means an abandoned cart for the same artwork is
  // not blocked for the rest of the TTL.
  await releaseReservationsForOrder(razorpayOrderId).catch(() => null)

  // Stored right after the row exists, so a receipt is available even if the
  // customer closes the tab. Best effort: the payment is already captured and
  // the order recorded, so failing here must not fail the request — it is
  // logged instead, and the invoice can be regenerated from the order.
  try {
    const invoice = buildInvoiceSnapshot({
      selection,
      order: createdOrder,
      coupon: appliedCoupon,
      payment,
    })
    await updateOrderById(createdOrder.id, { invoice })
    createdOrder.invoice = invoice
    order.invoice = invoice
  } catch (error) {
    console.error('[orders] failed to store invoice snapshot', {
      order_id: createdOrder.id,
      message: error?.message || 'unknown error',
    })
  }

  if (appliedCoupon) {
    await createCouponRedemption({
      coupon_id: appliedCoupon.id,
      customer_email: customerEmail,
      order_id: order.id,
      discount_amount: selection.pricing.couponDiscountAmount || 0,
    }).catch((error) => {
      console.warn('[orders] Failed to record coupon redemption:', error.message)
    })
  }

  await createPaymentLog({
    event_type: 'create_order',
    status: 'order_created',
    razorpay_payment_id: razorpayPaymentId,
    razorpay_order_id: razorpayOrderId,
    order_id: order.id,
    details: {
      product_ids: selection.items.map((artwork) => artwork.id),
      product_title: selection.title,
      combo_id: selection.comboId,
      discount_percent: selection.pricing.discountPercent,
    },
  })

  const [adminNotification, customerNotification] = await Promise.allSettled([
    notifyAdmin(order, config),
    notifyCustomer(order, config),
  ])

  return sendJson(res, 201, {
    success: true,
    duplicated: false,
    order,
    notifications: {
      admin:
        adminNotification.status === 'fulfilled'
          ? adminNotification.value
          : { emailStatus: { delivered: false, skipped: false } },
      customer:
        customerNotification.status === 'fulfilled'
          ? customerNotification.value
          : { delivered: false, skipped: false },
    },
    data: {
      duplicated: false,
      order,
      notifications: {
        admin:
          adminNotification.status === 'fulfilled'
            ? adminNotification.value
            : { emailStatus: { delivered: false, skipped: false } },
        customer:
          customerNotification.status === 'fulfilled'
            ? customerNotification.value
            : { delivered: false, skipped: false },
      },
    },
  })
}

async function handleLookupOrders(req, res) {
  const paymentId = String(req.query?.payment_id || '').trim()

  if (!paymentId) {
    const session = await requireAdminAuth(req, res)
    if (!session) {
      return null
    }

    const orders = await fetchOrders()
    return sendJson(res, 200, {
      success: true,
      orders: orders.map(normalizeOrder),
      data: orders.map(normalizeOrder),
    })
  }

  const order = await fetchOrderByPaymentId(paymentId)

  if (!order) {
    return sendJson(res, 404, {
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'No order found for this payment yet.',
    })
  }

  return sendJson(res, 200, {
    success: true,
    order: normalizeOrder(order),
    data: normalizeOrder(order),
  })
}

async function handleLookupOrderByCode(req, res) {
  // Order codes run in sequence, so without a limit the whole year's orders
  // could be walked in a single pass.
  const limited = await enforcePublicRateLimit(req, res, {
    scope: 'order-tracking',
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: 'Too many tracking lookups. Please wait a few minutes and try again.',
  })

  if (limited) {
    return null
  }

  const orderCode = String(req.query?.orderCode || '').trim()

  if (!orderCode) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_ORDER_CODE',
      message: 'A valid order code is required.',
    })
  }

  const order = await fetchOrderByCode(orderCode)

  if (!order) {
    return sendJson(res, 404, {
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'No order found for this order code.',
    })
  }

  return sendJson(res, 200, {
    success: true,
    order: normalizeTrackingOrder(order),
    data: normalizeTrackingOrder(order),
  })
}

/**
 * Every artwork id an order claimed.
 *
 * Orders written before product_ids existed only recorded the primary piece,
 * so fall back to that rather than restoring nothing.
 */
function getOrderArtworkIds(order) {
  const recorded = Array.isArray(order?.product_ids) ? order.product_ids : []
  const ids = recorded.length > 0 ? recorded : [order?.product_id]

  return [...new Set(ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))]
}

async function handleUpdateOrderStatus(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const orderId = getOrderId(req)
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_ORDER_ID',
      message: 'A valid order id is required.',
    })
  }

  const body = await readJson(req)
  const payload = validateWithSchema(orderUpdateSchema, body)
  const existingOrder = await fetchOrderById(orderId)

  if (!existingOrder) {
    return sendJson(res, 404, {
      success: false,
      error: 'ORDER_NOT_FOUND',
      message: 'Order not found.',
    })
  }

  const transitionError = getOrderStatusTransitionError(
    existingOrder.payment_status,
    payload.payment_status,
  )

  if (transitionError) {
    return sendJson(res, 409, {
      success: false,
      error: 'INVALID_STATUS_TRANSITION',
      message: transitionError,
    })
  }

  // Conditional on the status we just read. If another request transitioned
  // this order in between, we did not perform the change and must not run its
  // side effects.
  const statusPatch = getOrderStatusTimestampPatch(
    existingOrder.payment_status,
    payload.payment_status,
  )

  // Shipment details belong to the transition that dispatched the order.
  if (payload.courier_name !== undefined) statusPatch.courier_name = payload.courier_name || null
  if (payload.tracking_number !== undefined) {
    statusPatch.tracking_number = payload.tracking_number || null
  }
  if (payload.tracking_url !== undefined) statusPatch.tracking_url = payload.tracking_url || null

  const updatedOrder = await updateOrderStatusIfUnchanged(
    orderId,
    existingOrder.payment_status,
    statusPatch,
  )

  if (!updatedOrder) {
    const current = await fetchOrderById(orderId)

    return sendJson(res, 409, {
      success: false,
      error: 'ORDER_STATUS_CHANGED',
      message: `This order was updated by someone else. It is now ${
        current?.payment_status || 'in a different state'
      }.`,
    })
  }

  // A cancelled order never completed, so its pieces go back on sale. Guarded
  // on the previous status: re-sending 'cancelled' for an already-cancelled
  // order is a permitted no-op transition, and must not restore stock twice.
  // Reaching here means this request performed the transition, so the side
  // effects run exactly once.
  if (payload.payment_status === 'cancelled' && existingOrder.payment_status !== 'cancelled') {
    const restoredIds = getOrderArtworkIds(existingOrder)
    const restored = await Promise.allSettled(
      restoredIds.map((artworkId) => restoreArtworkStock(artworkId)),
    )

    restored.forEach((result, index) => {
      if (result.status === 'rejected') {
        // The order is already cancelled; failing the request here would leave
        // the admin unable to retry. Surface it loudly instead.
        console.error('[orders] failed to restore stock after cancellation', {
          order_id: orderId,
          artwork_id: restoredIds[index],
          message: result.reason?.message || 'Unknown error',
        })
      }
    })

    await logAdminActivity(session, {
      action_type: 'order_stock_restored',
      resource_type: 'order',
      resource_id: orderId,
      details: { artwork_ids: restoredIds },
    })
  }

  // Tell the buyer their order moved. Best-effort: a mail failure must not
  // stop a status change the studio has already made.
  if (payload.payment_status !== existingOrder.payment_status) {
    const notified = await notifyOrderStatusChange(
      { ...existingOrder, ...updatedOrder },
      getBackendConfig(),
      payload.payment_status,
    ).catch((error) => ({ delivered: false, error: error?.message }))

    if (!notified?.delivered && !notified?.skipped) {
      console.error('[orders] status email not delivered', {
        order_id: orderId,
        next_status: payload.payment_status,
        error: notified?.error || 'provider rejected',
      })
    }
  }

  await logAdminActivity(session, {
    action_type: 'order_status_changed',
    resource_type: 'order',
    resource_id: orderId,
    details: {
      order_code: existingOrder.order_code || null,
      previous_status: existingOrder.payment_status,
      next_status: payload.payment_status,
    },
  })

  return sendJson(res, 200, {
    success: true,
    order: normalizeOrder(updatedOrder),
    data: normalizeOrder(updatedOrder),
  })
}

export default async function handler(req, res) {
  try {
    const action = getAction(req)

    if (req.method === 'POST') {
      return await handleCreateOrder(req, res)
    }

    if (req.method === 'GET' && action === 'code') {
      return await handleLookupOrderByCode(req, res)
    }

    if (req.method === 'GET') {
      return await handleLookupOrders(req, res)
    }

    if ((req.method === 'PATCH' || req.method === 'PUT') && action === 'status') {
      return await handleUpdateOrderStatus(req, res)
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PATCH', 'PUT'])
  } catch (error) {
    // Surfaced rather than left in a log nobody reads.
    await reportServerError(error, { route: 'orders', action: getAction(req) }).catch(
      () => null,
    )

    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'ORDER_REQUEST_FAILED',
      message: error.message || 'Unable to process the order request.',
    })
  }
}
