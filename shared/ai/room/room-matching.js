import { buildArtworkFeatureProfile } from '../core/features/artwork-features.js'
import { scoreArtworkWithPipeline } from '../core/ranking/score-artwork.js'

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function average(values = []) {
  if (!values.length) {
    return 0
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function tagOverlap(tagsA = [], tagsB = []) {
  if (!tagsA.length || !tagsB.length) {
    return 0
  }
  const setB = new Set(tagsB.map((tag) => String(tag).toLowerCase()))
  const overlap = tagsA.filter((tag) => setB.has(String(tag).toLowerCase())).length
  return overlap / Math.max(tagsA.length, tagsB.length)
}

export function buildArtworkRoomSignals(artwork = {}) {
  const profile = buildArtworkFeatureProfile(artwork)
  const tags = [
    ...profile.style_tags,
    ...profile.mood_tags,
    ...profile.color_tags,
    ...profile.space_tags,
    ...profile.subject_tags,
  ]

  const tagSet = new Set(tags.map((tag) => String(tag).toLowerCase()))
  const has = (...values) => values.some((value) => tagSet.has(String(value).toLowerCase()))

  return {
    artwork_id: artwork.id ?? null,
    tags,
    style_tags: profile.style_tags,
    mood_tags: profile.mood_tags,
    color_tags: profile.color_tags,
    space_tags: profile.space_tags,
    brightness: has('bright', 'light', 'soft', 'minimal') ? 0.72 : has('dark', 'moody', 'noir') ? 0.28 : 0.5,
    saturation: has('vibrant', 'colorful', 'bold', 'anime') ? 0.72 : has('muted', 'minimal', 'monochrome') ? 0.24 : 0.45,
    density: has('detailed', 'complex', 'expressive') ? 0.68 : has('minimal', 'clean', 'simple') ? 0.22 : 0.42,
    warmth: has('warm', 'gold', 'earth') ? 0.68 : has('cool', 'blue', 'monochrome') ? 0.32 : 0.5,
    contrast: has('bold', 'dramatic', 'statement') ? 0.72 : has('soft', 'calm', 'minimal') ? 0.28 : 0.46,
    minimal: has('minimal', 'clean', 'simple', 'line') ? 0.78 : 0.25,
    bold: has('bold', 'statement', 'vibrant', 'expressive') ? 0.74 : 0.22,
  }
}

function scoreAlignment(left = 0.5, right = 0.5) {
  return clamp(1 - Math.abs(left - right))
}

export function scoreRoomHarmony(roomProfile = {}, artwork = {}) {
  const signals = buildArtworkRoomSignals(artwork)
  const roomTags = [...(roomProfile.moods || []), ...(roomProfile.style || [])]
  const alignment = average([
    scoreAlignment(roomProfile.brightness, signals.brightness),
    scoreAlignment(roomProfile.saturation, signals.saturation),
    scoreAlignment(roomProfile.density, signals.density),
    scoreAlignment(roomProfile.warmth, signals.warmth),
    scoreAlignment(1 - roomProfile.clutter_score, 1 - signals.density),
    tagOverlap(roomTags, signals.tags),
    tagOverlap(
      (roomProfile.dominant_colors || []).map((color) => color.label),
      signals.color_tags,
    ),
  ])

  return Number(clamp(alignment).toFixed(3))
}

export function scoreRoomContrast(roomProfile = {}, artwork = {}) {
  const signals = buildArtworkRoomSignals(artwork)
  const contrastNeeds = {
    brightness: roomProfile.brightness < 0.45 ? 0.72 : roomProfile.brightness > 0.68 ? 0.35 : 0.55,
    saturation: roomProfile.saturation < 0.3 ? 0.72 : 0.42,
    density: roomProfile.density < 0.28 ? 0.74 : 0.4,
    bold: roomProfile.clutter_score < 0.34 ? 0.78 : 0.45,
  }

  const contrastScore = average([
    scoreAlignment(contrastNeeds.brightness, signals.brightness),
    scoreAlignment(contrastNeeds.saturation, signals.saturation),
    scoreAlignment(contrastNeeds.density, signals.density),
    scoreAlignment(contrastNeeds.bold, signals.bold),
    signals.bold,
  ])

  return Number(clamp(contrastScore).toFixed(3))
}

export function computeRoomMatchScore(roomProfile = {}, artwork = {}, tasteProfile = {}, options = {}) {
  const pipeline = scoreArtworkWithPipeline(artwork, { tasteProfile })
  const harmony = scoreRoomHarmony(roomProfile, artwork)
  const contrast = scoreRoomContrast(roomProfile, artwork)
  const mode = options.mode === 'contrast' ? 'contrast' : 'harmony'
  const modeScore = mode === 'contrast' ? contrast : harmony
  const comboBoost = Number(options.combo_boost || 0)

  const roomMatchScore = Number(
    clamp(
      modeScore * 0.48 +
        Number(pipeline.score || 0) * 0.28 +
        harmony * 0.12 +
        contrast * 0.12 +
        comboBoost,
    ).toFixed(3),
  )

  return {
    room_match_score: roomMatchScore,
    harmony_score: harmony,
    contrast_score: contrast,
    recommendation_score: Number(pipeline.score || 0),
    mode,
  }
}

export function explainRoomMatch(roomProfile = {}, artwork = {}, mode = 'harmony') {
  const dominant = (roomProfile.dominant_colors || [])[0]?.label || 'neutral'
  const personality = roomProfile.room_personality || 'your space'
  const signals = buildArtworkRoomSignals(artwork)

  if (mode === 'contrast') {
    if (roomProfile.saturation < 0.3) {
      return 'Adds visual focus to your neutral palette.'
    }
    if (roomProfile.density < 0.3) {
      return 'Introduces a bold statement to your clean room.'
    }
    if (roomProfile.brightness < 0.45) {
      return 'Brings a brighter accent to your darker setup.'
    }
    return 'Balances the visual rhythm of your environment.'
  }

  if (signals.color_tags.some((tag) => dominant.includes(String(tag)))) {
    return `Works well with your ${dominant}-toned setup.`
  }
  if (roomProfile.moods.includes('calm')) {
    return 'Complements the calm atmosphere of your environment.'
  }
  if (personality.includes('Minimal')) {
    return 'Fits the restrained visual language of your room.'
  }
  return `Curated for the ${personality.toLowerCase()} feel of your space.`
}

export function rankRoomMatches(roomProfile = {}, artworks = [], tasteProfile = {}, options = {}) {
  const mode = options.mode === 'contrast' ? 'contrast' : 'harmony'
  const limit = Number(options.limit) || 8
  const excludeIds = new Set((options.excludeIds || []).map(Number))

  return artworks
    .filter((artwork) => artwork && !excludeIds.has(Number(artwork.id)))
    .map((artwork) => {
      const scores = computeRoomMatchScore(roomProfile, artwork, tasteProfile, { mode })
      return {
        artwork,
        ...scores,
        explanation: explainRoomMatch(roomProfile, artwork, mode),
      }
    })
    .sort((left, right) => right.room_match_score - left.room_match_score)
    .slice(0, limit)
}

function comboRoomAffinity(roomProfile = {}, combo = {}) {
  const title = String(combo.title || '').toLowerCase()
  const personality = String(roomProfile.room_personality || '').toLowerCase()
  const moods = (roomProfile.moods || []).join(' ')
  const styles = (roomProfile.style || []).join(' ')
  let score = 0.35

  if (personality.includes('gaming') && title.includes('dark')) score += 0.25
  if (personality.includes('anime') && (title.includes('anime') || title.includes('demon'))) score += 0.28
  if (personality.includes('minimal') && title.includes('minimal')) score += 0.24
  if (personality.includes('workspace') && title.includes('workspace')) score += 0.22
  if (moods.includes('calm') && title.includes('calm')) score += 0.15
  if (styles.includes('dark') && title.includes('dark')) score += 0.18
  if (roomProfile.brightness < 0.45 && title.includes('dark')) score += 0.12
  if (roomProfile.saturation > 0.38 && title.includes('blue')) score += 0.1

  return clamp(score)
}

export function recommendRoomSets(roomProfile = {}, combos = [], artworks = [], options = {}) {
  const limit = Number(options.limit) || 4
  const artworkById = new Map(artworks.map((artwork) => [Number(artwork.id), artwork]))

  return combos
    .map((combo) => {
      const items = Array.isArray(combo.items)
        ? combo.items
        : (Array.isArray(combo.artwork_ids) ? combo.artwork_ids : [])
            .map((artworkId) => artworkById.get(Number(artworkId)))
            .filter(Boolean)

      if (items.length < 2 || combo.is_active === false || combo.isAvailable === false) {
        return null
      }

      const itemScores = items.map((item) =>
        computeRoomMatchScore(roomProfile, item, options.tasteProfile || {}, { mode: 'harmony' }),
      )
      const avgRoomScore = average(itemScores.map((item) => item.room_match_score))
      const affinity = comboRoomAffinity(roomProfile, combo)

      return {
        combo: { ...combo, items },
        room_match_score: Number(clamp(avgRoomScore * 0.72 + affinity * 0.28).toFixed(3)),
        explanation:
          affinity > 0.55
            ? `A curated set aligned with your ${roomProfile.room_personality?.toLowerCase() || 'room'}.`
            : 'A coordinated set selected for your current room atmosphere.',
      }
    })
    .filter(Boolean)
    .sort((left, right) => right.room_match_score - left.room_match_score)
    .slice(0, limit)
}
