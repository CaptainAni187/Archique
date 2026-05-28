import { buildArtworkFeatureProfile, createArtworkSearchDocument, tokenizeText } from '../features/artwork-features.js'
import { parseSearchIntent } from '../search/intent-parser.js'

export function retrieveCandidateArtworks(artworks = [], { query = '', moods = [], limit = 48 } = {}) {
  const intent = parseSearchIntent(query, moods)

  if (!intent.search_has_intent) {
    return artworks.slice(0, Math.max(limit, artworks.length))
  }

  const candidates = artworks
    .map((artwork) => {
      const featureProfile = buildArtworkFeatureProfile(artwork)
      const documentTokens = tokenizeText(createArtworkSearchDocument(artwork))
      const tokenMatches = intent.tokens.filter((token) => documentTokens.includes(token)).length
      const moodMatches = intent.moods.filter((mood) => featureProfile.mood_tags.includes(mood)).length
      const spaceMatches = intent.room_context
        ? featureProfile.space_tags.includes(intent.room_context)
          ? 1
          : 0
        : 0

      return {
        artwork,
        retrieval_score:
          tokenMatches * 2 +
          moodMatches * 1.5 +
          spaceMatches +
          (artwork.is_featured === true ? 0.2 : 0),
      }
    })
    .filter((item) => item.retrieval_score > 0)
    .sort((left, right) => right.retrieval_score - left.retrieval_score)
    .map((item) => item.artwork)

  return candidates.length > 0 ? candidates.slice(0, limit) : artworks.slice(0, limit)
}
