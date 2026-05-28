import { normalizeText, tokenizeText } from '../tagging/tag-taxonomy.js'

export const SMART_SEARCH_MOODS = ['calm', 'bold', 'spiritual', 'minimal', 'gift', 'anime']

export const MOOD_KEYWORDS = {
  calm: ['calm', 'quiet', 'soft', 'peaceful', 'gentle', 'serene', 'minimal'],
  bold: ['bold', 'strong', 'dramatic', 'contrast', 'vivid', 'statement'],
  spiritual: ['spiritual', 'soul', 'divine', 'ritual', 'sacred', 'meditative'],
  minimal: ['minimal', 'simple', 'clean', 'modern', 'neutral', 'subtle', 'white'],
  gift: ['gift', 'mom', 'mother', 'friend', 'personal', 'warm', 'home', 'girlfriend'],
  anime: ['anime', 'manga', 'character', 'figure', 'portrait', 'sketch'],
  dark: ['dark', 'black', 'night', 'moody', 'gaming'],
  romantic: ['romantic', 'love', 'girlfriend', 'warm'],
}

export function inferMoodsFromQuery(query = '', selectedMoods = []) {
  const tokens = tokenizeText(query)
  const explicitMoods = selectedMoods.map(normalizeText).filter(Boolean)
  const inferred = []

  Object.entries(MOOD_KEYWORDS).forEach(([mood, keywords]) => {
    if (tokens.some((token) => keywords.includes(token))) {
      inferred.push(mood)
    }
  })

  return [...new Set([...explicitMoods, ...inferred])]
}
