import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Reveal from '../components/Reveal'
import usePageMeta from '../hooks/usePageMeta'
import { fetchArtworks } from '../services/artworkService'

function getPrimaryImage(artwork) {
  return (
    (Array.isArray(artwork?.images)
      ? artwork.images.find((image) => typeof image === 'string' && image.trim())
      : '') ||
    (typeof artwork?.image === 'string' ? artwork.image : '')
  )
}

function About() {
  const [artworks, setArtworks] = useState([])

  usePageMeta({
    title: 'About | Archiverse',
    description:
      'Learn the story and purpose behind Archiverse and its curated fine art journey.',
  })

  useEffect(() => {
    let isCancelled = false

    async function loadImages() {
      try {
        const response = await fetchArtworks()
        if (!isCancelled) {
          setArtworks(response)
        }
      } catch {
        if (!isCancelled) {
          setArtworks([])
        }
      }
    }

    loadImages()

    return () => {
      isCancelled = true
    }
  }, [])

  const visualArtworks = useMemo(
    () =>
      artworks
        .map((artwork) => ({
          id: artwork.id,
          title: artwork.title,
          image: getPrimaryImage(artwork),
        }))
        .filter((artwork) => artwork.image)
        .slice(0, 3),
    [artworks],
  )

  return (
    <section className="page-flow page-with-header-gap">
      <Reveal className="about-editorial">
        <div className="about-visual-stack" aria-label="Selected Archiverse visuals">
          {visualArtworks.length > 0 ? (
            visualArtworks.map((artwork) => (
              <img
                key={artwork.id}
                src={artwork.image}
                alt={artwork.title}
                loading="lazy"
                decoding="async"
              />
            ))
          ) : (
            <div className="about-visual-placeholder" />
          )}
        </div>

        <div className="about-editorial-copy">
          <p className="eyebrow">ABOUT</p>
          <h1 className="section-title">A quiet archive of handmade work.</h1>
          <p>
            Archiverse is a personal collection of acrylic paintings, sketches, and commissioned
            pieces made for intimate spaces.
          </p>
          <p>
            The work is guided by restraint, memory, and detail: pieces that feel calm from a
            distance and personal up close.
          </p>
          <div className="about-links">
            <Link to="/feed" className="text-link-button">
              FEED
            </Link>
            <Link to="/cv" className="text-link-button">
              CV
            </Link>
            <Link to="/contact" className="text-link-button">
              CONTACT
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

export default About
