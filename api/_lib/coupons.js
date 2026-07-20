import { countCouponRedemptions, fetchCouponByCode } from './supabaseAdmin.js'

export function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase()
}

/**
 * Re-validates a coupon server-side. Never trust a client-supplied discount
 * amount — always call this at both "preview" (checkout) and "charge"
 * (payment/order creation) time, since state (expiry, usage) can change
 * between the two.
 *
 * @returns {{ valid: true, coupon: { code, label, type, value } } | { valid: false, message: string }}
 */
export async function validateCoupon({ code, email, subtotal }) {
  const normalizedCode = normalizeCouponCode(code)
  if (!normalizedCode) {
    return { valid: false, message: 'Enter a coupon code.' }
  }

  const coupon = await fetchCouponByCode(normalizedCode)
  if (!coupon || coupon.is_active === false) {
    return { valid: false, message: 'This coupon code is not valid.' }
  }

  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
    return { valid: false, message: 'This coupon has expired.' }
  }

  const minOrderValue = Number(coupon.min_order_value || 0)
  if (minOrderValue > 0 && Number(subtotal) < minOrderValue) {
    return {
      valid: false,
      message: `This coupon requires a minimum order of Rs. ${minOrderValue.toLocaleString()}.`,
    }
  }

  const normalizedEmail = String(email || '').trim().toLowerCase()
  const { total, byCustomer } = await countCouponRedemptions(coupon.id, normalizedEmail)

  if (coupon.usage_limit != null && total >= Number(coupon.usage_limit)) {
    return { valid: false, message: 'This coupon has reached its usage limit.' }
  }

  if (
    coupon.per_customer_limit != null &&
    normalizedEmail &&
    byCustomer >= Number(coupon.per_customer_limit)
  ) {
    return { valid: false, message: 'You have already used this coupon.' }
  }

  return {
    valid: true,
    coupon: {
      id: coupon.id,
      code: coupon.code,
      label: coupon.label || '',
      type: coupon.discount_type,
      value: Number(coupon.discount_value),
    },
  }
}
