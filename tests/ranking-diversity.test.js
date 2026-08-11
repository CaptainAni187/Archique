import { describe, expect, it } from 'vitest'
import { rankArtworksWithPipeline } from '../shared/ai/core/ranking/ranking-pipeline.js'

/**
 * The ranking pipeline scores a diversity term that compares each artwork
 * against the ones already chosen. That only means something if selection
 * happens one at a time: scoring every candidate in a single pass leaves the
 * running selection empty, the term returns the same constant for everyone,
 * and an identical constant added to every score cannot reorder anything.
 */
describe('ranking diversity', () => {
  const nearIdentical = [
    { id: 1, title: 'Ocean A', tags: ['ocean', 'blue', 'calm'], category: 'canvas', price: 5000 },
    { id: 2, title: 'Ocean B', tags: ['ocean', 'blue', 'calm'], category: 'canvas', price: 5200 },
    { id: 3, title: 'Ocean C', tags: ['ocean', 'blue', 'calm'], category: 'canvas', price: 5100 },
    { id: 4, title: 'Fire Portrait', tags: ['portrait', 'red', 'bold'], category: 'sketch', price: 5050 },
  ]

  it('varies the diversity term across positions instead of applying a constant', () => {
    const ranked = rankArtworksWithPipeline(nearIdentical, { limit: 4 })
    const boosts = ranked.map((row) => row.score_breakdown.diversity_boost)

    expect(new Set(boosts).size).toBeGreaterThan(1)
  })

  it('penalises an artwork that repeats the style of one already selected', () => {
    const ranked = rankArtworksWithPipeline(nearIdentical, { limit: 4 })
    const first = ranked[0].score_breakdown.diversity_boost
    const repeat = ranked.find((row, index) => index > 0 && row.title.startsWith('Ocean'))

    expect(repeat.score_breakdown.diversity_boost).toBeLessThan(first)
  })

  it('surfaces a stylistically different piece above near-duplicates', () => {
    const ranked = rankArtworksWithPipeline(nearIdentical, { limit: 4 })
    const positionOfDifferent = ranked.findIndex((row) => row.title === 'Fire Portrait')
    const oceanPositions = ranked
      .map((row, index) => (row.title.startsWith('Ocean') ? index : -1))
      .filter((index) => index >= 0)

    // It must not sit below every near-duplicate, which is what happened when
    // the diversity term was inert.
    expect(positionOfDifferent).toBeLessThan(Math.max(...oceanPositions))
  })

  it('returns a stable order for identical input', () => {
    const first = rankArtworksWithPipeline(nearIdentical, { limit: 4 }).map((row) => row.id)
    const second = rankArtworksWithPipeline(nearIdentical, { limit: 4 }).map((row) => row.id)

    expect(second).toEqual(first)
  })

  it('respects the requested limit', () => {
    expect(rankArtworksWithPipeline(nearIdentical, { limit: 2 })).toHaveLength(2)
  })

  it('returns an empty list for no artworks', () => {
    expect(rankArtworksWithPipeline([], { limit: 4 })).toEqual([])
  })
})
