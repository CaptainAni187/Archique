import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useOrderContext } from '../state/useOrderContext'
import { fetchArtworks, fetchSingleArtwork } from '../services/artworkService'
import { fetchActiveCombos } from '../services/comboService'
import { trackAnalyticsEvent } from '../services/analyticsService'
import { trackRecommendationEvent } from '../services/analyticsService'
import Reveal from '../components/Reveal'
import ErrorState from '../components/ErrorState'
import { SkeletonProduct } from '../components/SkeletonLoader'
import StoreCard from '../components/StoreCard'
import usePageMeta from '../hooks/usePageMeta'
import { getUserFriendlyError } from '../utils/userErrors'
import {
  getArtworkTasteMetadata,
  getRecommendationReason,
  getTasteProfile,
} from '../services/tasteService'
import {
  buildPurchaseSelection,
  getSmartPairings,
  isArtworkAvailable,
} from '../utils/comboPricing'
import { fetchSavedArtworks, saveArtwork, unsaveArtwork } from '../services/userAuthService'

function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

function Product() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { setSelectedProduct, setSelectedPurchase } = useOrderContext()
  const [artwork, setArtwork] = useState(null)
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [activeImage, setActiveImage] = useState('')
  const [isZoomOpen, setIsZoomOpen] = useState(false)
  const [isImageHovering, setIsImageHovering] = useState(false)
  const [hoverZoomOrigin, setHoverZoomOrigin] = useState({ x: '50%', y: '50%' })
  const [retryKey, setRetryKey] = useState(0)
  const [allArtworks, setAllArtworks] = useState([])
  const [comboMatches, setComboMatches] = useState([])
  const [savedArtworkIds, setSavedArtworkIds] = useState([])
  const productOpenedAtRef = useRef(Date.now())
  const hoverStartedAtRef = useRef(null)
  const hoverDwellMsRef = useRef(0)

  usePageMeta({
    title: artwork ? `${artwork.title} | Archiverse` : 'Artwork | Archiverse',
    description:
      artwork?.description || 'Explore artwork details and pay 50% advance at Archiverse.',
  })

  useEffect(() => {
    async function loadArtwork() {
      setLoading(true)
      try {
        const response = await fetchSingleArtwork(id)
        setArtwork(response || null)
        setActiveImage(Array.isArray(response?.images) ? response.images[0] || '' : '')
        const [artworksResponse, comboResponse, saved] = await Promise.all([
          fetchArtworks(),
          fetchActiveCombos(id),
          fetchSavedArtworks().catch(() => []),
        ])
        setAllArtworks(artworksResponse)
        setComboMatches(comboResponse)
        setSavedArtworkIds(saved.map((item) => Number(item.artwork_id)).filter(Boolean))
        if (response) {
          productOpenedAtRef.current = Date.now()
          hoverDwellMsRef.current = 0
          hoverStartedAtRef.current = null
          void trackAnalyticsEvent('artwork_view', getArtworkTasteMetadata(response))
          void trackRecommendationEvent('recommendation_clicked', {
            artwork_id: response.id,
            source: 'product_page',
            artwork: response,
          })
          void trackRecommendationEvent('recommendation_revisited', {
            artwork_id: response.id,
            source: document.referrer || 'direct',
            artwork: response,
          })
        }
        setErrorMessage('')
      } catch (error) {
        setErrorMessage(
          getUserFriendlyError(error, 'We could not load this artwork right now.'),
        )
      } finally {
        setLoading(false)
      }
    }

    loadArtwork()
  }, [id, retryKey])

  const galleryImages = useMemo(
    () => (Array.isArray(artwork?.images) ? artwork.images.filter(Boolean) : []),
    [artwork?.images],
  )
  const primaryImage = galleryImages[0] || ''
  const currentImage = activeImage || primaryImage
  const activeImageIndex = galleryImages.indexOf(currentImage)
  const safeImageIndex = activeImageIndex >= 0 ? activeImageIndex : 0
  const recommendationReason = artwork
    ? getRecommendationReason(artwork, getTasteProfile())
    : ''
  const recommendationReasonLabel = recommendationReason
    .replace(/^Shown because it\s*/i, '')
    .replace(/\.$/, '')

  const goToPreviousImage = () => {
    if (galleryImages.length <= 1) {
      return
    }

    const nextIndex = safeImageIndex === 0 ? galleryImages.length - 1 : safeImageIndex - 1
    setActiveImage(galleryImages[nextIndex])
  }

  const goToNextImage = () => {
    if (galleryImages.length <= 1) {
      return
    }

    const nextIndex = safeImageIndex === galleryImages.length - 1 ? 0 : safeImageIndex + 1
    setActiveImage(galleryImages[nextIndex])
  }

  const handleImageMouseMove = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const relativeX = ((event.clientX - bounds.left) / bounds.width) * 100
    const relativeY = ((event.clientY - bounds.top) / bounds.height) * 100

    setHoverZoomOrigin({
      x: `${Math.min(100, Math.max(0, relativeX))}%`,
      y: `${Math.min(100, Math.max(0, relativeY))}%`,
    })
  }

  const startHoverDwell = () => {
    setIsImageHovering(true)
    hoverStartedAtRef.current = Date.now()
  }

  const stopHoverDwell = () => {
    setIsImageHovering(false)

    if (hoverStartedAtRef.current) {
      hoverDwellMsRef.current += Date.now() - hoverStartedAtRef.current
      hoverStartedAtRef.current = null
    }
  }

  useEffect(() => {
    if (!artwork) {
      return undefined
    }

    return () => {
      if (hoverStartedAtRef.current) {
        hoverDwellMsRef.current += Date.now() - hoverStartedAtRef.current
        hoverStartedAtRef.current = null
      }

      void trackAnalyticsEvent(
        'product_open',
        getArtworkTasteMetadata(artwork, {
          dwell_time_ms: Date.now() - productOpenedAtRef.current,
          hover_dwell_time_ms: hoverDwellMsRef.current,
        }),
      )
    }
  }, [artwork])

  useEffect(() => {
    if (!isZoomOpen) {
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsZoomOpen(false)
      }
      if (galleryImages.length > 1 && event.key === 'ArrowLeft') {
        event.preventDefault()
        setActiveImage((previous) => {
          const currentIndex = galleryImages.indexOf(previous)
          const resolvedIndex = currentIndex >= 0 ? currentIndex : 0
          const nextIndex = resolvedIndex === 0 ? galleryImages.length - 1 : resolvedIndex - 1
          return galleryImages[nextIndex]
        })
      }
      if (galleryImages.length > 1 && event.key === 'ArrowRight') {
        event.preventDefault()
        setActiveImage((previous) => {
          const currentIndex = galleryImages.indexOf(previous)
          const resolvedIndex = currentIndex >= 0 ? currentIndex : 0
          const nextIndex = resolvedIndex === galleryImages.length - 1 ? 0 : resolvedIndex + 1
          return galleryImages[nextIndex]
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => window.removeEventListener('keydown', onKeyDown)
  }, [galleryImages, isZoomOpen])

  if (loading) {
    return (
      <section className="page-flow page-with-header-gap">
        <SkeletonProduct />
      </section>
    )
  }

  if (errorMessage) {
    return (
      <ErrorState
        message={errorMessage}
        onRetry={() => setRetryKey((value) => value + 1)}
      />
    )
  }

  if (!artwork) {
    return <p className="status-message">Artwork not found.</p>
  }

  const smartPairings = getSmartPairings(artwork, allArtworks, 3)

  const buyNow = () => {
    if (artwork.status === 'sold' || Number(artwork.quantity) <= 0) {
      return
    }

    const selection = buildPurchaseSelection([artwork])
    void trackRecommendationEvent('recommendation_purchased', {
      artwork_id: artwork.id,
      source: 'product_buy_now',
      artwork,
    })
    setSelectedProduct(artwork)
    setSelectedPurchase(selection)
    navigate('/checkout', { state: { product: artwork, selection } })
  }
  const isSoldOut = artwork.status === 'sold' || Number(artwork.quantity) <= 0
  const isSaved = savedArtworkIds.includes(Number(artwork.id))

  return (
    <section className="page-flow page-with-header-gap">
      <Reveal className="product-layout">
        <div className="product-gallery">
          <div className="product-image-wrap">
            <button
              type="button"
              className={`product-zoom-trigger ${isImageHovering ? 'is-hovering' : ''}`}
              onClick={() => setIsZoomOpen(true)}
              onMouseEnter={startHoverDwell}
              onMouseLeave={stopHoverDwell}
              onMouseMove={handleImageMouseMove}
              aria-label={`Open full resolution view of ${artwork.title}`}
            >
              {currentImage ? (
                <img
                  src={currentImage}
                  alt={artwork.title}
                  className="product-image"
                  style={{
                    '--product-zoom-origin-x': hoverZoomOrigin.x,
                    '--product-zoom-origin-y': hoverZoomOrigin.y,
                  }}
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                  width="1400"
                  height="1750"
                />
              ) : null}
            </button>
            {galleryImages.length > 1 ? (
              <>
                <button
                  type="button"
                  className="artwork-carousel__arrow artwork-carousel__arrow--left product-gallery-arrow"
                  onClick={goToPreviousImage}
                  aria-label="Previous artwork image"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="artwork-carousel__arrow artwork-carousel__arrow--right product-gallery-arrow"
                  onClick={goToNextImage}
                  aria-label="Next artwork image"
                >
                  →
                </button>
              </>
            ) : null}
            {isSoldOut ? (
              <span className="badge sold product-badge">Sold Out</span>
            ) : null}
          </div>
          <div className="thumbnail-row">
            {galleryImages.map((image, index) =>
              image ? (
                <button
                  key={`${artwork.id}-${index}`}
                  type="button"
                  className={`thumbnail-btn ${activeImage === image ? 'active' : ''}`}
                  onClick={() => setActiveImage(image)}
                >
                  <img
                    src={image}
                    alt={`${artwork.title} view ${index + 1}`}
                    className="thumbnail-image"
                    loading="lazy"
                    decoding="async"
                    width="240"
                    height="240"
                  />
                </button>
              ) : null,
            )}
          </div>
        </div>
        <div className="product-copy">
          <p className="eyebrow">ORIGINAL ARTWORK</p>
          <h1 className="section-title">{artwork.title}</h1>
          <p className="price">{formatPrice(artwork.price)}</p>
          <div className="product-meta">
            <p>
              <span>Medium</span>
              {artwork.medium}
            </p>
            <p>
              <span>Size</span>
              {artwork.size}
            </p>
          </div>
          <p>ONLY 1 PIECE AVAILABLE</p>
          <p>SHIPS IN 7–10 DAYS</p>
          <p className="product-description">{artwork.description}</p>
          <div className="product-meta">
            <p>
              <span>Why this is shown</span>
              {recommendationReasonLabel}
            </p>
          </div>
          <button
            type="button"
            className="text-link-button action-button"
            onClick={async () => {
              if (isSaved) {
                await unsaveArtwork(artwork.id).catch(() => null)
                setSavedArtworkIds((current) => current.filter((value) => value !== Number(artwork.id)))
                void trackRecommendationEvent('favorite_removed', {
                  artwork_id: artwork.id,
                  source: 'product',
                  artwork,
                })
              } else {
                await saveArtwork(artwork.id).catch(() => null)
                setSavedArtworkIds((current) =>
                  current.includes(Number(artwork.id)) ? current : [...current, Number(artwork.id)],
                )
                void trackRecommendationEvent('favorite_added', {
                  artwork_id: artwork.id,
                  source: 'product',
                  artwork,
                })
                void trackRecommendationEvent('recommendation_saved', {
                  artwork_id: artwork.id,
                  source: 'product',
                  artwork,
                })
              }
            }}
          >
            {isSaved ? 'Remove from Saved' : 'Save Artwork'}
          </button>
          <button
            type="button"
            className="text-link-button action-button"
            onClick={buyNow}
            disabled={isSoldOut}
          >
            {isSoldOut ? 'Sold Out' : 'Buy This Work'}
          </button>
        </div>
      </Reveal>
      <Reveal className="section-block-home room-match-entry">
        <p className="eyebrow">SEE THIS IN YOUR ROOM</p>
        <h2 className="section-title">Visualize In Your Space</h2>
        <p className="section-copy">
          Upload a room photo to preview how this artwork may feel in your environment.
        </p>
        <div className="room-match-actions">
          <Link
            to={`/room-match?artworkId=${encodeURIComponent(artwork.id)}`}
            className="text-link-button action-button"
          >
            Upload Room Photo
          </Link>
          <Link
            to={`/room-match?artworkId=${encodeURIComponent(artwork.id)}&camera=1`}
            className="text-link-button action-button"
          >
            Take Photo
          </Link>
        </div>
      </Reveal>
      {comboMatches.filter((combo) => combo.isAvailable !== false).length > 0 ? (
        <Reveal className="section-block-home">
          <p className="eyebrow">COMPLETE THE SET</p>
          <h2 className="section-title">Curated Combos</h2>
          {comboMatches
            .filter((combo) => combo.isAvailable !== false)
            .map((combo) => (
              <div key={combo.id} className="section-block-home">
                <div className="order-detail-header">
                  <div>
                    <p>{combo.title}</p>
                    <p>
                      Save {combo.pricing?.discountPercent || combo.discount_percent}% on this set
                    </p>
                  </div>
                  <span className="badge available">
                    {combo.pricing?.discountPercent || combo.discount_percent}% OFF
                  </span>
                </div>
                <div className="store-grid artwork-grid">
                  {combo.items
                    .filter((item) => isArtworkAvailable(item))
                    .map((item) => (
                      <StoreCard key={`${combo.id}-${item.id}`} artwork={item} />
                    ))}
                </div>
                <button
                  type="button"
                  className="text-link-button action-button"
                  onClick={() => {
                    void trackAnalyticsEvent('combo_click', getArtworkTasteMetadata(artwork, { combo_id: combo.id }))
                    const selection = buildPurchaseSelection(combo.items, {
                      comboId: combo.id,
                      comboTitle: combo.title,
                      curatedDiscountPercent:
                        combo.pricing?.discountPercent || combo.discount_percent,
                      type: 'combo',
                    })
                    setSelectedProduct(artwork)
                    setSelectedPurchase(selection)
                    navigate('/checkout', { state: { product: artwork, selection } })
                  }}
                >
                  Buy as Combo
                </button>
              </div>
            ))}
        </Reveal>
      ) : null}
      {isZoomOpen ? (
        <div
          className="image-zoom-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${artwork.title} full resolution image`}
          onClick={() => setIsZoomOpen(false)}
        >
          <button
            type="button"
            className="image-zoom-close"
            onClick={() => setIsZoomOpen(false)}
          >
            Close
          </button>
          {galleryImages.length > 1 ? (
            <>
              <button
                type="button"
                className="artwork-carousel__arrow artwork-carousel__arrow--left image-zoom-arrow"
                onClick={(event) => {
                  event.stopPropagation()
                  goToPreviousImage()
                }}
                aria-label="Previous artwork image"
              >
                ←
              </button>
              <button
                type="button"
                className="artwork-carousel__arrow artwork-carousel__arrow--right image-zoom-arrow"
                onClick={(event) => {
                  event.stopPropagation()
                  goToNextImage()
                }}
                aria-label="Next artwork image"
              >
                →
              </button>
            </>
          ) : null}
          <img
            src={currentImage}
            alt={artwork.title}
            className="image-zoom-full"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
      {smartPairings.length > 0 ? (
        <Reveal className="section-block-home">
          <p className="eyebrow">PAIR WITH THESE</p>
          <h2 className="section-title">Smart Pairings</h2>
          <div className="store-grid artwork-grid">
            {smartPairings.map((candidate) => (
              <div key={candidate.artwork.id}>
                <StoreCard artwork={candidate.artwork} />
                <button
                  type="button"
                  className="text-link-button action-button"
                  onClick={() => {
                    const selection = buildPurchaseSelection([artwork, candidate.artwork], {
                      type: 'smart-pair',
                    })
                    setSelectedProduct(artwork)
                    setSelectedPurchase(selection)
                    navigate('/checkout', { state: { product: artwork, selection } })
                  }}
                >
                  Add both & save 10%
                </button>
              </div>
            ))}
          </div>
        </Reveal>
      ) : null}
    </section>
  )
}

export default Product
