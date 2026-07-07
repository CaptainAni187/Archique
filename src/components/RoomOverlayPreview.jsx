import { useEffect, useRef } from 'react'
import Konva from 'konva'
import { getDefaultArtworkPlacement } from '../../shared/ai/room/index.js'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

function RoomOverlayPreview({ roomImageUrl, artworkImageUrl, onOpen }) {
  const containerRef = useRef(null)
  const stageRef = useRef(null)

  useEffect(() => {
    if (onOpen) {
      onOpen()
    }
  }, [onOpen])

  useEffect(() => {
    if (!containerRef.current || !roomImageUrl) {
      return undefined
    }

    let isCancelled = false
    let stage = null
    const container = containerRef.current

    async function mountStage() {
      const width = Math.max(280, Math.min(container.clientWidth || 800, 960))
      const height = Math.round(width * 0.62)
      const placement = getDefaultArtworkPlacement(width, height)

      stage = new Konva.Stage({
        container,
        width,
        height,
      })

      const roomLayer = new Konva.Layer()
      const artworkLayer = new Konva.Layer()
      stage.add(roomLayer)
      stage.add(artworkLayer)

      try {
        const roomImage = await loadImage(roomImageUrl)
        if (isCancelled) {
          return
        }

        roomLayer.add(
          new Konva.Image({
            image: roomImage,
            width,
            height,
            listening: false,
          }),
        )
        roomLayer.draw()

        if (artworkImageUrl) {
          const artworkImage = await loadImage(artworkImageUrl)
          if (isCancelled) {
            return
          }

          const artworkNode = new Konva.Image({
            image: artworkImage,
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
            draggable: true,
            shadowColor: 'black',
            shadowBlur: 8,
            shadowOpacity: 0.25,
          })

          const transformer = new Konva.Transformer({
            nodes: [artworkNode],
            rotateEnabled: true,
            enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
            boundBoxFunc: (oldBox, newBox) => {
              if (newBox.width < 80 || newBox.height < 80) {
                return oldBox
              }
              return newBox
            },
          })

          artworkLayer.add(artworkNode)
          artworkLayer.add(transformer)
          artworkLayer.draw()

          artworkNode.on('dragend transformend', () => {
            artworkLayer.draw()
          })
        }
      } catch {
        /* preview remains room-only */
      }

      stageRef.current = stage
    }

    mountStage()

    return () => {
      isCancelled = true
      stage?.destroy()
      stageRef.current = null
      if (container) {
        container.innerHTML = ''
      }
    }
  }, [roomImageUrl, artworkImageUrl])

  return (
    <div className="room-overlay-preview-wrap">
      <div className="room-overlay-preview" ref={containerRef} />
      <p className="section-copy room-overlay-hint">
        Drag, resize, or lightly rotate the artwork to visualize placement. This is a curated preview, not AR.
      </p>
    </div>
  )
}

export default RoomOverlayPreview
