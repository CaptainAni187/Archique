import { useEffect, useRef } from 'react'

// How quickly the brush catches up to the pointer. A touch of lag reads as a
// held object rather than a stuck sprite; too much and it feels broken.
const BRUSH_EASING = 0.28

// The brush is drawn upright (tip at top) and rotated -45deg in CSS about its
// tip, so it points north-west with the handle trailing south-east. Because the
// rotation origin *is* the tip, the tip stays at this fixed point in the sprite
// and every effect can be anchored to it.
const TIP_X = 13
const TIP_Y = 1.1

const INTERACTIVE_SELECTOR =
  'a, button, [role="button"], summary, .mood-chip, .store-menu-option, .artwork-action'
const TEXT_FIELD_SELECTOR = 'input, textarea, select, [contenteditable="true"]'

const SPLAT_LIFETIME_MS = 900
const DROP_LIFETIME_MS = 1100

// Paint spills as the brush travels, rather than on a timer, so the rate tracks
// how fast the pointer is actually moving.
const SPILL_DISTANCE_PX = 190
const MOVE_SPILL_MIN = 2
const MOVE_SPILL_MAX = 3

// Entering something clickable jostles the loaded brush and throws more off.
const HOVER_SPILL_MIN = 4
const HOVER_SPILL_MAX = 8

// Hard ceiling so a frantic mouse can never pile up unbounded DOM nodes.
const MAX_LIVE_DROPS = 44

const randomBetween = (min, max) => min + Math.random() * (max - min)
const randomInt = (min, max) => Math.floor(randomBetween(min, max + 1))

/**
 * A paintbrush cursor for an art store.
 *
 *   - The bristle tip tracks the pointer, so clicks land where the paint would.
 *   - Over anything clickable the brush is "loaded": paint drips from the tip,
 *     and entering the element throws off a spill of droplets.
 *   - Travelling across the page spills a couple of drops every so often.
 *   - Clicking lays down a golden-white splat at the point of contact.
 *
 * Same conservative guards as any custom cursor: it only activates for a real
 * mouse with motion allowed, `cursor: none` is applied via a runtime class so
 * the native pointer survives any failure to mount, and text fields always get
 * the caret back.
 */
function CustomCursor() {
  const brushRef = useRef(null)
  const layerRef = useRef(null)

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)')
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

    if (!finePointer.matches || reducedMotion.matches) {
      return undefined
    }

    const brush = brushRef.current
    const layer = layerRef.current
    if (!brush || !layer) {
      return undefined
    }

    const root = document.documentElement
    root.classList.add('has-custom-cursor')

    let pointerX = -200
    let pointerY = -200
    let brushX = -200
    let brushY = -200
    let frameId = 0
    let isVisible = false
    let wasInteractive = false
    let travelSinceSpill = 0
    let lastSpillX = -200
    let lastSpillY = -200
    let liveDrops = 0
    const timeouts = new Set()

    const after = (ms, fn) => {
      const id = window.setTimeout(() => {
        timeouts.delete(id)
        fn()
      }, ms)
      timeouts.add(id)
    }

    const setVisible = (visible) => {
      if (visible === isVisible) {
        return
      }
      isVisible = visible
      brush.classList.toggle('is-visible', visible)
    }

    // Throws `count` droplets off the tip, each with its own size, fall and
    // sideways drift so a spill never looks stamped.
    const spillDrops = (count, originX, originY) => {
      const allowed = Math.min(count, MAX_LIVE_DROPS - liveDrops)
      for (let index = 0; index < allowed; index += 1) {
        const drop = document.createElement('span')
        drop.className = 'paint-drop'
        drop.style.left = `${originX + randomBetween(-5, 5)}px`
        drop.style.top = `${originY + randomBetween(-3, 5)}px`
        drop.style.setProperty('--size', `${randomBetween(3.5, 7).toFixed(1)}px`)
        drop.style.setProperty('--dx', `${randomBetween(-16, 16).toFixed(1)}px`)
        drop.style.setProperty('--dy', `${randomBetween(20, 44).toFixed(1)}px`)
        drop.style.setProperty('--delay', `${Math.round(randomBetween(0, 130))}ms`)
        drop.style.setProperty('--life', `${Math.round(randomBetween(760, DROP_LIFETIME_MS))}ms`)
        if (Math.random() > 0.62) {
          drop.classList.add('is-pale')
        }
        layer.appendChild(drop)
        liveDrops += 1
        after(DROP_LIFETIME_MS + 200, () => {
          drop.remove()
          liveDrops -= 1
        })
      }
    }

    const onPointerMove = (event) => {
      pointerX = event.clientX
      pointerY = event.clientY

      const target = event.target
      const overTextField =
        target instanceof Element && Boolean(target.closest(TEXT_FIELD_SELECTOR))
      setVisible(!overTextField)

      const isInteractive =
        target instanceof Element && Boolean(target.closest(INTERACTIVE_SELECTOR))
      const loaded = isInteractive && !overTextField
      brush.classList.toggle('is-dripping', loaded)

      if (overTextField) {
        wasInteractive = false
        return
      }

      // Crossing onto something clickable jostles the brush.
      if (loaded && !wasInteractive) {
        spillDrops(randomInt(HOVER_SPILL_MIN, HOVER_SPILL_MAX), pointerX, pointerY)
      }
      wasInteractive = loaded

      // Spill by distance travelled, so a slow drift stays clean and a quick
      // sweep across the page leaves a trail.
      travelSinceSpill += Math.hypot(pointerX - lastSpillX, pointerY - lastSpillY)
      lastSpillX = pointerX
      lastSpillY = pointerY
      if (travelSinceSpill >= SPILL_DISTANCE_PX) {
        travelSinceSpill = 0
        spillDrops(randomInt(MOVE_SPILL_MIN, MOVE_SPILL_MAX), pointerX, pointerY)
      }
    }

    const onPointerLeave = () => setVisible(false)

    const onPointerDown = (event) => {
      const target = event.target
      if (target instanceof Element && target.closest(TEXT_FIELD_SELECTOR)) {
        return
      }

      brush.classList.add('is-painting')
      after(260, () => brush.classList.remove('is-painting'))

      // Random rotation so no two splats land identically.
      const spin = Math.round(Math.random() * 360)
      const mark = document.createElement('div')
      mark.className = 'paint-mark'
      mark.style.left = `${event.clientX}px`
      mark.style.top = `${event.clientY}px`
      mark.innerHTML = `
        <svg class="paint-splat" viewBox="0 0 48 48" style="--spin:${spin}deg" aria-hidden="true">
          <g class="splat-core">
            <path d="M24 6 C27.5 6.5, 28.8 10.2, 31.5 11.4 C34.6 12.8, 38 12.2, 38.6 15
                     C39.2 17.6, 35.6 19.2, 35.4 21.8 C35.2 24.6, 39.4 26.4, 38.2 29
                     C37 31.6, 32.8 30.4, 30.6 32.2 C28.4 34, 28.8 38.2, 26 38.6
                     C23.2 39, 22.2 35.2, 19.8 33.8 C17.2 32.3, 13.4 33.6, 12 31.2
                     C10.6 28.8, 14 26.4, 14 23.6 C14 20.8, 10.4 18.8, 11.4 16.2
                     C12.4 13.6, 16.6 14.6, 19 13 C21.3 11.5, 20.8 6.5, 24 6 Z" />
          </g>
          <g class="splat-spray">
            <circle cx="7.5" cy="14.5" r="1.7" />
            <circle cx="39.5" cy="12.5" r="2.2" />
            <circle cx="42" cy="30.5" r="1.4" />
            <circle cx="9" cy="32.5" r="2" />
            <circle cx="23" cy="43" r="1.8" />
            <circle cx="34" cy="41" r="1.2" />
            <circle cx="4.5" cy="24" r="1.1" />
          </g>
        </svg>
      `
      layer.appendChild(mark)
      after(SPLAT_LIFETIME_MS, () => mark.remove())
    }

    const render = () => {
      brushX += (pointerX - brushX) * BRUSH_EASING
      brushY += (pointerY - brushY) * BRUSH_EASING
      brush.style.transform = `translate3d(${brushX}px, ${brushY}px, 0)`
      frameId = window.requestAnimationFrame(render)
    }

    frameId = window.requestAnimationFrame(render)
    document.addEventListener('pointermove', onPointerMove, { passive: true })
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
    document.addEventListener('mouseleave', onPointerLeave)
    window.addEventListener('blur', onPointerLeave)

    return () => {
      window.cancelAnimationFrame(frameId)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('mouseleave', onPointerLeave)
      window.removeEventListener('blur', onPointerLeave)
      timeouts.forEach(window.clearTimeout)
      layer.replaceChildren()
      root.classList.remove('has-custom-cursor')
    }
  }, [])

  return (
    <>
      <div ref={layerRef} className="paint-layer" aria-hidden="true" />
      <div
        ref={brushRef}
        className="brush-cursor"
        aria-hidden="true"
        style={{ marginLeft: `${-TIP_X}px`, marginTop: `${-TIP_Y}px` }}
      >
        <svg className="brush-icon" viewBox="0 0 24 24" aria-hidden="true">
          {/* wooden handle, tapered to a rounded butt */}
          <path className="brush-handle" d="M9.7 13.2 L14.3 13.2 L13.5 21.4 Q12 23.8 10.5 21.4 Z" />
          {/* crimped metal ferrule */}
          <path className="brush-ferrule" d="M9.2 8.9 L14.8 8.9 L14.4 13.4 L9.6 13.4 Z" />
          <path className="brush-crimp" d="M9.5 10.4 H14.5 M9.5 11.9 H14.5" />
          {/* bristles: bellied at the ferrule, tapering to a fine point */}
          <path
            className="brush-head"
            d="M12 0.9 C10.4 3.6, 9.5 6.2, 9.2 9.1 L14.8 9.1 C14.5 6.2, 13.6 3.6, 12 0.9 Z"
          />
          <path className="brush-bristle-lines" d="M11.2 3.4 L10.4 8.8 M12.8 3.4 L13.6 8.8" />
        </svg>
        <span className="brush-drip" style={{ left: `${TIP_X}px`, top: `${TIP_Y}px` }} />
        <span
          className="brush-drip brush-drip-late"
          style={{ left: `${TIP_X}px`, top: `${TIP_Y}px` }}
        />
      </div>
    </>
  )
}

export default CustomCursor
