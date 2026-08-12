import { memo, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { artworkImageUrl } from '../utils/artworkImages'

function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

function ArtworkCard({ artwork }) {
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

  return (
    <article
      className="card"
      onClick={() => navigate(`/product/${artwork.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          navigate(`/product/${artwork.id}`)
        }
      }}
    >
      <div className="card-media">
        {primaryImage ? (
          <img
            src={primaryImage}
            alt={artwork.title}
            className="card-image"
            loading="lazy"
            decoding="async"
            width="960"
            height="1200"
          />
        ) : null}
        <div className="card-overlay">
          <div className="card-overlay-copy">
            <h3>{artwork.title}</h3>
            <p>{formatPrice(artwork.price)}</p>
          </div>
        </div>
        {artwork.status === 'sold' ? (
          <span className="badge sold card-badge">Sold Out</span>
        ) : null}
      </div>
      <div className="card-body">
        <h3>{artwork.title}</h3>
        <p>{formatPrice(artwork.price)}</p>
      </div>
    </article>
  )
}

export default memo(ArtworkCard)
