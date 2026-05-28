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
