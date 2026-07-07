const DEFAULT_MAX_EDGE = 1280
const DEFAULT_QUALITY = 0.82

export function compressRoomImageFile(file, options = {}) {
  if (typeof window === 'undefined' || !file) {
    return Promise.resolve(null)
  }

  const maxEdge = Number(options.maxEdge) || DEFAULT_MAX_EDGE
  const quality = Number(options.quality) || DEFAULT_QUALITY

  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        try {
          const scale = Math.min(1, maxEdge / Math.max(image.width, image.height))
          const width = Math.max(1, Math.round(image.width * scale))
          const height = Math.max(1, Math.round(image.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const context = canvas.getContext('2d')
          if (!context) {
            resolve(String(reader.result || ''))
            return
          }

          context.drawImage(image, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          resolve(String(reader.result || ''))
        }
      }
      image.onerror = () => resolve(String(reader.result || ''))
      image.src = String(reader.result || '')
    }

    reader.onerror = () => resolve(null)
    reader.readAsDataURL(file)
  })
}

export function captureVideoFrame(videoElement, options = {}) {
  if (typeof window === 'undefined' || !videoElement) {
    return null
  }

  const maxEdge = Number(options.maxEdge) || DEFAULT_MAX_EDGE
  const quality = Number(options.quality) || DEFAULT_QUALITY
  const width = videoElement.videoWidth || maxEdge
  const height = videoElement.videoHeight || maxEdge
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))

  const context = canvas.getContext('2d')
  if (!context) {
    return null
  }

  context.drawImage(videoElement, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}
