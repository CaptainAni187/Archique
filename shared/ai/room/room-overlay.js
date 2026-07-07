export function getDefaultArtworkPlacement(stageWidth = 800, stageHeight = 600) {
  const width = Math.max(120, stageWidth * 0.34)
  const height = width * 1.25

  return {
    x: stageWidth * 0.33,
    y: stageHeight * 0.16,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  }
}

export function clampPlacement(placement = {}, bounds = {}) {
  const stageWidth = Number(bounds.width) || 800
  const stageHeight = Number(bounds.height) || 600
  const width = Math.max(80, Math.min(stageWidth * 0.8, Number(placement.width) || 200))
  const height = Math.max(80, Math.min(stageHeight * 0.8, Number(placement.height) || width * 1.25))

  return {
    x: Math.max(0, Math.min(stageWidth - width, Number(placement.x) || 0)),
    y: Math.max(0, Math.min(stageHeight - height, Number(placement.y) || 0)),
    width,
    height,
    rotation: Math.max(-18, Math.min(18, Number(placement.rotation) || 0)),
    scaleX: Number(placement.scaleX) || 1,
    scaleY: Number(placement.scaleY) || 1,
  }
}

export function serializeOverlayState(state = {}) {
  return {
    placement: clampPlacement(state.placement, state.bounds),
    artwork_id: state.artwork_id || null,
    artwork_url: state.artwork_url || '',
  }
}

export function createOverlayRenderPlan({
  roomImageUrl = '',
  artworkImageUrl = '',
  stageWidth = 800,
  stageHeight = 600,
  placement,
} = {}) {
  return {
    roomImageUrl,
    artworkImageUrl,
    stageWidth,
    stageHeight,
    placement: clampPlacement(placement || getDefaultArtworkPlacement(stageWidth, stageHeight), {
      width: stageWidth,
      height: stageHeight,
    }),
  }
}
