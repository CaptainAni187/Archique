/**
 * Semantic scoring from precomputed vectors.
 *
 * Artwork and lexicon vectors are generated offline
 * (scripts/build-artwork-embeddings.mjs), so scoring a query here is pure
 * arithmetic — no model, no API call, no network, no cost at request time.
 *
 * A query vector is composed as the mean of the vectors of the lexicon terms it
 * mentions. If the query mentions nothing we know, we return null and the
 * caller falls back to keyword search.
 */
import embeddingData from '../../data/artwork-embeddings.js'

const ARTWORK_VECTORS = embeddingData?.artworks || {}
const LEXICON = embeddingData?.lexicon || {}
const SIMILAR = embeddingData?.similar_by_artwork_id || {}

// Longest-first so "living room" wins over "living" / "room".
const LEXICON_TERMS = Object.keys(LEXICON).sort((a, b) => b.length - a.length)

export function hasEmbeddingData() {
  return Object.keys(ARTWORK_VECTORS).length > 0 && LEXICON_TERMS.length > 0
}

export function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) {
    return 0
  }

  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  const length = Math.min(left.length, right.length)

  for (let index = 0; index < length; index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Terms from the lexicon that the query actually mentions.
 * Multi-word terms match as phrases; single words match whole tokens only, so
 * "art" does not match inside "heart".
 */
export function matchLexiconTerms(text) {
  const normalized = normalizeText(text)
  if (!normalized) {
    return []
  }

  const tokens = new Set(normalized.split(' '))
  const matched = []
  let remaining = ` ${normalized} `

  for (const term of LEXICON_TERMS) {
    if (term.includes(' ')) {
      if (remaining.includes(` ${term} `)) {
        matched.push(term)
        remaining = remaining.replace(` ${term} `, ' ')
      }
    } else if (tokens.has(term)) {
      matched.push(term)
    }
  }

  return matched
}

/** Mean of the matched lexicon vectors, or null when nothing is recognised. */
export function buildQueryVector(text) {
  const terms = matchLexiconTerms(text)
  if (terms.length === 0) {
    return null
  }

  const dimensions = LEXICON[terms[0]].length
  const vector = new Array(dimensions).fill(0)

  for (const term of terms) {
    const termVector = LEXICON[term]
    for (let index = 0; index < dimensions; index += 1) {
      vector[index] += termVector[index]
    }
  }

  for (let index = 0; index < dimensions; index += 1) {
    vector[index] /= terms.length
  }

  return vector
}

/**
 * Map of artworkId -> semantic score (0..1) for the given query text.
 * Returns an empty Map when the query has no recognisable terms.
 */
export function scoreArtworksByEmbedding(text, { minScore = 0.15 } = {}) {
  const queryVector = buildQueryVector(text)
  if (!queryVector) {
    return { scores: new Map(), matchedTerms: [] }
  }

  const scores = new Map()
  for (const [artworkId, vector] of Object.entries(ARTWORK_VECTORS)) {
    const score = cosineSimilarity(queryVector, vector)
    if (score >= minScore) {
      scores.set(Number(artworkId), Number(score.toFixed(4)))
    }
  }

  return { scores, matchedTerms: matchLexiconTerms(text) }
}

/** Precomputed nearest neighbours for "more like this". */
export function getSimilarArtworkIds(artworkId, limit = 4) {
  const neighbours = SIMILAR[String(artworkId)] || []
  return neighbours.slice(0, limit).map((entry) => ({
    id: Number(entry.id),
    score: Number(entry.score),
  }))
}

export const embeddingMeta = {
  model: embeddingData?.model || null,
  dimensions: embeddingData?.dimensions || 0,
  artworkCount: embeddingData?.artwork_count || 0,
  generatedAt: embeddingData?.generated_at || null,
}
