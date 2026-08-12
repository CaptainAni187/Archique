/**
 * Pick the right rendition of an artwork image for where it is being shown.
 *
 * Uploads store several sizes alongside the original. A grid of cards has no
 * use for a 4MB photograph, and an artwork page should not be given a 600px
 * thumbnail. Older images predate variants and are plain URL strings, so every
 * lookup falls back to whatever exists.
 */
const ORDER = {
  thumb: ['thumb', 'display', 'zoom', 'original'],
  display: ['display', 'zoom', 'original', 'thumb'],
  zoom: ['zoom', 'display', 'original', 'thumb'],
}

export function artworkImageUrl(image, size = 'display') {
  if (!image) {
    return ''
  }

  if (typeof image === 'string') {
    return image
  }

  const urls = image.urls || null

  if (urls) {
    for (const key of ORDER[size] || ORDER.display) {
      if (urls[key]) {
        return urls[key]
      }
    }
  }

  return image.url || ''
}

/** The primary image of an artwork, at the requested size. */
export function primaryArtworkImage(artwork, size = 'display') {
  const images = Array.isArray(artwork?.images) ? artwork.images : []
  const first = images[0] || artwork?.image || null

  return artworkImageUrl(first, size)
}
