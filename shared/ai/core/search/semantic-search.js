import { retrieveCandidateArtworks } from '../retrieval/candidate-retrieval.js'
import { rankArtworksWithPipeline } from '../ranking/ranking-pipeline.js'
import { smartKeywordSearch } from './keyword-search.js'
import { parseSearchIntent } from './intent-parser.js'

export function searchArtworks({
  artworks = [],
  query = '',
  moods = [],
  limit = 12,
  tasteProfile = {},
  semanticScoresById = new Map(),
} = {}) {
  const intent = parseSearchIntent(query, moods)
  const candidates = retrieveCandidateArtworks(artworks, {
    query,
    moods,
    limit: Math.max(Number(limit) || 12, 24),
  })

  if (!intent.search_has_intent) {
    return candidates.slice(0, limit).map((artwork) => ({
      artwork,
      score: 0,
      explanation: 'Shown from the current browsing order.',
      source: 'default',
      confidence_score: 0,
      reasons: [],
    }))
  }

  const ranked = rankArtworksWithPipeline(candidates, {
    tasteProfile,
    query,
    moods: intent.moods,
    semanticScoresById,
    limit: Math.max(1, Number(limit) || 12),
  }).map((artwork) => ({
    artwork,
    score: artwork.ai_score,
    explanation: artwork.recommendation_explanation,
    source: semanticScoresById.size > 0 ? 'hybrid' : 'keyword',
    confidence_score: artwork.confidence_score,
    reasons: artwork.recommendation_reasons || [],
  }))

  if (ranked.length > 0) {
    return ranked
  }

  return smartKeywordSearch(artworks, query, intent.moods, limit)
}
