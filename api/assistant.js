import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
import { z } from 'zod'
import {
  createArtworkSearchDocument,
  explainSmartSearchMatch,
  getSearchScoreBreakdown,
  searchArtworks,
  tokenizeText,
} from '../shared/ai/core/index.js'
import { fetchArtworks } from './_lib/supabaseAdmin.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { sendValidationError, validateWithSchema } from './_lib/validation.js'

const assistantSchema = z.object({
  query: z.string().trim().max(300).optional().default(''),
  moods: z.array(z.string().trim().max(40)).max(6).optional().default([]),
  limit: z.coerce.number().int().min(1).max(24).optional().default(12),
})

function normalizeSearchInput(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function logAssistantSearch(stage, details = {}) {
  console.log(`[assistant-search] ${stage}`, details)
}

function logResultScoring(mode, artworks, query, moods, rankedResults, queryEmbedding = null, documentEmbeddings = []) {
  const modeWeights =
    mode === 'ollama-embeddings'
      ? {
          embedding_weight: 1,
          tag_weight: 0,
          keyword_weight: 0,
          category_weight: 0,
          price_weight: 0,
        }
      : {
          embedding_weight: 0,
          tag_weight: 1,
          keyword_weight: 1,
          category_weight: 1,
          price_weight: 1,
        }

  rankedResults.forEach((result) => {
    const artwork = result.artwork
    const breakdown = getSearchScoreBreakdown(artwork, query, moods)
    const embeddingIndex = artworks.findIndex((candidate) => Number(candidate.id) === Number(artwork.id))
    const embeddingScore =
      mode === 'ollama-embeddings' &&
      queryEmbedding &&
      Array.isArray(documentEmbeddings?.[embeddingIndex])
        ? Number(cosineSimilarity(queryEmbedding, documentEmbeddings[embeddingIndex]).toFixed(4))
        : 0

    logAssistantSearch('result-score-breakdown', {
      mode,
      artwork_id: artwork.id,
      title: artwork.title,
      tags: Array.isArray(artwork.tags) ? artwork.tags : [],
      category: artwork.category || '',
      price: Number(artwork.price || 0),
      embedding_score: embeddingScore,
      keyword_score: breakdown.components.keyword_score,
      tag_score: breakdown.components.tag_score,
      category_score: breakdown.components.category_score,
      price_score: breakdown.components.price_score,
      weights: modeWeights,
      final_score_formula:
        'final_score = (embedding_weight * embedding_score) + (tag_weight * tag_score) + (keyword_weight * keyword_score) + (category_weight * category_score) + (price_weight * price_score)',
      final_score:
        mode === 'ollama-embeddings'
          ? Number((modeWeights.embedding_weight * embeddingScore).toFixed(4))
          : Number(
              (
                modeWeights.embedding_weight * embeddingScore +
                modeWeights.tag_weight * breakdown.components.tag_score +
                modeWeights.keyword_weight * breakdown.components.keyword_score +
                modeWeights.category_weight * breakdown.components.category_score +
                modeWeights.price_weight * breakdown.components.price_score
              ).toFixed(3),
            ),
    })
  })
}

function buildResultScoreAudit(mode, artworks, query, moods, rankedResults, queryEmbedding = null, documentEmbeddings = []) {
  const modeWeights =
    mode === 'ollama-embeddings'
      ? {
          embedding_weight: 1,
          tag_weight: 0,
          keyword_weight: 0,
          category_weight: 0,
          price_weight: 0,
        }
      : {
          embedding_weight: 0,
          tag_weight: 1,
          keyword_weight: 1,
          category_weight: 1,
          price_weight: 1,
        }

  return rankedResults.slice(0, 10).map((result, index) => {
    const artwork = result.artwork
    const breakdown = getSearchScoreBreakdown(artwork, query, moods)
    const embeddingIndex = artworks.findIndex((candidate) => Number(candidate.id) === Number(artwork.id))
    const embeddingScore =
      mode === 'ollama-embeddings' &&
      queryEmbedding &&
      Array.isArray(documentEmbeddings?.[embeddingIndex])
        ? Number(cosineSimilarity(queryEmbedding, documentEmbeddings[embeddingIndex]).toFixed(4))
        : 0
    const finalScore =
      mode === 'ollama-embeddings'
        ? Number((modeWeights.embedding_weight * embeddingScore).toFixed(4))
        : Number(
            (
              modeWeights.embedding_weight * embeddingScore +
              modeWeights.tag_weight * breakdown.components.tag_score +
              modeWeights.keyword_weight * breakdown.components.keyword_score +
              modeWeights.category_weight * breakdown.components.category_score +
              modeWeights.price_weight * breakdown.components.price_score
            ).toFixed(3),
          )

    return {
      rank: index + 1,
      artwork_id: artwork.id,
      title: artwork.title,
      tags: Array.isArray(artwork.tags) ? artwork.tags : [],
      category: artwork.category || '',
      price: Number(artwork.price || 0),
      embedding_score: embeddingScore,
      keyword_score: breakdown.components.keyword_score,
      tag_score: breakdown.components.tag_score,
      category_score: breakdown.components.category_score,
      price_score: breakdown.components.price_score,
      weights: modeWeights,
      final_score_formula:
        'final_score = (embedding_weight * embedding_score) + (tag_weight * tag_score) + (keyword_weight * keyword_score) + (category_weight * category_score) + (price_weight * price_score)',
      final_score: finalScore,
    }
  })
}

function checkSortConsistency(scoredResults) {
  const mismatches = []

  for (let index = 1; index < scoredResults.length; index += 1) {
    const previous = scoredResults[index - 1]
    const current = scoredResults[index]

    if (previous.final_score < current.final_score) {
      mismatches.push({
        previousRank: previous.rank,
        previousArtworkId: previous.artwork_id,
        previousFinalScore: previous.final_score,
        currentRank: current.rank,
        currentArtworkId: current.artwork_id,
        currentFinalScore: current.final_score,
      })
    }
  }

  return {
    isConsistent: mismatches.length === 0,
    mismatches,
  }
}

function normalizeArtwork(artwork) {
  const images = [
    ...(Array.isArray(artwork.images) ? artwork.images : []),
    typeof artwork.image === 'string' ? artwork.image : '',
  ].filter((image, index, collection) => {
    return typeof image === 'string' && image.trim() && collection.indexOf(image) === index
  })

  return {
    ...artwork,
    price: Number(artwork.price),
    images,
    image: images[0] || '',
    tags: Array.isArray(artwork.tags) ? artwork.tags.filter(Boolean) : [],
    category: artwork.category || '',
    instagram_url: artwork.instagram_url || '',
  }
}

function cosineSimilarity(left, right) {
  let dot = 0
  let leftMagnitude = 0
  let rightMagnitude = 0

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index]
    leftMagnitude += left[index] * left[index]
    rightMagnitude += right[index] * right[index]
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude))
}

async function searchWithOllama(artworks, query, moods, limit) {
  const prompt = [query, ...moods].filter(Boolean).join(' ')
  if (!prompt.trim()) {
    logAssistantSearch('ollama-skipped-empty-prompt', {
      rawQuery: query,
      moods,
    })
    return null
  }

  logAssistantSearch('OLLAMA MODE ACTIVE', {
    prompt,
    promptTokens: tokenizeText(prompt),
    artworkCount: artworks.length,
    limit,
  })

  const embeddings = new OllamaEmbeddings({
    model: process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text',
    baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
  })

  const queryEmbedding = await embeddings.embedQuery(prompt)
  const documents = artworks.map((artwork) => createArtworkSearchDocument(artwork))
  const documentEmbeddings = await embeddings.embedDocuments(documents)
  logAssistantSearch('embedding-generated', {
    queryEmbeddingDimensions: Array.isArray(queryEmbedding) ? queryEmbedding.length : 0,
    documentCount: documents.length,
    documentEmbeddingDimensions: Array.isArray(documentEmbeddings?.[0])
      ? documentEmbeddings[0].length
      : 0,
  })

  const rankedResults = artworks
    .map((artwork, index) => ({
      artwork,
      score: Number(cosineSimilarity(queryEmbedding, documentEmbeddings[index]).toFixed(4)),
      explanation: explainSmartSearchMatch(artwork, query, moods, []),
      source: 'ollama-embeddings',
    }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || Number(left.artwork.id) - Number(right.artwork.id))
    .slice(0, limit)

  logAssistantSearch('ollama-scoring-complete', {
    scoredArtworkCount: rankedResults.length,
    embeddingVectorLength: Array.isArray(queryEmbedding) ? queryEmbedding.length : 0,
    topResults: rankedResults.slice(0, 5).map((result, index) => ({
      rank: index + 1,
      artworkId: result.artwork.id,
      title: result.artwork.title,
      score: result.score,
    })),
  })
  logResultScoring('ollama-embeddings', artworks, query, moods, rankedResults, queryEmbedding, documentEmbeddings)
  const scoreAudit = buildResultScoreAudit(
    'ollama-embeddings',
    artworks,
    query,
    moods,
    rankedResults,
    queryEmbedding,
    documentEmbeddings,
  )
  const sortCheck = checkSortConsistency(scoreAudit)
  logAssistantSearch('top-10-ranked-results', {
    mode: 'ollama-embeddings',
    results: scoreAudit,
  })
  logAssistantSearch(sortCheck.isConsistent ? 'sort-order-confirmed' : 'SORT_ORDER_MISMATCH', {
    mode: 'ollama-embeddings',
    isConsistent: sortCheck.isConsistent,
    mismatches: sortCheck.mismatches,
  })

  return rankedResults
}

async function summarizeWithOllama(query, moods, results) {
  if (results.length === 0) {
    return ''
  }

  try {
    const model = new ChatOllama({
      model: process.env.OLLAMA_CHAT_MODEL || 'llama3.2',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
      temperature: 0.2,
    })

    const response = await model.invoke([
      [
        'human',
        [
          'You are the local Archiverse art assistant.',
          'Write one short sentence explaining why these artworks match.',
          `Search: ${query || moods.join(', ')}`,
          `Artworks: ${results
            .slice(0, 5)
            .map((result) => `${result.artwork.title} (${result.artwork.category}, ${result.artwork.tags?.join(', ') || 'no tags'}, Rs. ${result.artwork.price})`)
            .join('; ')}`,
        ].join('\n'),
      ],
    ])

    return typeof response?.content === 'string' ? response.content.trim() : ''
  } catch {
    return ''
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  try {
    const body = await readJson(req)
    const payload = validateWithSchema(assistantSchema, body)
    const normalizedQuery = normalizeSearchInput(payload.query)
    const extractedTokens = tokenizeText([payload.query, ...payload.moods].filter(Boolean).join(' '))

    logAssistantSearch('pipeline-start', {
      rawQuery: payload.query,
      normalizedQuery,
      moods: payload.moods,
      extractedTokens,
      limit: payload.limit,
    })

    const artworks = (await fetchArtworks()).map(normalizeArtwork)
    logAssistantSearch('artworks-loaded', {
      artworkCount: artworks.length,
    })
    let results = null

    try {
      results = await searchWithOllama(artworks, payload.query, payload.moods, payload.limit)
    } catch (error) {
      logAssistantSearch('ollama-error', {
        message: error?.message || 'Unknown Ollama error',
        stack: error?.stack || '',
      })
      logAssistantSearch('FALLBACK MODE ACTIVE', {
        reason: 'Ollama search failed',
        fallback: 'smartKeywordSearch',
      })
      results = null
    }

    const usedOllamaResults = Boolean(results && results.length > 0)
    const semanticScoresById = new Map(
      usedOllamaResults
        ? results.map((result) => [Number(result.artwork.id), Number(result.score || 0)])
        : [],
    )
    const resolvedResults = searchArtworks({
      artworks,
      query: payload.query,
      moods: payload.moods,
      limit: payload.limit,
      semanticScoresById,
    })
    if (!usedOllamaResults) {
      logAssistantSearch('keyword-scoring-complete', {
        rawQuery: payload.query,
        normalizedQuery,
        extractedTokens,
        rankedResultCount: resolvedResults.length,
        topResults: resolvedResults.slice(0, 5).map((result, index) => ({
          rank: index + 1,
          artworkId: result.artwork.id,
          title: result.artwork.title,
          score: result.score,
          source: result.source,
        })),
      })
      logResultScoring('keyword', artworks, payload.query, payload.moods, resolvedResults)
      const scoreAudit = buildResultScoreAudit('keyword', artworks, payload.query, payload.moods, resolvedResults)
      const sortCheck = checkSortConsistency(scoreAudit)
      logAssistantSearch('top-10-ranked-results', {
        mode: 'keyword',
        results: scoreAudit,
      })
      logAssistantSearch(sortCheck.isConsistent ? 'sort-order-confirmed' : 'SORT_ORDER_MISMATCH', {
        mode: 'keyword',
        isConsistent: sortCheck.isConsistent,
        mismatches: sortCheck.mismatches,
      })
    }
    const resolvedSource = usedOllamaResults ? 'hybrid-ollama-keyword' : 'keyword'
    const summary =
      usedOllamaResults
        ? await summarizeWithOllama(payload.query, payload.moods, resolvedResults)
        : ''

    logAssistantSearch('pipeline-complete', {
      mode: resolvedSource,
      resultCount: resolvedResults.length,
      summaryGenerated: Boolean(summary),
      topResults: resolvedResults.slice(0, 5).map((result, index) => ({
        rank: index + 1,
        artworkId: result.artwork.id,
        title: result.artwork.title,
        score: result.score,
        source: result.source || resolvedSource,
      })),
    })

    return sendJson(res, 200, {
      success: true,
      data: {
        source: resolvedSource,
        summary:
          summary ||
          'Matched locally using artwork titles, descriptions, tags, categories, and prices.',
        results: resolvedResults.map((result) => ({
          artwork: result.artwork,
          score: result.score,
          explanation: result.explanation,
          source: result.source || resolvedSource,
        })),
      },
    })
  } catch (error) {
    if (error.validationIssues) {
      logAssistantSearch('validation-error', {
        issues: error.validationIssues,
      })
      return sendValidationError(res, error.validationIssues)
    }

    logAssistantSearch('pipeline-failed', {
      message: error.message || 'Unable to run local assistant search.',
      stack: error.stack || '',
    })

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'ASSISTANT_SEARCH_FAILED',
      message: error.message || 'Unable to run local assistant search.',
    })
  }
}
