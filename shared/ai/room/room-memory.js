const CACHE_PREFIX = 'archiverse_room_analysis_cache_v1'
const SESSION_PREFIX = 'archiverse_room_session_v1'
const MAX_CACHE_ENTRIES = 12

function safeParse(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function buildRoomCacheKey(fingerprint = '') {
  return `${CACHE_PREFIX}:${String(fingerprint || 'unknown')}`
}

export function getCachedRoomAnalysis(fingerprint) {
  if (typeof window === 'undefined' || !fingerprint) {
    return null
  }

  const cached = safeParse(window.localStorage.getItem(buildRoomCacheKey(fingerprint)))
  if (!cached?.profile) {
    return null
  }

  return cached
}

export function setCachedRoomAnalysis(fingerprint, payload = {}) {
  if (typeof window === 'undefined' || !fingerprint || !payload.profile) {
    return null
  }

  const entries = listRoomCacheEntries()
  const nextEntry = {
    fingerprint,
    profile: payload.profile,
    image_preview: payload.image_preview || '',
    updated_at: new Date().toISOString(),
  }

  const filtered = entries.filter((entry) => entry.fingerprint !== fingerprint)
  filtered.unshift(nextEntry)

  filtered.slice(0, MAX_CACHE_ENTRIES).forEach((entry) => {
    window.localStorage.setItem(
      buildRoomCacheKey(entry.fingerprint),
      JSON.stringify({
        profile: entry.profile,
        image_preview: entry.image_preview,
        updated_at: entry.updated_at,
      }),
    )
  })

  return nextEntry
}

export function listRoomCacheEntries() {
  if (typeof window === 'undefined') {
    return []
  }

  const entries = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (!key?.startsWith(`${CACHE_PREFIX}:`)) {
      continue
    }
    const cached = safeParse(window.localStorage.getItem(key))
    if (!cached?.profile) {
      continue
    }
    entries.push({
      fingerprint: key.replace(`${CACHE_PREFIX}:`, ''),
      profile: cached.profile,
      image_preview: cached.image_preview || '',
      updated_at: cached.updated_at || '',
    })
  }

  return entries.sort((left, right) => String(right.updated_at).localeCompare(String(left.updated_at)))
}

export function saveRoomSessionState(state = {}) {
  if (typeof window === 'undefined') {
    return null
  }

  window.sessionStorage.setItem(
    SESSION_PREFIX,
    JSON.stringify({
      ...state,
      updated_at: new Date().toISOString(),
    }),
  )
  return state
}

export function loadRoomSessionState() {
  if (typeof window === 'undefined') {
    return null
  }

  return safeParse(window.sessionStorage.getItem(SESSION_PREFIX))
}

export function formatRoomProfileForStorage(profile = {}, options = {}) {
  return {
    label: options.label || profile.label || 'My Space',
    space_type: options.space_type || profile.space_type || null,
    room_personality: profile.room_personality || '',
    personality_summary: profile.personality_summary || '',
    brightness: profile.brightness,
    darkness: profile.darkness,
    warmth: profile.warmth,
    saturation: profile.saturation,
    contrast: profile.contrast,
    density: profile.density,
    clutter_score: profile.clutter_score,
    composition_balance: profile.composition_balance,
    dominant_colors: profile.dominant_colors || [],
    moods: profile.moods || [],
    style: profile.style || [],
    analyzed_at: profile.analyzed_at || new Date().toISOString(),
  }
}

export const SUPPORTED_SPACE_TYPES = [
  'bedroom',
  'workspace',
  'living_room',
  'studio',
  'gaming_setup',
]
