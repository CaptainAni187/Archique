import fs from 'node:fs/promises'
import path from 'node:path'
import { buildArtworkFeatureProfile, normalizeTags } from '../shared/ai/core/index.js'

function parseArtworks(payload) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object' && Array.isArray(payload.data)) {
    return payload.data
  }

  throw new Error('Expected a JSON array or an object with a "data" array.')
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

  if (!inputPath) {
    console.error('Usage: node scripts/audit-tag-quality.mjs <artworks-json>')
    process.exit(1)
  }

  const resolvedPath = path.resolve(process.cwd(), inputPath)
  const raw = await fs.readFile(resolvedPath, 'utf8')
  const artworks = parseArtworks(JSON.parse(raw))
  const rows = artworks.map((artwork) => {
    const rawTags = Array.isArray(artwork.tags) ? artwork.tags : []
    const normalizedRawTags = rawTags
      .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
      .filter(Boolean)
    const normalizedTags = normalizeTags(rawTags)
    const featureProfile = buildArtworkFeatureProfile(artwork)
    const duplicateTags = normalizedRawTags.filter(
      (tag, index, collection) => collection.indexOf(tag) !== index,
    )
    const casingIssues = rawTags.filter((tag) => typeof tag === 'string' && tag !== tag.toLowerCase())
    const hasWeakTags = normalizedTags.length < 2 || featureProfile.metadata_quality_score < 0.45

    return {
      id: artwork.id,
      title: artwork.title,
      tag_count: normalizedTags.length,
      duplicate_tags: [...new Set(duplicateTags)],
      casing_issues: casingIssues,
      uncategorized_tags: featureProfile.normalized_tags.uncategorized_tags,
      metadata_quality_score: featureProfile.metadata_quality_score,
      hasWeakTags,
      embedding_coverage: Array.isArray(featureProfile.embedding_vector) && featureProfile.embedding_vector.length > 0,
    }
  })

  console.log('AI TAG QUALITY AUDIT')
  console.log(`Source: ${resolvedPath}`)
  console.log(`Artworks: ${artworks.length}`)
  console.log(`Weak metadata: ${rows.filter((row) => row.hasWeakTags).length}`)
  console.log(`Missing embeddings: ${rows.filter((row) => !row.embedding_coverage).length}`)

  printRows('WEAK TAGGING', rows.filter((row) => row.hasWeakTags).slice(0, 20), (row) => {
    return `#${row.id} ${row.title} | tags=${row.tag_count} | quality=${row.metadata_quality_score}`
  })

  printRows('CASING ISSUES', rows.filter((row) => row.casing_issues.length).slice(0, 20), (row) => {
    return `#${row.id} ${row.title} | ${row.casing_issues.join(', ')}`
  })

  printRows('UNCATEGORIZED TAGS', rows.filter((row) => row.uncategorized_tags.length).slice(0, 20), (row) => {
    return `#${row.id} ${row.title} | ${row.uncategorized_tags.join(', ')}`
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
