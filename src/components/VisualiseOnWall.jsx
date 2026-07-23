import { useEffect, useRef, useState } from 'react'
import {
  currentPageUrl,
  getArAssetsForArtwork,
  isArCapableDevice,
} from '../services/arSupportService'
import { trackAnalyticsEvent } from '../services/analyticsService'

/**
 * "See It On Your Wall" — the artwork rendered at its true real-world size,
 * on the buyer's own wall, straight from the product page.
 *
 * Uses Google's <model-viewer> (free, MIT) so the actual AR is handled by each
 * platform's built-in, real-device-tested viewer — no app install, no SDK:
 *   - iOS Safari  -> AR Quick Look (from the .usdz), anchored vertically
 *   - Android     -> Scene Viewer / WebXR (from the .glb)
 *   - Desktop     -> interactive 3D preview + a QR code to open on a phone
 *
 * `ar-scale="fixed"` locks the model to its real dimensions so the size the
 * buyer sees on their wall is the size that ships. The heavy model-viewer
 * library is only downloaded once the buyer opts in.
 */
function VisualiseOnWall({ artworkId, artworkTitle }) {
  const [assets, setAssets] = useState(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLibReady, setIsLibReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const modelViewerRef = useRef(null)
  const arCapable = isArCapableDevice()

  useEffect(() => {
    let isActive = true
    getArAssetsForArtwork(artworkId).then((entry) => {
      if (isActive) {
        setAssets(entry)
      }
    })
    return () => {
      isActive = false
    }
  }, [artworkId])

  const open = async () => {
    setIsOpen(true)
    setLoadError('')
    void trackAnalyticsEvent('room_preview_opened', { artwork_id: artworkId })

    try {
      // model-viewer registers the <model-viewer> custom element as a side
      // effect; loaded lazily so it never weighs down a normal product view.
      await import('@google/model-viewer')
      setIsLibReady(true)
    } catch {
      setLoadError('We could not start the 3D viewer right now. Please try again.')
    }

    if (!arCapable) {
      try {
        const QRCode = (await import('qrcode')).default
        const url = await QRCode.toDataURL(currentPageUrl(), { margin: 1, width: 200 })
        setQrDataUrl(url)
      } catch {
        /* QR is a nicety; ignore failures */
      }
    }
  }

  // Set model-viewer's attributes imperatively rather than via JSX. React's
  // custom-element handling turns some of these into properties, but
  // model-viewer's AR interface keys off the attributes — setting them
  // directly guarantees it sees exactly what it expects on real devices.
  useEffect(() => {
    const viewer = modelViewerRef.current
    if (!viewer || !isLibReady || !assets) {
      return
    }
    viewer.setAttribute('src', assets.glb)
    viewer.setAttribute('ios-src', assets.usdz)
    viewer.setAttribute('alt', `${artworkTitle || 'Artwork'} shown at real size`)
    // The buyer has already opted in by tapping the button, so load the model
    // right away instead of waiting for a lazy scroll-into-view intersection
    // (the default, which leaves the preview blank until the element scrolls).
    viewer.setAttribute('loading', 'eager')
    viewer.setAttribute('reveal', 'auto')
    viewer.setAttribute('camera-controls', '')
    viewer.setAttribute('ar', '')
    viewer.setAttribute('ar-modes', 'webxr scene-viewer quick-look')
    viewer.setAttribute('ar-placement', 'wall')
    viewer.setAttribute('ar-scale', 'fixed')
    viewer.setAttribute('shadow-intensity', '0.6')
    viewer.setAttribute('environment-image', 'neutral')
  }, [isLibReady, assets, artworkTitle])

  const launchAr = () => {
    const viewer = modelViewerRef.current
    if (viewer && typeof viewer.activateAR === 'function') {
      // Called directly from the tap so the AR permission gesture is preserved.
      viewer.activateAR().catch(() => {
        setLoadError('Could not open the camera view on this device.')
      })
    }
  }

  if (!assets) {
    return null
  }

  return (
    <div className="visualise-wall">
      {!isOpen ? (
        <button type="button" className="text-link-button action-button" onClick={open}>
          See It On Your Wall
        </button>
      ) : (
        <div className="visualise-wall-stage">
          {loadError ? <p className="status-message error">{loadError}</p> : null}

          {isLibReady ? (
            <model-viewer
              ref={modelViewerRef}
              style={{ width: '100%', height: '360px', backgroundColor: 'transparent' }}
            ></model-viewer>
          ) : (
            <p className="status-message">Loading preview...</p>
          )}

          {arCapable ? (
            <>
              <button
                type="button"
                className="text-link-button action-button"
                onClick={launchAr}
                disabled={!isLibReady}
              >
                View in Your Room (Camera)
              </button>
              <p className="visualise-wall-hint">
                Point your camera at a wall — the artwork appears at its true size.
              </p>
            </>
          ) : (
            <div className="visualise-wall-desktop">
              <p className="visualise-wall-hint">
                Drag to rotate. To place it on your wall in real size, open this page on your phone:
              </p>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Scan to open this artwork on your phone" width="140" height="140" />
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default VisualiseOnWall
