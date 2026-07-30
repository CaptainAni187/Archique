/**
 * Artwork photos are uploaded straight from a phone, so the stored files are
 * full-resolution JPEGs (~80-200KB each, and a store page shows fourteen of
 * them). Supabase's own image transforms are a paid add-on, so we route
 * through Vercel's image optimizer instead: it resizes and re-encodes to
 * WebP/AVIF on the fly and caches the result on the CDN.
 *
 * The optimizer only exists when the app is served by Vercel, so on localhost
 * (and anywhere else) we fall back to the original URL and simply serve the
 * unoptimised file — correct everywhere, faster in production.
 */
const WIDTHS = [320, 480, 640, 828, 1080, 1200]
const DEFAULT_QUALITY = 72

function canUseOptimizer() {
  if (typeof window === 'undefined') {
    return false
  }
  const { hostname, protocol } = window.location
  if (protocol !== 'https:') {
    return false
  }
  return hostname !== 'localhost' && hostname !== '127.0.0.1'
}

function isRemote(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

export function getOptimizedImageUrl(url, width = 828, quality = DEFAULT_QUALITY) {
  if (!isRemote(url) || !canUseOptimizer()) {
    return url
  }
  return `/_vercel/image?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`
}

/**
 * A srcset across the standard widths so the browser downloads the size it
 * actually needs. Returns an empty string when optimisation is unavailable, so
 * callers can spread it onto an <img> without emitting a broken attribute.
 */
export function getImageSrcSet(url, quality = DEFAULT_QUALITY) {
  if (!isRemote(url) || !canUseOptimizer()) {
    return undefined
  }
  return WIDTHS.map((width) => `${getOptimizedImageUrl(url, width, quality)} ${width}w`).join(', ')
}
