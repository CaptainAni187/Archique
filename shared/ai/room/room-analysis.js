const SAMPLE_SIZE = 48

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function rgbToHsl(r, g, b) {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min
  let hue = 0
  let saturation = 0
  const lightness = (max + min) / 2

  if (delta > 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1))
    switch (max) {
      case rn:
        hue = ((gn - bn) / delta) % 6
        break
      case gn:
        hue = (bn - rn) / delta + 2
        break
      default:
        hue = (rn - gn) / delta + 4
        break
    }
    hue *= 60
    if (hue < 0) {
      hue += 360
    }
  }

  return { hue, saturation, lightness }
}

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function quantizeChannel(value) {
  return Math.round(value / 32) * 32
}

function colorKey(r, g, b) {
  return `${quantizeChannel(r)}:${quantizeChannel(g)}:${quantizeChannel(b)}`
}

function edgeMagnitude(left, right, top, bottom) {
  const gx = Math.abs(right - left)
  const gy = Math.abs(bottom - top)
  return Math.sqrt(gx * gx + gy * gy)
}

export function analyzeImageData(imageData, width = SAMPLE_SIZE, height = SAMPLE_SIZE) {
  const data = imageData?.data
  if (!data || !width || !height) {
    return null
  }

  let pixelCount = 0
  let brightnessTotal = 0
  let darknessTotal = 0
  let saturationTotal = 0
  let warmthTotal = 0
  let contrastTotal = 0
  let edgeTotal = 0
  let leftBrightness = 0
  let rightBrightness = 0
  let topBrightness = 0
  let bottomBrightness = 0
  let leftCount = 0
  let rightCount = 0
  let topCount = 0
  let bottomCount = 0
  const colorBuckets = new Map()

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const alpha = data[index + 3] / 255
      if (alpha < 0.08) {
        continue
      }

      const r = data[index]
      const g = data[index + 1]
      const b = data[index + 2]
      const lum = luminance(r, g, b) / 255
      const hsl = rgbToHsl(r, g, b)

      pixelCount += 1
      brightnessTotal += lum
      darknessTotal += 1 - lum
      saturationTotal += hsl.saturation
      warmthTotal += (r - b) / 255
      contrastTotal += Math.abs(lum - 0.5)

      const key = colorKey(r, g, b)
      colorBuckets.set(key, (colorBuckets.get(key) || 0) + 1)

      if (x < width / 2) {
        leftBrightness += lum
        leftCount += 1
      } else {
        rightBrightness += lum
        rightCount += 1
      }

      if (y < height / 2) {
        topBrightness += lum
        topCount += 1
      } else {
        bottomBrightness += lum
        bottomCount += 1
      }

      if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const left = luminance(data[index - 4], data[index - 3], data[index - 2]) / 255
        const right = luminance(data[index + 4], data[index + 5], data[index + 6]) / 255
        const top = luminance(data[index - width * 4], data[index - width * 4 + 1], data[index - width * 4 + 2]) / 255
        const bottom = luminance(data[index + width * 4], data[index + width * 4 + 1], data[index + width * 4 + 2]) / 255
        edgeTotal += edgeMagnitude(left, right, top, bottom)
      }
    }
  }

  if (pixelCount === 0) {
    return null
  }

  const dominantColors = Array.from(colorBuckets.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([key, count]) => {
      const [r, g, b] = key.split(':').map(Number)
      return {
        rgb: [r, g, b],
        weight: Number((count / pixelCount).toFixed(3)),
        label: describeColor(r, g, b),
      }
    })

  const avgBrightness = brightnessTotal / pixelCount
  const avgEdge = edgeTotal / Math.max(1, pixelCount)
  const horizontalBalance = leftCount && rightCount
    ? 1 - Math.abs(leftBrightness / leftCount - rightBrightness / rightCount)
    : 0.5
  const verticalBalance = topCount && bottomCount
    ? 1 - Math.abs(topBrightness / topCount - bottomBrightness / bottomCount)
    : 0.5

  return {
    brightness: Number(clamp(avgBrightness).toFixed(3)),
    darkness: Number(clamp(darknessTotal / pixelCount).toFixed(3)),
    saturation: Number(clamp(saturationTotal / pixelCount).toFixed(3)),
    warmth: Number(clamp((warmthTotal / pixelCount + 1) / 2).toFixed(3)),
    contrast: Number(clamp(contrastTotal / pixelCount).toFixed(3)),
    dominant_colors: dominantColors,
    visual_density: Number(clamp(avgEdge * 2.4).toFixed(3)),
    clutter_score: Number(clamp(avgEdge * 1.8 + saturationTotal / pixelCount * 0.25).toFixed(3)),
    composition_balance: Number(clamp((horizontalBalance + verticalBalance) / 2).toFixed(3)),
    sample_size: { width, height },
  }
}

function describeColor(r, g, b) {
  const lum = luminance(r, g, b)
  const { hue, saturation } = rgbToHsl(r, g, b)

  if (lum < 55) {
    return 'charcoal'
  }
  if (saturation < 0.12) {
    return lum > 180 ? 'soft white' : 'neutral gray'
  }
  if (hue >= 190 && hue <= 250) {
    return 'blue'
  }
  if (hue >= 20 && hue <= 55) {
    return 'warm gold'
  }
  if (hue >= 330 || hue <= 15) {
    return 'red'
  }
  if (hue >= 80 && hue <= 160) {
    return 'green'
  }
  return 'muted tone'
}

export async function analyzeRoomImageSource(source, options = {}) {
  if (typeof window === 'undefined' || !source) {
    return null
  }

  const maxSize = Number(options.maxSampleSize) || SAMPLE_SIZE

  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const aspect = image.width / Math.max(image.height, 1)
        canvas.width = aspect >= 1 ? maxSize : Math.max(8, Math.round(maxSize * aspect))
        canvas.height = aspect >= 1 ? Math.max(8, Math.round(maxSize / aspect)) : maxSize

        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          resolve(null)
          return
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
        resolve(analyzeImageData(imageData, canvas.width, canvas.height))
      } catch {
        resolve(null)
      }
    }

    image.onerror = () => resolve(null)
    image.src = source
  })
}

export function buildRoomAnalysisFingerprint(analysis) {
  if (!analysis) {
    return ''
  }

  return [
    analysis.brightness,
    analysis.warmth,
    analysis.saturation,
    analysis.visual_density,
    ...(analysis.dominant_colors || []).slice(0, 3).map((color) => color.label),
  ].join('|')
}
