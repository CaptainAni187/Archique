import { createEmptyTasteProfile } from './taste-profile.js'

function normalizeBucket(bucket = {}) {
  const entries = Object.entries(bucket)
  const maxValue = Math.max(0, ...entries.map(([, value]) => Number(value) || 0))

  if (maxValue === 0) {
    return {}
  }

  return Object.fromEntries(
    entries.map(([key, value]) => [key, Number(((Number(value) || 0) / maxValue).toFixed(3))]),
  )
}

export function buildTasteVector(profile = {}) {
  const baseProfile = {
    ...createEmptyTasteProfile(),
    ...profile,
    price_preference: {
      ...createEmptyTasteProfile().price_preference,
      ...(profile.price_preference || {}),
    },
  }

  return {
    style_affinity: normalizeBucket(baseProfile.style_affinity || baseProfile.tag_weights),
    mood_affinity: normalizeBucket(baseProfile.mood_affinity),
    color_affinity: normalizeBucket(baseProfile.color_affinity),
    space_affinity: normalizeBucket(baseProfile.space_affinity),
    tag_affinity: normalizeBucket(baseProfile.tag_weights),
    category_affinity: normalizeBucket(baseProfile.category_weights),
    artwork_affinity: normalizeBucket(baseProfile.artwork_weights),
    price_affinity: {
      buckets: normalizeBucket(baseProfile.price_affinity),
      average: baseProfile.price_preference.average,
      min: baseProfile.price_preference.min,
      max: baseProfile.price_preference.max,
    },
    confidence_score: Number(baseProfile.confidence_score || 0),
    recommendation_confidence: Number(baseProfile.recommendation_confidence || 0),
  }
}

export function hasTasteSignals(profile = {}) {
  const vector = buildTasteVector(profile)

  return (
    Object.keys(vector.tag_affinity).length > 0 ||
    Object.keys(vector.category_affinity).length > 0 ||
    Object.keys(vector.artwork_affinity).length > 0 ||
    Number(profile.price_preference?.total_weight || 0) > 0
  )
}
