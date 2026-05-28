import { buildRecommendationSet, rankArtworksForTaste } from '../ranking/ranking-pipeline.js'
import { hasTasteSignals } from '../profiles/taste-vector.js'

export function recommendArtworks({ artworks = [], tasteProfile = {}, limit = 6 } = {}) {
  if (!hasTasteSignals(tasteProfile)) {
    return []
  }

  return buildRecommendationSet(artworks, tasteProfile, limit)
}

export function rankArtworksByTaste({ artworks = [], tasteProfile = {} } = {}) {
  if (!hasTasteSignals(tasteProfile)) {
    return artworks
  }

  return rankArtworksForTaste(artworks, tasteProfile)
}
