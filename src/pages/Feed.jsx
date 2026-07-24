import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Reveal from '../components/Reveal'
import { fetchArtworks } from '../services/artworkService'
import usePageMeta from '../hooks/usePageMeta'
import ErrorState from '../components/ErrorState'
import { SkeletonMasonry } from '../components/SkeletonLoader'
import { getUserFriendlyError } from '../utils/userErrors'
import { trackAnalyticsEvent } from '../services/analyticsService'
import {
  getArtworkTasteMetadata,
  getTasteProfile,
  rankArtworksByTaste,
} from '../services/tasteService'

function getPrimaryImage(artwork) {
  const imageCandidates = [
    ...(Array.isArray(artwork?.images) ? artwork.images : []),
    typeof artwork?.image === 'string' ? artwork.image : '',
  ]

  return (
    imageCandidates.find((image) => typeof image === 'string' && image.trim()) || ''
  )
}

function Feed() {
  const navigate = useNavigate()
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  usePageMeta({
    title: 'FEED | ARCHIVERSE',
    description: 'Selected recent works and highlights from ARCHIVERSE.',
  })

  useEffect(() => {
    async function loadFeed() {
      setLoading(true)
      try {
        const response = await fetchArtworks()
        setArtworks(response)
        setErrorMessage('')
      } catch (error) {
        setErrorMessage(
          getUserFriendlyError(error, 'We could not load the feed right now.'),
        )
      } finally {
        setLoading(false)
      }
    }

    loadFeed()
  }, [retryKey])

  const artworksWithImages = useMemo(
    () =>
      rankArtworksByTaste(artworks, getTasteProfile())
        .map((artwork) => ({
          ...artwork,
          src: getPrimaryImage(artwork),
        }))
        .filter((artwork) => artwork.src),
    [artworks],
  )
  const featuredArtwork = artworksWithImages[0] || null
  const masonryItems = artworksWithImages.slice(1)

  return (
    <section className="page-flow page-with-header-gap">
      <p className="eyebrow">FEED</p>

      {loading ? (
        <>
          <div className="skeleton-block feed-feature-image" aria-hidden="true" />
          <SkeletonMasonry />
        </>
      ) : null}
      {errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      ) : null}

      {featuredArtwork ? (
        <Reveal className="feed-feature">
          {featuredArtwork.src ? (
            <button
              type="button"
              className="feed-feature-button"
              onClick={() => {
                void trackAnalyticsEvent('artwork_click', getArtworkTasteMetadata(featuredArtwork))
                navigate(`/product/${featuredArtwork.id}`)
              }}
            >
              <img
                src={featuredArtwork.src}
                alt={featuredArtwork.title}
                className="feed-feature-image"
                loading="lazy"
                decoding="async"
                width="1600"
                height="1200"
              />
            </button>
          ) : null}
          <div className="feed-card-caption">
            <h3>{featuredArtwork.title}</h3>
            <p>{featuredArtwork.medium || featuredArtwork.category}</p>
          </div>
        </Reveal>
      ) : null}

      <div className="feed-masonry artwork-grid">
        {masonryItems.map((artwork, index) => (
          <Reveal
            key={artwork.id}
            className={`feed-brick artwork-item feed-brick-${(index % 4) + 1}`}
          >
            <article
              className="feed-artwork-card"
              onClick={() => {
                void trackAnalyticsEvent('artwork_click', getArtworkTasteMetadata(artwork))
                navigate(`/product/${artwork.id}`)
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  void trackAnalyticsEvent('artwork_click', getArtworkTasteMetadata(artwork))
                  navigate(`/product/${artwork.id}`)
                }
              }}
            >
              <div className="feed-brick-media">
                {artwork.src ? (
                  <img
                    src={artwork.src}
                    alt={artwork.title}
                    className="feed-image"
                    loading="lazy"
                    decoding="async"
                    width="900"
                    height="1200"
                  />
                ) : null}
                {artwork.instagram_url ? (
                  <a
                    href={artwork.instagram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="feed-instagram-overlay"
                    onClick={(event) => {
                      event.stopPropagation()
                      void trackAnalyticsEvent(
                        'instagram_click',
                        getArtworkTasteMetadata(artwork, {
                          instagram_url: artwork.instagram_url,
                        }),
                      )
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    Instagram
                  </a>
                ) : null}
              </div>
              {artwork.instagram_url ? (
                <a
                  href={artwork.instagram_url}
                  target="_blank"
                  rel="noreferrer"
                  className="feed-instagram-mobile"
                  onClick={(event) => {
                    event.stopPropagation()
                    void trackAnalyticsEvent(
                      'instagram_click',
                      getArtworkTasteMetadata(artwork, {
                        instagram_url: artwork.instagram_url,
                      }),
                    )
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  Instagram
                </a>
              ) : null}
              <div className="feed-card-caption">
                <h3>{artwork.title}</h3>
                <p>{artwork.medium || artwork.category}</p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

export default Feed
