import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCountResponse,
  createEmptyResponse,
  createJsonResponse,
  createMockResponse,
} from './helpers/http.js'

/**
 * A coupon's limits are only worth having if they cannot be walked around.
 *
 * Three faults let them be. The redemption was stored with the email exactly as
 * typed while the limit was counted against a lowercased copy, so one capital
 * letter defeated "one per customer" every time. The limits were read long
 * before the redemption was written, with nothing atomic in between. And the
 * write happened after the order already existed, with its failure swallowed,
 * so a coupon could be spent and never recorded.
 *
 * The claim itself is enforced in the database (see
 * supabase/migrations/20260910_archique_coupon_redemption_integrity.sql, which
 * holds a lock on the coupon row for the whole decision). What is covered here
 * is the wiring: that the claim is asked for before the customer pays, that a
 * refusal stops the checkout, and that an order confirms a claim rather than
 * inventing one.
 */
describe('coupon redemption', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_URL = 'https://supabase.example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
    process.env.USER_SESSION_SECRET = 'test-user-session-secret-0123456789abcdef'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('writes and reads the customer email the same way', async () => {
    const { normalizeCustomerEmail } = await import('../api/_lib/coupons.js')

    // Autofill preserves the case a buyer typed; the count used to look for a
    // lowercased copy and find nothing, so the limit never applied.
    expect(normalizeCustomerEmail('  Ada@Example.COM ')).toBe('ada@example.com')
    expect(normalizeCustomerEmail('ada@example.com')).toBe('ada@example.com')
    expect(normalizeCustomerEmail(null)).toBe('')
  })

  it('asks the database to decide, rather than deciding and then writing', async () => {
    let rpcBody = null
    global.fetch = vi.fn(async (url, options = {}) => {
      if (String(url).includes('/rest/v1/rpc/claim_coupon_redemption')) {
        rpcBody = JSON.parse(options.body)
        return createJsonResponse('ok')
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const { claimCouponRedemption } = await import('../api/_lib/supabaseAdmin.js')
    const result = await claimCouponRedemption({
      couponId: 'c-1',
      email: 'Ada@Example.com',
      token: 'tok-1',
    })

    expect(result).toBe('ok')
    expect(rpcBody).toMatchObject({ p_coupon_id: 'c-1', p_token: 'tok-1' })
  })

  it.each([
    ['usage_limit', 'This coupon has reached its usage limit.'],
    ['customer_limit', 'You have already used this coupon.'],
  ])('stops checkout when the database refuses the claim (%s)', async (reason, message) => {
    const released = []

    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)

      if (value.includes('/rest/v1/artworks?select=*&id=eq.1&limit=1')) {
        return createJsonResponse([
          { id: 1, title: 'Test Artwork', price: 5000, status: 'available', quantity: 1 },
        ])
      }
      if (value.includes('/rest/v1/rpc/release_expired_reservations')) {
        return createJsonResponse(0)
      }
      if (value.includes('/rest/v1/artwork_reservations') && options.method === 'POST') {
        return createJsonResponse([{ id: 1 }])
      }
      if (value.includes('/rest/v1/coupons?select=*')) {
        return createJsonResponse([
          { id: 'c-1', code: 'LAUNCH10', discount_type: 'percent', discount_value: 10, is_active: true },
        ])
      }
      // Nothing is held yet, so the preview check passes and only the claim refuses.
      if (value.includes('/rest/v1/coupon_redemptions')) {
        return createCountResponse(0)
      }
      if (value.includes('/rest/v1/rpc/claim_coupon_redemption')) {
        return createJsonResponse(reason)
      }
      if (value.includes('/rest/v1/rpc/release_coupon_redemptions')) {
        released.push('coupon')
        return createJsonResponse(1)
      }
      if (value.includes('/rest/v1/artwork_reservations') && options.method === 'PATCH') {
        released.push('artwork')
        return createEmptyResponse(200)
      }
      if (value.includes('/rest/v1/shop_settings')) {
        return createJsonResponse([])
      }
      return createJsonResponse([])
    })

    const { default: handler } = await import('../api/payments.js')
    const { createUserToken } = await import('../api/_lib/userSession.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'POST',
        url: '/api/payments/create-order',
        query: { action: 'create-order' },
        headers: { authorization: `Bearer ${createUserToken({ id: 42, email: 'ada@example.com' })}` },
        body: {
          product_id: 1,
          customer_email: 'ada@example.com',
          coupon_code: 'LAUNCH10',
        },
      },
      res,
    )

    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('COUPON_INVALID')
    expect(res.body.message).toBe(message)
    // Refusing must not leave the piece — or the coupon — held for the full TTL.
    expect(released).toContain('artwork')
    expect(released).toContain('coupon')
    // No Razorpay order was created, so nothing was charged.
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('api.razorpay.com/v1/orders'),
      expect.anything(),
    )
  })

  it('confirms the existing claim when the order is written, and never creates one', async () => {
    const paymentId = 'pay_123'
    const razorpayOrderId = 'order_123'
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest('hex')

    const calls = { confirm: 0, insertRedemption: 0 }

    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)

      if (value.includes('/rest/v1/orders?select=*&razorpay_payment_id=eq.pay_123')) {
        return createJsonResponse([])
      }
      if (value.includes('/rest/v1/artworks?select=*&id=eq.1&limit=1')) {
        return createJsonResponse([
          { id: 1, title: 'Test Artwork', price: 5000, status: 'available', quantity: 1 },
        ])
      }
      if (value === 'https://api.razorpay.com/v1/payments/pay_123') {
        return createJsonResponse({
          id: paymentId,
          status: 'captured',
          amount: 570000,
          order_id: razorpayOrderId,
        })
      }
      if (value.includes('/rest/v1/coupons?select=*')) {
        return createJsonResponse([
          { id: 'c-1', code: 'LAUNCH10', discount_type: 'percent', discount_value: 10, is_active: true },
        ])
      }
      if (value.includes('/rest/v1/rpc/confirm_coupon_redemption')) {
        calls.confirm += 1
        return createJsonResponse(1)
      }
      if (value.includes('/rest/v1/coupon_redemptions') && options.method === 'POST') {
        calls.insertRedemption += 1
        return createJsonResponse([{ id: 1 }])
      }
      if (value.includes('/rest/v1/coupon_redemptions')) {
        return createCountResponse(0)
      }
      if (value.includes('/rest/v1/artworks?id=eq.1') && options.method === 'PATCH') {
        const payload = JSON.parse(options.body)
        return createJsonResponse([{ id: 1, title: 'Test Artwork', price: 5000, ...payload }])
      }
      if (value.includes('/rest/v1/orders?select=order_code')) {
        return createJsonResponse([])
      }
      if (value.includes('/rest/v1/orders') && options.method === 'POST') {
        return createJsonResponse([{ id: 42, ...JSON.parse(options.body) }], 201)
      }
      return createJsonResponse([])
    })

    const { default: handler } = await import('../api/orders.js')
    const { createUserToken } = await import('../api/_lib/userSession.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'POST',
        headers: { authorization: `Bearer ${createUserToken({ id: 42, email: 'ada@example.com' })}` },
        body: {
          product_id: 1,
          customer_name: 'Ada Lovelace',
          customer_phone: '+919812345678',
          customer_address: '123 Main Street',
          customer_email: 'ada@example.com',
          coupon_code: 'LAUNCH10',
          razorpay_payment_id: paymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: signature,
        },
      },
      res,
    )

    expect(res.statusCode).toBe(201)
    expect(calls.confirm).toBe(1)
    // The redemption was claimed before payment; creating one here would mean
    // the limits were never enforced at the point the discount was granted.
    expect(calls.insertRedemption).toBe(0)
  })
})
