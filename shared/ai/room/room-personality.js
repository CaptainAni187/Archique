const PERSONALITIES = [
  {
    label: 'Modern Minimal Workspace',
    score(profile) {
      return (
        (profile.clutter_score < 0.34 ? 0.35 : 0) +
        (profile.saturation < 0.32 ? 0.25 : 0) +
        (profile.brightness > 0.48 && profile.brightness < 0.78 ? 0.2 : 0) +
        (profile.density < 0.38 ? 0.2 : 0)
      )
    },
    summary: 'Your room is calm, neutral, and visually clean.',
  },
  {
    label: 'Dark Gaming Setup',
    score(profile) {
      return (
        (profile.darkness > 0.58 ? 0.35 : 0) +
        (profile.saturation > 0.28 ? 0.15 : 0) +
        (profile.contrast > 0.38 ? 0.2 : 0) +
        (profile.density > 0.35 ? 0.15 : 0) +
        (profile.moods.includes('dramatic') ? 0.15 : 0)
      )
    },
    summary: 'Your room reads as focused, low-light, and visually immersive.',
  },
  {
    label: 'Anime Collector',
    score(profile) {
      return (
        (profile.saturation > 0.34 ? 0.25 : 0) +
        (profile.density > 0.42 ? 0.25 : 0) +
        (profile.clutter_score > 0.38 ? 0.2 : 0) +
        (profile.moods.includes('expressive') ? 0.15 : 0) +
        (profile.style.includes('collector') ? 0.15 : 0)
      )
    },
    summary: 'Your room carries expressive color and collected visual energy.',
  },
  {
    label: 'Creative Studio',
    score(profile) {
      return (
        (profile.density > 0.36 ? 0.25 : 0) +
        (profile.saturation > 0.3 ? 0.2 : 0) +
        (profile.moods.includes('focused') || profile.moods.includes('expressive') ? 0.2 : 0) +
        (profile.style.includes('creative') ? 0.2 : 0) +
        (profile.composition_balance > 0.55 ? 0.15 : 0)
      )
    },
    summary: 'Your room feels active, creative, and ready for visual inspiration.',
  },
  {
    label: 'Calm Retreat',
    score(profile) {
      return (
        (profile.saturation < 0.34 ? 0.25 : 0) +
        (profile.clutter_score < 0.4 ? 0.25 : 0) +
        (profile.brightness > 0.42 && profile.brightness < 0.72 ? 0.2 : 0) +
        (profile.moods.includes('calm') ? 0.2 : 0) +
        (profile.warmth > 0.45 && profile.warmth < 0.65 ? 0.1 : 0)
      )
    },
    summary: 'Your room is calm, neutral, and visually clean.',
  },
  {
    label: 'Cozy Bedroom',
    score(profile) {
      return (
        (profile.warmth > 0.56 ? 0.3 : 0) +
        (profile.brightness < 0.62 ? 0.2 : 0) +
        (profile.moods.includes('cozy') ? 0.25 : 0) +
        (profile.saturation < 0.38 ? 0.15 : 0) +
        (profile.clutter_score < 0.48 ? 0.1 : 0)
      )
    },
    summary: 'Your room feels warm, intimate, and softly layered.',
  },
  {
    label: 'Luxury Contemporary',
    score(profile) {
      return (
        (profile.brightness > 0.58 ? 0.2 : 0) +
        (profile.composition_balance > 0.62 ? 0.25 : 0) +
        (profile.warmth > 0.54 ? 0.2 : 0) +
        (profile.style.includes('luxury') || profile.style.includes('contemporary') ? 0.2 : 0) +
        (profile.clutter_score < 0.42 ? 0.15 : 0)
      )
    },
    summary: 'Your room feels refined, balanced, and quietly elevated.',
  },
  {
    label: 'Industrial Modern',
    score(profile) {
      return (
        (profile.saturation < 0.3 ? 0.25 : 0) +
        (profile.contrast > 0.36 ? 0.25 : 0) +
        (profile.style.includes('industrial') ? 0.25 : 0) +
        (profile.darkness > 0.42 ? 0.15 : 0) +
        (profile.composition_balance > 0.55 ? 0.1 : 0)
      )
    },
    summary: 'Your room has structured contrast and a modern, restrained palette.',
  },
  {
    label: 'Vibrant Creative Space',
    score(profile) {
      return (
        (profile.saturation > 0.4 ? 0.3 : 0) +
        (profile.density > 0.4 ? 0.25 : 0) +
        (profile.moods.includes('energetic') || profile.moods.includes('expressive') ? 0.25 : 0) +
        (profile.style.includes('creative') ? 0.2 : 0)
      )
    },
    summary: 'Your room holds bold color and lively visual rhythm.',
  },
]

export function classifyRoomPersonality(profile = {}) {
  const scored = PERSONALITIES.map((personality) => ({
    label: personality.label,
    score: Number(personality.score(profile).toFixed(3)),
    summary: personality.summary,
  })).sort((left, right) => right.score - left.score)

  return scored[0] || { label: 'Calm Retreat', score: 0, summary: PERSONALITIES[4].summary }
}

export function getRoomPersonalitySummary(label, profile = {}) {
  const match = PERSONALITIES.find((personality) => personality.label === label)
  if (match) {
    return match.summary
  }

  if (profile.moods.includes('calm')) {
    return 'Your room is calm, neutral, and visually clean.'
  }

  return 'Your room has a distinct visual atmosphere worth curating around.'
}

export function listRoomPersonalities() {
  return PERSONALITIES.map((personality) => personality.label)
}
