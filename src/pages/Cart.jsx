import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { fetchArtworks } from '../services/artworkService'
import { useOrderContext } from '../state/useOrderContext'
import { removeFromCart } from '../state/cartStore'
import useCart from '../hooks/useCart'
import usePageMeta from '../hooks/usePageMeta'
import ErrorState from '../components/ErrorState'
import { getUserFriendlyError } from '../utils/userErrors'
import { buildPurchaseSelection, getDynamicDiscountPercent } from '../utils/comboPricing'

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

function Cart() {
  usePageMeta({
    title: 'Cart | Archique',
    description: 'Artworks you have added to your cart.',
  })

  const navigate = useNavigate()
  const { setSelectedProduct, setSelectedPurchase } = useOrderContext()
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
  const availableArtworks = availableLines.map((line) => line.live)
  const subtotal = availableArtworks.reduce((sum, artwork) => sum + Number(artwork.price || 0), 0)

  // The pricing engine already supports buying several works in one order and
  // discounts related pieces (10% for a pair, 15% for three or more). Build the
  // same selection the product page would, so the cart can offer it too.
  const bundleSelection = useMemo(
    () => (availableArtworks.length > 1 ? buildPurchaseSelection(availableArtworks) : null),
    [availableArtworks],
  )
  const bundleDiscountPercent =
    availableArtworks.length > 1 ? getDynamicDiscountPercent(availableArtworks) : 0
  const bundleTotal = bundleSelection ? Number(bundleSelection.pricing.totalAmount) : subtotal
  const bundleSaving = bundleSelection
    ? Number(bundleSelection.pricing.discountAmount || 0)
    : 0

  const buyNow = (artwork) => {
    const selection = buildPurchaseSelection([artwork])
    setSelectedProduct(artwork)
    setSelectedPurchase(selection)
    navigate('/checkout', { state: { product: artwork, selection } })
  }

  const buyAllTogether = () => {
    if (!bundleSelection) {
      return
    }
    setSelectedProduct(availableArtworks[0])
    setSelectedPurchase(bundleSelection)
    navigate('/checkout', {
      state: { product: availableArtworks[0], selection: bundleSelection },
    })
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
            <div className="cart-summary-figures">
              {bundleSaving > 0 ? (
                <>
                  <p className="cart-summary-strike">{formatPrice(subtotal)}</p>
                  <p className="cart-summary-saving">
                    −{bundleDiscountPercent}% bundle · save {formatPrice(bundleSaving)}
                  </p>
                </>
              ) : null}
              <p className="cart-summary-total">
                {loading ? 'Checking prices…' : formatPrice(bundleTotal)}
              </p>
            </div>
          </div>

          {availableLines.length > 1 ? (
            <div className="cart-checkout-all">
              <button
                type="button"
                className="text-link-button action-button"
                onClick={buyAllTogether}
              >
                Buy all {availableLines.length} together
              </button>
              <p className="section-copy cart-note">
                {bundleSaving > 0
                  ? `These works pair well, so buying them together takes ${bundleDiscountPercent}% off. Shipping is combined into one delivery.`
                  : 'Buying together ships everything in one delivery.'}
              </p>
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

export default Cart
