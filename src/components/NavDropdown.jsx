import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

const CLOSE_DELAY_MS = 180

// Hover-to-open only makes sense on devices with a real pointer. On touch,
// tapping the trigger fires an emulated mouseenter/focus that would open the
// menu and then the click that would toggle it shut — so it must be click-only.
function supportsHover() {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return false
  }
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches
}

function NavDropdown({ label, items }) {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const closeTimeoutRef = useRef(null)
  const containerRef = useRef(null)
  const isActive = items.some((item) => location.pathname === item.to)
  const canHover = supportsHover()

  const clearCloseTimeout = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = null
    }
  }

  const openMenu = () => {
    clearCloseTimeout()
    setIsOpen(true)
  }

  const closeMenuWithDelay = () => {
    clearCloseTimeout()
    closeTimeoutRef.current = setTimeout(() => {
      setIsOpen(false)
    }, CLOSE_DELAY_MS)
  }

  useEffect(() => () => clearCloseTimeout(), [])

  const handleBlur = (event) => {
    if (containerRef.current?.contains(event.relatedTarget)) {
      return
    }

    closeMenuWithDelay()
  }

  // On hover devices the pointer opens/closes the menu; on touch we leave those
  // handlers off so the click below is the single source of truth.
  const hoverHandlers = canHover
    ? { onMouseEnter: openMenu, onMouseLeave: closeMenuWithDelay, onBlur: handleBlur }
    : {}

  return (
    <div
      ref={containerRef}
      className={`nav-dropdown ${isOpen ? 'is-open' : ''}`}
      {...hoverHandlers}
    >
      <button
        type="button"
        className={`nav-dropdown-trigger ${isActive ? 'active-nav' : ''}`.trim()}
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {label}
      </button>
      <div className="nav-dropdown-bridge" aria-hidden="true" />
      <div className="nav-dropdown-menu">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => (isActive ? 'active-nav' : '')}
            onClick={() => setIsOpen(false)}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default NavDropdown
