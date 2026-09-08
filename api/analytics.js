import { z } from 'zod'
import { SUPPORTED_BEHAVIOR_EVENTS } from '../shared/ai/core/index.js'
import { logAnalyticsEvent } from './_lib/analytics.js'
import { requireAdminAuth } from './_lib/adminSession.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { enforcePublicRateLimit } from './_lib/rateLimit.js'
import { fetchVisitorEvents, fetchVisitorSessions } from './_lib/supabaseAdmin.js'
import { TRAFFIC_WINDOW_DAYS, summariseTraffic } from './_lib/trafficSummary.js'
import { sendValidationError, validateWithSchema } from './_lib/validation.js'

const analyticsEventSchema = z.object({
  event_type: z.enum(SUPPORTED_BEHAVIOR_EVENTS),
  session_id: z.string().trim().min(1).max(120).optional().default(''),
  user_id: z.coerce.number().int().positive().optional().nullable(),
  path: z.string().trim().max(240).optional().default(''),
  referrer: z.string().trim().max(1000).optional().default(''),
  artwork_id: z.coerce.number().int().positive().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

function incrementCounter(counter, key) {
  if (!key) {
    return
  }

  counter.set(key, (counter.get(key) || 0) + 1)
}

function topCounterItems(counter, limit = 8) {
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit)
}

/**
 * The analytics tables are additive migrations, so a database that has not had
 * them applied yet should leave the dashboard working rather than 500.
 */
async function tolerateMissingTable(read, fallback) {
  try {
    return await read()
  } catch (error) {
    const message = String(error?.message || '').toLowerCase()
    if (message.includes('visitor_') || message.includes('relation')) {
      return fallback
    }
    throw error
  }
}

/** Own-domain referrers are internal navigation, not a traffic source. */
function siteHostname() {
  try {
    return new URL(process.env.SITE_URL || 'https://www.archique.in').hostname
  } catch {
    return ''
  }
}

async function handleAnalyticsSummary(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const windowStart = new Date(
    Date.now() - TRAFFIC_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const [events, sessions] = await Promise.all([
    tolerateMissingTable(() => fetchVisitorEvents(5000, { since: windowStart }), []),
    tolerateMissingTable(() => fetchVisitorSessions(), []),
  ])

  const tagCounts = new Map()
  const categoryCounts = new Map()

  events
    .filter((event) =>
      ['artwork_view', 'artwork_click', 'product_open', 'instagram_click'].includes(
        event.event_type,
      ),
    )
    .forEach((event) => {
      const metadata = event.metadata || {}
      const category = metadata.category || metadata.artwork?.category || ''
      const tags = Array.isArray(metadata.tags)
        ? metadata.tags
        : Array.isArray(metadata.artwork?.tags)
          ? metadata.artwork.tags
          : []

      incrementCounter(categoryCounts, String(category || '').trim().toLowerCase())
      tags.forEach((tag) => incrementCounter(tagCounts, String(tag || '').trim().toLowerCase()))
    })

  return sendJson(res, 200, {
    success: true,
    data: {
      top_tags: topCounterItems(tagCounts),
      top_categories: topCounterItems(categoryCounts),
      inspected_events: events.length,
      traffic: summariseTraffic({
        sessions,
        events,
        siteHost: siteHostname(),
      }),
    },
  })
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return await handleAnalyticsSummary(req, res)
    }

    if (req.method !== 'POST') {
      return methodNotAllowed(res, ['GET', 'POST'])
    }

    // Legitimate browsing is chatty, so the cap is generous — it exists to
    // stop a script flooding the events table, not to throttle real users.
    const limited = await enforcePublicRateLimit(req, res, {
      scope: 'analytics-write',
      limit: 240,
      windowMs: 5 * 60 * 1000,
    })
    if (limited) {
      return null
    }

    const body = await readJson(req)
    const payload = validateWithSchema(analyticsEventSchema, body)

    await logAnalyticsEvent({
      ...payload,
      // Read from the request rather than trusting the body: the client has no
      // reason to send it, and this column drove the device breakdown to
      // "unknown" for every session because nothing ever set it.
      user_agent: String(req.headers?.['user-agent'] || '').slice(0, 400),
    })

    return sendJson(res, 202, {
      success: true,
      data: {
        accepted: true,
      },
    })
  } catch (error) {
    if (error.validationIssues) {
      return sendValidationError(res, error.validationIssues)
    }

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'ANALYTICS_REQUEST_FAILED',
      message: error.message || 'Unable to log analytics event.',
    })
  }
}
