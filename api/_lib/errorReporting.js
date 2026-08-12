import { getBackendConfig } from './env.js'
import { sendResendEmail } from './notifications.js'

/**
 * Server error alerting.
 *
 * Errors previously existed only in Vercel's logs, which nobody reads — a
 * checkout breaking at 2am would be discovered from a customer complaint. This
 * writes a structured line for searching and emails the studio when something
 * actually breaks.
 *
 * Deliberately dependency-free rather than reaching for a hosted service: the
 * project already sends email, and one fewer vendor is one fewer thing to
 * configure, pay for, and keep a key for. If a dashboard is wanted later,
 * Sentry can sit alongside this without changing any call sites.
 */

// Alerts are per-instance and short-lived, which is the point: an outage
// hitting a hundred requests should not send a hundred emails. Serverless
// instances are recycled often enough that a persistent outage still surfaces.
const recentAlerts = new Map()
const ALERT_WINDOW_MS = 15 * 60 * 1000
const MAX_ALERTS_PER_WINDOW = 5

function shouldAlert(fingerprint) {
  const now = Date.now()

  for (const [key, timestamp] of recentAlerts) {
    if (now - timestamp > ALERT_WINDOW_MS) {
      recentAlerts.delete(key)
    }
  }

  if (recentAlerts.has(fingerprint)) {
    return false
  }

  if (recentAlerts.size >= MAX_ALERTS_PER_WINDOW) {
    return false
  }

  recentAlerts.set(fingerprint, now)
  return true
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * @param error the thrown error
 * @param context route, action and anything else that identifies the request.
 *   Never pass customer PII — this ends up in logs and an inbox.
 */
export async function reportServerError(error, context = {}) {
  const message = error?.message || 'Unknown error'
  const route = context.route || 'unknown'

  // Structured so it can be found in log search by route or fingerprint.
  console.error(
    JSON.stringify({
      type: 'archique.server.error',
      route,
      action: context.action || null,
      message,
      code: error?.code || null,
      status: error?.status || 500,
      stack: String(error?.stack || '').split('\n').slice(0, 4).join(' | '),
      at: new Date().toISOString(),
    }),
  )

  // Client mistakes are not incidents. Only genuine server failures alert.
  const status = Number(error?.status || 500)
  if (status < 500) {
    return { alerted: false, reason: 'client_error' }
  }

  const fingerprint = `${route}:${error?.code || message}`.slice(0, 200)
  if (!shouldAlert(fingerprint)) {
    return { alerted: false, reason: 'suppressed' }
  }

  const config = getBackendConfig()
  const recipients = String(config.inquiryNotificationRecipients || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  if (recipients.length === 0 || !config.resendApiKey || !config.fromEmail) {
    return { alerted: false, reason: 'not_configured' }
  }

  const result = await sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: recipients[0],
    subject: `Archique error: ${route}`,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;color:#2b2b2b;">
        <h2 style="font-weight:400;">Server error</h2>
        <p style="margin:0 0 4px;"><strong>Route:</strong> ${escapeHtml(route)}</p>
        <p style="margin:0 0 4px;"><strong>Action:</strong> ${escapeHtml(context.action || '-')}</p>
        <p style="margin:0 0 12px;"><strong>When:</strong> ${escapeHtml(new Date().toISOString())}</p>
        <pre style="background:#f6f4f0;padding:12px;border-left:3px solid #c6a962;white-space:pre-wrap;font-size:12px;">${escapeHtml(message)}

${escapeHtml(String(error?.stack || '').split('\n').slice(0, 6).join('\n'))}</pre>
        <p style="color:#777;font-size:12px;">
          Further identical errors are suppressed for 15 minutes so an outage cannot fill your inbox.
        </p>
      </div>
    `,
  }).catch(() => ({ delivered: false }))

  return { alerted: result?.delivered === true }
}
