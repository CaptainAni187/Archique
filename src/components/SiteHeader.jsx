import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import NavDropdown from './NavDropdown'
import ThemeToggle from './ThemeToggle'
import { getStoredUser } from '../services/userAuthService'
function SocialIcons() {
  return (
    <div className="social-links">
      <a
        href="https://www.instagram.com/__archiverse_/"
        target="_blank"
        rel="noreferrer"
        aria-label="Instagram"
      >
        <svg className="social-icon" aria-hidden="true">
          <use href="/icons.svg#instagram-icon" />
        </svg>
        <span className="sr-only">Instagram</span>
      </a>
      <a
        href="https://www.linkedin.com/in/archi-kumari-6a3489371/"
        target="_blank"
        rel="noreferrer"
        aria-label="LinkedIn"
      >
        <svg className="social-icon" aria-hidden="true">
          <use href="/icons.svg#linkedin-icon" />
        </svg>
        <span className="sr-only">LinkedIn</span>
      </a>
    </div>
  )
}

function SiteHeader({ isDarkBackground = false }) {
  const location = useLocation()
  const isAccountRoute = location.pathname === '/account' || location.pathname === '/login'
  const aboutItems = [
    { to: '/about', label: 'ABOUT' },
    { to: '/commission', label: 'COMMISSION' },
    { to: '/feed', label: 'FEED' },
    { to: '/privacy', label: 'PRIVACY' },
    { to: '/contact', label: 'CONTACT' },
  ]
  const isOverlay =
    location.pathname === '/' ||
    location.pathname === '/canvas' ||
    location.pathname === '/sketch'
  const [isScrolled, setIsScrolled] = useState(false)
  const [currentUser, setCurrentUser] = useState(getStoredUser())

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentUser(getStoredUser())
    }, 1500)
    return () => window.clearInterval(intervalId)
  }, [])

  return (
    <header
      className={`topbar ${isOverlay ? 'is-overlay' : ''} ${
        isScrolled ? 'scrolled' : ''
      } ${isDarkBackground ? 'is-dark-background' : 'is-bright-background'}`}
    >
      <Link to="/" className="brand-mark" aria-label="ARCHIVERSE home">
        ARCHIVERSE
      </Link>

      <div className="topbar-cluster">
        <nav className="topbar-nav" aria-label="Primary">
          <ThemeToggle />
          <NavLink to="/canvas" className={({ isActive }) => (isActive ? 'active-nav' : '')}>
            CANVAS
          </NavLink>
          <NavLink to="/sketch" className={({ isActive }) => (isActive ? 'active-nav' : '')}>
            SKETCH
          </NavLink>
          <NavDropdown label="ABOUT" items={aboutItems} />
          <NavLink
            to="/store"
            className={({ isActive }) => (isActive ? 'active-nav' : '')}
          >
            STORE
          </NavLink>
          <NavLink
            to="/account"
            className={({ isActive }) =>
              isActive || isAccountRoute ? 'profile-nav-link active-nav' : 'profile-nav-link'
            }
            aria-label="Account"
            title="Account"
          >
            {currentUser?.avatar_url ? (
              <img
                src={currentUser.avatar_url}
                alt={currentUser.name || 'Account avatar'}
                className="profile-nav-avatar"
              />
            ) : (
              <svg
                className="profile-nav-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <circle cx="12" cy="8" r="3.4" />
                <path d="M5.8 19.2c1.1-3.4 3.2-5.1 6.2-5.1s5.1 1.7 6.2 5.1" />
              </svg>
            )}
            <span className="sr-only">Account</span>
          </NavLink>
        </nav>

        <SocialIcons />
      </div>
    </header>
  )
}

export default SiteHeader
