import { useEffect, useState } from 'react'
import { fetchArtworkTestimonials } from '../services/testimonialService'

function formatDate(value) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function Stars({ rating }) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)))

  return (
    <span className="review-stars" aria-label={`${value} out of 5`}>
      {'★'.repeat(value)}
      <span className="review-stars-empty">{'★'.repeat(5 - value)}</span>
    </span>
  )
}

/**
 * Reviews of this specific piece.
 *
 * Social proof belongs at the point of decision. The table and API already
 * carried an artwork_id; nothing had ever surfaced it. Renders nothing at all
 * when there are no reviews — an empty "no reviews yet" block on a one-of-one
 * artwork reads as a warning rather than an invitation.
 */
function ArtworkReviews({ artworkId }) {
  const [reviews, setReviews] = useState([])

  useEffect(() => {
    let cancelled = false

    if (!artworkId) {
      return undefined
    }

    fetchArtworkTestimonials(artworkId)
      .then((list) => {
        if (!cancelled) {
          setReviews(list)
        }
      })
      .catch(() => null)

    return () => {
      cancelled = true
    }
  }, [artworkId])

  if (reviews.length === 0) {
    return null
  }

  const rated = reviews.filter((review) => Number(review.rating) > 0)
  const average = rated.length
    ? (rated.reduce((sum, review) => sum + Number(review.rating), 0) / rated.length).toFixed(1)
    : null

  return (
    <section className="artwork-reviews">
      <div className="artwork-reviews-head">
        <h2 className="section-title">What collectors said</h2>
        {average ? (
          <p className="artwork-reviews-average">
            <Stars rating={average} /> {average} · {reviews.length}{' '}
            {reviews.length === 1 ? 'review' : 'reviews'}
          </p>
        ) : null}
      </div>

      <ul className="artwork-review-list">
        {reviews.map((review) => (
          <li key={review.id} className="artwork-review">
            {review.rating ? <Stars rating={review.rating} /> : null}
            <p className="artwork-review-body">{review.content}</p>
            <p className="artwork-review-meta">
              {review.name}
              {review.created_at ? <> · {formatDate(review.created_at)}</> : null}
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default ArtworkReviews
