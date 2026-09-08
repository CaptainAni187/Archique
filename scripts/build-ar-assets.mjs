/**
 * Offline AR asset builder — run whenever artworks change.
 *
 *   npm run build:ar-assets [artworkId]
 *
 * For each artwork, generates a true-to-scale, textured rectangular plane and
 * exports it as:
 *   - public/ar/<id>.glb   (glTF binary — Android Chrome WebXR)
 *   - public/ar/<id>.usdz  (Apple USDZ — iOS Safari AR Quick Look, via
 *     `<a rel="ar">`, no app required)
 *
 * Both are static files served by Vite, same as any other public asset —
 * generation is a one-time offline step, not a runtime cost.
 */
// First import: installs the browser globals three's exporters expect.
import { createExportCanvas } from './lib/node-canvas-polyfill.mjs'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { loadImage } from '@napi-rs/canvas'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import '../api/_lib/loadEnv.js'
import { fetchArtworks } from '../api/_lib/supabaseAdmin.js'
import { getArtworkDimensionsMeters } from '../src/utils/artworkDimensions.js'

const OUTPUT_DIR = path.resolve(process.cwd(), 'public/ar')
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json')
const MAX_TEXTURE_PX = 1024

// Bumped whenever the geometry, material or orientation changes, so the skip
// check below rebuilds every artwork instead of keeping stale output.
const AR_PIPELINE_VERSION = 4

function primaryImageUrl(artwork) {
  if (Array.isArray(artwork.images) && artwork.images[0]) {
    return artwork.images[0]
  }
  return artwork.image || null
}

async function loadArtworkCanvas(imageUrl) {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status}): ${imageUrl}`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  const image = await loadImage(buffer)

  // Cap texture resolution — AR viewers don't benefit from full-res source
  // photos, and it keeps the exported files small.
  const scale = Math.min(1, MAX_TEXTURE_PX / Math.max(image.width, image.height))
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))

  const canvas = createExportCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, width, height)
  return canvas
}

/**
 * The two AR viewers disagree about which way "out of the wall" points, so each
 * format is authored for the viewer that actually reads it.
 *
 * model-viewer's wall placement keeps the model upright and only yaws it,
 * pressing the model's back (-Z) against the wall. The GLB therefore stays in
 * the XY plane facing +Z, which is also the orientation the inline 3D preview
 * wants.
 *
 * AR Quick Look works the other way round: a vertical plane anchor aligns the
 * scene's +Y axis with the wall's normal. A USDZ authored facing +Z hangs off
 * the wall like a shelf — the piece lying flat, legible only by tilting the
 * phone down at it, which is exactly the bug this fixes. Laying the plane into
 * the XZ plane facing +Y puts it flat against the wall, the right way up.
 */
const WALL_ANCHOR_ROTATION_X = -Math.PI / 2

function buildArtworkMaterial(canvas, { textureMimeType, doubleSided }) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  // glTF embeds the texture in the file itself, so the format decides how much
  // the phone downloads before the preview appears. A photograph at 1024px is
  // ~1 MB as PNG and ~100 KB as JPEG with no difference anyone can see at AR
  // viewing distance. USDZ has no such choice — three always writes PNG there.
  texture.userData.mimeType = textureMimeType

  // The artwork must read at its true colours no matter how bright or dark the
  // room is — and the exported scene ships with no lights, while iOS Quick Look
  // relies on real-world light estimation. A plain lit material therefore
  // renders the piece near-black (the bug this fixes). So we drive the image
  // purely through the *emissive* channel (self-illuminated, like a backlit
  // print) with a black base colour: exact colours everywhere, never black in a
  // dark room and never blown out in a bright one, in model-viewer and AR alike.
  // `emissiveMap` survives both the glTF and USDZ exporters.
  return new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 1,
    side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
    roughness: 1,
    metalness: 0,
  })
}

/**
 * @param wallAnchored orient for AR Quick Look's vertical anchor (USDZ) rather
 *   than for model-viewer (GLB)
 */
function buildPlaneScene(canvas, widthM, heightM, { wallAnchored = false } = {}) {
  const material = buildArtworkMaterial(canvas, {
    textureMimeType: wallAnchored ? 'image/png' : 'image/jpeg',
    // USD has no double-sided flag, so the USDZ gets a real second face below
    // instead; glTF has one, so the GLB needs no extra geometry.
    doubleSided: !wallAnchored,
  })
  const geometry = new THREE.PlaneGeometry(widthM, heightM)

  const scene = new THREE.Scene()

  const front = new THREE.Mesh(geometry, material)
  front.name = 'Artwork'
  scene.add(front)

  if (wallAnchored) {
    front.rotation.x = WALL_ANCHOR_ROTATION_X

    // three's USDZ exporter has no way to mark a mesh double-sided, and USD
    // defaults to single-sided, so the reverse of a lone plane draws as a black
    // rectangle — which is what Quick Look's "Object" tab was showing. A second
    // face, turned to look the other way, gives it something to draw from
    // behind. Applied as X-then-Y so the flip happens in the artwork's own
    // frame before the wall rotation.
    const back = new THREE.Mesh(geometry, material)
    back.name = 'ArtworkBack'
    back.rotation.set(WALL_ANCHOR_ROTATION_X, Math.PI, 0)
    scene.add(back)
  }

  // Both exporters read `object.matrix` straight off each node and neither
  // refreshes it first, so without this the rotations above export as identity.
  scene.updateMatrixWorld(true)

  return scene
}

async function exportGlb(scene, outPath) {
  const exporter = new GLTFExporter()
  const result = await new Promise((resolve, reject) => {
    exporter.parse(scene, resolve, reject, { binary: true })
  })
  await fs.writeFile(outPath, Buffer.from(result))
}

async function exportUsdz(scene, outPath) {
  const exporter = new USDZExporter()
  // Artwork hangs on a wall, not the floor/a table — tell Quick Look to
  // anchor against a vertical plane so it snaps to the right surface.
  const result = await exporter.parseAsync(scene, {
    includeAnchoringProperties: true,
    ar: {
      anchoring: { type: 'plane' },
      planeAnchoring: { alignment: 'vertical' },
    },
  })
  await fs.writeFile(outPath, Buffer.from(result))
}

/**
 * Fingerprint of everything that affects an artwork's AR output.
 *
 * USDZ is a zip, and zip entries carry the time they were written, so an
 * unchanged artwork still exports to different bytes on every run. Left alone
 * that means the nightly job always finds "changes" to commit, pushing 14
 * rewritten files a day that differ only by timestamp. Comparing inputs
 * instead of outputs makes an unchanged run a genuine no-op.
 */
function artworkFingerprint(artwork, imageUrl, widthM, heightM) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        id: artwork.id,
        imageUrl,
        widthM,
        heightM,
        maxTexturePx: MAX_TEXTURE_PX,
        pipelineVersion: AR_PIPELINE_VERSION,
      }),
    )
    .digest('hex')
    .slice(0, 16)
}

async function buildForArtwork(artwork, previousEntry) {
  const imageUrl = primaryImageUrl(artwork)
  if (!imageUrl) {
    console.log(`  skip #${artwork.id} "${artwork.title}" — no image`)
    return null
  }

  const { widthM, heightM, isFallback } = getArtworkDimensionsMeters(artwork.size)
  const fingerprint = artworkFingerprint(artwork, imageUrl, widthM, heightM)

  // Nothing about this piece changed, and both files are still on disk.
  if (previousEntry?.fingerprint === fingerprint) {
    const stillOnDisk = await Promise.all(
      [`${artwork.id}.glb`, `${artwork.id}.usdz`].map((name) =>
        fs
          .access(path.join(OUTPUT_DIR, name))
          .then(() => true)
          .catch(() => false),
      ),
    )

    if (stillOnDisk.every(Boolean)) {
      console.log(`  skip #${artwork.id} "${artwork.title}" — unchanged`)
      return previousEntry
    }
  }

  const canvas = await loadArtworkCanvas(imageUrl)

  const glbPath = path.join(OUTPUT_DIR, `${artwork.id}.glb`)
  const usdzPath = path.join(OUTPUT_DIR, `${artwork.id}.usdz`)
  await exportGlb(buildPlaneScene(canvas, widthM, heightM), glbPath)
  await exportUsdz(buildPlaneScene(canvas, widthM, heightM, { wallAnchored: true }), usdzPath)

  console.log(
    `  built #${artwork.id} "${artwork.title}" -> ${widthM.toFixed(3)}m x ${heightM.toFixed(3)}m` +
      (isFallback ? ' (size unparsed, used fallback dimensions)' : ''),
  )

  return {
    id: artwork.id,
    glb: `/ar/${artwork.id}.glb`,
    usdz: `/ar/${artwork.id}.usdz`,
    widthM,
    heightM,
    fingerprint,
  }
}

async function main() {
  const onlyId = process.argv[2] ? Number(process.argv[2]) : null

  await fs.mkdir(OUTPUT_DIR, { recursive: true })

  const allArtworks = await fetchArtworks()
  const artworks = onlyId ? allArtworks.filter((a) => Number(a.id) === onlyId) : allArtworks

  if (artworks.length === 0) {
    console.log('No matching artworks found.')
    return
  }

  console.log(`Building AR assets for ${artworks.length} artwork(s)...`)

  // Read first, so each artwork can be compared against what was built last
  // time and skipped when nothing about it has changed.
  let manifest = {}
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))
  } catch {
    manifest = {}
  }

  const manifestEntries = []
  for (const artwork of artworks) {
    try {
      const entry = await buildForArtwork(artwork, manifest[artwork.id])
      if (entry) {
        manifestEntries.push(entry)
      }
    } catch (error) {
      console.error(`  FAILED #${artwork.id} "${artwork.title}": ${error.message}`)
    }
  }

  // Merge into the existing manifest so a partial/single-id run doesn't
  // clobber entries for artworks that weren't touched this time.
  for (const entry of manifestEntries) {
    manifest[entry.id] = entry
  }
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')

  console.log(`\nWrote ${manifestEntries.length} asset pair(s) and updated ${MANIFEST_PATH}`)
}

main().catch((error) => {
  console.error('AR asset build failed:', error)
  process.exit(1)
})
