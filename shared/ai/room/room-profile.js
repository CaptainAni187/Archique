import { classifyRoomPersonality, getRoomPersonalitySummary } from './room-personality.js'

const MOOD_RULES = [
  { mood: 'calm', when: (profile) => profile.saturation < 0.35 && profile.clutter_score < 0.45 },
  { mood: 'focused', when: (profile) => profile.density < 0.35 && profile.brightness > 0.45 },
  { mood: 'cozy', when: (profile) => profile.warmth > 0.55 && profile.brightness < 0.65 },
  { mood: 'dramatic', when: (profile) => profile.contrast > 0.42 || profile.darkness > 0.55 },
  { mood: 'energetic', when: (profile) => profile.saturation > 0.42 && profile.density > 0.35 },
  { mood: 'minimal', when: (profile) => profile.clutter_score < 0.32 && profile.saturation < 0.3 },
  { mood: 'expressive', when: (profile) => profile.saturation > 0.38 && profile.density > 0.42 },
]

const STYLE_RULES = [
  { style: 'minimal', when: (profile) => profile.clutter_score < 0.34 && profile.saturation < 0.32 },
  { style: 'contemporary', when: (profile) => profile.brightness > 0.55 && profile.composition_balance > 0.62 },
  { style: 'industrial', when: (profile) => profile.saturation < 0.28 && profile.contrast > 0.38 },
  { style: 'luxury', when: (profile) => profile.warmth > 0.58 && profile.composition_balance > 0.6 },
  { style: 'creative', when: (profile) => profile.saturation > 0.36 && profile.density > 0.38 },
  { style: 'collector', when: (profile) => profile.density > 0.45 && profile.clutter_score > 0.42 },
  { style: 'dark-toned', when: (profile) => profile.darkness > 0.52 },
]

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function inferMoods(profile) {
  return MOOD_RULES.filter((rule) => rule.when(profile)).map((rule) => rule.mood).slice(0, 4)
}

function inferStyles(profile) {
  return STYLE_RULES.filter((rule) => rule.when(profile)).map((rule) => rule.style).slice(0, 4)
}

export function createEmptyRoomProfile() {
  return {
    brightness: 0.5,
    darkness: 0.5,
    warmth: 0.5,
    saturation: 0.5,
    contrast: 0.5,
    density: 0.5,
    dominant_colors: [],
    moods: [],
    style: [],
    clutter_score: 0.5,
    composition_balance: 0.5,
    room_personality: 'Calm Retreat',
    personality_summary: '',
    space_type: null,
    label: 'My Space',
    analyzed_at: null,
  }
}

export function buildRoomProfile(analysis = {}, options = {}) {
  if (!analysis) {
    return createEmptyRoomProfile()
  }

  const profile = {
    brightness: clamp(Number(analysis.brightness) || 0.5),
    darkness: clamp(Number(analysis.darkness) || 0.5),
    warmth: clamp(Number(analysis.warmth) || 0.5),
    saturation: clamp(Number(analysis.saturation) || 0.5),
    contrast: clamp(Number(analysis.contrast) || 0.5),
    density: clamp(Number(analysis.visual_density) || 0.5),
    dominant_colors: Array.isArray(analysis.dominant_colors) ? analysis.dominant_colors : [],
    moods: [],
    style: [],
    clutter_score: clamp(Number(analysis.clutter_score) || 0.5),
    composition_balance: clamp(Number(analysis.composition_balance) || 0.5),
    room_personality: '',
    personality_summary: '',
    space_type: options.space_type || null,
    label: options.label || 'My Space',
    analyzed_at: options.analyzed_at || new Date().toISOString(),
  }

  profile.moods = inferMoods(profile)
  profile.style = inferStyles(profile)

  const personality = classifyRoomPersonality(profile)
  profile.room_personality = personality.label
  profile.personality_summary = getRoomPersonalitySummary(personality.label, profile)

  return profile
}

export function normalizeStoredRoomProfile(rawProfile = {}) {
  const base = createEmptyRoomProfile()
  const merged = {
    ...base,
    ...rawProfile,
    dominant_colors: Array.isArray(rawProfile.dominant_colors)
      ? rawProfile.dominant_colors
      : base.dominant_colors,
    moods: Array.isArray(rawProfile.moods) ? rawProfile.moods : base.moods,
    style: Array.isArray(rawProfile.style) ? rawProfile.style : base.style,
  }

  if (!merged.room_personality) {
    const personality = classifyRoomPersonality(merged)
    merged.room_personality = personality.label
    merged.personality_summary = getRoomPersonalitySummary(personality.label, merged)
  }

  return merged
}
