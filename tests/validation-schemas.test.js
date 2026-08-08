import { describe, expect, it } from 'vitest'
import {
  artworkPayloadSchema,
  orderCreationSchema,
  paymentVerificationSchema,
} from '../api/_lib/validation.js'

describe('validation schemas', () => {
  it('accepts artwork image arrays as plain urls', () => {
    const parsed = artworkPayloadSchema.parse({
      title: 'Structured Work',
      price: 1000,
      description: 'Example',
      medium: 'Ink',
      size: 'A4',
      status: 'available',
      category: 'canvas',
      images: ['https://example.com/image.jpg'],
    })

    expect(parsed.images).toEqual(['https://example.com/image.jpg'])
  })

  it('rejects artwork payloads with too many images', () => {
    const result = artworkPayloadSchema.safeParse({
      title: 'Bad Work',
      price: 1000,
      description: 'Example',
      medium: 'Ink',
      size: 'A4',
      status: 'available',
      category: 'canvas',
      images: [
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/4.jpg',
        'https://example.com/5.jpg',
        'https://example.com/6.jpg',
      ],
    })

    expect(result.success).toBe(false)
  })

  it('accepts valid order creation payloads', () => {
    const result = orderCreationSchema.safeParse({
      product_id: 1,
      customer_name: 'Ada',
      customer_phone: '+919812345678',
      customer_address: '123 Main Street',
      customer_email: 'ada@example.com',
      razorpay_payment_id: 'pay_123',
      razorpay_order_id: 'order_123',
      razorpay_signature: 'sig_123',
    })

    expect(result.success).toBe(true)
  })

  it('rejects incomplete payment verification payloads', () => {
    const result = paymentVerificationSchema.safeParse({
      razorpay_payment_id: '',
      razorpay_order_id: 'order_123',
      razorpay_signature: '',
    })

    expect(result.success).toBe(false)
  })
})
