import { normalizeText, tokenizeText } from '../tagging/tag-taxonomy.js'
import { inferMoodsFromQuery } from './mood-inference.js'

export function parseSearchIntent(query = '', moods = []) {
  const normalizedQuery = normalizeText(query)
  const tokens = tokenizeText(query)
  const inferredMoods = inferMoodsFromQuery(query, moods)
  const numbers = normalizedQuery.match(/\d+/g)?.map(Number).filter(Number.isFinite) || []

  const intent = {
    raw_query: query,
    normalized_query: normalizedQuery,
    tokens,
    moods: inferredMoods,
    wants_gift: tokens.includes('gift') || tokens.includes('girlfriend') || tokens.includes('mom'),
    wants_affordable:
      tokens.includes('affordable') || tokens.includes('budget') || tokens.includes('cheap'),
    target_price: numbers.length > 0 ? Math.max(...numbers) : null,
    room_context: '',
    search_has_intent: Boolean(normalizedQuery || moods.length > 0),
  }

  if (tokens.includes('gaming')) {
    intent.room_context = 'gaming-room'
    intent.moods = [...new Set([...intent.moods, 'dark', 'anime'])]
  } else if (tokens.includes('bedroom')) {
    intent.room_context = 'bedroom'
    intent.moods = [...new Set([...intent.moods, 'calm'])]
  } else if (tokens.includes('studio')) {
    intent.room_context = 'studio'
    intent.moods = [...new Set([...intent.moods, 'minimal'])]
  }

  if (tokens.includes('girlfriend')) {
    intent.moods = [...new Set([...intent.moods, 'romantic', 'gift'])]
  }

  return intent
}
