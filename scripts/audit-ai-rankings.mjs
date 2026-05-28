import fs from 'node:fs/promises'
import path from 'node:path'
import {
  buildArtworkFeatureProfile,
  createEmptyTasteProfile,
  rankArtworksForTaste,
  searchArtworks,
} from '../shared/ai/core/index.js'

function parseArtworks(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
    return payload.data
  }

  throw new Error('Expected a JSON array or an object with a "data" array.')
}

function loadProfile(payload) {
  if (!payload) {
    return createEmptyTasteProfile()
  }

  return {
    ...createEmptyTasteProfile(),
    ...payload,
  }
}

function printRows(label, rows, formatter) {
  console.log(`\n${label}`)
  if (!rows.length) {
    console.log('  none')
    return
  }

  rows.forEach((row, index) => console.log(`  ${index + 1}. ${formatter(row)}`))
}

async function main() {
  const inputPath = process.argv[2]
  const query = process.argv.includes('--query')
    ? process.argv[process.argv.indexOf('--query') + 1] || ''
    : ''

  if (!inputPath) {
    console.error('Usage: node scripts/audit-ai-rankings.mjs <artworks-json> [--query "minimal room art"]')
    process.exit(1)
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath)
  const raw = await fs.readFile(resolvedPath, 'utf8')
  const payload = JSON.parse(raw)
  const artworks = parseArtworks(payload)
  const profile = loadProfile(payload.taste_profile)
  const ranked = query
    ? searchArtworks({ artworks, query, tasteProfile: profile, limit: 20 }).map((result) => ({
        ...result.artwork,
        ai_score: result.score,
        confidence_score: result.confidence_score,
        recommendation_explanation: result.explanation,
      }))
    : rankArtworksForTaste(artworks, profile).slice(0, 20)
  const lowConfidence = ranked.filter((artwork) => Number(artwork.confidence_score || 0) < 0.2)
  const repetitiveTags = new Map()

  ranked.slice(0, 10).forEach((artwork) => {
    buildArtworkFeatureProfile(artwork).style_tags.forEach((tag) => {
      repetitiveTags.set(tag, (repetitiveTags.get(tag) || 0) + 1)
    })
  })

  console.log('AI RANKING AUDIT')
  console.log(`Source: ${resolvedPath}`)
  console.log(`Artworks: ${artworks.length}`)
  console.log(`Mode: ${query ? `search "${query}"` : 'taste ranking'}`)

  printRows('TOP RANKED', ranked.slice(0, 10), (artwork) => {
    return `#${artwork.id} ${artwork.title} | score=${artwork.ai_score ?? 0} | confidence=${artwork.confidence_score ?? 0}`
  })

  printRows('LOW CONFIDENCE RESULTS', lowConfidence.slice(0, 10), (artwork) => {
    return `#${artwork.id} ${artwork.title} | confidence=${artwork.confidence_score ?? 0}`
  })

  printRows(
    'REPETITIVE TOP-10 STYLE TAGS',
    [...repetitiveTags.entries()].filter(([, count]) => count >= 4),
    ([tag, count]) => `${tag} appears ${count} times`,
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
