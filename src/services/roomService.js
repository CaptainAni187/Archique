import {
  analyzeRoomImageSource,
  buildRoomAnalysisFingerprint,
  buildRoomProfile,
  getCachedRoomAnalysis,
  rankRoomMatches,
  recommendRoomSets,
  setCachedRoomAnalysis,
} from '../../shared/ai/room/index.js'
import { hydrateCombo } from '../utils/comboPricing.js'
import { getTasteProfile } from './tasteService.js'

const analysisMemo = new Map()

export async function analyzeRoomFromImage(imageSource, options = {}) {
  if (!imageSource) {
    return null
  }

  const memoKey = `${String(imageSource).slice(0, 96)}:${options.forceRefresh ? '1' : '0'}`
  if (analysisMemo.has(memoKey) && !options.forceRefresh) {
    return analysisMemo.get(memoKey)
  }

  const analysis = await analyzeRoomImageSource(imageSource)
  if (!analysis) {
    return null
  }

  const fingerprint = buildRoomAnalysisFingerprint(analysis)
  if (!options.forceRefresh) {
    const cached = getCachedRoomAnalysis(fingerprint)
    if (cached?.profile) {
      const result = {
        profile: cached.profile,
        analysis,
        imagePreview: cached.image_preview || imageSource,
        fingerprint,
        cached: true,
      }
      analysisMemo.set(memoKey, result)
      return result
    }
  }

  const profile = buildRoomProfile(analysis, options)

  setCachedRoomAnalysis(fingerprint, {
    profile,
    image_preview: imageSource,
  })

  const result = {
    profile,
    analysis,
    imagePreview: imageSource,
    fingerprint,
    cached: false,
  }
  analysisMemo.set(memoKey, result)
  return result
}

export function buildRoomRecommendations(roomProfile, artworks = [], combos = [], options = {}) {
  const tasteProfile = options.tasteProfile || getTasteProfile()
  const hydratedCombos = combos
    .map((combo) => hydrateCombo(combo, artworks))
    .filter((combo) => combo.isAvailable !== false)

  return {
    harmony: rankRoomMatches(roomProfile, artworks, tasteProfile, {
      mode: 'harmony',
      limit: options.limit || 8,
      excludeIds: options.excludeIds || [],
    }),
    contrast: rankRoomMatches(roomProfile, artworks, tasteProfile, {
      mode: 'contrast',
      limit: options.limit || 8,
      excludeIds: options.excludeIds || [],
    }),
    roomSets: recommendRoomSets(roomProfile, hydratedCombos, artworks, {
      tasteProfile,
      limit: options.setLimit || 4,
    }),
  }
}

export function clearRoomAnalysisMemo() {
  analysisMemo.clear()
}
