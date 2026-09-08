import {
  createEmptyTasteProfile,
  mergeTasteProfileForEvent,
} from '../../shared/ai/core/index.js'
import {
  createVisitorEvent,
  fetchVisitorTasteProfileBySessionId,
  supabaseAdminRequest,
  upsertVisitorSession,
  upsertVisitorTasteProfile,
} from './supabaseAdmin.js'

function normalizeSessionId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Database ids are positive or absent — never zero.
 *
 * The previous guard was `Number.isInteger(Number(value))`, and `Number(null)`
 * is `0`, so every event that had no artwork behind it — a page view, a
 * recommendation impression, most of the traffic — was written with
 * `artwork_id: 0`. No artwork has that id, so the row failed the foreign key,
 * the error was swallowed by the catch below, and the visit survived only as a
 * session with no events attached. Roughly nine in ten visits were lost this
 * way, which is why the dashboard could see arrivals but almost no behaviour.
 */
function toIdOrNull(value) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Runs one write, reporting a failure instead of letting it end the rest.
 *
 * These writes were wrapped in a single try/catch, so the first rejection took
 * everything after it down with it — a rejected event row also discarded the
 * visit and the taste profile, and a rejected `analytics_events` row discarded
 * the whole lot. That coupling is what let a bad `artwork_id` go unnoticed
 * while it was quietly dropping most of the site's traffic. Naming the table in
 * the log is what makes the next one obvious rather than invisible.
 */
async function write(table, run) {
  try {
    return await run()
  } catch (error) {
    console.error(`[analytics] ${table} write failed:`, error.message)
    return null
  }
}

export async function logAnalyticsEvent({
  event_type,
  session_id = '',
  user_id = null,
  metadata = {},
  path = '',
  referrer = '',
  artwork_id = null,
  user_agent = '',
  timestamp = new Date().toISOString(),
}) {
  await write('analytics_events', () =>
    supabaseAdminRequest('analytics_events', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type,
        timestamp,
        metadata: {
          ...metadata,
          user_id: toIdOrNull(user_id) ?? undefined,
        },
      }),
    }),
  )

  const normalizedSessionId = normalizeSessionId(session_id || metadata.session_id)

  if (!normalizedSessionId) {
    return
  }

  const session = await write('visitor_sessions', () =>
    upsertVisitorSession({
      session_id: normalizedSessionId,
      // Only true of the first visit: where they came from and what they landed
      // on. Rewriting these on every event turned them into duplicates of
      // last_path and of whatever referrer the browser reported most recently.
      firstTouch: {
        referrer: referrer || null,
        landing_path: path || null,
      },
      last_seen: timestamp,
      last_path: path || null,
      user_agent: user_agent || null,
      metadata: {
        ...(metadata.session_metadata || {}),
      },
    }),
  )

  // Both of the writes below reference the session row, so there is nothing to
  // attach them to if it could not be created.
  if (!session) {
    return
  }

  await write('visitor_events', () =>
    createVisitorEvent({
      session_id: normalizedSessionId,
      event_type,
      user_id: toIdOrNull(user_id),
      artwork_id: toIdOrNull(artwork_id),
      path: path || null,
      metadata,
      created_at: timestamp,
    }),
  )

  await write('visitor_taste_profiles', async () => {
    const existingProfile = await fetchVisitorTasteProfileBySessionId(normalizedSessionId)
    const nextTasteProfile = mergeTasteProfileForEvent(
      existingProfile?.taste_profile || createEmptyTasteProfile(),
      {
        event_type,
        metadata,
        timestamp,
      },
    )

    return upsertVisitorTasteProfile({
      session_id: normalizedSessionId,
      taste_profile: nextTasteProfile,
      last_seen: timestamp,
      updated_at: timestamp,
    })
  })
}
