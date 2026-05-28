import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackAnalyticsEvent } from '../services/analyticsService'
import { getArtworkTasteMetadata } from '../services/tasteService'

function PortfolioCard({ artwork, className = '' }) {
  const navigate = useNavigate()
  const images = useMemo(
    () =>
      Array.isArray(artwork.images)
        ? artwork.images
        : artwork.image
          ? [artwork.image]
          : [],
    [artwork.id, artwork.image, artwork.images],
  )
  const primaryImage = images[0]
  const openProduct = () => {
    void trackAnalyticsEvent('artwork_click', getArtworkTasteMetadata(artwork))
    navigate(`/product/${artwork.id}`)
  }

  return (
    <article
      className={`portfolio-card ${className}`.trim()}
      onClick={openProduct}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          openProduct()
        }
      }}
    >
      <div className="portfolio-image-wrap">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={artwork.title}
            className="portfolio-image"
            loading="lazy"
            decoding="async"
            width="960"
            height="1200"
          />
        ) : null}
      </div>
      <div className="portfolio-meta">
        <h3>{artwork.title}</h3>
        <p>{artwork.medium}</p>
      </div>
    </article>
  )
}

export default PortfolioCard
