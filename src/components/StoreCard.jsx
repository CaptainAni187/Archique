import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackAnalyticsEvent } from '../services/analyticsService'
import { getArtworkTasteMetadata } from '../services/tasteService'

function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

function StoreCard({ artwork, isSaved = false, onToggleSave = null }) {
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
      className="store-card artwork-item"
      onClick={openProduct}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          openProduct()
        }
      }}
    >
      <div className="store-card-media">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={artwork.title}
            className="store-card-image"
            loading="lazy"
            decoding="async"
            width="960"
            height="1200"
          />
        ) : null}
        {artwork.status === 'sold' ? (
          <span className="badge sold card-badge">SOLD OUT</span>
        ) : null}
        {typeof onToggleSave === 'function' ? (
          <button
            type="button"
            className={`save-artwork-button ${isSaved ? 'is-saved' : ''}`}
            aria-label={isSaved ? `Unsave ${artwork.title}` : `Save ${artwork.title}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onToggleSave()
            }}
          >
            {isSaved ? 'Saved' : 'Save'}
          </button>
        ) : null}
      </div>
      <div className="store-card-body">
        <h3>{artwork.title}</h3>
        <p>{artwork.medium || artwork.category}</p>
        <p>{formatPrice(artwork.price)}</p>
        {artwork.smart_explanation ? (
          <p className="smart-result-explanation">{artwork.smart_explanation}</p>
        ) : null}
        {artwork.recommendation_reason_label ? (
          <p className="smart-result-explanation">{artwork.recommendation_reason_label}</p>
        ) : null}
      </div>
    </article>
  )
}

export default StoreCard
