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
import './lib/node-canvas-polyfill.mjs'
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

  const { Canvas } = await import('@napi-rs/canvas')
  const canvas = new Canvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0, width, height)
  return canvas
}

function buildPlaneScene(canvas, widthM, heightM) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  const geometry = new THREE.PlaneGeometry(widthM, heightM)
  // The artwork must read at its true colours no matter how bright or dark the
  // room is — and the exported scene ships with no lights, while iOS Quick Look
  // relies on real-world light estimation. A plain lit material therefore
  // renders the piece near-black (the bug this fixes). So we drive the image
  // purely through the *emissive* channel (self-illuminated, like a backlit
  // print) with a black base colour: exact colours everywhere, never black in a
  // dark room and never blown out in a bright one, in model-viewer and AR alike.
  // `emissiveMap` survives both the glTF and USDZ exporters. DoubleSide
  // guarantees we never see a culled black back if wall-anchoring flips the
  // plane toward the viewer.
  const material = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: texture,
    emissiveIntensity: 1,
    side: THREE.DoubleSide,
    roughness: 1,
    metalness: 0,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = 'Artwork'

  const scene = new THREE.Scene()
  scene.add(mesh)
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

async function buildForArtwork(artwork) {
  const imageUrl = primaryImageUrl(artwork)
  if (!imageUrl) {
    console.log(`  skip #${artwork.id} "${artwork.title}" — no image`)
    return null
  }

  const { widthM, heightM, isFallback } = getArtworkDimensionsMeters(artwork.size)
  const canvas = await loadArtworkCanvas(imageUrl)
  const scene = buildPlaneScene(canvas, widthM, heightM)

  const glbPath = path.join(OUTPUT_DIR, `${artwork.id}.glb`)
  const usdzPath = path.join(OUTPUT_DIR, `${artwork.id}.usdz`)
  await exportGlb(scene, glbPath)
  await exportUsdz(scene, usdzPath)

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

  const manifestEntries = []
  for (const artwork of artworks) {
    try {
      const entry = await buildForArtwork(artwork)
      if (entry) {
        manifestEntries.push(entry)
      }
    } catch (error) {
      console.error(`  FAILED #${artwork.id} "${artwork.title}": ${error.message}`)
    }
  }

  // Merge into any existing manifest so a partial/single-id run doesn't
  // clobber entries for artworks that weren't touched this time.
  let manifest = {}
  try {
    manifest = JSON.parse(await fs.readFile(MANIFEST_PATH, 'utf8'))
  } catch {
    manifest = {}
  }
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
