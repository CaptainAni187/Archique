import { Link } from 'react-router-dom'
import useCart from '../hooks/useCart'

function formatPrice(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

/**
 * Floating checkout affordance while browsing.
 *
 * Without it the cart is only reachable from a small header icon, so someone
 * adding several works has no obvious way forward. Sits bottom-right, appears
 * only once something is in the cart, and never covers the artwork grid on
 * mobile because it collapses to a compact pill.
 */
function CartCheckoutBar() {
  const cartItems = useCart()

  if (cartItems.length === 0) {
    return null
  }

  const total = cartItems.reduce((sum, item) => sum + Number(item.price || 0), 0)

  return (
    <Link to="/cart" className="cart-checkout-bar" aria-label="Go to cart and check out">
      <span className="cart-checkout-bar-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M3.5 4.5h2.2l2.3 9.4a1.4 1.4 0 0 0 1.4 1.1h7.2a1.4 1.4 0 0 0 1.4-1.1L19.6 8H6.2" />
          <circle cx="10" cy="19" r="1.5" />
          <circle cx="16.8" cy="19" r="1.5" />
        </svg>
        <span className="cart-checkout-bar-count">{cartItems.length}</span>
      </span>

      <span className="cart-checkout-bar-text">
        <strong>Checkout</strong>
        <em>{formatPrice(total)}</em>
      </span>
    </Link>
  )
}

export default CartCheckoutBar
