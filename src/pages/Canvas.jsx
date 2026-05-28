import { useEffect, useMemo, useState } from 'react'
import ArtworkCarousel from '../components/ArtworkCarousel'
import { fetchArtworks } from '../services/artworkService'
import { getCanvasArtworks } from '../utils/artworkCategories'
import usePageMeta from '../hooks/usePageMeta'
import ErrorState from '../components/ErrorState'
import { getUserFriendlyError } from '../utils/userErrors'

function Canvas({ onHeroContrastChange }) {
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  usePageMeta({
    title: 'CANVAS | ARCHIVERSE',
    description: 'Explore acrylic and painted works from ARCHIVERSE.',
  })

  useEffect(() => {
    async function loadArtworks() {
      setLoading(true)
      try {
        const response = await fetchArtworks()
        setArtworks(getCanvasArtworks(response))
        setErrorMessage('')
      } catch (error) {
        setErrorMessage(
          getUserFriendlyError(error, 'We could not load canvas works right now.'),
        )
      } finally {
        setLoading(false)
      }
    }

    loadArtworks()
  }, [retryKey])

  const canvasImages = useMemo(
    () =>
      artworks.map((artwork) => ({
        src:
          (Array.isArray(artwork.images) ? artwork.images[0] || '' : '') ||
          artwork.image ||
          '',
        title: artwork.title,
        medium: artwork.medium,
        year: artwork.year,
      })),
    [artworks],
  )

  return (
    <section className="page-flow fullscreen-page">
      {loading ? <p className="status-message">Loading CANVAS works...</p> : null}
      {errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      ) : null}
      {!loading && !errorMessage && artworks.length === 0 ? (
        <p className="status-message">No CANVAS works available yet.</p>
      ) : null}

      {!loading && !errorMessage && artworks.length > 0 ? (
        <ArtworkCarousel
          images={canvasImages}
          interval={3000}
          overlayPosition="left"
          onBackgroundContrastChange={onHeroContrastChange}
        />
      ) : null}
    </section>
  )
}

export default Canvas
