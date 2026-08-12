/**
 * Generate sitemap.xml at build time.
 *
 * Artworks live in the database, not in git, so the sitemap cannot be a static
 * file. Generating it during the build rather than serving it from a function
 * keeps it free — the project is at the platform's twelve-function ceiling —
 * and a sitemap that is a build behind is of no consequence to a crawler.
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import '../api/_lib/loadEnv.js'
import { fetchArtworks } from '../api/_lib/supabaseAdmin.js'

const SITE = (process.env.SITE_URL || 'https://www.archique.in').replace(/\/+$/, '')

const STATIC_ROUTES = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/store', priority: '0.9', changefreq: 'daily' },
  { path: '/canvas', priority: '0.8', changefreq: 'weekly' },
  { path: '/sketch', priority: '0.8', changefreq: 'weekly' },
  { path: '/feed', priority: '0.6', changefreq: 'weekly' },
  { path: '/contact', priority: '0.5', changefreq: 'monthly' },
  { path: '/policies', priority: '0.3', changefreq: 'yearly' },
  { path: '/privacy', priority: '0.3', changefreq: 'yearly' },
]

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function imageUrlOf(artwork) {
  const first = Array.isArray(artwork.images) ? artwork.images[0] : artwork.image
  if (!first) return ''
  if (typeof first === 'string') return first
  return first.urls?.display || first.urls?.original || first.url || ''
}

async function main() {
  const today = new Date().toISOString().slice(0, 10)
  let artworks = []

  try {
    artworks = await fetchArtworks()
  } catch (error) {
    // A sitemap missing its artwork entries is far better than a failed build.
    console.warn('[sitemap] could not load artworks:', error?.message || 'unknown error')
  }

  const urls = [
    ...STATIC_ROUTES.map(
      (route) => `  <url>
    <loc>${SITE}${route.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${route.changefreq}</changefreq>
    <priority>${route.priority}</priority>
  </url>`,
    ),
    ...artworks.map((artwork) => {
      const image = imageUrlOf(artwork)
      return `  <url>
    <loc>${SITE}/product/${artwork.id}</loc>
    <lastmod>${String(artwork.updated_at || artwork.created_at || today).slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>${
      image
        ? `
    <image:image>
      <image:loc>${escapeXml(image)}</image:loc>
      <image:title>${escapeXml(artwork.title)}</image:title>
    </image:image>`
        : ''
    }
  </url>`
    }),
  ]

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.join('\n')}
</urlset>
`

  await writeFile(path.resolve(process.cwd(), 'public/sitemap.xml'), xml, 'utf8')
  console.log(`[sitemap] wrote ${urls.length} urls (${artworks.length} artworks)`)
}

main().catch((error) => {
  console.error('[sitemap] failed:', error)
  process.exitCode = 0
})
