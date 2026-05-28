import { useEffect, useMemo, useState } from 'react'
import { isDarkImageBrightness, measureImageBrightness } from '../utils/imageBrightness'

function FullscreenCarousel({
  artworks,
  autoSlide = true,
  interval = 3000,
  overlayContent = null,
  showMeta = true,
  onBackgroundContrastChange,
}) {
  const slides = useMemo(
    () =>
      (artworks || [])
        .filter(Boolean)
        .map((artwork) => ({
          id: artwork.id || artwork.title,
          image:
            (Array.isArray(artwork.images) ? artwork.images[0] : '') ||
            (typeof artwork.image === 'string' ? artwork.image : ''),
          title: artwork.title || 'UNTITLED',
          medium: artwork.medium || 'ACRYLIC',
        }))
        .filter((slide) => Boolean(slide.image)),
    [artworks],
  )
  const [activeIndex, setActiveIndex] = useState(0)
  const safeActiveIndex = slides.length > 0 ? activeIndex % slides.length : 0
  const activeSlideImage = slides[safeActiveIndex]?.image || ''

  useEffect(() => {
    if (!onBackgroundContrastChange || !activeSlideImage) {
      return undefined
    }

    let isCurrent = true

    measureImageBrightness(activeSlideImage).then((luminance) => {
      if (isCurrent) {
        onBackgroundContrastChange(isDarkImageBrightness(luminance))
      }
    })

    return () => {
      isCurrent = false
    }
  }, [activeSlideImage, onBackgroundContrastChange])

  useEffect(() => {
    if (!autoSlide || slides.length <= 1) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setActiveIndex((previous) => (previous + 1) % slides.length)
    }, interval)

    return () => window.clearInterval(timerId)
  }, [autoSlide, interval, slides.length])

  if (slides.length === 0) {
    return (
      <section className="fullscreen-carousel">
        <div className="carousel-stage full-bleed">
          <div className="carousel-placeholder" />
        </div>
      </section>
    )
  }

  const goPrevious = () => {
    setActiveIndex((previous) => (previous - 1 + slides.length) % slides.length)
  }

  const goNext = () => {
    setActiveIndex((previous) => (previous + 1) % slides.length)
  }

  return (
    <section className="fullscreen-carousel">
      <div className="carousel-stage full-bleed">
        {slides.map((slide, index) => (
          <img
            key={`${slide.id}-${index}`}
            src={slide.image}
            alt={slide.title}
            loading={index === safeActiveIndex ? 'eager' : 'lazy'}
            decoding="async"
            width="2200"
            height="1600"
            className={`carousel-image carousel-image-frame ${
              index === safeActiveIndex ? 'is-active' : ''
            }`}
            fetchPriority={index === safeActiveIndex ? 'high' : undefined}
          />
        ))}

        {slides.length > 1 ? (
          <>
            <button
              type="button"
              className="carousel-arrow carousel-arrow-left"
              onClick={goPrevious}
              aria-label="Previous slide"
            >
              ←
            </button>
            <button
              type="button"
              className="carousel-arrow carousel-arrow-right"
              onClick={goNext}
              aria-label="Next slide"
            >
              →
            </button>
          </>
        ) : null}

        {overlayContent ? (
          <div className="carousel-overlay-content">
            {overlayContent(slides[safeActiveIndex], safeActiveIndex)}
          </div>
        ) : null}
        {showMeta ? (
          <div className="carousel-meta">
            <p className="carousel-meta-title">{slides[safeActiveIndex]?.title}</p>
            <p className="carousel-meta-medium">{slides[safeActiveIndex]?.medium}</p>
            <p className="carousel-meta-medium">2026</p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

export default FullscreenCarousel
