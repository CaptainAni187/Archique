import { countCouponRedemptions, fetchCouponByCode } from './supabaseAdmin.js'

export function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase()
}

/**
 * The one way an email is written when it identifies a customer.
 *
 * Redemptions used to be stored exactly as the buyer typed them while the
 * per-customer count queried a lowercased copy, so a single capital letter --
 * which autofill preserves -- meant the count matched nothing and the limit was
 * never enforced. Both sides go through here now, and the database rejects
 * anything else.
 */
export function normalizeCustomerEmail(email) {
  return String(email || '').trim().toLowerCase()
}

/** Why a claim was refused, in words a buyer can act on. */
export const COUPON_CLAIM_MESSAGES = {
  not_found: 'This coupon code is not valid.',
  expired: 'This coupon has expired.',
  usage_limit: 'This coupon has reached its usage limit.',
  customer_limit: 'You have already used this coupon.',
}

/**
 * Re-validates a coupon server-side. Never trust a client-supplied discount
 * amount — always call this at both "preview" (checkout) and "charge"
 * (payment/order creation) time, since state (expiry, usage) can change
 * between the two.
 *
 * This answers "would this coupon apply right now"; it does not hold anything.
 * The binding decision is `claimCouponRedemption`, which re-checks the same
 * limits inside a transaction — so a coupon that passes here can still be
 * refused there, and that refusal is the one that counts.
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

  const normalizedEmail = normalizeCustomerEmail(email)
  const { total, byCustomer } = await countCouponRedemptions(coupon.id, normalizedEmail)

  if (coupon.usage_limit != null && total >= Number(coupon.usage_limit)) {
    return { valid: false, message: COUPON_CLAIM_MESSAGES.usage_limit }
  }

  if (
    coupon.per_customer_limit != null &&
    normalizedEmail &&
    byCustomer >= Number(coupon.per_customer_limit)
  ) {
    return { valid: false, message: COUPON_CLAIM_MESSAGES.customer_limit }
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
