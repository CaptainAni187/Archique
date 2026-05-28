import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { isAdminAuthenticated } from '../services/adminAuthService'

function ProtectedRoute({ children }) {
  const location = useLocation()
  const [authState, setAuthState] = useState('checking')

  useEffect(() => {
    let isMounted = true

    async function verifySession() {
      const authenticated = await isAdminAuthenticated()

      if (isMounted) {
        setAuthState(authenticated ? 'authenticated' : 'unauthenticated')
      }
    }

    verifySession()

    return () => {
      isMounted = false
    }
  }, [location.pathname])

  if (authState === 'checking') {
    return <p className="status-message">Checking admin access…</p>
  }

  if (authState !== 'authenticated') {
    return <Navigate to="/captain" replace state={{ from: location.pathname }} />
  }

  return children
}

export default ProtectedRoute
