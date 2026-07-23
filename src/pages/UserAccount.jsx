import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  addArtworkToCollection,
  createCollection,
  deleteMyAccount,
  exportMyData,
  fetchCollections,
  fetchCurrentUser,
  fetchUserOrders,
  fetchSavedArtworks,
  getStoredUser,
  logoutUser,
  updateAccountSettings,
} from '../services/userAuthService'
import usePageMeta from '../hooks/usePageMeta'
import ErrorState from '../components/ErrorState'
import { SkeletonAccount } from '../components/SkeletonLoader'
import { getUserFriendlyError } from '../utils/userErrors'
import { fetchArtworks } from '../services/artworkService'

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

function UserAccount() {
  usePageMeta({
    title: 'My Account | Archiverse',
    description: 'View your Archiverse account and order history.',
  })

  const navigate = useNavigate()
  const [user, setUser] = useState(getStoredUser())
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [savedArtworks, setSavedArtworks] = useState([])
  const [digestOptIn, setDigestOptIn] = useState(false)
  const [digestFrequency, setDigestFrequency] = useState('weekly')
  const [settingsMessage, setSettingsMessage] = useState('')
  const [collections, setCollections] = useState([])
  const [newCollectionName, setNewCollectionName] = useState('')

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

        const [response, saved, artworks, collectionsResponse] = await Promise.all([
          fetchUserOrders(),
          fetchSavedArtworks(),
          fetchArtworks(),
          fetchCollections().catch(() => []),
        ])
        if (!isCancelled) {
          setUser(currentUser)
          setOrders(response)
          setDigestOptIn(currentUser.digest_opt_in === true)
          setDigestFrequency(currentUser.digest_frequency || 'weekly')
          const savedIdSet = new Set(saved.map((item) => Number(item.artwork_id)))
          setSavedArtworks(artworks.filter((artwork) => savedIdSet.has(Number(artwork.id))).slice(0, 8))
          setCollections(Array.isArray(collectionsResponse) ? collectionsResponse : [])
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

  if (loading) {
    return <SkeletonAccount />
  }

  return (
    <section className="order-detail-card">
      <div className="order-detail-header">
        <div>
          <p className="order-detail-kicker">My Account</p>
          <h2 className="section-title">{user?.name || 'Account'}</h2>
          <p>{user?.email}</p>
          {user?.avatar_url ? <img src={user.avatar_url} alt={user.name} className="account-avatar" /> : null}
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
      </div>

      {errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => setRetryKey((value) => value + 1)}
        />
      ) : null}

      <h3 className="orders-heading">My Orders</h3>
      <div className="admin-list">
        {orders.length === 0 ? (
          <p>No orders found for this account email yet.</p>
        ) : (
          orders.map((order) => (
            <article key={order.id} className="admin-item order-item">
              <div>
                <h3>{order.order_code || `Order #${order.id}`}</h3>
                <p>Artwork: {order.product_title}</p>
                <p>Status: {order.payment_status}</p>
                <p>Total: {formatPrice(order.total_amount)}</p>
              </div>
              {order.order_code ? (
                <Link to={`/order/${encodeURIComponent(order.order_code)}`} className="text-link-button">
                  Track
                </Link>
              ) : null}
            </article>
          ))
        )}
      </div>

      <h3 className="orders-heading">Saved Collection</h3>
      <div className="admin-list">
        {savedArtworks.length === 0 ? (
          <p>No saved artworks yet.</p>
        ) : (
          savedArtworks.map((artwork) => (
            <article key={artwork.id} className="admin-item order-item">
              <div>
                <h3>{artwork.title}</h3>
                <p>{artwork.medium || artwork.category}</p>
              </div>
              <Link to={`/product/${artwork.id}`} className="text-link-button">
                View
              </Link>
            </article>
          ))
        )}
      </div>

      <h3 className="orders-heading">Your Aesthetic</h3>
      <div className="admin-list">
        {user?.taste_profile ? (
          <article className="admin-item order-item">
            <div>
              <h3>Favorite Styles</h3>
              <p>
                {Object.entries(user.taste_profile.style_affinity || {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .slice(0, 5)
                  .map(([label]) => label)
                  .join(', ') || 'No style signals yet'}
              </p>
              <h3>Favorite Moods</h3>
              <p>
                {Object.entries(user.taste_profile.mood_affinity || {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .slice(0, 5)
                  .map(([label]) => label)
                  .join(', ') || 'No mood signals yet'}
              </p>
              <h3>Favorite Spaces</h3>
              <p>
                {Object.entries(user.taste_profile.space_affinity || {})
                  .sort((a, b) => Number(b[1]) - Number(a[1]))
                  .slice(0, 5)
                  .map(([label]) => label)
                  .join(', ') || 'No space signals yet'}
              </p>
            </div>
          </article>
        ) : (
          <p>No personalization profile yet.</p>
        )}
      </div>

      <h3 className="orders-heading">Named Collections</h3>
      <div className="admin-list">
        <article className="admin-item order-item">
          <div>
            <h3>Create Collection</h3>
            <input
              value={newCollectionName}
              onChange={(event) => setNewCollectionName(event.target.value)}
              placeholder="Dark Aesthetic"
            />
          </div>
          <button
            type="button"
            className="text-link-button"
            onClick={async () => {
              const created = await createCollection(newCollectionName)
              if (created) {
                setCollections((current) => [created, ...current])
                setNewCollectionName('')
              }
            }}
          >
            Create
          </button>
        </article>
        {collections.map((collection) => (
          <article key={collection.id} className="admin-item order-item">
            <div>
              <h3>{collection.name}</h3>
              <p>{Array.isArray(collection.items) ? collection.items.length : 0} saved entries</p>
            </div>
            {savedArtworks[0] ? (
              <button
                type="button"
                className="text-link-button"
                onClick={async () => {
                  await addArtworkToCollection(collection.id, savedArtworks[0].id)
                  const refreshed = await fetchCollections()
                  setCollections(refreshed)
                }}
              >
                Add latest saved
              </button>
            ) : null}
          </article>
        ))}
      </div>

      <h3 className="orders-heading">Account Settings</h3>
      <div className="admin-list">
        <article className="admin-item order-item">
          <div>
            <h3>Connected Providers</h3>
            <p>{user?.provider || 'email'}</p>
          </div>
        </article>
        <article className="admin-item order-item">
          <div>
            <h3>Digest Emails</h3>
            <p>Opt-in only curation emails based on your taste profile.</p>
            <label>
              <input
                type="checkbox"
                checked={digestOptIn}
                onChange={(event) => setDigestOptIn(event.target.checked)}
              />{' '}
              Receive digest emails
            </label>
            <label>
              Frequency
              <select
                value={digestFrequency}
                onChange={(event) => setDigestFrequency(event.target.value)}
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
          </div>
          <button
            type="button"
            className="text-link-button"
            onClick={async () => {
              const nextUser = await updateAccountSettings({
                digest_opt_in: digestOptIn,
                digest_frequency: digestFrequency,
              })
              setUser((current) => ({ ...current, ...nextUser }))
              setSettingsMessage('Settings saved.')
            }}
          >
            Save Settings
          </button>
        </article>
        <article className="admin-item order-item">
          <div>
            <h3>Password Reset</h3>
            <p>For Google accounts, manage password through Google. Email accounts use login password.</p>
          </div>
        </article>
        <article className="admin-item order-item">
          <div>
            <h3>Export My Data</h3>
            <p>Download your profile, analytics, saved artworks, and recommendation activity.</p>
          </div>
          <button
            type="button"
            className="text-link-button"
            onClick={async () => {
              const payload = await exportMyData()
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const anchor = document.createElement('a')
              anchor.href = url
              anchor.download = `archiverse-user-export-${Date.now()}.json`
              anchor.click()
              URL.revokeObjectURL(url)
            }}
          >
            Export
          </button>
        </article>
        <article className="admin-item order-item">
          <div>
            <h3>Delete Account</h3>
            <p>This permanently removes account access and personalization history.</p>
          </div>
          <button
            type="button"
            className="text-link-button btn-danger"
            onClick={async () => {
              const confirmed = window.confirm('Delete your Archiverse account permanently?')
              if (!confirmed) {
                return
              }
              await deleteMyAccount()
              navigate('/login')
            }}
          >
            Delete Account
          </button>
        </article>
      </div>
      {settingsMessage ? <p className="status-message success">{settingsMessage}</p> : null}
    </section>
  )
}

export default UserAccount
