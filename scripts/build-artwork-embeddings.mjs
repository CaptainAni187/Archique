/**
 * Offline embedding builder — run this whenever artworks change.
 *
 *   npm run build:embeddings
 *
 * Produces `shared/ai/data/artwork-embeddings.js`, a plain ES module containing:
 *   - one vector per artwork (title + description + tags + medium + category)
 *   - one vector per lexicon term, so the server can compose a query vector
 *     without ever running a model at request time
 *   - precomputed "similar artworks" neighbours per artwork
 *
 * Everything downstream is pure arithmetic: no API key, no network, no cost.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from '@xenova/transformers'
import '../api/_lib/loadEnv.js'
import { fetchArtworks } from '../api/_lib/supabaseAdmin.js'

const MODEL = 'Xenova/all-MiniLM-L6-v2'
const OUTPUT = path.resolve(process.cwd(), 'shared/ai/data/artwork-embeddings.js')
const SIMILARITY_OUTPUT = path.resolve(process.cwd(), 'shared/ai/data/artwork-similarity.js')
const PRECISION = 4
const NEIGHBOURS = 6

// Vocabulary the search box realistically receives. Each term gets a vector so
// a query like "calm bedroom art" becomes the mean of its known term vectors.
const LEXICON = [
  // mood / feeling
  'calm', 'serene', 'peaceful', 'quiet', 'soothing', 'cozy', 'warm', 'cold',
  'bold', 'vibrant', 'energetic', 'dramatic', 'moody', 'dark', 'bright', 'soft',
  'romantic', 'nostalgic', 'dreamy', 'melancholy', 'joyful', 'playful', 'elegant',
  'spiritual', 'meditative', 'mystical', 'powerful', 'gentle', 'intense', 'subtle',
  // style
  'minimal', 'minimalist', 'abstract', 'realistic', 'portrait', 'landscape',
  'modern', 'contemporary', 'traditional', 'vintage', 'rustic', 'geometric',
  'anime', 'cartoon', 'surreal', 'impressionist', 'sketch', 'line art', 'detailed',
  // subject
  'nature', 'flower', 'floral', 'tree', 'forest', 'mountain', 'ocean', 'sea',
  'sky', 'sunset', 'sunrise', 'moon', 'stars', 'night', 'animal', 'bird', 'cat',
  'dog', 'human', 'face', 'woman', 'man', 'couple', 'god', 'mythology', 'temple',
  'city', 'architecture', 'street', 'water', 'fire', 'garden',
  // colour
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white',
  'grey', 'brown', 'gold', 'pastel', 'monochrome', 'colorful', 'earthy', 'neutral',
  // space / placement
  'bedroom', 'living room', 'workspace', 'office', 'studio', 'kitchen', 'hallway',
  'gaming setup', 'small space', 'large wall', 'above sofa', 'bedside',
  // intent / occasion
  'gift', 'birthday', 'anniversary', 'wedding', 'housewarming', 'for mom',
  'for dad', 'for friend', 'statement piece', 'centerpiece', 'affordable',
  'premium', 'canvas', 'painting', 'acrylic', 'drawing',
]

function round(value) {
  return Number(value.toFixed(PRECISION))
}

function cosine(a, b) {
  let dot = 0
  let ma = 0
  let mb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    dot += a[i] * b[i]
    ma += a[i] * a[i]
    mb += b[i] * b[i]
  }
  if (ma === 0 || mb === 0) return 0
  return dot / (Math.sqrt(ma) * Math.sqrt(mb))
}

function artworkDocument(artwork) {
  const tags = Array.isArray(artwork.tags) ? artwork.tags.filter(Boolean).join(', ') : ''
  return [
    artwork.title,
    artwork.description,
    tags,
    artwork.medium,
    artwork.category,
  ]
    .filter(Boolean)
    .join('. ')
}

async function main() {
  console.log(`Loading model ${MODEL} (first run downloads ~23MB, then cached)...`)
  const embed = await pipeline('feature-extraction', MODEL)

  const encode = async (text) => {
    // Mean pooling + L2 normalisation gives sentence-level vectors.
    const output = await embed(text, { pooling: 'mean', normalize: true })
    return Array.from(output.data).map(round)
  }

  const artworks = await fetchArtworks()
  console.log(`Embedding ${artworks.length} artworks...`)

  const artworkVectors = {}
  for (const artwork of artworks) {
    const doc = artworkDocument(artwork)
    if (!doc.trim()) continue
    artworkVectors[artwork.id] = await encode(doc)
  }

  console.log(`Embedding ${LEXICON.length} lexicon terms...`)
  const lexiconVectors = {}
  for (const term of LEXICON) {
    lexiconVectors[term] = await encode(term)
  }

  // Precompute nearest neighbours so "similar artworks" costs nothing at runtime.
  const similar = {}
  const ids = Object.keys(artworkVectors)
  for (const id of ids) {
    similar[id] = ids
      .filter((other) => other !== id)
      .map((other) => ({ id: Number(other), score: round(cosine(artworkVectors[id], artworkVectors[other])) }))
      .sort((l, r) => r.score - l.score)
      .slice(0, NEIGHBOURS)
  }

  const payload = {
    model: MODEL,
    dimensions: Object.values(artworkVectors)[0]?.length || 0,
    generated_at: new Date().toISOString(),
    artwork_count: Object.keys(artworkVectors).length,
    artworks: artworkVectors,
    lexicon: lexiconVectors,
    similar_by_artwork_id: similar,
  }

  await fs.mkdir(path.dirname(OUTPUT), { recursive: true })
  await fs.writeFile(
    OUTPUT,
    `// Generated by scripts/build-artwork-embeddings.mjs — do not edit by hand.\n` +
      `// Regenerate with: npm run build:embeddings\n` +
      `// Server-side only: importing this in the browser would ship every vector.\n` +
      `export default ${JSON.stringify(payload)}\n`,
    'utf8',
  )

  // Neighbours only (no vectors) — small enough to ship to the browser so the
  // product page can show "similar works" without a round trip.
  await fs.writeFile(
    SIMILARITY_OUTPUT,
    `// Generated by scripts/build-artwork-embeddings.mjs — do not edit by hand.\n` +
      `// Regenerate with: npm run build:embeddings\n` +
      `export default ${JSON.stringify(similar)}\n`,
    'utf8',
  )

  const bytes = (await fs.stat(OUTPUT)).size
  const similarityBytes = (await fs.stat(SIMILARITY_OUTPUT)).size
  console.log(`Wrote ${OUTPUT} (${(bytes / 1024).toFixed(0)} KB, server-only)`)
  console.log(`Wrote ${SIMILARITY_OUTPUT} (${(similarityBytes / 1024).toFixed(1)} KB, client-safe)`)
  console.log(`  artworks: ${payload.artwork_count}, lexicon: ${LEXICON.length}, dims: ${payload.dimensions}`)
}

main().catch((error) => {
  console.error('Embedding build failed:', error)
  process.exit(1)
})
