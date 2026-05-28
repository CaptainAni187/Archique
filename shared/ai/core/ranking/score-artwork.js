import { DEFAULT_RANKING_WEIGHTS, SEARCH_INTENT_RANKING_WEIGHTS } from '../config/weights.js'
import { buildArtworkFeatureProfile, buildArtworkSignals, normalizeNumber } from '../features/artwork-features.js'
import { buildTasteVector } from '../profiles/taste-vector.js'
import { parseSearchIntent } from '../search/intent-parser.js'

function averageAffinity(keys = [], affinity = {}) {
  if (!keys.length) {
    return 0
  }

  const total = keys.reduce((sum, key) => sum + normalizeNumber(affinity[key]), 0)
  return total / keys.length
}

function getPriceAffinity(artworkPrice, preferredAverage) {
  const price = normalizeNumber(artworkPrice, null)
  const average = normalizeNumber(preferredAverage, null)
  if (!Number.isFinite(price) || !Number.isFinite(average) || average <= 0) {
    return 0
  }

  return Math.max(0, 1 - Math.min(1, Math.abs(price - average) / average))
}

function getFreshnessBoost(artwork = {}) {
  if (artwork.is_featured === true) {
    return 0.45
  }

  if (Number.isFinite(Number(artwork.featured_rank))) {
    return Math.max(0, 0.4 - Number(artwork.featured_rank) * 0.03)
  }

  return 0
}

function getDiversityBoost(artwork, selectedArtworks = []) {
  if (!selectedArtworks.length) {
    return 0.5
  }

  const profile = buildArtworkFeatureProfile(artwork)
  const selectedTags = new Set(
    selectedArtworks.flatMap((selected) => buildArtworkFeatureProfile(selected).style_tags),
  )
  const overlap = profile.style_tags.filter((tag) => selectedTags.has(tag)).length

  return Math.max(0, 0.5 - overlap * 0.2)
}

export function scoreArtworkWithPipeline(artwork = {}, {
  tasteProfile = {},
  query = '',
  moods = [],
  semanticScore = 0,
  selectedArtworks = [],
  weights,
} = {}) {
  const intent = parseSearchIntent(query, moods)
  const resolvedWeights = weights || (intent.search_has_intent ? SEARCH_INTENT_RANKING_WEIGHTS : DEFAULT_RANKING_WEIGHTS)
  const tasteVector = buildTasteVector(tasteProfile)
  const featureProfile = buildArtworkFeatureProfile(artwork)
  const signals = buildArtworkSignals(artwork)
  const tasteAlignment = Math.max(
    averageAffinity(featureProfile.style_tags, tasteVector.style_affinity),
    averageAffinity(signals.tags, tasteVector.tag_affinity),
    averageAffinity([signals.category], tasteVector.category_affinity),
  )
  const moodAlignment = Math.max(
    averageAffinity(featureProfile.mood_tags, tasteVector.mood_affinity),
    averageAffinity(intent.moods, Object.fromEntries(featureProfile.mood_tags.map((tag) => [tag, 1]))),
  )
  const visualSimilarity = Math.max(
    averageAffinity(featureProfile.color_tags, tasteVector.color_affinity),
    averageAffinity(featureProfile.space_tags, tasteVector.space_affinity),
  )
  const priceAffinity = getPriceAffinity(artwork.price, tasteVector.price_affinity.average)
  const diversityBoost = getDiversityBoost(artwork, selectedArtworks)
  const freshnessBoost = getFreshnessBoost(artwork)
  const breakdown = {
    semantic_similarity: normalizeNumber(semanticScore),
    taste_alignment: tasteAlignment,
    mood_similarity: moodAlignment,
    visual_similarity: visualSimilarity,
    price_affinity: priceAffinity,
    diversity_boost: diversityBoost,
    freshness_boost: freshnessBoost,
  }
  const rawScore = Object.entries(resolvedWeights).reduce(
    (sum, [key, weight]) => sum + normalizeNumber(weight) * normalizeNumber(breakdown[key]),
    0,
  )

  return {
    score: Number(rawScore.toFixed(4)),
    confidence_score: Number(
      Math.min(1, rawScore * 0.7 + featureProfile.metadata_quality_score * 0.2 + tasteVector.confidence_score * 0.1).toFixed(3),
    ),
    breakdown,
    weights: resolvedWeights,
  }
}

export function scoreArtworkForTaste(artwork = {}, tasteProfile = {}, options = {}) {
  const pipelineScore = scoreArtworkWithPipeline(artwork, {
    tasteProfile,
    selectedArtworks: options.selectedArtworks || [],
  })

  return Number((pipelineScore.score * 10).toFixed(3))
}
