import { createArtworkSearchDocument, buildArtworkSignals, normalizeNumber, tokenizeText } from '../features/artwork-features.js'
import { explainSmartSearchMatch } from '../explainability/reasons.js'
import { MOOD_KEYWORDS } from './mood-inference.js'
import { parseSearchIntent } from './intent-parser.js'

function getSmartSearchTerms(intent) {
  const moodTerms = intent.moods.flatMap((mood) => MOOD_KEYWORDS[mood] || [])
  return [...intent.tokens, ...moodTerms].filter(
    (term, index, collection) => term && collection.indexOf(term) === index,
  )
}

export function scoreArtworkForSearch(artwork = {}, query = '', moods = []) {
  const intent = parseSearchIntent(query, moods)
  const terms = getSmartSearchTerms(intent)
  const documentTokens = tokenizeText(createArtworkSearchDocument(artwork))
  const signals = buildArtworkSignals(artwork)
  const price = normalizeNumber(artwork.price, null)
  let keywordScore = 0
  let tagScore = 0
  let categoryScore = 0
  let priceScore = 0
  const matchedTerms = []

  terms.forEach((term) => {
    if (documentTokens.includes(term)) {
      keywordScore += 3
      matchedTerms.push(term)
      return
    }

    if (documentTokens.some((token) => token.includes(term) || term.includes(token))) {
      keywordScore += 1.2
      matchedTerms.push(term)
    }
  })

  intent.moods.forEach((mood) => {
    const moodKeywords = MOOD_KEYWORDS[mood] || []
    const hasMoodMatch =
      signals.tags.some((tag) => moodKeywords.includes(tag)) ||
      moodKeywords.some((keyword) => documentTokens.includes(keyword))

    if (hasMoodMatch) {
      tagScore += 2.5
      matchedTerms.push(mood)
    }
  })

  if (
    signals.category &&
    (documentTokens.includes(signals.category) ||
      intent.normalized_query.includes(signals.category) ||
      terms.includes(signals.category))
  ) {
    categoryScore += 0.75
  }

  if (intent.wants_gift && Number.isFinite(price)) {
    priceScore += price <= 5000 ? 1.5 : 0.5
  }

  if (intent.wants_affordable && Number.isFinite(price)) {
    priceScore += price <= 4000 ? 2 : 0
  }

  if (Number.isFinite(intent.target_price) && Number.isFinite(price) && intent.target_price > 0) {
    const proximity = 1 - Math.min(1, Math.abs(price - intent.target_price) / intent.target_price)
    priceScore += proximity * 2
  }

  if (artwork.is_featured === true) {
    keywordScore += 0.25
  }

  const finalScore = keywordScore + tagScore + categoryScore + priceScore

  return {
    score: Number(finalScore.toFixed(3)),
    matchedTerms: matchedTerms.filter(
      (term, index, collection) => term && collection.indexOf(term) === index,
    ),
    components: {
      embedding_score: 0,
      keyword_score: Number(keywordScore.toFixed(3)),
      tag_score: Number(tagScore.toFixed(3)),
      category_score: Number(categoryScore.toFixed(3)),
      price_score: Number(priceScore.toFixed(3)),
    },
    weights: {
      embedding_weight: 0,
      keyword_weight: 1,
      tag_weight: 1,
      category_weight: 1,
      price_weight: 1,
    },
    terms,
  }
}

export function getSearchScoreBreakdown(artwork = {}, query = '', moods = []) {
  return scoreArtworkForSearch(artwork, query, moods)
}

export function smartKeywordSearch(artworks = [], query = '', moods = [], limit = 12) {
  const intent = parseSearchIntent(query, moods)

  if (!intent.search_has_intent) {
    return artworks.slice(0, limit).map((artwork) => ({
      artwork,
      score: 0,
      explanation: 'Shown from the current browsing order.',
      source: 'default',
      confidence_score: 0,
      reasons: [],
    }))
  }

  return artworks
    .map((artwork) => {
      const result = scoreArtworkForSearch(artwork, query, moods)
      return {
        artwork,
        score: result.score,
        explanation: explainSmartSearchMatch(artwork, query, intent.moods, result.matchedTerms),
        source: 'keyword',
        confidence_score: Number(Math.min(1, result.score / 10).toFixed(3)),
        reasons: result.matchedTerms.slice(0, 3).map((term) => `matches ${term}`),
      }
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || Number(left.artwork.id) - Number(right.artwork.id))
    .slice(0, Math.max(1, Number(limit) || 12))
}
