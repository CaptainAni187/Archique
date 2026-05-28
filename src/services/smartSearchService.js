import { searchArtworks } from '../../shared/ai/core/index.js'
import { backendRequest } from './backendApiService'

export async function runSmartArtworkSearch({ query = '', moods = [], limit = 12, artworks = [] }) {
  try {
    console.log('[smart-search-client] request', {
      rawQuery: query,
      normalizedQuery: typeof query === 'string' ? query.trim().toLowerCase() : '',
      extractedTokens:
        typeof query === 'string'
          ? query
              .trim()
              .toLowerCase()
              .split(/[^a-z0-9]+/i)
              .map((token) => token.trim())
              .filter(Boolean)
          : [],
      moods,
      limit,
    })
    const payload = await backendRequest('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({ query, moods, limit }),
    })

    console.log('[smart-search-client] response', {
      source: payload.data?.source || 'assistant',
      resultCount: Array.isArray(payload.data?.results) ? payload.data.results.length : 0,
    })

    return {
      source: payload.data?.source || 'assistant',
      summary: payload.data?.summary || '',
      results: payload.data?.results || [],
    }
  } catch (error) {
    console.log('[smart-search-client] FALLBACK MODE ACTIVE', {
      reason: 'Assistant API request failed',
      message: error?.message || 'Unknown client fallback error',
    })
    const results = searchArtworks({ artworks, query, moods, limit })
    console.log('[smart-search-client] fallback-results', {
      resultCount: results.length,
      topResults: results.slice(0, 5).map((result, index) => ({
        rank: index + 1,
        artworkId: result.artwork.id,
        title: result.artwork.title,
        score: result.score,
      })),
    })

    return {
      source: 'keyword',
      summary: 'Matched locally using titles, descriptions, tags, categories, and prices.',
      results: results.map((result) => ({
        artwork: result.artwork,
        score: result.score,
        explanation: result.explanation,
        source: result.source,
      })),
    }
  }
}
