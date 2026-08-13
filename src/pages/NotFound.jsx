import { Link, useLocation } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta'

/**
 * Shown for any URL that matches no route.
 *
 * Without a catch-all, React Router renders nothing at all — a mistyped link,
 * an old shared URL, or a stale bookmark produced a blank page with no header
 * and no way back, which reads as a broken site rather than a wrong address.
 */
function NotFound() {
  const location = useLocation()

  usePageMeta({
    title: 'Page not found | Archique',
    description: 'That page does not exist. Browse the collection instead.',
  })

  return (
    <section className="page-flow page-with-header-gap not-found-page">
      <p className="eyebrow">404</p>
      <h1 className="section-title">THIS PAGE DOES NOT EXIST</h1>
      <p className="section-copy not-found-copy">
        The address <code className="not-found-path">{location.pathname}</code> does not lead
        anywhere. It may have been mistyped, or the work that lived here has since been sold and
        withdrawn from the collection.
      </p>

      <div className="not-found-actions">
        <Link to="/store" className="text-link-button action-button">
          Browse the collection
        </Link>
        <Link to="/" className="text-link-button">
          Return home
        </Link>
        <Link to="/contact" className="text-link-button">
          Ask us
        </Link>
      </div>
    </section>
  )
}

export default NotFound
