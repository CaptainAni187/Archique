// Parses the free-text `size` field artworks are stored with (e.g. "8 × 12",
// "24x36 inches", "8 x 8") into real-world dimensions for AR placement, where
// the artwork must render at true scale on the buyer's actual wall.
const INCHES_TO_METERS = 0.0254
const DEFAULT_WIDTH_IN = 12
const DEFAULT_HEIGHT_IN = 16

function parseSizeToInches(size) {
  const normalized = String(size || '')
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/inches?|in\.?|"/g, '')
    .trim()

  const match = normalized.match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/)
  if (!match) {
    return { widthIn: DEFAULT_WIDTH_IN, heightIn: DEFAULT_HEIGHT_IN, isFallback: true }
  }

  const widthIn = Number(match[1])
  const heightIn = Number(match[2])
  if (!Number.isFinite(widthIn) || !Number.isFinite(heightIn) || widthIn <= 0 || heightIn <= 0) {
    return { widthIn: DEFAULT_WIDTH_IN, heightIn: DEFAULT_HEIGHT_IN, isFallback: true }
  }

  return { widthIn, heightIn, isFallback: false }
}

/** Real-world artwork dimensions in meters, for 3D/AR placement. */
export function getArtworkDimensionsMeters(size) {
  const { widthIn, heightIn, isFallback } = parseSizeToInches(size)
  return {
    widthM: Number((widthIn * INCHES_TO_METERS).toFixed(4)),
    heightM: Number((heightIn * INCHES_TO_METERS).toFixed(4)),
    widthIn,
    heightIn,
    isFallback,
  }
}
