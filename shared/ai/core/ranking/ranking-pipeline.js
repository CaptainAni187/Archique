import { explainArtworkRecommendation, buildRecommendationReasons } from '../explainability/reasons.js'
import { retrieveCandidateArtworks } from '../retrieval/candidate-retrieval.js'
import { scoreArtworkWithPipeline, scoreArtworkForTaste } from './score-artwork.js'

export { scoreArtworkForTaste }

const rankingCache = new Map()
const explanationCache = new Map()
const CACHE_LIMIT = 120

function hashInput(artworks = [], options = {}) {
  const artworkIds = artworks.map((item) => Number(item.id)).join(',')
  const profileKey = JSON.stringify(options.tasteProfile || {})
  return `${artworkIds}|${profileKey}|${String(options.query || '')}|${JSON.stringify(
    options.moods || [],
  )}|${Number(options.limit || artworks.length)}`
}

function setCache(map, key, value) {
  map.set(key, value)
  if (map.size > CACHE_LIMIT) {
    const first = map.keys().next().value
    map.delete(first)
  }
}

function cloneRankedRows(rows = []) {
  return rows.map((row) => ({
    ...row,
    score_breakdown: row?.score_breakdown ? { ...row.score_breakdown } : {},
    recommendation_reasons: Array.isArray(row?.recommendation_reasons)
      ? [...row.recommendation_reasons]
      : [],
  }))
}

export function rankArtworksWithPipeline(artworks = [], {
  tasteProfile = {},
  query = '',
  moods = [],
  semanticScoresById = new Map(),
  limit = artworks.length,
} = {}) {
  if (!Array.isArray(artworks) || artworks.length === 0) {
    return []
  }

  const safeArtworks = artworks.filter(
    (item) =>
      item &&
      typeof item === 'object' &&
      Number.isFinite(Number(item.id)) &&
      typeof item.title === 'string',
  )
  if (safeArtworks.length === 0) {
    return []
  }

  const cacheKey = hashInput(artworks, { tasteProfile, query, moods, limit })
  const cached = rankingCache.get(cacheKey)
  if (cached) {
    return cloneRankedRows(cached)
  }

  const candidates = retrieveCandidateArtworks(safeArtworks, {
    query,
    moods,
    limit: Math.max(Number(limit) || artworks.length, artworks.length),
  })
  const selected = []
  const ranked = candidates
    .map((artwork) => {
      const semanticScore = semanticScoresById.get(Number(artwork.id)) || 0
      const scored = scoreArtworkWithPipeline(artwork, {
        tasteProfile,
        query,
        moods,
        semanticScore,
        selectedArtworks: selected,
      })

      return {
        ...artwork,
        ai_score: Number((scored.score * 10).toFixed(3)),
        confidence_score: scored.confidence_score,
        score_breakdown: scored.breakdown,
        recommendation_reasons: (() => {
          const key = `${Number(artwork.id)}|${JSON.stringify(tasteProfile || {})}|${JSON.stringify(
            scored.breakdown,
          )}`
          if (explanationCache.has(key)) {
            return explanationCache.get(key).reasons
          }
          const reasons = buildRecommendationReasons(artwork, tasteProfile, scored.breakdown)
          const explanation = explainArtworkRecommendation(artwork, tasteProfile, scored.breakdown)
          setCache(explanationCache, key, { reasons, explanation })
          return reasons
        })(),
        recommendation_explanation: (() => {
          const key = `${Number(artwork.id)}|${JSON.stringify(tasteProfile || {})}|${JSON.stringify(
            scored.breakdown,
          )}`
          if (explanationCache.has(key)) {
            return explanationCache.get(key).explanation
          }
          const reasons = buildRecommendationReasons(artwork, tasteProfile, scored.breakdown)
          const explanation = explainArtworkRecommendation(artwork, tasteProfile, scored.breakdown)
          setCache(explanationCache, key, { reasons, explanation })
          return explanation
        })(),
      }
    })
    .filter(
      (artwork) =>
        Number.isFinite(Number(artwork.ai_score)) &&
        Number.isFinite(Number(artwork.confidence_score)),
    )
    .sort((left, right) => right.ai_score - left.ai_score || Number(left.id) - Number(right.id))

  ranked.slice(0, limit).forEach((artwork) => selected.push(artwork))
  const result = ranked.slice(0, Math.max(1, Number(limit) || ranked.length))
  const safeResult = result.length > 0 ? result : safeArtworks.map((artwork) => ({ ...artwork }))
  setCache(rankingCache, cacheKey, cloneRankedRows(safeResult))
  return cloneRankedRows(safeResult)
}

export function rankArtworksForTaste(artworks = [], tasteProfile = {}) {
  return rankArtworksWithPipeline(artworks, {
    tasteProfile,
    limit: artworks.length,
  })
}

export function buildRecommendationSet(artworks = [], tasteProfile = {}, limit = 6) {
  return rankArtworksWithPipeline(artworks, {
    tasteProfile,
    limit: Math.max(1, Number(limit) || 6),
  })
}
