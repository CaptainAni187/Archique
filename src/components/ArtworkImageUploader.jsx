import { useRef, useState } from 'react'
import { uploadArtworkImages } from '../services/artworkService'

const MAX_IMAGES = 5
const MAX_FILE_BYTES = 10 * 1024 * 1024

/**
 * Pick or drop photographs and have them uploaded straight to storage.
 *
 * The upload endpoint already existed but nothing called it, so images had to
 * be uploaded in the Supabase dashboard and their links pasted in by hand.
 * This fills the same image1..image5 fields the form already uses, so the rest
 * of the form is untouched — the URLs stay visible and editable.
 */
function ArtworkImageUploader({ form, onImagesChange }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState('')

  const slots = ['image1', 'image2', 'image3', 'image4', 'image5']
  const currentUrls = slots.map((slot) => form[slot]).filter(Boolean)
  const remaining = MAX_IMAGES - currentUrls.length

  async function handleFiles(fileList) {
    const files = Array.from(fileList || [])

    if (files.length === 0) {
      return
    }

    if (remaining <= 0) {
      setMessage(`All ${MAX_IMAGES} image slots are full. Remove one first.`)
      return
    }

    // Reject before uploading rather than after a slow round trip.
    const tooLarge = files.find((file) => file.size > MAX_FILE_BYTES)
    if (tooLarge) {
      setMessage(`"${tooLarge.name}" is larger than 10MB. Please use a smaller photo.`)
      return
    }

    const notImage = files.find((file) => !file.type.startsWith('image/'))
    if (notImage) {
      setMessage(`"${notImage.name}" is not an image.`)
      return
    }

    const accepted = files.slice(0, remaining)
    const skipped = files.length - accepted.length

    setIsUploading(true)
    setMessage(accepted.length > 1 ? `Uploading ${accepted.length} images…` : 'Uploading…')

    try {
      const uploaded = await uploadArtworkImages(accepted)
      const urls = uploaded.map((image) => image.url).filter(Boolean)

      // Fill the first free slots, leaving anything already entered alone.
      const next = {}
      let cursor = 0
      slots.forEach((slot) => {
        if (!form[slot] && cursor < urls.length) {
          next[slot] = urls[cursor]
          cursor += 1
        }
      })

      onImagesChange(next)
      setMessage(
        skipped > 0
          ? `Added ${urls.length}. ${skipped} skipped — only ${MAX_IMAGES} images per artwork.`
          : `Added ${urls.length} image${urls.length === 1 ? '' : 's'}.`,
      )
    } catch (error) {
      setMessage(error?.message || 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  function removeImage(slot) {
    // Close the gap so slot 1 always holds the primary image.
    const kept = slots.filter((key) => key !== slot).map((key) => form[key]).filter(Boolean)
    const next = {}
    slots.forEach((key, index) => {
      next[key] = kept[index] || ''
    })
    onImagesChange(next)
    setMessage('')
  }

  return (
    <div className="artwork-uploader">
      <div
        className={`artwork-dropzone ${isDragging ? 'is-dragging' : ''} ${
          isUploading ? 'is-uploading' : ''
        }`.trim()}
        onDragOver={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setIsDragging(false)
          handleFiles(event.dataTransfer.files)
        }}
onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => handleFiles(event.target.files)}
        />
        <p className="artwork-dropzone-title">
          {isUploading ? 'Uploading…' : 'Drop photos here, or click to choose'}
        </p>
        <p className="artwork-dropzone-hint">
          {remaining > 0
            ? `JPG or PNG, up to 10MB each · ${remaining} slot${remaining === 1 ? '' : 's'} left`
            : 'All image slots are full'}
        </p>
      </div>

      {message ? <p className="artwork-uploader-message">{message}</p> : null}

      {currentUrls.length > 0 ? (
        <ul className="artwork-uploader-grid">
          {slots.map((slot) =>
            form[slot] ? (
              <li key={slot} className="artwork-uploader-thumb">
                <img src={form[slot]} alt="" />
                {slot === 'image1' ? <span className="artwork-thumb-badge">Main</span> : null}
                <button
                  type="button"
                  className="artwork-thumb-remove"
                  onClick={() => removeImage(slot)}
                  aria-label="Remove this image"
                >
                  ×
                </button>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
    </div>
  )
}

export default ArtworkImageUploader
