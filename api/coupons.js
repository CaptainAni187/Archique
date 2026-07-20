import { requireAdminAuth } from './_lib/adminSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { validateCoupon } from './_lib/coupons.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import {
  createCoupon,
  deleteCouponById,
  fetchCouponById,
  fetchCoupons,
  updateCouponById,
} from './_lib/supabaseAdmin.js'
import {
  couponPayloadSchema,
  couponValidateSchema,
  sendValidationError,
  validateWithSchema,
} from './_lib/validation.js'

function normalizeCoupon(coupon) {
  return {
    ...coupon,
    discount_value: Number(coupon.discount_value),
    min_order_value: Number(coupon.min_order_value || 0),
    usage_limit: coupon.usage_limit == null ? null : Number(coupon.usage_limit),
    per_customer_limit:
      coupon.per_customer_limit == null ? null : Number(coupon.per_customer_limit),
  }
}

function getCouponId(req) {
  return String(req.query?.id || '').trim()
}

async function handleValidate(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const body = await readJson(req)
  const payload = validateWithSchema(couponValidateSchema, body)
  const result = await validateCoupon({
    code: payload.code,
    email: payload.email,
    subtotal: payload.subtotal,
  })

  if (!result.valid) {
    return sendJson(res, 200, { success: true, data: { valid: false, message: result.message } })
  }

  return sendJson(res, 200, {
    success: true,
    data: {
      valid: true,
      coupon: result.coupon,
    },
  })
}

async function handleList(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const coupons = await fetchCoupons()
  return sendJson(res, 200, { success: true, data: coupons.map(normalizeCoupon) })
}

async function handleCreate(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const body = await readJson(req)
  const payload = validateWithSchema(couponPayloadSchema, body)
  const coupon = await createCoupon({
    ...payload,
    created_by: session.email || 'admin',
  })

  await logAdminActivity(session, {
    action_type: 'coupon_created',
    resource_type: 'coupon',
    resource_id: coupon?.id,
    details: { code: coupon?.code },
  })

  return sendJson(res, 201, { success: true, data: normalizeCoupon(coupon) })
}

async function handleUpdate(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const couponId = getCouponId(req)
  if (!couponId) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_COUPON_ID',
      message: 'A valid coupon id is required.',
    })
  }

  const existing = await fetchCouponById(couponId)
  if (!existing) {
    return sendJson(res, 404, {
      success: false,
      error: 'COUPON_NOT_FOUND',
      message: 'Coupon not found.',
    })
  }

  const body = await readJson(req)
  const payload = validateWithSchema(couponPayloadSchema, body)
  const coupon = await updateCouponById(couponId, payload)

  await logAdminActivity(session, {
    action_type: 'coupon_updated',
    resource_type: 'coupon',
    resource_id: couponId,
    details: { code: coupon?.code },
  })

  return sendJson(res, 200, { success: true, data: normalizeCoupon(coupon) })
}

async function handleDelete(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const couponId = getCouponId(req)
  if (!couponId) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_COUPON_ID',
      message: 'A valid coupon id is required.',
    })
  }

  const existing = await fetchCouponById(couponId)
  if (!existing) {
    return sendJson(res, 404, {
      success: false,
      error: 'COUPON_NOT_FOUND',
      message: 'Coupon not found.',
    })
  }

  await deleteCouponById(couponId)

  await logAdminActivity(session, {
    action_type: 'coupon_deleted',
    resource_type: 'coupon',
    resource_id: couponId,
    details: { code: existing.code },
  })

  return sendJson(res, 200, { success: true, data: { id: couponId } })
}

export default async function handler(req, res) {
  try {
    const action = String(req.query?.action || '').trim().toLowerCase()

    if (action === 'validate') {
      return await handleValidate(req, res)
    }

    if (req.method === 'GET') {
      return await handleList(req, res)
    }

    if (req.method === 'POST') {
      return await handleCreate(req, res)
    }

    if (req.method === 'PUT') {
      return await handleUpdate(req, res)
    }

    if (req.method === 'DELETE') {
      return await handleDelete(req, res)
    }

    return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE'])
  } catch (error) {
    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'COUPON_REQUEST_FAILED',
      message: error.message || 'Unable to process coupon request.',
    })
  }
}
