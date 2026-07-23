import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Reset the scroll position to the top on every route change.
 *
 * React Router keeps the previous scroll offset across navigations, so tapping
 * an artwork while scrolled down the store would open the product page already
 * scrolled partway down. Jump back to the top whenever the path changes — but
 * leave in-page hash links (#section) alone, and don't fight the browser's own
 * restoration on back/forward.
 */
function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      return
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])

  return null
}

export default ScrollToTop
