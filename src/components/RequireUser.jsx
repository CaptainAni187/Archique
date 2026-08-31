import { Navigate, useLocation } from 'react-router-dom'
import { getUserToken } from '../services/userAuthService'

/**
 * Gate for pages that need a signed-in customer.
 *
 * Checkout requires an account, so this sends anyone without one to sign in
 * rather than letting them fill in a delivery address and only discover the
 * requirement when payment fails. The server enforces the same rule — this is
 * the courtesy, not the control.
 *
 * The current path travels along so sign-in returns the visitor to where they
 * were, with their cart intact.
 */
function RequireUser({ children }) {
  const location = useLocation()

  if (!getUserToken()) {
    const from = `${location.pathname}${location.search}`
    return <Navigate to={`/login?from=${encodeURIComponent(from)}`} replace />
  }

  return children
}

export default RequireUser
