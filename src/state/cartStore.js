/**
 * Cart state, kept outside React so any component can read it without prop
 * drilling and every subscriber re-renders together.
 *
 * Persisted to localStorage so a cart survives reloads, and synced across tabs
 * via the `storage` event. Only a small snapshot of each artwork is stored —
 * enough to render the cart without refetching — while price and availability
 * are re-verified server-side at checkout, so a stale snapshot can never drive
 * what someone is charged.
 */
const STORAGE_KEY = 'archique-cart'

const listeners = new Set()
let items = readFromStorage()

function readFromStorage() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id != null) : []
  } catch {
    return []
  }
}

function commit(nextItems) {
  items = nextItems

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* storage can be full or blocked (private mode); cart still works in memory */
  }

  listeners.forEach((listener) => listener())
}

function toCartItem(artwork) {
  const images = [
    ...(Array.isArray(artwork?.images) ? artwork.images : []),
    typeof artwork?.image === 'string' ? artwork.image : '',
  ].filter(Boolean)

  return {
    id: Number(artwork.id),
    title: artwork.title || 'Untitled',
    price: Number(artwork.price) || 0,
    image: images[0] || '',
    size: artwork.size || '',
    medium: artwork.medium || artwork.category || '',
  }
}

export function getCartItems() {
  return items
}

export function getCartCount() {
  return items.length
}

export function isInCart(artworkId) {
  return items.some((item) => Number(item.id) === Number(artworkId))
}

export function addToCart(artwork) {
  if (!artwork || artwork.id == null || isInCart(artwork.id)) {
    return
  }
  commit([...items, toCartItem(artwork)])
}

export function removeFromCart(artworkId) {
  const next = items.filter((item) => Number(item.id) !== Number(artworkId))
  if (next.length !== items.length) {
    commit(next)
  }
}

export function clearCart() {
  if (items.length > 0) {
    commit([])
  }
}

export function subscribeToCart(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Another tab changed the cart — adopt its value and notify subscribers here.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      items = readFromStorage()
      listeners.forEach((listener) => listener())
    }
  })
}
