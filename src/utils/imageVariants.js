/**
 * Produce the display sizes for an artwork photograph, in the browser.
 *
 * This is an art store, so detail is the product — the goal is not to make one
 * small image but to serve the right size in each place. The grid loads a
 * thumbnail, the artwork page a display copy, and zoom a near-full copy. The
 * original is uploaded untouched as the master.
 *
 * Resizing here rather than on the server means less data is uploaded, not
 * more, and the serverless function needs no native image library.
 */
const VARIANTS = [
  { name: 'thumb', maxEdge: 600 },
  { name: 'display', maxEdge: 1600 },
  { name: 'zoom', maxEdge: 2600 },
]

// Visually indistinguishable at these dimensions, at a fraction of the bytes.
const QUALITY = 0.92

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That image could not be read.'))
    }
    image.src = url
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the image.'))),
      type,
      quality,
    )
  })
}

/**
 * @returns {Promise<{ original: File, thumb?: File, display?: File, zoom?: File }>}
 *   Variants larger than the source are omitted — upscaling only wastes bytes.
 */
export async function buildImageVariants(file) {
  const result = { original: file }

  // PNG is kept as PNG: sketches and flat colour fields are exactly where JPEG
  // artefacts show, and a transparent background must survive.
  const isPng = file.type === 'image/png'
  const type = isPng ? 'image/png' : 'image/jpeg'
  const extension = isPng ? 'png' : 'jpg'

  let image
  try {
    image = await loadImage(file)
  } catch {
    // A file the browser cannot decode still uploads as-is rather than failing.
    return result
  }

  const longest = Math.max(image.width, image.height)

  for (const variant of VARIANTS) {
    if (longest <= variant.maxEdge) {
      continue
    }

    const scale = variant.maxEdge / longest
    const width = Math.round(image.width * scale)
    const height = Math.round(image.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    // Matters most on the thumbnail, where the reduction is largest.
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)

    try {
      const blob = await canvasToBlob(canvas, type, isPng ? undefined : QUALITY)
      const base = (file.name || 'artwork').replace(/\.[^.]+$/, '')
      result[variant.name] = new File([blob], `${base}-${variant.name}.${extension}`, { type })
    } catch {
      // Skip this size; the larger copies still serve.
    }
  }

  return result
}
