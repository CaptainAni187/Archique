import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  deleteMyAccount,
  exportMyData,
  fetchCurrentUser,
  fetchUserOrders,
  fetchSavedArtworks,
  getStoredUser,
  logoutUser,
  unsaveArtwork,
  updateAccountSettings,
} from '../services/userAuthService'
import usePageMeta from '../hooks/usePageMeta'
import ErrorState from '../components/ErrorState'
import StoreCard from '../components/StoreCard'
import { SkeletonAccount } from '../components/SkeletonLoader'
import { getUserFriendlyError } from '../utils/userErrors'
import { fetchArtworks } from '../services/artworkService'
import { trackRecommendationEvent } from '../services/analyticsService'

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

function formatDate(value) {
  if (!value) {
    return ''
  }
  return new Date(value).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/**
 * The furthest stage an order has reached, so a buyer sees "Shipped" rather
 * than having to interpret a raw payment_status against three timestamps.
 */
function getOrderStage(order) {
  if (order.delivered_at) {
    return { label: 'Delivered', tone: 'done' }
  }
  if (order.shipped_at) {
    return { label: 'Shipped', tone: 'active' }
  }
  if (order.processing_at) {
    return { label: 'In production', tone: 'active' }
  }
  if (order.payment_status === 'paid') {
    return { label: 'Payment received', tone: 'active' }
  }
  if (order.payment_status === 'failed') {
    return { label: 'Payment failed', tone: 'alert' }
  }
  return { label: 'Awaiting payment', tone: 'idle' }
}

function topAffinities(affinity, limit = 6) {
  return Object.entries(affinity || {})
    .sort((left, right) => Number(right[1]) - Number(left[1]))
    .slice(0, limit)
    .map(([label]) => label)
}

function UserAccount() {
  usePageMeta({
    title: 'My Account | Archique',
    description: 'Your Archique orders, wishlist and preferences.',
  })

  const navigate = useNavigate()
  const [user, setUser] = useState(getStoredUser())
  const [orders, setOrders] = useState([])
  const [artworks, setArtworks] = useState([])
  const [savedIds, setSavedIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [digestOptIn, setDigestOptIn] = useState(false)
  const [digestFrequency, setDigestFrequency] = useState('weekly')
  const [settingsMessage, setSettingsMessage] = useState('')
  const removalTimers = useRef(new Set())

  useEffect(
    () => () => {
      removalTimers.current.forEach(window.clearTimeout)
    },
    [],
  )

  useEffect(() => {
    let isCancelled = false

    async function loadAccount() {
      setLoading(true)
      setErrorMessage('')

      try {
        const currentUser = await fetchCurrentUser()
        if (!currentUser) {
          navigate('/login', { replace: true })
          return
        }

        const [orderResponse, saved, artworkResponse] = await Promise.all([
          fetchUserOrders(),
          fetchSavedArtworks(),
          fetchArtworks(),
        ])

        if (!isCancelled) {
          setUser(currentUser)
          setOrders(Array.isArray(orderResponse) ? orderResponse : [])
          setArtworks(Array.isArray(artworkResponse) ? artworkResponse : [])
          setSavedIds(saved.map((item) => Number(item.artwork_id)).filter(Boolean))
          setDigestOptIn(currentUser.digest_opt_in === true)
          setDigestFrequency(currentUser.digest_frequency || 'weekly')
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(
            getUserFriendlyError(error, 'We could not load your account right now.'),
          )
        }
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    loadAccount()

    return () => {
      isCancelled = true
    }
  }, [navigate, retryKey])

  const artworkById = useMemo(
    () => new Map(artworks.map((artwork) => [Number(artwork.id), artwork])),
    [artworks],
  )

  // Wishlist entries resolved to live artworks, so each one can be shown as a
  // real preview rather than a bare title.
  const wishlist = useMemo(
    () => savedIds.map((id) => artworkById.get(Number(id))).filter(Boolean),
    [artworkById, savedIds],
  )

  const tasteStyles = topAffinities(user?.taste_profile?.style_affinity)
  const tasteMoods = topAffinities(user?.taste_profile?.mood_affinity)
  const tasteSpaces = topAffinities(user?.taste_profile?.space_affinity)
  const hasTaste = tasteStyles.length > 0 || tasteMoods.length > 0 || tasteSpaces.length > 0

  // Unsave right away so the data is never out of step, but hold the card in
  // place long enough for the heart's burst animation to finish — otherwise the
  // tile vanishes mid-animation.
  const removeFromWishlist = async (artwork) => {
    await unsaveArtwork(artwork.id).catch(() => null)
    void trackRecommendationEvent('favorite_removed', {
      artwork_id: artwork.id,
      source: 'account',
      artwork,
    })

    const timer = window.setTimeout(() => {
      removalTimers.current.delete(timer)
      setSavedIds((current) => current.filter((value) => value !== Number(artwork.id)))
    }, 820)
    removalTimers.current.add(timer)
  }

  if (loading) {
    return <SkeletonAccount />
  }

  if (errorMessage) {
    return (
      <section className="page-flow page-with-header-gap">
        <ErrorState message={errorMessage} onRetry={() => setRetryKey((value) => value + 1)} />
      </section>
    )
  }

  return (
    <section className="page-flow page-with-header-gap account-page">
      {/* ── Profile ── */}
      <header className="account-header">
        <div className="account-identity">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.name || 'Account avatar'} className="account-avatar" />
          ) : (
            <span className="account-avatar account-avatar-fallback" aria-hidden="true">
              {(user?.name || user?.email || 'A').charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <p className="eyebrow">MY ACCOUNT</p>
            <h2 className="section-title">{user?.name || 'Account'}</h2>
            <p className="account-email">{user?.email}</p>
            <p className="account-provider">
              Signed in with {user?.provider === 'google' ? 'Google' : 'email'}
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={async () => {
            await logoutUser()
            navigate('/login')
          }}
        >
          Logout
        </button>
      </header>

      {/* ── Orders ── */}
      <div className="account-section">
        <div className="account-section-head">
          <h3>Orders</h3>
          <span className="account-count">{orders.length}</span>
        </div>

        {orders.length === 0 ? (
          <div className="account-empty">
            <p>You have not placed an order yet.</p>
            <Link to="/store" className="text-link-button action-button">
              Browse the store
            </Link>
          </div>
        ) : (
          <div className="account-order-list">
            {orders.map((order) => {
              const artwork = artworkById.get(Number(order.product_id))
              const image = artwork
                ? (Array.isArray(artwork.images) ? artwork.images[0] : artwork.image) || ''
                : ''
              const stage = getOrderStage(order)

              return (
                <article key={order.id} className="account-order">
                  <div className="account-order-media">
                    {image ? (
                      <img src={image} alt={order.product_title} loading="lazy" decoding="async" />
                    ) : (
                      <span className="account-order-media-empty" aria-hidden="true" />
                    )}
                  </div>

                  <div className="account-order-body">
                    <h4>{order.product_title}</h4>
                    <p className="account-order-code">{order.order_code || `Order #${order.id}`}</p>
                    {order.created_at ? (
                      <p className="account-order-date">{formatDate(order.created_at)}</p>
                    ) : null}
                    <p className="account-order-total">{formatPrice(order.total_amount)}</p>
                  </div>

                  <div className="account-order-side">
                    <span className={`account-stage is-${stage.tone}`}>{stage.label}</span>
                    {order.order_code ? (
                      <Link
                        to={`/order/${encodeURIComponent(order.order_code)}`}
                        className="text-link-button"
                      >
                        Track order
                      </Link>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Wishlist ── */}
      <div className="account-section">
        <div className="account-section-head">
          <h3>Wishlist</h3>
          <span className="account-count">{wishlist.length}</span>
        </div>

        {wishlist.length === 0 ? (
          <div className="account-empty">
            <p>Nothing saved yet. Tap the heart on any piece to keep it here.</p>
            <Link to="/store" className="text-link-button action-button">
              Find something you like
            </Link>
          </div>
        ) : (
          <div className="store-grid artwork-grid account-wishlist-grid">
            {wishlist.map((artwork) => (
              <StoreCard
                key={artwork.id}
                artwork={artwork}
                isSaved
                onToggleSave={() => removeFromWishlist(artwork)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Taste profile ── */}
      {hasTaste ? (
        <div className="account-section">
          <div className="account-section-head">
            <h3>Your taste</h3>
          </div>
          <p className="account-note">
            Built from what you browse and save, and used to order the store for you.
          </p>

          <div className="account-taste">
            {tasteStyles.length > 0 ? (
              <div>
                <p className="account-taste-label">Styles</p>
                <div className="account-chips">
                  {tasteStyles.map((label) => (
                    <span key={label} className="account-chip">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {tasteMoods.length > 0 ? (
              <div>
                <p className="account-taste-label">Moods</p>
                <div className="account-chips">
                  {tasteMoods.map((label) => (
                    <span key={label} className="account-chip">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {tasteSpaces.length > 0 ? (
              <div>
                <p className="account-taste-label">Spaces</p>
                <div className="account-chips">
                  {tasteSpaces.map((label) => (
                    <span key={label} className="account-chip">
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* ── Settings ── */}
      <div className="account-section">
        <div className="account-section-head">
          <h3>Email preferences</h3>
        </div>

        <div className="account-setting">
          <label className="account-checkbox">
            <input
              type="checkbox"
              checked={digestOptIn}
              onChange={(event) => setDigestOptIn(event.target.checked)}
            />
            <span>Send me occasional picks based on my taste</span>
          </label>

          <label className="account-select">
            <span>How often</span>
            <select
              value={digestFrequency}
              onChange={(event) => setDigestFrequency(event.target.value)}
              disabled={!digestOptIn}
            >
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every two weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>

          <button
            type="button"
            className="text-link-button action-button"
            onClick={async () => {
              setSettingsMessage('')
              try {
                const nextUser = await updateAccountSettings({
                  digest_opt_in: digestOptIn,
                  digest_frequency: digestFrequency,
                })
                setUser((current) => ({ ...current, ...nextUser }))
                setSettingsMessage('Preferences saved.')
              } catch (error) {
                setSettingsMessage(getUserFriendlyError(error, 'Could not save preferences.'))
              }
            }}
          >
            Save preferences
          </button>
          {settingsMessage ? <p className="status-message success">{settingsMessage}</p> : null}
        </div>
      </div>

      <div className="account-section">
        <div className="account-section-head">
          <h3>Your data</h3>
        </div>

        <div className="account-setting account-data-row">
          <div>
            <h4>Download a copy</h4>
            <p>Your profile, orders, saved pieces and activity as a JSON file.</p>
          </div>
          <button
            type="button"
            className="text-link-button"
            onClick={async () => {
              const payload = await exportMyData()
              const blob = new Blob([JSON.stringify(payload, null, 2)], {
                type: 'application/json',
              })
              const url = URL.createObjectURL(blob)
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = `archique-account-export-${Date.now()}.json`
              anchor.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export
          </button>
        </div>

        <div className="account-setting account-data-row account-danger">
          <div>
            <h4>Delete account</h4>
            <p>Permanently removes your account, saved pieces and personalisation history.</p>
          </div>
          <button
            type="button"
            className="text-link-button btn-danger"
            onClick={async () => {
              const confirmed = window.confirm(
                'Delete your Archique account permanently? This cannot be undone.',
              )
              if (!confirmed) {
                return
              }
              await deleteMyAccount()
              navigate('/login')
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </section>
  )
}

export default UserAccount
