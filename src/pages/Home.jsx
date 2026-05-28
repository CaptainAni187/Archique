import { useEffect, useMemo, useState } from 'react'
import { fetchArtworks } from '../services/artworkService'
import FullscreenCarousel from '../components/FullscreenCarousel'
import PortfolioCard from '../components/PortfolioCard'
import { Link, useNavigate } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta'
import { getCanvasArtworks, getSketchArtworks } from '../utils/artworkCategories'
import ErrorState from '../components/ErrorState'
import { SkeletonGrid } from '../components/SkeletonLoader'
import { getUserFriendlyError } from '../utils/userErrors'

function pickStableGalleryPreview(artworks) {
  const validArtworks = artworks.filter((artwork) =>
    Array.isArray(artwork.images) && typeof artwork.images[0] === 'string' && artwork.images[0].trim(),
  )

  if (validArtworks.length <= 3) {
    return validArtworks.slice(0, 3)
  }

  const pool = [...validArtworks]
  const selected = []

  while (selected.length < 3 && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    selected.push(pool.splice(index, 1)[0])
  }

  return selected
}

function getFeaturedRank(artwork) {
  const rank = Number(artwork.featured_rank)
  return Number.isFinite(rank) ? rank : Number.MAX_SAFE_INTEGER
}

function Home({ onHeroContrastChange }) {
  const navigate = useNavigate()
  const [heroCanvasWorks, setHeroCanvasWorks] = useState([])
  const [heroSketchWorks, setHeroSketchWorks] = useState([])
  const [canvasWorks, setCanvasWorks] = useState([])
  const [galleryPreviewWorks, setGalleryPreviewWorks] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  usePageMeta({
    title: 'Archiverse | Curated Fine Art',
    description:
      'Discover original fine art, pay 50% advance, and collect timeless works from Archiverse.',
  })

  useEffect(() => {
    async function loadFeatured() {
      setLoading(true)
      setNoticeMessage('')
      try {
        const artworks = await fetchArtworks()
        const featuredWorks = artworks
          .filter((artwork) => artwork.is_featured === true)
          .sort(
            (left, right) =>
              getFeaturedRank(left) - getFeaturedRank(right) ||
              String(left.title || '').localeCompare(String(right.title || '')),
          )
        const curatedHeroCanvas = getCanvasArtworks(featuredWorks).slice(0, 4)
        const curatedHeroSketch = getSketchArtworks(featuredWorks).slice(0, 2)

        if (featuredWorks.length === 0) {
          setNoticeMessage('Featured works are being curated right now.')
        }

        setHeroCanvasWorks(curatedHeroCanvas)
        setHeroSketchWorks(curatedHeroSketch)
        setCanvasWorks(featuredWorks.slice(0, 6))
        setGalleryPreviewWorks((current) =>
          current.length > 0 ? current : pickStableGalleryPreview(artworks),
        )
        setErrorMessage('')
      } catch (error) {
        setErrorMessage(
          getUserFriendlyError(error, 'We could not load the home page right now.'),
        )
      } finally {
        setLoading(false)
      }
    }

    loadFeatured()
  }, [retryKey])

  const heroArtworks = useMemo(
    () => [...heroCanvasWorks, ...heroSketchWorks],
    [heroCanvasWorks, heroSketchWorks],
  )
  const galleryPreviewItems = useMemo(
    () =>
      galleryPreviewWorks.map((artwork) => ({
        id: artwork.id,
        src: artwork.images[0],
        title: artwork.title,
      })),
    [galleryPreviewWorks],
  )

  return (
    <section className="page-flow">
      {loading ? (
        <>
          <div className="carousel-stage full-bleed" aria-hidden="true">
            <div className="carousel-placeholder skeleton-block" />
          </div>
          <section className="section-block">
            <p className="eyebrow">FEATURED WORKS</p>
            <SkeletonGrid className="portfolio-grid" count={6} />
          </section>
        </>
      ) : null}
      {errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      ) : null}
      {noticeMessage && !errorMessage ? <p className="status-message">{noticeMessage}</p> : null}
      {!loading && !errorMessage ? (
        <>
          <FullscreenCarousel
            artworks={heroArtworks}
            autoSlide
            interval={3000}
            showMeta={false}
            onBackgroundContrastChange={onHeroContrastChange}
            overlayContent={() => (
              <div className="hero-overlay-copy">
                <p>CURATED WORKS</p>
                <h1>ARCHIVERSE</h1>
                <p>
                  Original works and commissioned pieces created for personal spaces.
                </p>
                <Link to="/canvas" className="hero-enter-link">
                  ENTER CANVAS
                </Link>
              </div>
            )}
          />

          {canvasWorks.length > 0 ? (
            <section className="section-block home-featured-section">
              <p className="eyebrow">FEATURED WORKS</p>
              <div className="home-featured-grid">
                {canvasWorks.slice(0, 4).map((artwork, index) => (
                  <PortfolioCard
                    key={artwork.id}
                    artwork={artwork}
                    className={index === 0 ? 'portfolio-card-dominant' : ''}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="section-block home-statement-section">
            <p className="eyebrow">ABOUT</p>
            <p className="home-editorial-statement">
              Original works and commissioned pieces created for personal spaces.
            </p>
          </section>

          <section className="section-block home-gallery-section">
            <div className="home-section-intro">
              <p className="eyebrow">GALLERY PREVIEW</p>
              <Link to="/feed" className="text-link-button">
                VIEW GALLERY
              </Link>
            </div>
            {galleryPreviewItems.length > 0 ? (
              <div className="feed-preview-grid home-gallery-preview">
                {galleryPreviewItems.map((artwork) => (
                  <button
                    key={artwork.id}
                    type="button"
                    className="feed-preview-button"
                    onClick={() => navigate('/feed')}
                    aria-label={`View full gallery from ${artwork.title}`}
                  >
                    <img
                      src={artwork.src}
                      alt={artwork.title}
                      className="feed-preview-image"
                      loading="lazy"
                      decoding="async"
                      width="900"
                      height="1200"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="section-block home-commission-section">
            <p className="eyebrow">CUSTOM COMMISSIONS</p>
            <p className="section-copy section-copy-readable">
              A restrained process for translating an idea, room, or memory into a personal work.
            </p>
            <Link to="/contact" className="text-link-button">
              CONTACT
            </Link>
          </section>
        </>
      ) : null}
    </section>
  )
}

export default Home
