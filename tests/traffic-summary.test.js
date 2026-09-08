import { describe, expect, it } from 'vitest'
import { deviceLabel, referrerLabel, summariseTraffic } from '../api/_lib/trafficSummary.js'

const NOW = new Date('2026-09-08T12:00:00.000Z')

function session(startedAt, extra = {}) {
  return { session_id: `s-${startedAt}`, started_at: startedAt, last_seen: startedAt, ...extra }
}

describe('referrer grouping', () => {
  it('collapses the hostnames one source arrives under', () => {
    // LinkedIn alone reaches us as a web URL, a shortener and an Android
    // package name; counted separately they read as three small sources.
    expect(referrerLabel('https://www.linkedin.com/feed/')).toBe('LinkedIn')
    expect(referrerLabel('com.linkedin.android')).toBe('LinkedIn')
    expect(referrerLabel('https://lnkd.in/abc')).toBe('LinkedIn')
    expect(referrerLabel('https://l.instagram.com/?u=x')).toBe('Instagram')
  })

  it('separates no referrer from our own pages', () => {
    expect(referrerLabel('')).toBe('Direct / shared link')
    expect(referrerLabel('https://www.archique.in/store', 'archique.in')).toBe('Own site')
  })
})

describe('device classification', () => {
  it('reads phones, tablets and computers apart', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('Phone')
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S911B) Mobile Safari')).toBe('Phone')
    expect(deviceLabel('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('Tablet')
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('Computer')
  })

  it('says unknown rather than guessing when nothing was recorded', () => {
    expect(deviceLabel('')).toBe('Unknown')
    expect(deviceLabel(null)).toBe('Unknown')
  })
})

describe('traffic summary', () => {
  it('counts new visitors across today, the week and all time', () => {
    const summary = summariseTraffic({
      now: NOW,
      sessions: [
        session('2026-09-08T09:00:00.000Z'),
        session('2026-09-08T11:00:00.000Z'),
        session('2026-09-05T09:00:00.000Z'),
        session('2026-08-20T09:00:00.000Z'),
        session('2026-04-01T09:00:00.000Z'), // first seen outside the window
      ],
    })

    expect(summary.totals.new_today).toBe(2)
    expect(summary.totals.new_7d).toBe(3)
    expect(summary.totals.new_window).toBe(4)
    expect(summary.totals.visitors_all_time).toBe(5)
  })

  it('separates a returning visitor from a new one', () => {
    const summary = summariseTraffic({
      now: NOW,
      sessions: [
        // First seen long ago, back inside the window: returning, not new.
        session('2026-01-05T09:00:00.000Z', { last_seen: '2026-09-06T09:00:00.000Z' }),
        // First seen long ago and not back since: neither.
        session('2026-01-06T09:00:00.000Z', { last_seen: '2026-02-01T09:00:00.000Z' }),
        session('2026-09-06T09:00:00.000Z'),
      ],
    })

    expect(summary.totals.new_window).toBe(1)
    expect(summary.totals.returning_window).toBe(1)
    expect(summary.totals.active_window).toBe(2)
  })

  it('gives every day in the window a bar, including the quiet ones', () => {
    const summary = summariseTraffic({
      now: NOW,
      sessions: [session('2026-09-08T09:00:00.000Z')],
    })

    expect(summary.daily).toHaveLength(30)
    expect(summary.daily.at(-1)).toMatchObject({ date: '2026-09-08', visitors: 1 })
    // A day nobody came is a zero, not a missing entry that would compress the
    // timeline and make visits look more continuous than they were.
    expect(summary.daily.at(-2)).toMatchObject({ date: '2026-09-07', visitors: 0 })
  })

  it('counts a returning visitor on the day they came back, not just their first', () => {
    const summary = summariseTraffic({
      now: NOW,
      sessions: [session('2026-08-01T09:00:00.000Z')],
      events: [{ session_id: 's-2026-08-01T09:00:00.000Z', created_at: '2026-09-07T10:00:00.000Z' }],
    })

    const byDate = Object.fromEntries(summary.daily.map((day) => [day.date, day.visitors]))
    expect(byDate['2026-09-07']).toBe(1)
  })

  it('does not double-count a visitor who fires many events in one day', () => {
    const summary = summariseTraffic({
      now: NOW,
      sessions: [session('2026-09-07T09:00:00.000Z')],
      events: Array.from({ length: 40 }, () => ({
        session_id: 's-2026-09-07T09:00:00.000Z',
        created_at: '2026-09-07T09:05:00.000Z',
        event_type: 'artwork_view',
      })),
    })

    const byDate = Object.fromEntries(summary.daily.map((day) => [day.date, day.visitors]))
    expect(byDate['2026-09-07']).toBe(1)
  })

  it('counts each funnel step once per visit, not once per event', () => {
    const summary = summariseTraffic({
      now: NOW,
      sessions: [session('2026-09-07T09:00:00.000Z'), session('2026-09-06T09:00:00.000Z')],
      events: [
        { session_id: 's-2026-09-07T09:00:00.000Z', event_type: 'artwork_view', artwork_id: 4 },
        { session_id: 's-2026-09-07T09:00:00.000Z', event_type: 'artwork_view', artwork_id: 4 },
        { session_id: 's-2026-09-07T09:00:00.000Z', event_type: 'product_open', artwork_id: 4 },
        { session_id: 's-2026-09-06T09:00:00.000Z', event_type: 'checkout_started' },
      ],
    })

    const byStage = Object.fromEntries(summary.funnel.map((step) => [step.stage, step.count]))
    expect(byStage.Visited).toBe(2)
    expect(byStage['Viewed a piece']).toBe(1)
    expect(byStage['Started checkout']).toBe(1)
    expect(summary.top_artwork_ids[0]).toEqual({ artwork_id: 4, count: 3 })
  })

  it('returns a renderable shape with no data at all', () => {
    const summary = summariseTraffic({ now: NOW })

    expect(summary.totals.visitors_all_time).toBe(0)
    expect(summary.daily).toHaveLength(30)
    expect(summary.referrers).toEqual([])
    expect(summary.funnel[0]).toEqual({ stage: 'Visited', count: 0 })
  })
})
