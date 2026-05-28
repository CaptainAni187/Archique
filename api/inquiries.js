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
    const recipients = ['archikri07@gmail.com', 'kanimesh187@gmail.com']
    const emailHtml = `
      <h2>New ARCHIVERSE inquiry</h2>
      <p><strong>Name:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <p><strong>Message:</strong></p>
      <p>${escapeHtml(message).replaceAll('\n', '<br/>')}</p>
    `

    await Promise.allSettled(
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
