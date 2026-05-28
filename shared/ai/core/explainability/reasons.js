import { buildArtworkFeatureProfile, buildArtworkSignals, normalizeNumber, normalizeTags, normalizeText } from '../features/artwork-features.js'
import { createEmptyTasteProfile } from '../profiles/taste-profile.js'

export function buildRecommendationReasons(artwork = {}, tasteProfile = {}, scoreBreakdown = {}) {
  const profile = {
    ...createEmptyTasteProfile(),
    ...tasteProfile,
    price_preference: {
      ...createEmptyTasteProfile().price_preference,
      ...(tasteProfile.price_preference || {}),
    },
  }
  const signals = buildArtworkSignals(artwork)
  const featureProfile = buildArtworkFeatureProfile(artwork)
  const reasons = []
  const matchingTags = signals.tags.filter((tag) => normalizeNumber(profile.tag_weights?.[tag]) > 0)
  const matchingMoods = featureProfile.mood_tags.filter(
    (tag) => normalizeNumber(profile.mood_affinity?.[tag]) > 0,
  )
  const categoryWeight = normalizeNumber(profile.category_weights?.[signals.category])
  const artworkPrice = normalizeNumber(artwork.price, null)
  const preferredPrice = normalizeNumber(profile.price_preference?.average, null)
  const repeatedWeight = normalizeNumber(profile.artwork_weights?.[String(artwork.id)])

  if (matchingMoods.length > 0) {
    reasons.push(`matches your ${matchingMoods.slice(0, 2).join(' and ')} aesthetic preference`)
  }

  if (matchingTags.length > 0) {
    reasons.push(`shares tags like ${matchingTags.slice(0, 3).join(', ')}`)
  }

  if (signals.category && categoryWeight > 0) {
    reasons.push(`fits your ${signals.category} browsing`)
  }

  if (Number.isFinite(artworkPrice) && Number.isFinite(preferredPrice) && preferredPrice > 0) {
    const proximity = 1 - Math.min(1, Math.abs(artworkPrice - preferredPrice) / preferredPrice)
    if (proximity >= 0.65) {
      reasons.push('fits your preferred price range')
    }
  }

  if (repeatedWeight > 1) {
    reasons.push('is similar to recently viewed artworks')
  }

  if (scoreBreakdown.semantic_similarity > 0.25) {
    reasons.push('matches the current search intent')
  }

  return reasons.slice(0, 3)
}

export function explainArtworkRecommendation(artwork = {}, tasteProfile = {}, scoreBreakdown = {}) {
  const reasons = buildRecommendationReasons(artwork, tasteProfile, scoreBreakdown)

  return reasons.length > 0
    ? `Shown because it ${reasons.join(', ')}.`
    : 'Shown from your recent browsing signals. Explore more works to improve recommendations.'
}

export function explainSmartSearchMatch(artwork = {}, query = '', moods = [], matchedTerms = []) {
  const parts = []
  const tags = normalizeTags(artwork.tags)
  const category = normalizeText(artwork.category)

  if (matchedTerms.length > 0) {
    parts.push(`matches ${matchedTerms.slice(0, 3).join(', ')}`)
  }

  if (moods.length > 0) {
    parts.push(`fits the ${moods.slice(0, 2).join(' and ')} mood`)
  }

  if (tags.length > 0) {
    parts.push(`shares tags like ${tags.slice(0, 2).join(', ')}`)
  } else if (category) {
    parts.push(`belongs to ${category}`)
  }

  if (Number.isFinite(Number(artwork.price))) {
    parts.push(`sits around Rs. ${Number(artwork.price).toLocaleString()}`)
  }

  return parts.length > 0
    ? `Shown because it ${parts.slice(0, 3).join(', ')}.`
    : 'Shown because it is the closest local match for this search.'
}
