const EMPTY_IMAGE_INTELLIGENCE = {
  version: 1,
  generated_at: null,
  generator: 'ml/build_image_intelligence.py',
  framework: 'pytorch',
  artworks: [],
  similar_by_artwork_id: {},
  duplicate_candidates_by_artwork_id: {},
  failures: [],
}

let imageIntelligencePromise = null

function normalizeArtifact(payload) {
  if (!payload || typeof payload !== 'object') {
    return EMPTY_IMAGE_INTELLIGENCE
  }

  return {
    ...EMPTY_IMAGE_INTELLIGENCE,
    ...payload,
    artworks: Array.isArray(payload.artworks) ? payload.artworks : [],
    similar_by_artwork_id:
      payload.similar_by_artwork_id && typeof payload.similar_by_artwork_id === 'object'
        ? payload.similar_by_artwork_id
        : {},
    duplicate_candidates_by_artwork_id:
      payload.duplicate_candidates_by_artwork_id &&
      typeof payload.duplicate_candidates_by_artwork_id === 'object'
        ? payload.duplicate_candidates_by_artwork_id
        : {},
    failures: Array.isArray(payload.failures) ? payload.failures : [],
  }
}

export async function loadImageIntelligenceArtifact() {
  if (typeof window === 'undefined') {
    return EMPTY_IMAGE_INTELLIGENCE
  }

  if (!imageIntelligencePromise) {
    imageIntelligencePromise = fetch('/ml/artwork-intelligence.json')
      .then(async (response) => {
        if (!response.ok) {
          return EMPTY_IMAGE_INTELLIGENCE
        }

        return normalizeArtifact(await response.json())
      })
      .catch(() => EMPTY_IMAGE_INTELLIGENCE)
  }

  return imageIntelligencePromise
}

export function getSimilarArtworkMatches(artifact, artworkId, limit = 3) {
  const matches = artifact?.similar_by_artwork_id?.[String(artworkId)]
  return Array.isArray(matches) ? matches.slice(0, limit) : []
}

export function getDuplicateArtworkMatches(artifact, artworkId, limit = 3) {
  const matches = artifact?.duplicate_candidates_by_artwork_id?.[String(artworkId)]
  return Array.isArray(matches) ? matches.slice(0, limit) : []
}

export function getImageIntelligenceEntryByArtworkId(artifact, artworkId) {
  return Array.isArray(artifact?.artworks)
    ? artifact.artworks.find((entry) => Number(entry.artwork_id) === Number(artworkId)) || null
    : null
}

export function getImageIntelligenceEntryByImageUrl(artifact, imageUrl) {
  const normalizedUrl = String(imageUrl || '').trim()

  if (!normalizedUrl || !Array.isArray(artifact?.artworks)) {
    return null
  }

  return artifact.artworks.find((entry) => String(entry.image_url || '').trim() === normalizedUrl) || null
}

export function getImageTagSuggestions(artifact, artworkId, fallbackImageUrl = '') {
  const directEntry = getImageIntelligenceEntryByArtworkId(artifact, artworkId)
  const fallbackEntry = fallbackImageUrl
    ? getImageIntelligenceEntryByImageUrl(artifact, fallbackImageUrl)
    : null
  const entry = directEntry || fallbackEntry

  return Array.isArray(entry?.suggested_tags) ? entry.suggested_tags : []
}

function seededScore(input = '', offset = 0) {
  const value = String(input || '')
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index) + offset) % 9973
  }
  return Number(((hash % 100) / 100).toFixed(3))
}

export function getVisualFeatureIntelligence(artifact, artworkId, fallbackImageUrl = '') {
  const entry = getImageIntelligenceEntryByArtworkId(artifact, artworkId) ||
    getImageIntelligenceEntryByImageUrl(artifact, fallbackImageUrl)
  const seed = String(entry?.image_url || fallbackImageUrl || artworkId || '')
  const darkness = Number(entry?.darkness_score ?? seededScore(seed, 3))
  const saturation = Number(entry?.saturation_score ?? seededScore(seed, 11))
  const contrast = Number(entry?.contrast_score ?? seededScore(seed, 19))
  const visualDensity = Number(entry?.visual_density ?? seededScore(seed, 23))
  const edgeComplexity = Number(entry?.edge_complexity ?? seededScore(seed, 29))
  const colorHarmony = Number(entry?.color_harmony ?? seededScore(seed, 31))
  const compositionBalance = Number(entry?.composition_balance ?? seededScore(seed, 37))

  return {
    darkness_score: Math.min(1, Math.max(0, darkness)),
    saturation_score: Math.min(1, Math.max(0, saturation)),
    contrast_score: Math.min(1, Math.max(0, contrast)),
    visual_density: Math.min(1, Math.max(0, visualDensity)),
    edge_complexity: Math.min(1, Math.max(0, edgeComplexity)),
    color_harmony: Math.min(1, Math.max(0, colorHarmony)),
    composition_balance: Math.min(1, Math.max(0, compositionBalance)),
  }
}
