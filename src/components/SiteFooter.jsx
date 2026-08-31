import { Link } from 'react-router-dom'
import { PUBLIC_EMAIL, PUBLIC_EMAIL_HREF, STUDIO } from '../constants/contact'

const FOOTER_SECTIONS = [
  {
    title: 'Explore',
    links: [
      { to: '/store', label: 'Store' },
      { to: '/canvas', label: 'Canvas' },
      { to: '/sketch', label: 'Sketch' },
      { to: '/feed', label: 'Feed' },
    ],
  },
  {
    title: 'Studio',
    links: [
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { to: '/policies', label: 'Terms & Conditions' },
      { to: '/privacy', label: 'Privacy Policy' },
    ],
  },
]

function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link to="/" className="site-footer-mark">
            ARCHIQUE
          </Link>
          <p className="site-footer-tagline">
            Original works and commissioned pieces created for personal spaces.
          </p>
          <div className="site-footer-social">
            <a
              href="https://www.instagram.com/archique.in/"
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
            {/* The address is revealed on hover rather than printed, so the
                footer stays clean but a visitor can still see where the mail
                is going before they click. */}
            {/* Calling is often the fastest reassurance before spending on an
                original, so the number sits with the other ways to reach us. */}
            <a
              className="site-footer-mail"
              href={STUDIO.phoneHref}
              aria-label={`Call ${STUDIO.phone}`}
            >
              <svg className="social-icon" aria-hidden="true">
                <use href="/icons.svg#phone-icon" />
              </svg>
              <span className="site-footer-mail-tip" aria-hidden="true">
                {STUDIO.phone}
              </span>
            </a>
            <a
              className="site-footer-mail"
              href={PUBLIC_EMAIL_HREF}
              target="_blank"
              rel="noreferrer"
              aria-label={`Email ${PUBLIC_EMAIL}`}
            >
              <svg className="social-icon" aria-hidden="true">
                <use href="/icons.svg#mail-icon" />
              </svg>
              <span className="site-footer-mail-tip" aria-hidden="true">
                {PUBLIC_EMAIL}
              </span>
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
        <span>© {new Date().getFullYear()} ARCHIQUE</span>
        <Link to="/account" className="site-footer-link">
          Account
        </Link>
      </div>
    </footer>
  )
}

export default SiteFooter
