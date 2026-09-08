import { backendRequest } from './backendApiService'
import { updateTasteProfileFromEvent } from './tasteService'
import { getStoredUser } from './userAuthService'

const SESSION_STORAGE_KEY = 'archique_visitor_session_id'
const INTERNAL_TRAFFIC_KEY = 'archique_internal_traffic'

/**
 * The studio's own browsing was the largest single source of "traffic" — every
 * round of testing looked like a visitor, which made the launch numbers
 * unreadable. Opening the site once with `?analytics=off` marks that browser as
 * internal for good (and `?analytics=on` undoes it); nothing from it is sent to
 * the server after that, so the dashboard counts real visitors only.
 *
 * Stored per browser rather than filtered later, because there is no reliable
 * way to tell the studio's sessions apart once they are already in the table.
 */
function syncInternalTrafficFlag() {
  if (typeof window === 'undefined') {
    return
  }

  try {
    const setting = new URLSearchParams(window.location.search).get('analytics')
    if (setting === 'off') {
      window.localStorage.setItem(INTERNAL_TRAFFIC_KEY, '1')
      console.info('[analytics] This browser is now excluded from visitor stats.')
    } else if (setting === 'on') {
      window.localStorage.removeItem(INTERNAL_TRAFFIC_KEY)
      console.info('[analytics] This browser is counted in visitor stats again.')
    }
  } catch {
    /* Private browsing can refuse storage; tracking normally is the safe default. */
  }
}

export function isInternalTraffic() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    return window.localStorage.getItem(INTERNAL_TRAFFIC_KEY) === '1'
  } catch {
    return false
  }
}

syncInternalTrafficFlag()

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
  // The local taste profile still updates, so the site keeps recommending
  // sensibly on this browser — it is only the server-side record that stops.
  updateTasteProfileFromEvent(eventType, metadata)

  if (isInternalTraffic()) {
    return
  }

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
