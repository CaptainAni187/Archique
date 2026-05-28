import { useEffect, useMemo, useState } from 'react'
import ArtworkCarousel from '../components/ArtworkCarousel'
import { fetchArtworks } from '../services/artworkService'
import { getSketchArtworks } from '../utils/artworkCategories'
import usePageMeta from '../hooks/usePageMeta'
import ErrorState from '../components/ErrorState'
import { getUserFriendlyError } from '../utils/userErrors'

const placeholderSketch = {
  id: 'placeholder-sketch-1',
  title: 'FIGURE STUDY',
  medium: 'GRAPHITE ON PAPER',
  images: [
    'https://images.unsplash.com/photo-1517971129774-8a2b38fa128e?auto=format&fit=crop&w=1600&q=80',
  ],
  category: 'sketch',
}

function Sketch({ onHeroContrastChange }) {
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  usePageMeta({
    title: 'SKETCH | ARCHIVERSE',
    description: 'Explore sketch studies and drawing works from ARCHIVERSE.',
  })

  useEffect(() => {
    async function loadArtworks() {
      setLoading(true)
      try {
        const response = await fetchArtworks()
        const sketchWorks = getSketchArtworks(response)
        setArtworks(sketchWorks.length > 0 ? sketchWorks : [placeholderSketch])
        setErrorMessage('')
      } catch (error) {
        setErrorMessage(
          getUserFriendlyError(error, 'We could not load sketch works right now.'),
        )
      } finally {
        setLoading(false)
      }
    }

    loadArtworks()
  }, [retryKey])

  const sketchImages = useMemo(
    () =>
      artworks.map((artwork) => ({
        src:
          (Array.isArray(artwork.images) ? artwork.images[0] || '' : '') ||
          artwork.image ||
          '',
        title: artwork.title,
        medium: artwork.medium,
      })),
    [artworks],
  )

  return (
    <section className="page-flow fullscreen-page">
      {loading ? <p className="status-message">Loading SKETCH works...</p> : null}
      {errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      ) : null}
      {!loading && !errorMessage && artworks.length === 0 ? (
        <p className="status-message">No SKETCH works available yet.</p>
      ) : null}

      {!loading && !errorMessage && artworks.length > 0 ? (
        <ArtworkCarousel
          images={sketchImages}
          interval={3000}
          overlayPosition="left"
          onBackgroundContrastChange={onHeroContrastChange}
        />
      ) : null}
    </section>
  )
}

export default Sketch
