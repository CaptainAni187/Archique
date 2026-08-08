import { useEffect, useMemo, useRef, useState } from 'react'
import { isDarkImageBrightness, measureImageRegions } from '../utils/imageBrightness'

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
  // Null until measured, so we never flash the wrong colour on first paint.
  const [isDarkBackdrop, setIsDarkBackdrop] = useState(null)
  const [isDarkHeaderArea, setIsDarkHeaderArea] = useState(null)
  const stageRef = useRef(null)
  const safeActiveIndex = slides.length > 0 ? activeIndex % slides.length : 0
  const activeSlideImage = slides[safeActiveIndex]?.image || ''

  useEffect(() => {
    if (!activeSlideImage) {
      return undefined
    }

    let isCurrent = true
    const stage = stageRef.current
    const containerSize = stage
      ? { width: stage.clientWidth, height: stage.clientHeight }
      : null

    // The header and the hero copy sit in different parts of the frame, so each
    // is measured against the strip it actually covers. A photo can easily be
    // pale at the top and dark at the bottom, where a single average would give
    // one of them the wrong colour.
    measureImageRegions(
      activeSlideImage,
      {
        header: { x: 0, y: 0, w: 1, h: 0.16 },
        copy: { x: 0, y: 0.6, w: 0.7, h: 0.4 },
      },
      containerSize,
    ).then((regions) => {
      if (!isCurrent) {
        return
      }
      // A null reading (CORS-tainted canvas, load failure) is treated as light:
      // dark text on an unknown backdrop still reads thanks to the scrim,
      // white text would not.
      const headerDark =
        regions.header === null || regions.header === undefined
          ? false
          : isDarkImageBrightness(regions.header)
      const copyDark =
        regions.copy === null || regions.copy === undefined
          ? false
          : isDarkImageBrightness(regions.copy)

      setIsDarkBackdrop(copyDark)
      setIsDarkHeaderArea(headerDark)
      onBackgroundContrastChange?.(headerDark)
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
      <div
        ref={stageRef}
        className={`carousel-stage full-bleed ${
          isDarkBackdrop === false ? 'is-light-backdrop' : ''
        } ${isDarkHeaderArea === false ? 'is-light-header' : ''}`
          .replace(/\s+/g, ' ')
          .trim()}
      >
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
