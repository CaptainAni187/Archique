export {
  SUPPORTED_BEHAVIOR_EVENTS,
  buildArtworkFeatureProfile,
  buildArtworkSignals,
  buildRecommendationReasons,
  buildRecommendationSet,
  buildTasteVector,
  createArtworkSearchDocument,
  createEmptyTasteProfile,
  explainArtworkRecommendation,
  explainRecommendation,
  explainSmartSearchMatch,
  getSearchScoreBreakdown,
  hasTasteSignals,
  mergeTasteProfileForEvent,
  normalizeTags,
  normalizeText,
  parseSearchIntent,
  rankArtworksByTaste,
  rankArtworksForTaste,
  rankArtworksWithPipeline,
  recommendArtworks,
  scoreArtworkForSearch,
  scoreArtworkForTaste,
  searchArtworks,
  smartKeywordSearch,
  SMART_SEARCH_MOODS,
  suggestArtworkTags,
  tokenizeText,
} from './core/index.js'

import { normalizeTags, normalizeText, tokenizeText } from './core/index.js'

function findMatchingKeywords(text, keywords) {
  return keywords.filter((keyword) => text.includes(keyword))
}

function chooseFirstMatch(text, options, fallback) {
  const match = options.find((option) => option.keywords.some((keyword) => text.includes(keyword)))
  return match?.label || fallback
}

export function parseCommissionIntent(input = '') {
  const tokens = tokenizeText(input)
  const joined = normalizeText(input)

  return {
    category:
      tokens.includes('sketch') || tokens.includes('pencil')
        ? 'sketch'
        : tokens.includes('canvas') || tokens.includes('acrylic')
          ? 'canvas'
          : '',
    style_keywords: normalizeTags(
      ['minimal', 'modern', 'portrait', 'abstract', 'botanical', 'textured'].filter((keyword) =>
        joined.includes(keyword),
      ),
    ),
    size_hints: normalizeTags(
      ['small', 'medium', 'large', 'wall', 'square', 'vertical', 'horizontal'].filter((keyword) =>
        joined.includes(keyword),
      ),
    ),
    extracted_tokens: tokens,
  }
}

export function buildCommissionPrompt({ request = '', tasteProfile = {}, recentArtworks = [] } = {}) {
  return [
    'You are a local Archiverse assistant running through Ollama.',
    'Summarize the commission request, infer likely category/style/size, and keep the tone practical.',
    `Request: ${request || 'No request provided.'}`,
    `Taste profile: ${JSON.stringify(tasteProfile)}`,
    `Recent artworks: ${JSON.stringify(recentArtworks.slice(0, 5))}`,
  ].join('\n')
}

export function buildAdminSuggestionPrompt({
  query = '',
  tasteProfile = {},
  topArtworks = [],
  recentEvents = [],
} = {}) {
  return [
    'You are a local Archiverse admin assistant running through Ollama.',
    'Suggest relevant artworks, tags, or featured ordering changes using only the supplied context.',
    `Admin query: ${query || 'No query provided.'}`,
    `Taste profile: ${JSON.stringify(tasteProfile)}`,
    `Top artworks: ${JSON.stringify(topArtworks.slice(0, 8))}`,
    `Recent events: ${JSON.stringify(recentEvents.slice(0, 12))}`,
  ].join('\n')
}

export function parseCommissionBrief(input = '', context = {}) {
  const normalized = normalizeText(input)
  const tokens = tokenizeText(input)
  const artworkType = normalizeText(context.artwork_type)
  const requestedSize = normalizeText(context.size)
  const deadline = context.deadline ? new Date(context.deadline) : null
  const today = new Date()
  const daysUntilDeadline =
    deadline && Number.isFinite(deadline.getTime())
      ? Math.ceil((deadline.getTime() - today.getTime()) / 86400000)
      : null
  const moodKeywords = findMatchingKeywords(normalized, [
    'calm',
    'peaceful',
    'soft',
    'bold',
    'spiritual',
    'minimal',
    'modern',
    'warm',
    'dark',
    'bright',
    'anime',
    'romantic',
    'dreamy',
  ])
  const themeKeywords = findMatchingKeywords(normalized, [
    'mother',
    'mom',
    'family',
    'love',
    'home',
    'portrait',
    'couple',
    'god',
    'spiritual',
    'nature',
    'flower',
    'anime',
    'memory',
    'gift',
    'room',
    'wall',
  ])
  const style = chooseFirstMatch(
    normalized,
    [
      { label: 'minimal modern', keywords: ['minimal', 'simple', 'clean', 'modern'] },
      { label: 'bold expressive', keywords: ['bold', 'dramatic', 'strong', 'vibrant'] },
      { label: 'spiritual symbolic', keywords: ['spiritual', 'god', 'divine', 'sacred'] },
      { label: 'anime inspired', keywords: ['anime', 'manga', 'character'] },
      { label: 'personal portrait', keywords: ['portrait', 'face', 'person', 'couple'] },
    ],
    artworkType === 'sketch' ? 'sketch study' : 'custom acrylic artwork',
  )
  const mood = moodKeywords.length > 0 ? moodKeywords.slice(0, 3).join(', ') : 'personal'
  const mediumSuggestion =
    artworkType === 'sketch' || normalized.includes('pencil') || normalized.includes('graphite')
      ? 'graphite or charcoal on paper'
      : 'acrylic on canvas'
  const sizeSuggestion =
    requestedSize ||
    chooseFirstMatch(
      normalized,
      [
        { label: 'small format', keywords: ['small', 'desk', 'compact'] },
        { label: 'medium wall piece', keywords: ['medium', 'room', 'wall'] },
        { label: 'large statement piece', keywords: ['large', 'big', 'statement'] },
      ],
      'medium wall piece',
    )
  const deadlineUrgency =
    daysUntilDeadline == null
      ? 'timeline not specified'
      : daysUntilDeadline <= 7
        ? 'urgent'
        : daysUntilDeadline <= 21
          ? 'moderate'
          : 'flexible'
  const cleanKeywords = [...new Set([...themeKeywords, ...tokens.slice(0, 8)])].slice(0, 10)
  const clearerBrief = [
    `Create a ${style} ${mediumSuggestion}`,
    `Mood: ${mood}`,
    `Suggested size: ${sizeSuggestion}`,
    cleanKeywords.length > 0 ? `Themes: ${cleanKeywords.join(', ')}` : '',
  ].filter(Boolean).join('. ')
  const suggestedReply = [
    'Thank you for sharing your commission idea.',
    `I can shape this into a ${style} piece with a ${mood} feeling.`,
    'I will review the references, confirm size and timeline, then share the next steps.',
  ].join(' ')

  return {
    style,
    mood,
    medium_suggestion: mediumSuggestion,
    size_suggestion: sizeSuggestion,
    deadline_urgency: deadlineUrgency,
    theme_keywords: cleanKeywords,
    clearer_brief: clearerBrief,
    suggested_reply: suggestedReply,
    parser: 'local-rules',
  }
}
