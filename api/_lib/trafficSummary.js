/**
 * Turns raw visitor rows into the numbers the studio actually asks about:
 * how many people came, when, where from, and how far they got.
 *
 * A row in `visitor_sessions` is one **browser**, not one sitting: the id is
 * kept in localStorage indefinitely so a visitor's taste profile survives, and
 * the same person returning next week reuses it. So `started_at` is when that
 * visitor was first ever seen and `last_seen` is their most recent activity —
 * which is why the wording here is "visitors" and "new", never "sessions".
 * Reading those rows as sittings would have doubled as an undercount of repeat
 * traffic and an overcount of fresh interest.
 *
 * Kept as a pure function over rows that have already been fetched, so it can
 * be tested without a database and reused wherever the rows come from.
 */

/** How far back the day-by-day chart and the breakdowns look. */
export const TRAFFIC_WINDOW_DAYS = 30

/**
 * Referrers arrive as full URLs and the same source shows up under several
 * hostnames — LinkedIn alone appears as `linkedin.com`, `lnkd.in` and
 * `com.linkedin.android`. Grouping them is the difference between "where is
 * traffic coming from" and a list of hostnames.
 */
const REFERRER_GROUPS = [
  [/(^|\.)instagram\.com$|^l\.instagram\.com$|^ig\.me$/i, 'Instagram'],
  [/linkedin|lnkd\.in/i, 'LinkedIn'],
  [/(^|\.)google\./i, 'Google'],
  [/facebook|fb\.me/i, 'Facebook'],
  [/whatsapp|wa\.me/i, 'WhatsApp'],
  [/(^|\.)(x|twitter)\.com$|^t\.co$/i, 'X / Twitter'],
  [/youtube|youtu\.be/i, 'YouTube'],
  [/pinterest/i, 'Pinterest'],
  [/(^|\.)bing\.com$|duckduckgo|yahoo/i, 'Other search'],
]

/** Events that mean "this visitor looked at an actual piece". */
const PRODUCT_VIEW_EVENTS = new Set(['product_open', 'artwork_view', 'artwork_click'])
const PURCHASE_EVENTS = new Set(['order_completed', 'purchase'])

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function daysAgo(now, days) {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

export function referrerLabel(referrer, siteHost = '') {
  const raw = String(referrer || '').trim()
  if (!raw) {
    return 'Direct / shared link'
  }

  let host = raw
  try {
    host = new URL(raw).hostname
  } catch {
    // Android apps report a package name ("com.linkedin.android"), not a URL.
    host = raw.replace(/^https?:\/\//i, '').split('/')[0]
  }

  if (siteHost && host.toLowerCase().endsWith(siteHost.toLowerCase())) {
    return 'Own site'
  }

  const match = REFERRER_GROUPS.find(([pattern]) => pattern.test(host))
  return match ? match[1] : host || 'Unknown'
}

/**
 * The previous classifier read `visitor_sessions.user_agent`, which the write
 * path never populated, so every session came back "other". It is populated
 * now; anything still missing is reported honestly as unknown rather than
 * being folded into desktop.
 */
export function deviceLabel(userAgent) {
  const ua = String(userAgent || '')
  if (!ua.trim()) {
    return 'Unknown'
  }
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) {
    return 'Tablet'
  }
  if (/iphone|ipod|android|blackberry|iemobile|opera mini|mobile/i.test(ua)) {
    return 'Phone'
  }
  return 'Computer'
}

function countBy(rows, toKey) {
  const counts = new Map()
  rows.forEach((row) => {
    const key = toKey(row)
    if (key) {
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  })
  return counts
}

function topItems(counts, limit = 8) {
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit)
}

/**
 * A continuous run of days, so a quiet day is a gap in the chart rather than a
 * missing bar that makes the timeline lie about how spread out visits were.
 *
 * A visitor counts as present on a day if they did something that day, or if
 * that is the day they first arrived. The union matters: a visitor's first
 * arrival is always recorded on the session row, while their activity lives in
 * the events table, and neither source alone sees every day.
 */
function buildDailySeries(sessions, events, now, days) {
  const byDay = new Map()

  const mark = (date, sessionId) => {
    if (!date) {
      return
    }
    if (!byDay.has(date)) {
      byDay.set(date, new Set())
    }
    byDay.get(date).add(sessionId || `anon-${byDay.get(date).size}`)
  }

  sessions.forEach((session) => mark(isoDate(session.started_at), session.session_id))
  events.forEach((event) => mark(isoDate(event.created_at), event.session_id))

  const series = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = isoDate(daysAgo(now, offset))
    series.push({ date, visitors: byDay.get(date)?.size || 0 })
  }
  return series
}

export function summariseTraffic({
  sessions = [],
  events = [],
  siteHost = '',
  now = new Date(),
  windowDays = TRAFFIC_WINDOW_DAYS,
} = {}) {
  const since = daysAgo(now, windowDays)
  const startOfToday = new Date(now)
  startOfToday.setUTCHours(0, 0, 0, 0)

  const firstSeen = (session) => new Date(session.started_at)
  const lastSeen = (session) => new Date(session.last_seen || session.started_at)

  const newInWindow = sessions.filter((session) => firstSeen(session) >= since)
  // Someone first seen before this window who has been back inside it. Counted
  // separately because "new visitors" and "people still coming back" answer
  // different questions after a launch.
  const returningInWindow = sessions.filter(
    (session) => firstSeen(session) < since && lastSeen(session) >= since,
  )

  const sessionsWithEvent = (predicate) =>
    new Set(events.filter(predicate).map((event) => event.session_id).filter(Boolean)).size

  const activeInWindow = newInWindow.length + returningInWindow.length

  const funnel = [
    { stage: 'Visited', count: activeInWindow },
    {
      stage: 'Viewed a piece',
      count: sessionsWithEvent((event) => PRODUCT_VIEW_EVENTS.has(event.event_type)),
    },
    {
      stage: 'Previewed on their wall',
      count: sessionsWithEvent((event) => event.event_type === 'room_preview_opened'),
    },
    {
      stage: 'Saved a piece',
      count: sessionsWithEvent((event) => event.event_type === 'favorite_added'),
    },
    {
      stage: 'Started checkout',
      count: sessionsWithEvent((event) => event.event_type === 'checkout_started'),
    },
    {
      stage: 'Ordered',
      count: sessionsWithEvent((event) => PURCHASE_EVENTS.has(event.event_type)),
    },
  ]

  const artworkViews = countBy(
    events.filter((event) => PRODUCT_VIEW_EVENTS.has(event.event_type) && event.artwork_id),
    (event) => String(event.artwork_id),
  )

  return {
    window_days: windowDays,
    generated_at: now.toISOString(),
    totals: {
      visitors_all_time: sessions.length,
      active_window: activeInWindow,
      new_window: newInWindow.length,
      returning_window: returningInWindow.length,
      new_7d: sessions.filter((session) => firstSeen(session) >= daysAgo(now, 7)).length,
      new_today: sessions.filter((session) => firstSeen(session) >= startOfToday).length,
      events_window: events.length,
    },
    daily: buildDailySeries(newInWindow, events, now, windowDays),
    // First-touch details describe an arrival, so they are counted over the
    // visitors who actually arrived in this window.
    referrers: topItems(countBy(newInWindow, (session) => referrerLabel(session.referrer, siteHost))),
    landing_pages: topItems(countBy(newInWindow, (session) => session.landing_path || '/')),
    devices: topItems(countBy(newInWindow, (session) => deviceLabel(session.user_agent)), 4),
    funnel,
    top_artwork_ids: topItems(artworkViews, 6).map((item) => ({
      artwork_id: Number(item.label),
      count: item.count,
    })),
  }
}
