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

  // Build an explanation once per (artwork, taste, breakdown) and reuse it.
  const describe = (artwork, scored) => {
    const key = `${Number(artwork.id)}|${JSON.stringify(tasteProfile || {})}|${JSON.stringify(
      scored.breakdown,
    )}`
    if (!explanationCache.has(key)) {
      setCache(explanationCache, key, {
        reasons: buildRecommendationReasons(artwork, tasteProfile, scored.breakdown),
        explanation: explainArtworkRecommendation(artwork, tasteProfile, scored.breakdown),
      })
    }
    return explanationCache.get(key)
  }

  const decorate = (artwork, scored) => {
    const described = describe(artwork, scored)
    return {
      ...artwork,
      ai_score: Number((scored.score * 10).toFixed(3)),
      confidence_score: scored.confidence_score,
      score_breakdown: scored.breakdown,
      recommendation_reasons: described.reasons,
      recommendation_explanation: described.explanation,
    }
  }

  const isUsable = (row) =>
    Number.isFinite(Number(row.ai_score)) && Number.isFinite(Number(row.confidence_score))

  // Greedy selection, so diversity actually applies.
  //
  // Scoring every candidate in one pass cannot diversify: the diversity term
  // compares an artwork against those already chosen, and in a single map
  // nothing has been chosen yet. It previously returned the same constant for
  // every candidate, which adds an identical amount to every score and so
  // cannot change the order — the feature was inert. Choosing one at a time
  // and re-scoring what remains against the running selection is what makes
  // the term mean anything.
  const selected = []
  const remaining = [...candidates]
  const targetCount = Math.max(1, Number(limit) || remaining.length)
  const ranked = []

  while (remaining.length > 0 && ranked.length < targetCount) {
    let bestIndex = -1
    let bestRow = null

    for (let index = 0; index < remaining.length; index += 1) {
      const artwork = remaining[index]
      const scored = scoreArtworkWithPipeline(artwork, {
        tasteProfile,
        query,
        moods,
        semanticScore: semanticScoresById.get(Number(artwork.id)) || 0,
        selectedArtworks: selected,
      })
      const row = decorate(artwork, scored)

      if (!isUsable(row)) {
        continue
      }

      // Ties break on id so ordering stays stable across identical inputs.
      const better =
        bestRow === null ||
        row.ai_score > bestRow.ai_score ||
        (row.ai_score === bestRow.ai_score && Number(row.id) < Number(bestRow.id))

      if (better) {
        bestIndex = index
        bestRow = row
      }
    }

    if (bestIndex === -1) {
      break
    }

    ranked.push(bestRow)
    selected.push(bestRow)
    remaining.splice(bestIndex, 1)
  }

  const safeResult = ranked.length > 0 ? ranked : safeArtworks.map((artwork) => ({ ...artwork }))
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
