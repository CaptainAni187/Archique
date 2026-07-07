export {
  analyzeImageData,
  analyzeRoomImageSource,
  buildRoomAnalysisFingerprint,
} from './room-analysis.js'
export {
  buildRoomProfile,
  createEmptyRoomProfile,
  normalizeStoredRoomProfile,
} from './room-profile.js'
export {
  classifyRoomPersonality,
  getRoomPersonalitySummary,
  listRoomPersonalities,
} from './room-personality.js'
export {
  buildArtworkRoomSignals,
  computeRoomMatchScore,
  explainRoomMatch,
  rankRoomMatches,
  recommendRoomSets,
  scoreRoomContrast,
  scoreRoomHarmony,
} from './room-matching.js'
export {
  buildRoomCacheKey,
  formatRoomProfileForStorage,
  getCachedRoomAnalysis,
  listRoomCacheEntries,
  loadRoomSessionState,
  saveRoomSessionState,
  setCachedRoomAnalysis,
  SUPPORTED_SPACE_TYPES,
} from './room-memory.js'
export {
  clampPlacement,
  createOverlayRenderPlan,
  getDefaultArtworkPlacement,
  serializeOverlayState,
} from './room-overlay.js'
