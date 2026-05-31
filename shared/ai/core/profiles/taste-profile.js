import { EVENT_WEIGHTS } from '../config/weights.js'
import { buildArtworkFeatureProfile, buildArtworkSignals, normalizeNumber, normalizeTags, tokenizeText } from '../features/artwork-features.js'
import { normalizeText } from '../tagging/tag-taxonomy.js'

export function createEmptyTasteProfile() {
  return {
    event_counts: {},
    category_weights: {},
    tag_weights: {},
    artwork_weights: {},
    style_affinity: {},
    mood_affinity: {},
    color_affinity: {},
    space_affinity: {},
    price_preference: {
      min: null,
      max: null,
      average: null,
      total_weight: 0,
    },
    price_affinity: {},
    search_terms: {},
    confidence_score: 0,
    recommendation_feedback: {
      shown: 0,
      clicked: 0,
      purchased: 0,
      saved: 0,
      revisited: 0,
      ignored: 0,
      save_adds: 0,
      save_removals: 0,
    },
    recommendation_confidence: 0,
    last_event_type: null,
    last_updated_at: null,
  }
}

export function incrementWeight(bucket, key, weight) {
  if (!key) {
    return bucket
  }

  return {
    ...bucket,
    [key]: normalizeNumber(bucket[key]) + weight,
  }
}

function incrementMany(bucket, keys, weight) {
  return keys.reduce((nextBucket, key) => incrementWeight(nextBucket, key, weight), { ...bucket })
}

function updatePricePreference(pricePreference, price, weight) {
  if (!Number.isFinite(price)) {
    return pricePreference
  }

  const previousTotalWeight = normalizeNumber(pricePreference.total_weight)
  const nextTotalWeight = previousTotalWeight + weight
  const previousAverage =
    pricePreference.average == null ? price : normalizeNumber(pricePreference.average, price)

  return {
    min:
      pricePreference.min == null
        ? price
        : Math.min(normalizeNumber(pricePreference.min, price), price),
    max:
      pricePreference.max == null
        ? price
        : Math.max(normalizeNumber(pricePreference.max, price), price),
    average: Number(
      (((previousAverage * previousTotalWeight) + (price * weight)) / nextTotalWeight).toFixed(2),
    ),
    total_weight: Number(nextTotalWeight.toFixed(3)),
  }
}

export function mergeTasteProfileForEvent(currentProfile = {}, event = {}) {
  const emptyProfile = createEmptyTasteProfile()
  const baseProfile = {
    ...emptyProfile,
    ...currentProfile,
    price_preference: {
      ...emptyProfile.price_preference,
      ...(currentProfile.price_preference || {}),
    },
    recommendation_feedback: {
      ...emptyProfile.recommendation_feedback,
      ...(currentProfile.recommendation_feedback || {}),
    },
  }
  const eventType = normalizeText(event.event_type)
  const metadata = event.metadata || {}
  const dwellWeight = Math.min(3, normalizeNumber(metadata.dwell_time_ms) / 15000)
  const hoverWeight = Math.min(2, normalizeNumber(metadata.hover_dwell_time_ms) / 10000)
  const weight = (EVENT_WEIGHTS[eventType] || 1) + dwellWeight + hoverWeight
  const artworkSignals = buildArtworkSignals(metadata.artwork || metadata)
  const featureProfile = buildArtworkFeatureProfile(metadata.artwork || metadata)
  const category = artworkSignals.category || normalizeText(metadata.category)
  const tags = artworkSignals.tags.length > 0 ? artworkSignals.tags : normalizeTags(metadata.tags)
  const queryTokens = tokenizeText(metadata.query)
  const artworkId = metadata.artwork_id || metadata.id || metadata.artwork?.id || null
  const price = normalizeNumber(metadata.price ?? metadata.artwork?.price, null)

  const nextProfile = {
    ...baseProfile,
    event_counts: incrementWeight(baseProfile.event_counts, eventType, 1),
    category_weights: category
      ? incrementWeight(baseProfile.category_weights, category, weight)
      : { ...baseProfile.category_weights },
    tag_weights: incrementMany(baseProfile.tag_weights, tags, weight),
    artwork_weights: { ...baseProfile.artwork_weights },
    style_affinity: incrementMany(baseProfile.style_affinity, featureProfile.style_tags, weight),
    mood_affinity: incrementMany(baseProfile.mood_affinity, featureProfile.mood_tags, weight),
    color_affinity: incrementMany(baseProfile.color_affinity, featureProfile.color_tags, weight),
    space_affinity: incrementMany(baseProfile.space_affinity, featureProfile.space_tags, weight),
    price_preference: updatePricePreference({ ...baseProfile.price_preference }, price, weight),
    price_affinity: { ...baseProfile.price_affinity },
    search_terms: incrementMany(baseProfile.search_terms, queryTokens, weight),
    last_event_type: eventType || baseProfile.last_event_type,
    last_updated_at: event.timestamp || new Date().toISOString(),
  }

  if (featureProfile.price_bucket && featureProfile.price_bucket !== 'unknown') {
    nextProfile.price_affinity = incrementWeight(
      nextProfile.price_affinity,
      featureProfile.price_bucket,
      weight,
    )
  }

  if (artworkId != null) {
    nextProfile.artwork_weights = incrementWeight(
      nextProfile.artwork_weights,
      String(artworkId),
      weight,
    )
  }

  if (eventType === 'recommendation_shown') {
    nextProfile.recommendation_feedback.shown += 1
  } else if (eventType === 'recommendation_clicked') {
    nextProfile.recommendation_feedback.clicked += 1
  } else if (eventType === 'recommendation_purchased') {
    nextProfile.recommendation_feedback.purchased += 1
  } else if (eventType === 'recommendation_saved') {
    nextProfile.recommendation_feedback.saved += 1
  } else if (eventType === 'recommendation_revisited') {
    nextProfile.recommendation_feedback.revisited += 1
  } else if (eventType === 'recommendation_ignored') {
    nextProfile.recommendation_feedback.ignored += 1
  } else if (eventType === 'favorite_added') {
    nextProfile.recommendation_feedback.save_adds += 1
  } else if (eventType === 'favorite_removed') {
    nextProfile.recommendation_feedback.save_removals += 1
  }

  const signalCount =
    Object.keys(nextProfile.tag_weights).length +
    Object.keys(nextProfile.artwork_weights).length +
    Object.keys(nextProfile.search_terms).length +
    normalizeNumber(nextProfile.price_preference.total_weight)

  nextProfile.confidence_score = Number(Math.min(1, signalCount / 20).toFixed(3))
  const shown = normalizeNumber(nextProfile.recommendation_feedback.shown)
  const clicked = normalizeNumber(nextProfile.recommendation_feedback.clicked)
  const purchased = normalizeNumber(nextProfile.recommendation_feedback.purchased)
  const saved = normalizeNumber(nextProfile.recommendation_feedback.saved)
  const revisited = normalizeNumber(nextProfile.recommendation_feedback.revisited)
  const ignored = normalizeNumber(nextProfile.recommendation_feedback.ignored)
  nextProfile.recommendation_confidence = Number(
    (
      shown > 0
        ? Math.max(
            0,
            Math.min(
              1,
              (clicked * 0.25 + saved * 0.55 + revisited * 0.35 + purchased * 1.0 - ignored * 0.2) /
                shown,
            ),
          )
        : 0
    ).toFixed(3),
  )

  return nextProfile
}
