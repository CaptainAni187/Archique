import { requireAdminAuth } from './_lib/adminSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { validateCoupon } from './_lib/coupons.js'
import { getBackendConfig } from './_lib/env.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { notifyAdmin, notifyCustomer } from './_lib/notifications.js'
import {
  getOrderStatusTimestampPatch,
  getOrderStatusTransitionError,
} from './_lib/orderLifecycle.js'
import { createPaymentLog } from './_lib/paymentLogs.js'
import { fetchRazorpayPayment, verifyRazorpaySignature } from './_lib/razorpay.js'
import {
  createCouponRedemption,
  decrementArtworkStock,
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
    customer_name: order.customer_name || null,
    customer_email: order.customer_email || null,
    customer_phone: order.customer_phone || null,
    customer_address: order.customer_address || null,
    razorpay_payment_id: order.razorpay_payment_id || null,
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

async function createOrderRecord(payload) {
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
          ...payload,
          order_code: orderCode,
        }),
      })

      return response[0]
    } catch (error) {
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

  return buildPurchaseSelection(availableArtworks, {
    comboId: curatedCombo?.id || null,
    comboTitle: curatedCombo?.title || String(validatedBody.combo_title || '').trim(),
    curatedDiscountPercent:
      curatedCombo?.discount_percent || Number(validatedBody.discount_percent || 0),
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

async function handleCreateOrder(req, res) {
  const body = await readJson(req)
  const validatedBody = validateWithSchema(orderCreationSchema, body)
  validateWithSchema(paymentVerificationSchema, validatedBody)
  const customerName = validatedBody.customer_name
  const customerPhone = validatedBody.customer_phone
  const customerAddress = validatedBody.customer_address
  const customerEmail = validatedBody.customer_email
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
      product_id: primaryArtwork.id,
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
    })
  } catch (error) {
    await rollbackArtworkSelection(stockClaim)
    throw error
  }

  const order = normalizeOrder(createdOrder)

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

  const updatedOrder = await updateOrderById(
    orderId,
    getOrderStatusTimestampPatch(existingOrder.payment_status, payload.payment_status),
  )

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
