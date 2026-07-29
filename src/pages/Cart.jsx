import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchArtworks } from '../services/artworkService'
import { useOrderContext } from '../state/useOrderContext'
import { removeFromCart } from '../state/cartStore'
import useCart from '../hooks/useCart'
import usePageMeta from '../hooks/usePageMeta'
import ErrorState from '../components/ErrorState'
import { getUserFriendlyError } from '../utils/userErrors'

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

function Cart() {
  usePageMeta({
    title: 'Cart | Archique',
    description: 'Artworks you have added to your cart.',
  })

  const navigate = useNavigate()
  const { setSelectedProduct } = useOrderContext()
  const cartItems = useCart()
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  // Cart entries are snapshots, so re-read the live catalogue: price and
  // availability shown here (and carried into checkout) are always current.
  useEffect(() => {
    let isCancelled = false

    async function loadArtworks() {
      setLoading(true)
      try {
        const response = await fetchArtworks()
        if (!isCancelled) {
          setArtworks(Array.isArray(response) ? response : [])
          setErrorMessage('')
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(getUserFriendlyError(error, 'We could not load your cart right now.'))
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadArtworks()
    return () => {
      isCancelled = true
    }
  }, [retryKey])

  const lines = useMemo(() => {
    const byId = new Map(artworks.map((artwork) => [Number(artwork.id), artwork]))

    return cartItems.map((item) => {
      const live = byId.get(Number(item.id)) || null
      return {
        item,
        live,
        isUnavailable: !live || live.status === 'sold',
      }
    })
  }, [artworks, cartItems])

  const availableLines = lines.filter((line) => !line.isUnavailable)
  const total = availableLines.reduce((sum, line) => sum + Number(line.live.price || 0), 0)

  const buyNow = (artwork) => {
    setSelectedProduct(artwork)
    navigate('/checkout', { state: { product: artwork } })
  }

  if (errorMessage) {
    return (
      <section className="page-flow page-with-header-gap">
        <ErrorState message={errorMessage} onRetry={() => setRetryKey((value) => value + 1)} />
      </section>
    )
  }

  return (
    <section className="page-flow page-with-header-gap">
      <p className="eyebrow">CART</p>
      <h2 className="section-title">Your selected works</h2>

      {cartItems.length === 0 ? (
        <div className="cart-empty">
          <p className="section-copy">Your cart is empty.</p>
          <Link to="/store" className="text-link-button action-button">
            Browse the store
          </Link>
        </div>
      ) : (
        <>
          <div className="cart-list">
            {lines.map(({ item, live, isUnavailable }) => (
              <article key={item.id} className="cart-line">
                <Link to={`/product/${item.id}`} className="cart-line-media">
                  {item.image ? (
                    <img src={item.image} alt={item.title} loading="lazy" decoding="async" />
                  ) : null}
                </Link>

                <div className="cart-line-body">
                  <h3>
                    <Link to={`/product/${item.id}`}>{item.title}</Link>
                  </h3>
                  {item.medium ? <p>{item.medium}</p> : null}
                  {item.size ? <p>{item.size}</p> : null}
                  <p className="cart-line-price">{formatPrice(live?.price ?? item.price)}</p>
                  {isUnavailable ? (
                    <p className="status-message error">
                      {live ? 'This piece has sold.' : 'This piece is no longer listed.'}
                    </p>
                  ) : null}
                </div>

                <div className="cart-line-actions">
                  {!isUnavailable ? (
                    <button
                      type="button"
                      className="text-link-button action-button"
                      onClick={() => buyNow(live)}
                    >
                      Buy This Work
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="cart-line-remove"
                    onClick={() => removeFromCart(item.id)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="cart-summary">
            <p>
              {availableLines.length} {availableLines.length === 1 ? 'work' : 'works'} available
            </p>
            <p className="cart-summary-total">{loading ? 'Checking prices…' : formatPrice(total)}</p>
          </div>

          <p className="section-copy cart-note">
            Each work is one of one, so pieces are purchased individually — choose a work above to
            check out.
          </p>
        </>
      )}
    </section>
  )
}

export default Cart
