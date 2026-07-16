import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Home from './pages/Home'
import Gallery from './pages/Gallery'
import Product from './pages/Product'
import Checkout from './pages/Checkout'
import Admin from './pages/Admin'
import AdminLogin from './pages/AdminLogin'
import UserLogin from './pages/UserLogin'
import UserAccount from './pages/UserAccount'
import About from './pages/About'
import Contact from './pages/Contact'
import Policies from './pages/Policies'
import Privacy from './pages/Privacy'
import OrderConfirmation from './pages/OrderConfirmation'
import OrderTracking from './pages/OrderTracking'
import Canvas from './pages/Canvas'
import Sketch from './pages/Sketch'
import Feed from './pages/Feed'
import CV from './pages/CV'
import Commission from './pages/Commission'
import RoomMatch from './pages/RoomMatch'
import { OrderProvider } from './state/OrderContext'
import ProtectedRoute from './components/ProtectedRoute'
import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import './App.css'

function AppLayout() {
  const location = useLocation()
  const [isDarkHeroBackground, setIsDarkHeroBackground] = useState(false)
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
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/commission" element={<Commission />} />
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
