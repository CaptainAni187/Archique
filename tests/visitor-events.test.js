import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEmptyResponse, createJsonResponse, createMockResponse } from './helpers/http.js'

/**
 * Every visit has to leave a behaviour trail, not just an arrival.
 *
 * `visitor_events.artwork_id` is a foreign key, and the write path used to
 * coerce a missing artwork to 0 — `Number(null)` is 0, which `Number.isInteger`
 * accepts. Postgres rejected the row, the error was swallowed, and the visit
 * survived only as a session with nothing attached to it. In production that
 * silently discarded roughly nine in ten visits.
 */
describe('visitor event recording', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env.SUPABASE_URL = 'https://supabase.example.com'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** @returns the body POSTed to visitor_events, or null if none was */
  async function postEvent(body) {
    let visitorEvent = null

    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)

      if (value.includes('/rest/v1/visitor_events') && options.method === 'POST') {
        visitorEvent = JSON.parse(options.body)
        return createJsonResponse([{ id: 1 }])
      }

      if (value.includes('/rest/v1/visitor_sessions')) {
        return createJsonResponse([{ session_id: 'sess-1' }])
      }

      if (value.includes('/rest/v1/visitor_taste_profiles')) {
        return createJsonResponse([])
      }

      return createEmptyResponse(201)
    })

    const { default: handler } = await import('../api/analytics.js')
    const res = createMockResponse()
    await handler({ method: 'POST', headers: { 'user-agent': 'probe/1.0' }, body }, res)
    return { res, visitorEvent }
  }

  it('records an event that has no artwork behind it', async () => {
    const { res, visitorEvent } = await postEvent({
      event_type: 'recommendation_shown',
      session_id: 'sess-1',
      path: '/store',
    })

    expect(res.statusCode).toBe(202)
    // Not 0: that id belongs to no artwork and the foreign key rejects it.
    expect(visitorEvent).toMatchObject({ session_id: 'sess-1', artwork_id: null })
  })

  it('keeps the artwork id when there is one', async () => {
    const { visitorEvent } = await postEvent({
      event_type: 'artwork_view',
      session_id: 'sess-1',
      artwork_id: 17,
    })

    expect(visitorEvent.artwork_id).toBe(17)
  })

  it('records an anonymous visitor without inventing a user id', async () => {
    const { visitorEvent } = await postEvent({
      event_type: 'artwork_view',
      session_id: 'sess-1',
      user_id: null,
    })

    expect(visitorEvent.user_id).toBeNull()
  })

  it('stores the user agent, so the device breakdown has something to read', async () => {
    let sessionRow = null
    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/rest/v1/visitor_sessions')) {
        sessionRow = JSON.parse(options.body)
        return createJsonResponse([{ session_id: 'sess-1' }])
      }
      if (value.includes('/rest/v1/visitor_events')) {
        return createJsonResponse([{ id: 1 }])
      }
      if (value.includes('/rest/v1/visitor_taste_profiles')) {
        return createJsonResponse([])
      }
      return createEmptyResponse(201)
    })

    const { default: handler } = await import('../api/analytics.js')
    await handler(
      {
        method: 'POST',
        headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' },
        body: { event_type: 'artwork_view', session_id: 'sess-1' },
      },
      createMockResponse(),
    )

    expect(sessionRow.user_agent).toContain('iPhone')
  })

  it('sets the landing page and referrer once, then leaves them alone', async () => {
    const sessionWrites = []
    global.fetch = vi.fn(async (url, options = {}) => {
      const value = String(url)
      if (value.includes('/rest/v1/visitor_sessions')) {
        sessionWrites.push({ method: options.method, body: JSON.parse(options.body) })
        return createJsonResponse([{ session_id: 'sess-1' }])
      }
      if (value.includes('/rest/v1/visitor_events')) {
        return createJsonResponse([{ id: 1 }])
      }
      if (value.includes('/rest/v1/visitor_taste_profiles')) {
        return createJsonResponse([])
      }
      return createEmptyResponse(201)
    })

    const { default: handler } = await import('../api/analytics.js')
    await handler(
      {
        method: 'POST',
        headers: {},
        body: {
          event_type: 'artwork_view',
          session_id: 'sess-1',
          path: '/product/17',
          referrer: 'https://www.instagram.com/',
        },
      },
      createMockResponse(),
    )

    const insert = sessionWrites.find((write) => write.method === 'POST')
    const update = sessionWrites.find((write) => write.method === 'PATCH')

    // The insert carries where they came from; it does nothing if the visitor
    // is already known, which is what keeps first-touch first-touch.
    expect(insert.body).toMatchObject({
      landing_path: '/product/17',
      referrer: 'https://www.instagram.com/',
    })
    // The update must not carry them, or every event would overwrite the
    // arrival with wherever the visitor currently is.
    expect(update.body).not.toHaveProperty('landing_path')
    expect(update.body).not.toHaveProperty('referrer')
    expect(update.body).toMatchObject({ last_path: '/product/17' })
  })
})
