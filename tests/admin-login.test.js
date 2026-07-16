import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockResponse } from './helpers/http.js'

describe('admin login handler', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.ADMIN_EMAIL = 'admin@example.com'
    process.env.ADMIN_PASSWORD = 'SuperSecret123!'
    process.env.ADMIN_SESSION_SECRET = 'test-admin-session-secret-0123456789abcdef'
    // Deterministic Supabase: every REST/RPC call resolves to an empty result
    // so tests never depend on live network (rate-limit RPC, admin lookups).
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => '[]',
        json: async () => [],
      })),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns a JWT for valid credentials', async () => {
    const { default: handler } = await import('../api/admin.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'POST',
        url: '/api/admin/login',
        body: {
          email: 'admin@example.com',
          password: 'SuperSecret123!',
        },
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      },
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body.success).toBe(true)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.token.length).toBeGreaterThan(20)
  })

  it('rejects invalid credentials', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { default: handler } = await import('../api/admin.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'POST',
        url: '/api/admin/login',
        body: {
          email: 'admin@example.com',
          password: 'wrong-password',
        },
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      },
      res,
    )

    expect(res.statusCode).toBe(401)
    expect(res.body.message).toBe('Invalid admin credentials.')
    expect(warnSpy).toHaveBeenCalled()
  })

  it('returns the current admin session from /api/admin/me', async () => {
    const { default: handler } = await import('../api/admin.js')
    const loginRes = createMockResponse()

    await handler(
      {
        method: 'POST',
        url: '/api/admin/login',
        body: {
          email: 'admin@example.com',
          password: 'SuperSecret123!',
        },
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      },
      loginRes,
    )

    const meRes = createMockResponse()

    await handler(
      {
        method: 'GET',
        url: '/api/admin/me',
        headers: {
          authorization: `Bearer ${loginRes.body.token}`,
        },
        socket: { remoteAddress: '127.0.0.1' },
      },
      meRes,
    )

    expect(meRes.statusCode).toBe(200)
    expect(meRes.body.success).toBe(true)
    expect(meRes.body.data.authenticated).toBe(true)
    expect(meRes.body.data.admin.email).toBe('admin@example.com')
  })

  it('supports db-backed multi-admin login identities', async () => {
    const bcrypt = await import('bcrypt')
    const passwordHash = bcrypt.hashSync('AdminPass123!', 10)

    vi.doMock('../api/_lib/supabaseAdmin.js', async () => {
      const actual = await vi.importActual('../api/_lib/supabaseAdmin.js')

      return {
        ...actual,
        fetchAdminByEmail: vi.fn(async (email) =>
          email === 'second-admin@example.com'
            ? {
                id: 22,
                name: 'Second Admin',
                email,
                password_hash: passwordHash,
                role: 'admin',
                is_active: true,
              }
            : null,
        ),
        fetchAdminById: vi.fn(async (id) =>
          id === 22
            ? {
                id: 22,
                name: 'Second Admin',
                email: 'second-admin@example.com',
                role: 'admin',
                is_active: true,
              }
            : null,
        ),
        createAdminSession: vi.fn(async (payload) => ({
          id: 77,
          ...payload,
          created_at: '2026-04-23T00:00:00.000Z',
        })),
        fetchAdminSessionById: vi.fn(async (id) =>
          id === 77
            ? {
                id: 77,
                session_token_id: '11111111-1111-4111-8111-111111111111',
                created_at: '2026-04-23T00:00:00.000Z',
                logged_out_at: null,
              }
            : null,
        ),
        updateAdminSessionById: vi.fn(async () => null),
        createAdminActivityLog: vi.fn(async () => ({ id: 1 })),
        fetchAdminActivityLogs: vi.fn(async () => []),
      }
    })

    const { default: handler } = await import('../api/admin.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'POST',
        url: '/api/admin/login',
        body: {
          email: 'second-admin@example.com',
          password: 'AdminPass123!',
        },
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      },
      res,
    )

    expect(res.statusCode).toBe(200)
    expect(res.body.data.admin.email).toBe('second-admin@example.com')
    expect(res.body.data.admin.name).toBe('Second Admin')
  })

  it('returns METHOD_NOT_ALLOWED for unsupported admin route methods', async () => {
    const { default: handler } = await import('../api/admin.js')
    const res = createMockResponse()

    await handler(
      {
        method: 'GET',
        url: '/api/admin/login',
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      },
      res,
    )

    expect(res.statusCode).toBe(405)
    expect(res.body.error).toBe('METHOD_NOT_ALLOWED')
  })

  it('returns 500 when admin env is missing', async () => {
    const { default: handler } = await import('../api/admin.js')
    process.env.ADMIN_SESSION_SECRET = ''
    const res = createMockResponse()

    await handler(
      {
        method: 'POST',
        url: '/api/admin/login',
        body: {
          email: 'admin@example.com',
          password: 'SuperSecret123!',
        },
        headers: {},
        socket: { remoteAddress: '127.0.0.1' },
      },
      res,
    )

    expect(res.statusCode).toBe(500)
    expect(res.body.error).toBe('ADMIN_CONFIG_MISSING')
  })
})
