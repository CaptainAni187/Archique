import { useEffect, useMemo, useState } from 'react'
import { isDarkImageBrightness, measureImageBrightness } from '../utils/imageBrightness'

function ArtworkCarousel({
  images,
  interval = 3000,
  overlayPosition = 'left',
  onBackgroundContrastChange,
}) {
  const slides = useMemo(() => {
    return (images || [])
      .filter(Boolean)
      .map((item, index) => ({
        id: item.id || `${item.title || 'slide'}-${index}`,
        src: typeof item.src === 'string' ? item.src.trim() : '',
        title: item.title || 'UNTITLED',
        medium: item.medium || '',
        year: item.year || '',
      }))
      .filter((slide) => Boolean(slide.src))
  }, [images])

  const [activeIndex, setActiveIndex] = useState(0)
  const [isHovering, setIsHovering] = useState(false)

  const count = slides.length
  const safeIndex = count > 0 ? ((activeIndex % count) + count) % count : 0
  const nextIndex = count > 1 ? (safeIndex + 1) % count : safeIndex
  const activeSlideSrc = slides[safeIndex]?.src || ''

  const goPrevious = () => setActiveIndex((previous) => previous - 1)
  const goNext = () => setActiveIndex((previous) => previous + 1)

  useEffect(() => {
    if (count <= 1 || isHovering) {
      return undefined
    }

    const timerId = window.setInterval(() => {
      setActiveIndex((previous) => previous + 1)
    }, interval)

    return () => window.clearInterval(timerId)
  }, [count, interval, isHovering])

  useEffect(() => {
    if (!onBackgroundContrastChange || !activeSlideSrc) {
      return undefined
    }

    let isCurrent = true

    measureImageBrightness(activeSlideSrc).then((luminance) => {
      if (isCurrent) {
        onBackgroundContrastChange(isDarkImageBrightness(luminance))
      }
    })

    return () => {
      isCurrent = false
    }
  }, [activeSlideSrc, onBackgroundContrastChange])

  useEffect(() => {
    if (count <= 1) {
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        goPrevious()
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        goNext()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [count])

  useEffect(() => {
    const nextSrc = slides[nextIndex]?.src
    if (!nextSrc) return
    const img = new Image()
    img.src = nextSrc
  }, [nextIndex, slides])

  if (slides.length === 0) {
    return (
      <section className="artwork-carousel">
        <div className="artwork-carousel__stage full-bleed">
          <div className="carousel-placeholder" />
        </div>
      </section>
    )
  }

  return (
    <section className="artwork-carousel">
      <div className="artwork-carousel__stage full-bleed">
        <div
          className="artwork-carousel__track"
          style={{ transform: `translateX(-${safeIndex * 100}%)` }}
        >
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className="artwork-carousel__slide"
              aria-hidden={index !== safeIndex}
            >
              <img
                src={slide.src}
                alt={slide.title}
                className="artwork-carousel__image"
                loading={index === safeIndex ? 'eager' : 'lazy'}
                decoding="async"
                fetchPriority={index === safeIndex ? 'high' : undefined}
                width="2200"
                height="1600"
              />

              <div
                className={`artwork-carousel__overlay artwork-carousel__overlay--${overlayPosition}`}
              >
                <p className="artwork-carousel__overlay-line">{slide.title}</p>
                {slide.medium ? (
                  <p className="artwork-carousel__overlay-line">{slide.medium}</p>
                ) : null}
                {slide.year ? <p className="artwork-carousel__overlay-line">{slide.year}</p> : null}
              </div>
            </div>
          ))}
        </div>

        {count > 1 ? (
          <>
            <button
              type="button"
              className="artwork-carousel__arrow artwork-carousel__arrow--left"
              onClick={goPrevious}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              onFocus={() => setIsHovering(true)}
              onBlur={() => setIsHovering(false)}
              aria-label="Previous artwork"
            >
              ←
            </button>
            <button
              type="button"
              className="artwork-carousel__arrow artwork-carousel__arrow--right"
              onClick={goNext}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              onFocus={() => setIsHovering(true)}
              onBlur={() => setIsHovering(false)}
              aria-label="Next artwork"
            >
              →
            </button>
          </>
        ) : null}
      </div>
    </section>
  )
}

export default ArtworkCarousel
