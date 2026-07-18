import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { finalizeGoogleLogin, OAUTH_ERROR_KEY } from './services/supabaseAuthService'
import { getUserToken } from './services/userAuthService'
import Home from './pages/Home'
import Gallery from './pages/Gallery'
import Product from './pages/Product'
import Checkout from './pages/Checkout'
import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import UserLogin from './pages/UserLogin'
import UserAccount from './pages/UserAccount'
import Contact from './pages/Contact'
import Policies from './pages/Policies'
import Privacy from './pages/Privacy'
import OrderConfirmation from './pages/OrderConfirmation'
import OrderTracking from './pages/OrderTracking'
import Canvas from './pages/Canvas'
import Sketch from './pages/Sketch'
import Feed from './pages/Feed'
import CV from './pages/CV'
import RoomMatch from './pages/RoomMatch'
import { OrderProvider } from './state/OrderContext'
import ProtectedRoute from './components/ProtectedRoute'
import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import './App.css'

// Detected synchronously on first render, before the SDK strips the params —
// so we can show the sign-in overlay instead of flashing the login form.
function hasOAuthCallbackInUrl() {
  if (typeof window === 'undefined') {
    return false
  }
  const search = window.location.search || ''
  const hash = window.location.hash || ''
  return /[?&]code=/.test(search) || hash.includes('access_token=')
}

function AppLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [isDarkHeroBackground, setIsDarkHeroBackground] = useState(false)
  const [isCompletingLogin, setIsCompletingLogin] = useState(
    () => hasOAuthCallbackInUrl() && !getUserToken(),
  )

  // Global OAuth completion. Rather than sniffing the URL (Supabase may return
  // either ?code= or #access_token=, and the SDK strips it before we could
  // read it), we simply ask the SDK whether a Supabase session exists and, if
  // so, exchange it for an Archiverse session. Safe no-op otherwise.
  useEffect(() => {
    if (getUserToken()) {
      return undefined
    }

    let cancelled = false

    finalizeGoogleLogin()
      .then((user) => {
        if (user && !cancelled) {
          navigate('/account', { replace: true })
        }
      })
      .catch((error) => {
        if (cancelled) {
          return
        }
        // Surface the reason instead of silently bouncing back to /login.
        window.sessionStorage.setItem(
          OAUTH_ERROR_KEY,
          error?.message || 'Google login could not be completed.',
        )
        navigate('/login', { replace: true })
      })
      .finally(() => {
        if (!cancelled) {
          setIsCompletingLogin(false)
        }
      })

    return () => {
      cancelled = true
    }
    // Run once on load — the OAuth redirect is a full page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isCarouselRoute = location.pathname === '/canvas' || location.pathname === '/sketch'
  const isAdminRoute = location.pathname.startsWith('/captain')
  const showFooter = !isCarouselRoute && !isAdminRoute
  const hasOverlayHeader =
    location.pathname === '/' ||
    location.pathname === '/canvas' ||
    location.pathname === '/sketch'

  useEffect(() => {
    document.body.classList.toggle('is-carousel-route', isCarouselRoute)
    return () => document.body.classList.remove('is-carousel-route')
  }, [isCarouselRoute])

  // Returning from Google: hold a calm overlay until the session is exchanged,
  // rather than flashing the login form the user just came from.
  if (isCompletingLogin) {
    return (
      <div className="auth-transition" role="status" aria-live="polite">
        <span className="auth-transition-mark">ARCHIVERSE</span>
        <span className="auth-transition-text">Signing you in...</span>
      </div>
    )
  }

  return (
    <div className={`app-shell ${isCarouselRoute ? 'is-carousel-route' : ''}`.trim()}>
      <SiteHeader isDarkBackground={hasOverlayHeader && isDarkHeroBackground} />

      <main
        className={`page-wrap ${hasOverlayHeader ? 'has-overlay-header' : ''} ${
          isCarouselRoute ? 'is-carousel-route' : ''
        }`.trim()}
      >
        <Routes>
          <Route
            path="/"
            element={<Home onHeroContrastChange={setIsDarkHeroBackground} />}
          />
          <Route
            path="/canvas"
            element={<Canvas onHeroContrastChange={setIsDarkHeroBackground} />}
          />
          <Route
            path="/sketch"
            element={<Sketch onHeroContrastChange={setIsDarkHeroBackground} />}
          />
          <Route path="/feed" element={<Feed />} />
          <Route path="/cv" element={<CV />} />
          <Route path="/store" element={<Gallery />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/room-match" element={<RoomMatch />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/checkout/confirmation" element={<OrderConfirmation />} />
          <Route path="/order/:orderCode" element={<OrderTracking />} />
          <Route path="/login" element={<UserLogin />} />
          <Route path="/account" element={<UserAccount />} />
          <Route path="/captain" element={<AdminLogin />} />
          <Route path="/admin/login" element={<Navigate to="/captain" replace />} />
          <Route path="/admin" element={<Navigate to="/captain" replace />} />
          <Route
            path="/captain/dashboard"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>

      {showFooter ? <SiteFooter /> : null}
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <OrderProvider>
        <AppLayout />
      </OrderProvider>
    </BrowserRouter>
  )
}

export default App
