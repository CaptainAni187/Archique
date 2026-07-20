import crypto from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyResponse, createJsonResponse, createMockResponse } from './helpers/http.js'

describe('order creation handler', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_URL = 'https://supabase.example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
    process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an order after backend signature verification', async () => {
    const paymentId = 'pay_123'
    const razorpayOrderId = 'order_123'
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${paymentId}`)
      .digest('hex')

    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)

      if (value.includes('/rest/v1/orders?select=*&razorpay_payment_id=eq.pay_123')) {
        return createJsonResponse([])
      }

      if (value.includes('/rest/v1/artworks?select=*&id=eq.1&limit=1')) {
        return createJsonResponse([
          {
            id: 1,
            title: 'Test Artwork',
            price: 5000,
            status: 'available',
            quantity: 1,
          },
        ])
      }

      if (value === 'https://api.razorpay.com/v1/payments/pay_123') {
        return createJsonResponse({
          id: paymentId,
          status: 'captured',
          // Full payment is collected upfront: Rs. 5000 artwork + Rs. 1200 shipping.
          amount: 620000,
          order_id: razorpayOrderId,
        })
      }

      if (value.includes('/rest/v1/orders?select=order_code')) {
        return createJsonResponse([])
      }

      if (value.includes('/rest/v1/orders') && options.method === 'POST') {
        const payload = JSON.parse(options.body)
        return createJsonResponse([{ id: 42, ...payload }], 201)
      }

      if (value.includes('/rest/v1/artworks?id=eq.1') && options.method === 'PATCH') {
        const payload = JSON.parse(options.body)
        return createJsonResponse([
          {
            id: 1,
            title: 'Test Artwork',
            price: 5000,
            status: payload.status,
            quantity: payload.quantity,
          },
        ])
      }

      if (value.includes('/rest/v1/payment_logs')) {
        return createEmptyResponse(201)
      }

      throw new Error(`Unexpected fetch: ${value}`)
    })

    const { default: handler } = await import('../api/orders.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'POST',
        body: {
          product_id: 1,
          customer_name: 'Ada Lovelace',
          customer_phone: '+911234567890',
          customer_address: '123 Main Street',
          customer_email: 'ada@example.com',
          razorpay_payment_id: paymentId,
          razorpay_order_id: razorpayOrderId,
          razorpay_signature: signature,
        },
      },
      res,
    )

    expect(res.statusCode).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.order.payment_status).toBe('advance_paid')
    expect(res.body.order.razorpay_payment_id).toBe(paymentId)
    expect(res.body.order.total_amount).toBe(6200)
    // Full payment is collected upfront — advance equals the total.
    expect(res.body.order.advance_amount).toBe(6200)
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/artworks?id=eq.1'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ quantity: 0, status: 'sold' }),
      }),
    )
  })
})
