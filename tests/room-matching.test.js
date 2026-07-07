import { describe, expect, it } from 'vitest'
import { analyzeImageData } from '../shared/ai/room/room-analysis.js'
import { buildRoomProfile } from '../shared/ai/room/room-profile.js'
import { classifyRoomPersonality } from '../shared/ai/room/room-personality.js'
import {
  computeRoomMatchScore,
  rankRoomMatches,
  scoreRoomContrast,
  scoreRoomHarmony,
} from '../shared/ai/room/room-matching.js'

function createImageData(width, height, fillFn) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const rgb = fillFn(x, y, width, height)
      data[index] = rgb[0]
      data[index + 1] = rgb[1]
      data[index + 2] = rgb[2]
      data[index + 3] = 255
    }
  }
  return { data, width, height }
}

describe('room intelligence', () => {
  it('classifies a bright minimal room as modern minimal workspace', () => {
    const imageData = createImageData(32, 32, () => [236, 234, 228])
    const analysis = analyzeImageData(imageData, 32, 32)
    const profile = buildRoomProfile(analysis)
    const personality = classifyRoomPersonality(profile)

    expect(analysis.brightness).toBeGreaterThan(0.7)
    expect(profile.moods).toContain('calm')
    expect(['Modern Minimal Workspace', 'Calm Retreat', 'Luxury Contemporary', 'Industrial Modern']).toContain(
      personality.label,
    )
  })

  it('scores harmony higher than contrast for aligned artworks', () => {
    const profile = buildRoomProfile(
      analyzeImageData(createImageData(24, 24, () => [30, 32, 38]), 24, 24),
    )
    const darkArtwork = {
      id: 1,
      title: 'Midnight Study',
      tags: ['dark', 'moody', 'minimal'],
      category: 'canvas',
      price: 5000,
    }
    const brightArtwork = {
      id: 2,
      title: 'Sunlit Bloom',
      tags: ['bright', 'vibrant', 'colorful'],
      category: 'canvas',
      price: 5000,
    }

    expect(scoreRoomHarmony(profile, darkArtwork)).toBeGreaterThan(
      scoreRoomHarmony(profile, brightArtwork),
    )
    expect(scoreRoomContrast(profile, brightArtwork)).toBeGreaterThan(
      scoreRoomContrast(profile, darkArtwork),
    )
  })

  it('ranks room matches with room_match_score', () => {
    const profile = buildRoomProfile(
      analyzeImageData(createImageData(24, 24, () => [240, 238, 232]), 24, 24),
    )
    const artworks = [
      { id: 1, title: 'Quiet Line', tags: ['minimal', 'calm'], category: 'canvas', price: 4000 },
      { id: 2, title: 'Neon Burst', tags: ['vibrant', 'bold', 'anime'], category: 'canvas', price: 4200 },
      { id: 3, title: 'Soft Field', tags: ['soft', 'neutral'], category: 'canvas', price: 4100 },
    ]

    const harmony = rankRoomMatches(profile, artworks, {}, { mode: 'harmony', limit: 2 })
    const contrast = rankRoomMatches(profile, artworks, {}, { mode: 'contrast', limit: 2 })

    expect(harmony[0].room_match_score).toBeGreaterThan(0)
    expect(contrast[0].room_match_score).toBeGreaterThan(0)
    expect(harmony[0].explanation.length).toBeGreaterThan(10)
    expect(computeRoomMatchScore(profile, artworks[0], {}).room_match_score).toBeGreaterThan(0)
  })
})
