import { requireAdminAuth } from './_lib/adminSession.js'
import { logAdminActivity } from './_lib/adminActivity.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { getBackendConfig } from './_lib/env.js'
import { sendResendEmail } from './_lib/notifications.js'
import { supabaseAdminRequest } from './_lib/supabaseAdmin.js'

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const session = await requireAdminAuth(req, res)
      if (!session) {
        return null
      }

      const inquiries = await supabaseAdminRequest('inquiries?select=*&order=id.desc')
      return sendJson(res, 200, {
        success: true,
        data: Array.isArray(inquiries) ? inquiries : [],
      })
    }

    if (req.method === 'PATCH') {
      const session = await requireAdminAuth(req, res)
      if (!session) {
        return null
      }

      const inquiryId = Number(req.query?.id)
      const body = await readJson(req)
      const isRead = body.is_read === true

      if (!Number.isInteger(inquiryId) || inquiryId <= 0) {
        return sendJson(res, 400, {
          success: false,
          error: 'INVALID_INQUIRY_ID',
          message: 'A valid inquiry id is required.',
        })
      }

      const response = await supabaseAdminRequest(`inquiries?id=eq.${inquiryId}`, {
        method: 'PATCH',
        headers: {
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          is_read: isRead,
        }),
      })

      await logAdminActivity(session, {
        action_type: isRead ? 'inquiry_marked_read' : 'inquiry_marked_unread',
        resource_type: 'inquiry',
        resource_id: inquiryId,
      })

      return sendJson(res, 200, {
        success: true,
        data: response?.[0] || null,
      })
    }

    if (req.method !== 'POST') {
      return methodNotAllowed(res, ['GET', 'POST', 'PATCH'])
    }

    const body = await readJson(req)
    const name = String(body.name || '').trim()
    const email = String(body.email || '').trim()
    const subject = String(body.subject || '').trim()
    const message = String(body.message || '').trim()

    if (!name || !email || !subject || !message) {
      return sendJson(res, 400, {
        success: false,
        error: 'INVALID_INQUIRY',
        message: 'Name, email, subject, and message are required.',
      })
    }

    const inserted = await supabaseAdminRequest('inquiries', {
      method: 'POST',
      headers: {
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        name,
        email,
        subject,
        message,
      }),
    })

    const config = getBackendConfig()
    const recipients = String(config.inquiryNotificationRecipients || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    const emailHtml = `
      <h2>New ARCHIVERSE inquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replaceAll('\n', '<br/>')}</p>
    `

    // The inquiry is already safely stored above, so email is best-effort and
    // never blocks the response. It is easy to misconfigure silently though
    // (a missing RESEND_API_KEY or FROM_EMAIL makes sendResendEmail a no-op),
    // so log the outcome per recipient — otherwise a form that "works" would
    // quietly stop notifying anyone.
    if (recipients.length === 0 || !config.resendApiKey || !config.fromEmail) {
      console.warn('[inquiries] notification email NOT sent — configuration missing', {
        hasResendApiKey: Boolean(config.resendApiKey),
        hasFromEmail: Boolean(config.fromEmail),
        recipientCount: recipients.length,
      })
    }

    const deliveries = await Promise.allSettled(
      recipients.map((to) =>
        sendResendEmail({
          resendApiKey: config.resendApiKey,
          fromEmail: config.fromEmail,
          to,
          subject: `Archiverse inquiry: ${subject}`,
          html: emailHtml,
        }),
      ),
    )

    deliveries.forEach((result, index) => {
      const to = recipients[index]
      if (result.status === 'rejected') {
        console.error('[inquiries] notification email threw', {
          to,
          message: result.reason?.message || 'Unknown error',
        })
        return
      }

      // sendResendEmail reports provider rejections in its return value rather
      // than throwing, so check `delivered` — otherwise a rejected send (an
      // unverified sender domain, say) would look like a success in the logs.
      if (result.value?.skipped) {
        console.warn('[inquiries] notification email skipped — missing config', { to })
      } else if (!result.value?.delivered) {
        console.error('[inquiries] notification email REJECTED by provider', {
          to,
          error: result.value?.error || 'Unknown provider error',
        })
      } else {
        console.log('[inquiries] notification email delivered', { to, id: result.value?.id })
      }
    })

    return sendJson(res, 201, {
      success: true,
      data: inserted?.[0] || null,
    })
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'INQUIRY_REQUEST_FAILED',
      message: error.message || 'Unable to submit inquiry.',
    })
  }
}
