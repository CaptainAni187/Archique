import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Reveal from '../components/Reveal'
import StoreCard from '../components/StoreCard'
import RoomOverlayPreview from '../components/RoomOverlayPreview'
import ErrorState from '../components/ErrorState'
import { SkeletonGrid } from '../components/SkeletonLoader'
import usePageMeta from '../hooks/usePageMeta'
import { fetchArtworks } from '../services/artworkService'
import { fetchActiveCombos } from '../services/comboService'
import { analyzeRoomFromImage, buildRoomRecommendations } from '../services/roomService.js'
import { trackRoomEvent } from '../services/analyticsService'
import {
  formatRoomProfileForStorage,
  saveRoomSessionState,
} from '../../shared/ai/room/index.js'
import { compressRoomImageFile, captureVideoFrame } from '../utils/roomImageCompression'
import { getStoredUser, saveRoomProfile } from '../services/userAuthService'
import { getUserFriendlyError } from '../utils/userErrors'

function RoomMatchSection({ title, items, onPreview }) {
  if (!items.length) {
    return null
  }

  return (
    <Reveal className="section-block-home room-match-section">
      <h2 className="section-title">{title}</h2>
      <div className="store-grid artwork-grid">
        {items.map((item) => (
          <div key={`${title}-${item.artwork.id}`} className="room-match-card-wrap">
            <StoreCard artwork={item.artwork} />
            <p className="section-copy room-match-explanation">{item.explanation}</p>
            <button
              type="button"
              className="text-link-button action-button"
              onClick={() => onPreview(item)}
            >
              Preview In Room
            </button>
          </div>
        ))}
      </div>
    </Reveal>
  )
}

function RoomMatch() {
  usePageMeta({
    title: 'Room Match | Archiverse',
    description: 'Upload a room photo and discover artworks curated for your environment.',
  })

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const focusArtworkId = Number(searchParams.get('artworkId') || 0)
  const startCamera = searchParams.get('camera') === '1'

  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  const [artworks, setArtworks] = useState([])
  const [combos, setCombos] = useState([])
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [roomImage, setRoomImage] = useState('')
  const [roomProfile, setRoomProfile] = useState(null)
  const [recommendations, setRecommendations] = useState(null)
  const [previewArtwork, setPreviewArtwork] = useState(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [saveLabel, setSaveLabel] = useState('My Space')
  const [saveMessage, setSaveMessage] = useState('')

  useEffect(() => {
    async function loadCatalog() {
      setLoadingCatalog(true)
      try {
        const [artworkResponse, comboResponse] = await Promise.all([
          fetchArtworks(),
          fetchActiveCombos(),
        ])
        setArtworks(Array.isArray(artworkResponse) ? artworkResponse : [])
        setCombos(Array.isArray(comboResponse) ? comboResponse : [])
      } catch (error) {
        setErrorMessage(getUserFriendlyError(error, 'We could not load artworks right now.'))
      } finally {
        setLoadingCatalog(false)
      }
    }

    loadCatalog()
  }, [])

  useEffect(() => {
    if (!focusArtworkId || !artworks.length) {
      return
    }
    const match = artworks.find((artwork) => Number(artwork.id) === focusArtworkId)
    if (match) {
      setPreviewArtwork(match)
    }
  }, [artworks, focusArtworkId])

  useEffect(() => {
    if (startCamera) {
      void startCameraCapture()
    }

    return () => {
      stopCameraCapture()
    }
  }, [startCamera])

  const previewArtworkImage = useMemo(() => {
    if (!previewArtwork) {
      return ''
    }
    return Array.isArray(previewArtwork.images) ? previewArtwork.images[0] || '' : ''
  }, [previewArtwork])

  async function stopCameraCapture() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  async function startCameraCapture() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Camera capture is not supported on this device.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraActive(true)
      setErrorMessage('')
    } catch {
      setErrorMessage('We could not access your camera. Try uploading a photo instead.')
    }
  }

  async function processRoomImage(imageSource, sourceType = 'upload') {
    if (!imageSource) {
      return
    }

    setProcessing(true)
    setErrorMessage('')
    setSaveMessage('')

    try {
      void trackRoomEvent('room_upload', { source: sourceType })
      const result = await analyzeRoomFromImage(imageSource)
      if (!result?.profile) {
        throw new Error('We could not analyze this room photo.')
      }

      setRoomImage(result.imagePreview)
      setRoomProfile(result.profile)
      saveRoomSessionState({
        imagePreview: result.imagePreview,
        profile: result.profile,
      })

      const recs = buildRoomRecommendations(result.profile, artworks, combos, {
        excludeIds: focusArtworkId ? [focusArtworkId] : [],
      })
      setRecommendations(recs)

      void trackRoomEvent('room_analysis_completed', {
        fingerprint: result.fingerprint,
        cached: result.cached,
      })
      void trackRoomEvent('room_personality_detected', {
        room_personality: result.profile.room_personality,
        moods: result.profile.moods,
        style: result.profile.style,
      })

      if (focusArtworkId) {
        const focused = artworks.find((artwork) => Number(artwork.id) === focusArtworkId)
        if (focused) {
          setPreviewArtwork(focused)
        }
      } else if (recs.harmony[0]?.artwork) {
        setPreviewArtwork(recs.harmony[0].artwork)
      }
    } catch (error) {
      setErrorMessage(getUserFriendlyError(error, 'We could not analyze this room photo.'))
    } finally {
      setProcessing(false)
      await stopCameraCapture()
    }
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const compressed = await compressRoomImageFile(file)
    await processRoomImage(compressed, 'upload')
    event.target.value = ''
  }

  async function handleCapturePhoto() {
    if (!videoRef.current) {
      await startCameraCapture()
      return
    }

    const frame = captureVideoFrame(videoRef.current)
    if (!frame) {
      setErrorMessage('Could not capture a photo from your camera.')
      return
    }

    await processRoomImage(frame, 'camera')
  }

  async function handleSaveProfile() {
    if (!roomProfile || !getStoredUser()) {
      navigate('/login')
      return
    }

    try {
      await saveRoomProfile({
        label: saveLabel,
        space_type: null,
        room_personality: roomProfile.room_personality,
        profile: formatRoomProfileForStorage(roomProfile, { label: saveLabel }),
      })
      setSaveMessage('Room profile saved to your account.')
      void trackRoomEvent('room_profile_saved', {
        room_personality: roomProfile.room_personality,
        label: saveLabel,
      })
    } catch (error) {
      setSaveMessage(getUserFriendlyError(error, 'Could not save this room profile.'))
    }
  }

  function handleArtworkClick(item) {
    setPreviewArtwork(item.artwork)
    void trackRoomEvent('room_match_clicked', {
      artwork_id: item.artwork.id,
      room_personality: roomProfile?.room_personality || '',
      mode: item.mode || 'harmony',
      room_match_score: item.room_match_score,
    })
  }

  if (loadingCatalog) {
    return (
      <section className="page-flow page-with-header-gap">
        <SkeletonGrid className="store-grid" count={3} />
      </section>
    )
  }

  return (
    <section className="page-flow page-with-header-gap room-match-page">
      <Reveal className="portfolio-header room-match-hero">
        <p className="eyebrow">ROOM CURATION</p>
        <h1 className="section-title">Find Art For Your Space</h1>
        <p className="section-copy">
          Upload a room photo and discover artworks curated for your environment.
        </p>
        <div className="room-match-actions">
          <button
            type="button"
            className="text-link-button action-button"
            onClick={() => fileInputRef.current?.click()}
            disabled={processing}
          >
            Upload Room Photo
          </button>
          <button
            type="button"
            className="text-link-button action-button"
            onClick={() => {
              if (cameraActive) {
                void handleCapturePhoto()
              } else {
                void startCameraCapture()
              }
            }}
            disabled={processing}
          >
            {cameraActive ? 'Capture Photo' : 'Take Photo'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>
      </Reveal>

      {cameraActive ? (
        <Reveal className="room-camera-panel">
          <video ref={videoRef} className="room-camera-video" playsInline muted autoPlay />
          <button type="button" className="text-link-button" onClick={() => void handleCapturePhoto()}>
            Use This Photo
          </button>
          <button type="button" className="text-link-button secondary-action" onClick={() => void stopCameraCapture()}>
            Cancel Camera
          </button>
        </Reveal>
      ) : null}

      {processing ? <p className="status-message">Analyzing your room atmosphere…</p> : null}
      {errorMessage ? <ErrorState message={errorMessage} onRetry={() => setErrorMessage('')} /> : null}

      {roomProfile ? (
        <Reveal className="order-detail-card room-personality-card">
          <p className="eyebrow">Detected Room Personality</p>
          <h2 className="section-title">{roomProfile.room_personality}</h2>
          <p className="section-copy">{roomProfile.personality_summary}</p>
          <p className="section-copy">
            Moods: {(roomProfile.moods || []).join(', ') || 'neutral'} · Styles:{' '}
            {(roomProfile.style || []).join(', ') || 'contemporary'}
          </p>
          {getStoredUser() ? (
            <div className="room-save-row">
              <input
                value={saveLabel}
                onChange={(event) => setSaveLabel(event.target.value)}
                placeholder="Workspace"
              />
              <button type="button" className="text-link-button" onClick={() => void handleSaveProfile()}>
                Save Room Profile
              </button>
            </div>
          ) : (
            <Link to="/login" className="text-link-button">
              Sign in to save room profiles
            </Link>
          )}
          {saveMessage ? <p className="status-message success">{saveMessage}</p> : null}
        </Reveal>
      ) : null}

      {roomImage && previewArtworkImage ? (
        <Reveal className="section-block-home">
          <p className="eyebrow">SMART ROOM PREVIEW</p>
          <h2 className="section-title">See Art In Your Room</h2>
          <RoomOverlayPreview
            roomImageUrl={roomImage}
            artworkImageUrl={previewArtworkImage}
            onOpen={() => {
              void trackRoomEvent('room_preview_opened', {
                artwork_id: previewArtwork?.id || null,
                room_personality: roomProfile?.room_personality || '',
              })
            }}
          />
        </Reveal>
      ) : null}

      {recommendations ? (
        <>
          <RoomMatchSection
            title="Matches Your Space"
            items={recommendations.harmony.map((item) => ({ ...item, mode: 'harmony' }))}
            onPreview={handleArtworkClick}
          />
          <RoomMatchSection
            title="Adds Contrast To Your Space"
            items={recommendations.contrast.map((item) => ({ ...item, mode: 'contrast' }))}
            onPreview={handleArtworkClick}
          />
          {recommendations.roomSets.length > 0 ? (
            <Reveal className="section-block-home room-match-section">
              <h2 className="section-title">Recommended Room Sets</h2>
              {recommendations.roomSets.map((entry) => (
                <div key={entry.combo.id} className="room-set-card">
                  <div className="order-detail-header">
                    <div>
                      <p>{entry.combo.title}</p>
                      <p className="section-copy">{entry.explanation}</p>
                    </div>
                  </div>
                  <div className="store-grid artwork-grid">
                    {entry.combo.items.map((item) => (
                      <StoreCard key={`${entry.combo.id}-${item.id}`} artwork={item} />
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-link-button action-button"
                    onClick={() => {
                      void trackRoomEvent('room_set_clicked', {
                        combo_id: entry.combo.id,
                        room_personality: roomProfile?.room_personality || '',
                      })
                      navigate(`/product/${entry.combo.items[0]?.id}`)
                    }}
                  >
                    View Set
                  </button>
                </div>
              ))}
            </Reveal>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

export default RoomMatch
