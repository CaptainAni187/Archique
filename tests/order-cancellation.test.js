import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsonResponse, createMockResponse } from './helpers/http.js'

/**
 * Cancelling an order has to put its artwork back on sale.
 *
 * Every piece is one of one, so an order that never completed and never
 * released its stock removes that piece from the catalogue permanently. This
 * previously happened on every cancellation.
 */
describe('order cancellation', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_URL = 'https://supabase.example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret-value'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockAdminAuth() {
    vi.doMock('../api/_lib/adminSession.js', async () => {
      const actual = await vi.importActual('../api/_lib/adminSession.js')
      return {
        ...actual,
        requireAdminAuth: async () => ({
          admin_id: 1,
          session_id: 1,
          name: 'Test Admin',
          email: 'admin@example.com',
        }),
      }
    })
    vi.doMock('../api/_lib/adminActivity.js', () => ({
      logAdminActivity: async () => null,
      fetchAdminActivity: async () => [],
    }))
  }

  /**
   * @param existingOrder the row the handler will read before transitioning
   * @returns the PATCHes issued against /artworks, i.e. the stock restores
   */
  async function cancelOrder(existingOrder) {
    mockAdminAuth()
    const artworkPatches = []

    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)

      if (value.includes('/rest/v1/orders?select=*&id=eq.7')) {
        return createJsonResponse([existingOrder])
      }

      if (value.includes('/rest/v1/artworks') && options.method === 'PATCH') {
        artworkPatches.push({ url: value, body: JSON.parse(options.body) })
        return createJsonResponse([{ id: 1, quantity: 1, status: 'available' }])
      }

      if (value.includes('/rest/v1/artworks')) {
        return createJsonResponse([{ id: 1, title: 'Piece', quantity: 0, status: 'sold' }])
      }

      if (value.includes('/rest/v1/orders') && options.method === 'PATCH') {
        return createJsonResponse([{ ...existingOrder, payment_status: 'cancelled' }])
      }

      return createJsonResponse([])
    })

    const { default: handler } = await import('../api/orders.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'PATCH',
        url: '/api/orders/7/status',
        headers: { authorization: 'Bearer token' },
        query: { id: '7', action: 'status' },
        body: { payment_status: 'cancelled' },
      },
      res,
    )

    return { res, artworkPatches }
  }

  it('returns the artwork to the catalogue when an order is cancelled', async () => {
    const { res, artworkPatches } = await cancelOrder({
      id: 7,
      product_id: 1,
      product_ids: [1],
      payment_status: 'advance_paid',
      order_code: 'ARC-2026-0007',
    })

    expect(res.statusCode).toBe(200)
    expect(artworkPatches).toHaveLength(1)
    expect(artworkPatches[0].body).toMatchObject({ quantity: 1, status: 'available' })
  })

  it('restores every piece of a multi-artwork order', async () => {
    const { artworkPatches } = await cancelOrder({
      id: 7,
      product_id: 1,
      product_ids: [1, 2, 3],
      payment_status: 'processing',
      order_code: 'ARC-2026-0007',
    })

    expect(artworkPatches).toHaveLength(3)
  })

  it('falls back to the primary artwork for orders written before product_ids existed', async () => {
    const { artworkPatches } = await cancelOrder({
      id: 7,
      product_id: 1,
      payment_status: 'advance_paid',
      order_code: 'ARC-2026-0007',
    })

    expect(artworkPatches).toHaveLength(1)
  })

  it('does not restore stock twice when an already-cancelled order is cancelled again', async () => {
    const { res, artworkPatches } = await cancelOrder({
      id: 7,
      product_id: 1,
      product_ids: [1],
      payment_status: 'cancelled',
      order_code: 'ARC-2026-0007',
    })

    expect(res.statusCode).toBe(200)
    expect(artworkPatches).toHaveLength(0)
  })

  it('leaves stock alone for transitions that are not cancellations', async () => {
    mockAdminAuth()
    const artworkPatches = []

    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)

      if (value.includes('/rest/v1/orders?select=*&id=eq.7')) {
        return createJsonResponse([
          { id: 7, product_id: 1, product_ids: [1], payment_status: 'processing' },
        ])
      }

      if (value.includes('/rest/v1/artworks') && options.method === 'PATCH') {
        artworkPatches.push(value)
        return createJsonResponse([{ id: 1 }])
      }

      if (value.includes('/rest/v1/orders') && options.method === 'PATCH') {
        return createJsonResponse([{ id: 7, payment_status: 'shipped' }])
      }

      return createJsonResponse([])
    })

    const { default: handler } = await import('../api/orders.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'PATCH',
        url: '/api/orders/7/status',
        headers: { authorization: 'Bearer token' },
        query: { id: '7', action: 'status' },
        body: { payment_status: 'shipped' },
      },
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(artworkPatches).toHaveLength(0)
  })
})
