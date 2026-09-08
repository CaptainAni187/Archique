import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SUPPORTED_BEHAVIOR_EVENTS, EVENT_WEIGHTS } from '../shared/ai/core/config/weights.js'

/**
 * The API validates event types against SUPPORTED_BEHAVIOR_EVENTS; the database
 * accepts them per a CHECK constraint. When those two lists drift, the mismatch
 * is invisible: validation passes, the insert is rejected, and the error is
 * logged rather than returned. `combo_click` was accepted by the API and
 * rejected by the database for months, and because analytics_events is the
 * first write in the chain, those events left no trace anywhere at all.
 *
 * So the lists are compared here rather than trusted.
 */
const MIGRATIONS_DIR = path.join(process.cwd(), 'supabase', 'migrations')

/** @returns the event list from the most recent migration that sets `constraint` */
function latestConstraintEvents(constraint) {
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith('.sql')).sort()

  let latest = null
  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')

    // Either spelled out inline, or built from a shared array in a do-block.
    const inline = new RegExp(
      `add constraint ${constraint}[\\s\\S]*?event_type in \\(([\\s\\S]*?)\\)`,
      'g',
    )
    let match
    while ((match = inline.exec(sql))) {
      const values = [...match[1].matchAll(/'([^']+)'/g)].map((value) => value[1])
      if (values.length > 0) {
        latest = values
      }
    }

    if (sql.includes(`${constraint} check (event_type in (%s))`)) {
      const declared = sql.match(/allowed text\[\] := array\[([\s\S]*?)\]/)
      if (declared) {
        latest = [...declared[1].matchAll(/'([^']+)'/g)].map((value) => value[1])
      }
    }
  }

  return latest
}

describe('analytics event coverage', () => {
  it.each(['visitor_events_event_type_check', 'analytics_events_event_type_check'])(
    '%s accepts every event the API accepts',
    (constraint) => {
      const allowed = latestConstraintEvents(constraint)
      expect(allowed, `no migration defines ${constraint}`).toBeTruthy()

      const rejected = SUPPORTED_BEHAVIOR_EVENTS.filter((event) => !allowed.includes(event))
      expect(rejected, 'these would pass validation and then fail to insert').toEqual([])
    },
  )

  it('gives every accepted event a weight, so none silently defaults to 1', () => {
    const unweighted = SUPPORTED_BEHAVIOR_EVENTS.filter((event) => !(event in EVENT_WEIGHTS))
    expect(unweighted).toEqual([])
  })

  it('keeps a deliberate zero weight at zero', async () => {
    const { mergeTasteProfileForEvent, createEmptyTasteProfile } = await import(
      '../shared/ai/core/index.js'
    )

    // scroll_depth is telemetry about the page, not a statement of taste. With
    // `||` in place of `??` its 0 became 1 and it moved the profile anyway.
    expect(EVENT_WEIGHTS.scroll_depth).toBe(0)

    const profile = mergeTasteProfileForEvent(createEmptyTasteProfile(), {
      event_type: 'scroll_depth',
      metadata: { artwork: { category: 'canvas', tags: ['anime'] } },
      timestamp: new Date().toISOString(),
    })

    const moved = Object.values(profile.categories || {}).some((value) => Number(value) > 0)
    expect(moved).toBe(false)
  })
})
