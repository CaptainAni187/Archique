import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useState } from 'react'
import { finalizeGoogleLogin, OAUTH_ERROR_KEY } from './services/supabaseAuthService'
import { getUserToken } from './services/userAuthService'
import Home from './pages/Home'
import Gallery from './pages/Gallery'
import Product from './pages/Product'
import Canvas from './pages/Canvas'
import Sketch from './pages/Sketch'
import { OrderProvider } from './state/OrderContext'
import ProtectedRoute from './components/ProtectedRoute'
import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import ScrollToTop from './components/ScrollToTop'
import CustomCursor from './components/CustomCursor'
import CartCheckoutBar from './components/CartCheckoutBar'
import './App.css'

// Split off routes that are not needed for the first paint, so the initial
// bundle carries only the landing and browsing experience.
const Admin = lazy(() => import('./pages/Admin'))
const AdminLogin = lazy(() => import('./pages/AdminLogin'))
const Checkout = lazy(() => import('./pages/Checkout'))
const OrderConfirmation = lazy(() => import('./pages/OrderConfirmation'))
const OrderTracking = lazy(() => import('./pages/OrderTracking'))
const UserAccount = lazy(() => import('./pages/UserAccount'))
const UserLogin = lazy(() => import('./pages/UserLogin'))
const Cart = lazy(() => import('./pages/Cart'))
const Policies = lazy(() => import('./pages/Policies'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Contact = lazy(() => import('./pages/Contact'))
const Feed = lazy(() => import('./pages/Feed'))

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
  // so, exchange it for an Archique session. Safe no-op otherwise.
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
  // Pointless (or in the way) once the buyer is already in the cart or paying.
  const isCheckoutFlowRoute =
    location.pathname === '/cart' ||
    location.pathname.startsWith('/checkout') ||
    location.pathname.startsWith('/order')
  const showBrowsingCheckoutBar = !isAdminRoute && !isCheckoutFlowRoute
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
        <span className="auth-transition-mark">ARCHIQUE</span>
        <span className="auth-transition-text">Signing you in...</span>
      </div>
    )
  }

  return (
    <div className={`app-shell ${isCarouselRoute ? 'is-carousel-route' : ''}`.trim()}>
      <ScrollToTop />
      <CustomCursor />
      <SiteHeader isDarkBackground={hasOverlayHeader && isDarkHeroBackground} />

      <main
        className={`page-wrap ${hasOverlayHeader ? 'has-overlay-header' : ''} ${
          isCarouselRoute ? 'is-carousel-route' : ''
        }`.trim()}
      >
        <Suspense fallback={<div className="route-fallback" role="status" aria-live="polite" />}>
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
          <Route path="/store" element={<Gallery />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/policies" element={<Policies />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
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
        </Suspense>
      </main>

      {showBrowsingCheckoutBar ? <CartCheckoutBar /> : null}

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
