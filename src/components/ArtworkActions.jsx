import { useEffect, useRef, useState } from 'react'
import { addToCart, isInCart, removeFromCart } from '../state/cartStore'
import useCart from '../hooks/useCart'

// Kept in sync with the animation durations in App.css.
const CART_ADD_MS = 720
const CART_CRASH_MS = 820
const HEART_PUMP_MS = 720
const HEART_BURST_MS = 820

const SHARDS = [
  { tx: '-16px', ty: '-14px', rotate: '-38deg' },
  { tx: '14px', ty: '-17px', rotate: '32deg' },
  { tx: '-19px', ty: '6px', rotate: '-14deg' },
  { tx: '18px', ty: '8px', rotate: '24deg' },
  { tx: '-7px', ty: '18px', rotate: '-52deg' },
  { tx: '9px', ty: '19px', rotate: '46deg' },
]

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

function CartIcon() {
  return (
    <svg className="action-icon action-icon-cart" viewBox="0 0 24 24" aria-hidden="true">
      {/* speed lines — the "zoom" streak the cart rides in on */}
      <g className="cart-speed">
        <path d="M1 8h4" />
        <path d="M0 12h3.5" />
        <path d="M1.5 16h3" />
      </g>
      <g className="cart-body">
        <path d="M3.5 4.5h2.2l2.3 9.4a1.4 1.4 0 0 0 1.4 1.1h7.2a1.4 1.4 0 0 0 1.4-1.1L19.6 8H6.2" />
        <circle className="cart-wheel cart-wheel-front" cx="10" cy="19" r="1.5" />
        <circle className="cart-wheel cart-wheel-back" cx="16.8" cy="19" r="1.5" />
      </g>
      {/* impact burst for the crash */}
      <g className="cart-impact">
        <path d="M12 2.5v3M17.5 4.5l-2 2.2M6.5 4.5l2 2.2" />
      </g>
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg className="action-icon action-icon-heart" viewBox="0 0 24 24" aria-hidden="true">
      {/* the puff ring that expands as the heart inflates */}
      <circle className="heart-puff" cx="12" cy="12" r="9" />
      <path
        className="heart-shape"
        d="M12 20.4l-1.45-1.32C5.7 14.7 2.6 11.88 2.6 8.5 2.6 6 4.55 4.05 7 4.05c1.6 0 3.08.79 4 2.06.92-1.27 2.4-2.06 4-2.06 2.45 0 4.4 1.95 4.4 4.45 0 3.38-3.1 6.2-7.95 10.58L12 20.4z"
      />
      {/* the arrow that bursts it */}
      <g className="heart-arrow">
        <path d="M20.5 3.5L11 13" />
        <path d="M14.6 13.4L11 13l-.4-3.6" />
      </g>
      <g className="heart-shards">
        {SHARDS.map((shard, index) => (
          <rect
            key={index}
            x="11"
            y="11"
            width="2.2"
            height="2.2"
            rx="0.4"
            style={{ '--tx': shard.tx, '--ty': shard.ty, '--rot': shard.rotate }}
          />
        ))}
      </g>
    </svg>
  )
}

/**
 * Cart + wishlist controls for an artwork.
 *
 * Each button plays a short animation on toggle: the cart is drawn in on a zoom
 * streak when added and crashes when removed; the heart inflates when saved and
 * is burst by an arrow when unsaved. The underlying state is committed
 * immediately — the animation only decorates it, so what the buttons report is
 * always the real cart/wishlist state even mid-animation.
 */
function ArtworkActions({ artwork, isSaved = false, onToggleSave = null }) {
  useCart() // re-render this button when the cart changes anywhere
  const carted = isInCart(artwork?.id)

  const [cartPhase, setCartPhase] = useState('idle')
  const [heartPhase, setHeartPhase] = useState('idle')
  const timers = useRef([])

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout)
    },
    [],
  )

  const runPhase = (setPhase, phase, duration) => {
    if (prefersReducedMotion()) {
      return
    }
    setPhase(phase)
    timers.current.push(window.setTimeout(() => setPhase('idle'), duration))
  }

  const handleCart = (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (carted) {
      removeFromCart(artwork.id)
      runPhase(setCartPhase, 'crashing', CART_CRASH_MS)
      return
    }

    addToCart(artwork)
    runPhase(setCartPhase, 'adding', CART_ADD_MS)
  }

  const handleSave = (event) => {
    event.preventDefault()
    event.stopPropagation()

    if (isSaved) {
      runPhase(setHeartPhase, 'bursting', HEART_BURST_MS)
    } else {
      runPhase(setHeartPhase, 'pumping', HEART_PUMP_MS)
    }

    onToggleSave?.()
  }

  return (
    <div className="artwork-actions" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        className={`artwork-action ${carted ? 'is-active' : ''} ${
          cartPhase !== 'idle' ? `is-${cartPhase}` : ''
        }`}
        aria-pressed={carted}
        aria-label={carted ? `Remove ${artwork?.title} from cart` : `Add ${artwork?.title} to cart`}
        title={carted ? 'Remove from cart' : 'Add to cart'}
        onClick={handleCart}
      >
        <CartIcon />
      </button>

      {typeof onToggleSave === 'function' ? (
        <button
          type="button"
          className={`artwork-action ${isSaved ? 'is-active' : ''} ${
            heartPhase !== 'idle' ? `is-${heartPhase}` : ''
          }`}
          aria-pressed={isSaved}
          aria-label={
            isSaved ? `Remove ${artwork?.title} from wishlist` : `Save ${artwork?.title} to wishlist`
          }
          title={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
          onClick={handleSave}
        >
          <HeartIcon />
        </button>
      ) : null}
    </div>
  )
}

export default ArtworkActions
