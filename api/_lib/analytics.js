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
  try {
    await supabaseAdminRequest('analytics_events', {
      method: 'POST',
      headers: {
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        event_type,
        timestamp,
        metadata: {
          ...metadata,
          user_id: Number.isInteger(Number(user_id)) ? Number(user_id) : undefined,
        },
      }),
    })

    const normalizedSessionId = normalizeSessionId(session_id || metadata.session_id)

    if (!normalizedSessionId) {
      return
    }

    await upsertVisitorSession({
      session_id: normalizedSessionId,
      last_seen: timestamp,
      user_agent: user_agent || null,
      referrer: referrer || null,
      landing_path: path || null,
      last_path: path || null,
      metadata: {
        ...(metadata.session_metadata || {}),
      },
    })

    await createVisitorEvent({
      session_id: normalizedSessionId,
      event_type,
      user_id: Number.isInteger(Number(user_id)) ? Number(user_id) : null,
      artwork_id: Number.isInteger(Number(artwork_id)) ? Number(artwork_id) : null,
      path: path || null,
      metadata,
      created_at: timestamp,
    })

    const existingProfile = await fetchVisitorTasteProfileBySessionId(normalizedSessionId)
    const nextTasteProfile = mergeTasteProfileForEvent(
      existingProfile?.taste_profile || createEmptyTasteProfile(),
      {
        event_type,
        metadata,
        timestamp,
      },
    )

    await upsertVisitorTasteProfile({
      session_id: normalizedSessionId,
      taste_profile: nextTasteProfile,
      last_seen: timestamp,
      updated_at: timestamp,
    })
  } catch (error) {
    console.error('[analytics] Failed to persist analytics event:', error.message)
  }
}
