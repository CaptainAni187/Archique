import { Link } from 'react-router-dom'

const FOOTER_SECTIONS = [
  {
    title: 'Explore',
    links: [
      { to: '/store', label: 'Store' },
      { to: '/room-match', label: 'Room Match' },
      { to: '/canvas', label: 'Canvas' },
      { to: '/sketch', label: 'Sketch' },
      { to: '/feed', label: 'Feed' },
    ],
  },
  {
    title: 'Studio',
    links: [
      { to: '/cv', label: 'CV' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/policies', label: 'Policies' },
      { to: '/privacy', label: 'Privacy' },
    ],
  },
]

function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link to="/" className="site-footer-mark">
            ARCHIVERSE
          </Link>
          <p className="site-footer-tagline">
            Original works and commissioned pieces created for personal spaces.
          </p>
          <div className="site-footer-social">
            <a
              href="https://www.instagram.com/__archiverse_/"
              target="_blank"
              rel="noreferrer"
              aria-label="Instagram"
            >
              <svg className="social-icon" aria-hidden="true">
                <use href="/icons.svg#instagram-icon" />
              </svg>
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
            </a>
          </div>
        </div>

        <nav className="site-footer-nav" aria-label="Footer navigation">
          {FOOTER_SECTIONS.map((section) => (
            <div key={section.title} className="site-footer-column">
              <span className="site-footer-heading">{section.title}</span>
              {section.links.map((link) => (
                <Link key={link.to} to={link.to} className="site-footer-link">
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>

      <div className="site-footer-base">
        <span>© {new Date().getFullYear()} ARCHIVERSE</span>
        <Link to="/account" className="site-footer-link">
          Account
        </Link>
      </div>
    </footer>
  )
}

export default SiteFooter
