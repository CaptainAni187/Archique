import { explainArtworkRecommendation, buildRecommendationReasons } from '../explainability/reasons.js'
import { retrieveCandidateArtworks } from '../retrieval/candidate-retrieval.js'
import { scoreArtworkWithPipeline, scoreArtworkForTaste } from './score-artwork.js'

export { scoreArtworkForTaste }

export function rankArtworksWithPipeline(artworks = [], {
  tasteProfile = {},
  query = '',
  moods = [],
  semanticScoresById = new Map(),
  limit = artworks.length,
} = {}) {
  const candidates = retrieveCandidateArtworks(artworks, {
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
        recommendation_reasons: buildRecommendationReasons(artwork, tasteProfile, scored.breakdown),
        recommendation_explanation: explainArtworkRecommendation(artwork, tasteProfile, scored.breakdown),
      }
    })
    .sort((left, right) => right.ai_score - left.ai_score || Number(left.id) - Number(right.id))

  ranked.slice(0, limit).forEach((artwork) => selected.push(artwork))
  return ranked.slice(0, Math.max(1, Number(limit) || ranked.length))
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
