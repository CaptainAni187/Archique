import { backendRequest } from './backendApiService'
import { updateTasteProfileFromEvent } from './tasteService'
import { getStoredUser } from './userAuthService'

const SESSION_STORAGE_KEY = 'archiverse_visitor_session_id'

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `arch-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function getAnonymousSessionId() {
  if (typeof window === 'undefined') {
    return ''
  }

  const existing = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (existing) {
    return existing
  }

  const created = createSessionId()
  window.localStorage.setItem(SESSION_STORAGE_KEY, created)
  return created
}

export async function trackAnalyticsEvent(eventType, metadata = {}) {
  updateTasteProfileFromEvent(eventType, metadata)
  const currentUser = getStoredUser()

  try {
    await backendRequest('/api/analytics', {
      method: 'POST',
      body: JSON.stringify({
        event_type: eventType,
        session_id: getAnonymousSessionId(),
        user_id: currentUser?.id || null,
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
        artwork_id: metadata.artwork_id || metadata.id || metadata.artwork?.id || null,
        metadata,
      }),
    })
  } catch (error) {
    console.error('Analytics tracking failed:', error)
  }
}

export async function trackRecommendationEvent(eventType, metadata = {}) {
  return trackAnalyticsEvent(eventType, {
    ...metadata,
    recommendation_signal: true,
  })
}

export async function trackRoomEvent(eventType, metadata = {}) {
  return trackAnalyticsEvent(eventType, {
    ...metadata,
    room_signal: true,
  })
}
