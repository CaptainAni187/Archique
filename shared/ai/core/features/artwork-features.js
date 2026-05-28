import { getPriceBucket } from '../config/weights.js'
import {
  categorizeTags,
  inferTagsFromText,
  normalizeNumber,
  normalizeTags,
  normalizeText,
  tokenizeText,
} from '../tagging/tag-taxonomy.js'

export { normalizeNumber, normalizeTags, normalizeText, tokenizeText }

export function createArtworkSearchDocument(artwork = {}) {
  const tags = normalizeTags(artwork.tags)
  return [
    artwork.title,
    artwork.description,
    artwork.medium,
    artwork.size,
    artwork.category,
    tags.join(' '),
    Number.isFinite(Number(artwork.price)) ? `price ${Number(artwork.price)}` : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function buildArtworkSignals(artwork = {}) {
  const category = normalizeText(artwork.category)
  const tags = normalizeTags(artwork.tags)
  const textTokens = [
    ...tokenizeText(artwork.title),
    ...tokenizeText(artwork.medium),
    ...tokenizeText(artwork.description),
  ]

  return {
    category,
    tags,
    textTokens: textTokens.filter(
      (token, index, collection) => collection.indexOf(token) === index,
    ),
  }
}

function estimateMetadataQuality(artwork, normalizedTags) {
  const fields = [
    artwork.title,
    artwork.description,
    artwork.medium,
    artwork.category,
    Array.isArray(artwork.images) && artwork.images.length > 0 ? 'images' : '',
  ]
  const fieldScore = fields.filter(Boolean).length / fields.length
  const tagScore = Math.min(1, normalizedTags.length / 5)

  return Number(((fieldScore * 0.65) + (tagScore * 0.35)).toFixed(3))
}

export function buildArtworkFeatureProfile(artwork = {}) {
  const explicitTags = normalizeTags(artwork.tags)
  const inferredTags = inferTagsFromText(
    artwork.title,
    artwork.description,
    artwork.medium,
    artwork.category,
  )
  const allTags = normalizeTags([...explicitTags, ...inferredTags])
  const normalizedTags = categorizeTags(allTags)
  const price = normalizeNumber(artwork.price, null)
  const textTokens = tokenizeText(createArtworkSearchDocument(artwork))

  return {
    artwork_id: artwork.id ?? null,
    normalized_tags: normalizedTags,
    style_tags: normalizedTags.style_tags,
    mood_tags: normalizedTags.mood_tags,
    subject_tags: normalizedTags.subject_tags,
    color_tags: normalizedTags.color_tags,
    space_tags: normalizedTags.space_tags,
    price_bucket: getPriceBucket(price),
    feature_vector: {
      tag_count: allTags.length,
      text_token_count: textTokens.length,
      has_description: Boolean(normalizeText(artwork.description)),
      is_featured: artwork.is_featured === true,
      price: Number.isFinite(price) ? price : null,
    },
    embedding_vector: Array.isArray(artwork.embedding_vector) ? artwork.embedding_vector : [],
    image_vector: Array.isArray(artwork.image_vector) ? artwork.image_vector : [],
    metadata_quality_score: estimateMetadataQuality(artwork, allTags),
  }
}
