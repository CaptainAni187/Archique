import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { trackAnalyticsEvent } from '../services/analyticsService'
import { getArtworkTasteMetadata } from '../services/tasteService'
import ArtworkActions from './ArtworkActions'
import { getImageSrcSet, getOptimizedImageUrl } from '../utils/imageUrl'
import { artworkImageUrl } from '../utils/artworkImages'

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
    [artwork.image, artwork.images],
  )
  // Cards are small; loading a full-size original here is what made the
  // store page weigh several megabytes.
  const primaryImage = artworkImageUrl(images[0], 'thumb')
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
            src={getOptimizedImageUrl(primaryImage, 640)}
            srcSet={getImageSrcSet(primaryImage)}
            sizes="(max-width: 720px) 50vw, (max-width: 1100px) 33vw, 25vw"
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
        <ArtworkActions artwork={artwork} isSaved={isSaved} onToggleSave={onToggleSave} />
      </div>
      <div className="store-card-body">
        <h3>{artwork.title}</h3>
        <p>{artwork.medium || artwork.category}</p>
        <p>{formatPrice(artwork.price)}</p>
      </div>
    </article>
  )
}

export default StoreCard
