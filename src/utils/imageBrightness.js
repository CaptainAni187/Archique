export function measureImageBrightness(src) {
  if (typeof window === 'undefined' || !src) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const size = 24
        canvas.width = size
        canvas.height = size

        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          resolve(null)
          return
        }

        context.drawImage(image, 0, 0, size, size)
        const { data } = context.getImageData(0, 0, size, size)
        let total = 0
        let pixels = 0

        for (let index = 0; index < data.length; index += 4) {
          const alpha = data[index + 3] / 255
          if (alpha === 0) {
            continue
          }

          total += (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) * alpha
          pixels += alpha
        }

        resolve(pixels > 0 ? total / pixels : null)
      } catch {
        resolve(null)
      }
    }

    image.onerror = () => resolve(null)
    image.src = src
  })
}

export function isDarkImageBrightness(luminance) {
  return typeof luminance === 'number' ? luminance < 140 : false
}

/**
 * Average luminance of one or more sub-regions of an image.
 *
 * A single average over the whole image is misleading whenever a photo is
 * bright in one half and dark in the other — a pale sky above dark water, say.
 * The header and the hero copy sit in different parts of the frame, so each
 * needs the brightness of the area it actually covers.
 *
 * `regions` are fractions of the *visible* area, {x, y, w, h} in 0..1.
 * When `containerSize` is supplied the visible area accounts for `object-fit:
 * cover` cropping, so we never sample pixels the visitor cannot see.
 *
 * Resolves to { [name]: luminance | null }.
 */
export function measureImageRegions(src, regions, containerSize = null) {
  if (typeof window === 'undefined' || !src || !regions) {
    return Promise.resolve({})
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'

    image.onload = () => {
      try {
        const naturalW = image.naturalWidth
        const naturalH = image.naturalHeight
        if (!naturalW || !naturalH) {
          resolve({})
          return
        }

        // Work out which part of the source is actually on screen.
        let cropX = 0
        let cropY = 0
        let cropW = naturalW
        let cropH = naturalH

        if (containerSize?.width > 0 && containerSize?.height > 0) {
          const scale = Math.max(
            containerSize.width / naturalW,
            containerSize.height / naturalH,
          )
          cropW = containerSize.width / scale
          cropH = containerSize.height / scale
          cropX = (naturalW - cropW) / 2
          cropY = (naturalH - cropH) / 2
        }

        const sample = 28
        const canvas = document.createElement('canvas')
        canvas.width = sample
        canvas.height = sample
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) {
          resolve({})
          return
        }

        const result = {}

        Object.entries(regions).forEach(([name, region]) => {
          const sx = cropX + cropW * region.x
          const sy = cropY + cropH * region.y
          const sw = Math.max(1, cropW * region.w)
          const sh = Math.max(1, cropH * region.h)

          context.clearRect(0, 0, sample, sample)
          context.drawImage(image, sx, sy, sw, sh, 0, 0, sample, sample)
          const { data } = context.getImageData(0, 0, sample, sample)

          let total = 0
          let pixels = 0
          for (let index = 0; index < data.length; index += 4) {
            const alpha = data[index + 3] / 255
            if (alpha === 0) {
              continue
            }
            total +=
              (0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2]) * alpha
            pixels += alpha
          }

          result[name] = pixels > 0 ? total / pixels : null
        })

        resolve(result)
      } catch {
        resolve({})
      }
    }

    image.onerror = () => resolve({})
    image.src = src
  })
}
