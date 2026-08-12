function maskEmail(email) {
  if (!email || !email.includes('@')) {
    return 'not-provided'
  }

  const [local, domain] = email.split('@')
  const visibleLocal = local.slice(0, 2)
  return `${visibleLocal}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`
}

function maskPhone(phone) {
  if (!phone) {
    return 'not-provided'
  }

  return `${phone.slice(0, 2)}${'*'.repeat(Math.max(phone.length - 4, 1))}${phone.slice(-2)}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatCurrency(value) {
  return `Rs. ${Number(value || 0).toLocaleString()}`
}

/**
 * Absolute base for links in email. Relative paths are not clickable in a mail
 * client, so the receipt's tracking link has to be a full URL.
 */
function getSiteUrl() {
  const configured = String(process.env.SITE_URL || '').trim().replace(/\/+$/, '')

  if (configured) {
    return configured
  }

  const vercelUrl = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || '').trim()

  return vercelUrl ? `https://${vercelUrl}` : 'https://www.archique.in'
}

export async function sendResendEmail({ resendApiKey, fromEmail, to, subject, html, replyTo }) {
  if (!resendApiKey || !fromEmail || !to) {
    return { delivered: false, skipped: true }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromEmail,
      ...(replyTo ? { reply_to: replyTo } : {}),
      to: [to],
      subject,
      html,
    }),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    return {
      delivered: false,
      skipped: false,
      provider: 'resend',
      error: payload?.message || payload?.error || 'Resend email delivery failed.',
    }
  }

  return {
    delivered: true,
    skipped: false,
    provider: 'resend',
    id: payload?.id || null,
  }
}

function getAdminNotificationEmail(config) {
  return config.adminNotificationEmail || process.env.ADMIN_EMAIL || ''
}

/**
 * Every customer email ends with a way to reach a person.
 *
 * After paying for something that will not arrive for days, the most common
 * anxiety is not knowing who to ask. A reply address, the studio's own inbox
 * and a tracking link cost nothing and remove that.
 */
function emailFooter(order) {
  const trackingUrl = order?.order_code
    ? `${getSiteUrl()}/order/${encodeURIComponent(order.order_code)}`
    : `${getSiteUrl()}/store`

  return `
    <div style="margin-top:28px;padding-top:16px;border-top:1px solid #e6e0d4;font-size:12px;color:#6b6b6b;line-height:1.7;">
      <p style="margin:0 0 6px;"><strong style="color:#3a3a3a;">Need help with this order?</strong></p>
      <p style="margin:0 0 3px;">Reply to this email, or write to
        <a href="mailto:archi@archique.in" style="color:#7d6320;">archi@archique.in</a></p>
      <p style="margin:0 0 3px;">Track it any time:
        <a href="${trackingUrl}" style="color:#7d6320;">${trackingUrl}</a></p>
      <p style="margin:0 0 3px;">Instagram:
        <a href="https://www.instagram.com/archique.in/" style="color:#7d6320;">@archique.in</a></p>
      <p style="margin:12px 0 0;color:#9a9a9a;">Archique &middot; original artwork &middot; archique.in</p>
    </div>`
}

/** Reaching the studio must be one tap, so replies go to a monitored inbox. */
const REPLY_TO = 'archi@archique.in'

export async function notifyAdmin(order, config) {
  const structuredLog = {
    type: 'archique.order.created',
    orderCode: order.order_code,
    productTitle: order.product_title,
    totalAmount: order.total_amount,
    advanceAmount: order.advance_amount,
    paymentStatus: order.payment_status,
    paymentId: order.razorpay_payment_id,
    customer: {
      name: order.customer_name,
      email: maskEmail(order.customer_email),
      phone: maskPhone(order.customer_phone),
    },
  }

  console.info(JSON.stringify(structuredLog))

  const webhookPromise = config.adminNotificationWebhookUrl
    ? fetch(config.adminNotificationWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderCode: order.order_code,
          productTitle: order.product_title,
          totalAmount: order.total_amount,
          advanceAmount: order.advance_amount,
          paymentStatus: order.payment_status,
          paymentId: order.razorpay_payment_id,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          customerPhone: order.customer_phone,
          customerAddress: order.customer_address,
        }),
      }).catch(() => null)
    : Promise.resolve(null)

  const emailPromise = sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: getAdminNotificationEmail(config),
    subject: `New Archique order ${order.order_code}`,
    html: `
      <h2>New order received</h2>
      <p><strong>Order:</strong> ${escapeHtml(order.order_code)}</p>
      <p><strong>Artwork:</strong> ${escapeHtml(order.product_title)}</p>
      <p><strong>Amount Paid (in full):</strong> ${formatCurrency(order.advance_amount)}</p>
      ${order.coupon_code ? `<p><strong>Coupon Used:</strong> ${escapeHtml(order.coupon_code)} (-${formatCurrency(order.coupon_discount_amount)})</p>` : ''}
      <p><strong>Customer:</strong> ${escapeHtml(order.customer_name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(order.customer_email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(order.customer_phone)}</p>
      <p><strong>Address:</strong> ${escapeHtml(order.customer_address)}</p>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))

  const [, emailStatus] = await Promise.all([webhookPromise, emailPromise])
  return { emailStatus }
}

export async function notifyCustomer(order, config) {
  const trackingUrl = `${getSiteUrl()}/order/${encodeURIComponent(order.order_code || '')}`
  const invoice = order.invoice || null
  const totals = invoice?.totals || {}
  const isGift = order.is_gift === true

  // Prefer the stored invoice: it is what was actually charged. Fall back to
  // the order columns for anything written before invoices were captured.
  const subtotal = Number(totals.subtotal ?? order.total_amount ?? 0)
  const pairingDiscount = Number(totals.pairing_discount_amount ?? 0)
  const couponDiscount = Number(totals.coupon_discount_amount ?? order.coupon_discount_amount ?? 0)
  const shipping = Number(totals.shipping ?? 0)
  const paid = Number(totals.amount_paid ?? order.advance_amount ?? 0)

  const lineItems = invoice?.line_items?.length
    ? invoice.line_items
    : [{ title: order.product_title, unit_price: subtotal, size: null }]

  const itemRows = lineItems
    .map(
      (item) =>
        `<tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;">
            ${escapeHtml(item.title || '')}
            ${item.size ? `<br/><span style="color:#8a8a8a;font-size:12px;">${escapeHtml(item.size)}</span>` : ''}
          </td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap;">
            ${formatCurrency(item.unit_price)}
          </td>
        </tr>`,
    )
    .join('')

  const summaryRow = (label, value, strong = false) =>
    `<tr>
      <td style="padding:6px 0;color:#666;">${label}</td>
      <td style="padding:6px 0;text-align:right;${strong ? 'font-weight:600;color:#000;' : ''}">${value}</td>
    </tr>`

  const summaryRows = [
    pairingDiscount > 0
      ? summaryRow(
          `Multi-piece discount${totals.pairing_discount_percent ? ` (${totals.pairing_discount_percent}%)` : ''}`,
          `- ${formatCurrency(pairingDiscount)}`,
        )
      : '',
    couponDiscount > 0
      ? summaryRow(
          `Coupon${totals.coupon_code ? ` (${escapeHtml(totals.coupon_code)})` : ''}`,
          `- ${formatCurrency(couponDiscount)}`,
        )
      : '',
    shipping > 0 ? summaryRow('Delivery', formatCurrency(shipping)) : '',
    summaryRow('Amount paid', formatCurrency(paid), true),
  ].join('')

  return sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    replyTo: REPLY_TO,
    to: order.customer_email,
    subject: `Your Archique receipt - order ${order.order_code}`,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:580px;color:#2b2b2b;">
        <h2 style="font-weight:400;letter-spacing:0.08em;margin:0 0 6px;">PAYMENT CONFIRMED</h2>
        <p style="margin:0 0 18px;">Thank you. Your payment has been received in full and the work is reserved for you.</p>

        <p style="margin:0 0 4px;"><strong>Invoice ${escapeHtml(order.order_code || '')}</strong></p>
        <p style="margin:0 0 16px;color:#666;font-size:13px;">
          Issued ${escapeHtml(new Date(order.created_at || Date.now()).toDateString())}
        </p>

        <table style="width:100%;border-collapse:collapse;margin:0 0 4px;">${itemRows}</table>
        <table style="width:100%;border-collapse:collapse;margin:0 0 20px;">${summaryRows}</table>

        ${
          isGift
            ? `<div style="margin:0 0 18px;padding:12px 14px;background:#faf7f0;border-left:3px solid #c6a962;">
                 <p style="margin:0 0 4px;"><strong>Sent as a gift</strong></p>
                 <p style="margin:0;color:#555;font-size:13px;">
                   ${order.gift_recipient_name ? `For ${escapeHtml(order.gift_recipient_name)}.` : ''}
                   No prices are included in the parcel.
                 </p>
               </div>`
            : ''
        }

        <p style="margin:0 0 4px;color:#666;font-size:13px;">Delivering to</p>
        <p style="margin:0 0 20px;">
          ${escapeHtml(order.gift_recipient_name || order.customer_name || '')}<br/>
          ${escapeHtml(order.customer_address || '').replaceAll('\n', '<br/>')}<br/>
          ${escapeHtml(order.customer_phone || '')}
        </p>

        <p style="margin:0 0 20px;">
          <a href="${trackingUrl}" style="background:#c6a962;color:#1a1a1a;padding:12px 22px;text-decoration:none;border-radius:2px;display:inline-block;">Track your order</a>
        </p>

        <p style="color:#666;font-size:13px;margin:0;">
          Ready pieces are dispatched within 4-7 business days. You will hear from us the moment yours ships.
        </p>

        ${emailFooter(order)}
      </div>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))
}

/**
 * Sent when an order moves to shipped or delivered, so the buyer is not left
 * checking a tracking page for a change nobody told them about.
 */
export async function notifyOrderStatusChange(order, config, nextStatus) {
  const trackingUrl = `${getSiteUrl()}/order/${encodeURIComponent(order.order_code || '')}`
  const copy = {
    processing: {
      subject: `Your Archique order ${order.order_code} is being prepared`,
      heading: 'IN PREPARATION',
      body: 'Your work is being finished, cured, and packed by hand. We will let you know the moment it ships.',
    },
    shipped: {
      subject: `Your Archique order ${order.order_code} has shipped`,
      heading: 'ON ITS WAY',
      body: 'Your work has left the studio. Please open and inspect it in front of the delivery partner where possible.',
      // "Shipped" with nothing to track is where the "where is it?" emails start.
      extra: order.tracking_number
        ? `<p style="margin:0 0 18px;padding:12px 14px;background:#faf7f0;border-left:3px solid #c6a962;">
             <strong>${escapeHtml(order.courier_name || 'Courier')}</strong><br/>
             Consignment ${escapeHtml(order.tracking_number)}
             ${
               order.tracking_url
                 ? `<br/><a href="${escapeHtml(order.tracking_url)}" style="color:#7d6320;">Track with the courier</a>`
                 : ''
             }
           </p>`
        : '',
    },
    delivered: {
      subject: `Your Archique order ${order.order_code} has been delivered`,
      heading: 'DELIVERED',
      body: 'Your work has arrived. If anything is not as it should be, tell us within 48 hours with photographs.',
    },
  }[nextStatus]

  if (!copy) {
    return { delivered: false, skipped: true }
  }

  return sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    replyTo: REPLY_TO,
    to: order.customer_email,
    subject: copy.subject,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:#2b2b2b;">
        <h2 style="font-weight:400;letter-spacing:0.08em;">${copy.heading}</h2>
        <p>${copy.body}</p>
        <p><strong>Order:</strong> ${escapeHtml(order.order_code || '')}<br/>
        <strong>Artwork:</strong> ${escapeHtml(order.product_title || '')}</p>
        ${copy.extra || ''}
        <p style="margin:24px 0;">
          <a href="${trackingUrl}" style="background:#c6a962;color:#1a1a1a;padding:12px 22px;text-decoration:none;border-radius:2px;display:inline-block;">Track your order</a>
        </p>
        ${emailFooter(order)}
      </div>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))
}

export async function notifyCommissionRequest(commission, config) {
  const adminEmail = sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: getAdminNotificationEmail(config),
    subject: `New Archique commission request #${commission.id}`,
    html: `
      <h2>New commission request</h2>
      <p><strong>Request:</strong> #${escapeHtml(commission.id)}</p>
      <p><strong>Customer:</strong> ${escapeHtml(commission.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(commission.email)}</p>
      <p><strong>Phone:</strong> ${escapeHtml(commission.phone)}</p>
      <p><strong>Artwork Type:</strong> ${escapeHtml(commission.artwork_type)}</p>
      <p><strong>Size:</strong> ${escapeHtml(commission.size)}</p>
      <p><strong>Deadline:</strong> ${escapeHtml(commission.deadline)}</p>
      <p><strong>Description:</strong></p>
      <p>${escapeHtml(commission.description).replaceAll('\n', '<br/>')}</p>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))

  const customerEmail = sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: commission.email,
    subject: 'Your Archique commission request was received',
    html: `
      <h2>Commission request received</h2>
      <p>Thank you for sharing your idea with Archique.</p>
      <p><strong>Request:</strong> #${escapeHtml(commission.id)}</p>
      <p><strong>Artwork Type:</strong> ${escapeHtml(commission.artwork_type)}</p>
      <p><strong>Size:</strong> ${escapeHtml(commission.size)}</p>
      <p><strong>Deadline:</strong> ${escapeHtml(commission.deadline)}</p>
      <p>We will review your request and reply with the next steps.</p>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))

  const [adminEmailStatus, customerEmailStatus] = await Promise.all([
    adminEmail,
    customerEmail,
  ])

  return {
    adminEmailStatus,
    customerEmailStatus,
  }
}

export async function sendUserPasswordResetEmail({ email, name, token, config }) {
  return sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: email,
    subject: 'Reset your Archique password',
    html: `
      <h2>Reset your Archique password</h2>
      <p>Hello ${escapeHtml(name || 'there')},</p>
      <p>We received a request to reset the password for your Archique account.</p>
      <p><strong>Your reset token:</strong> ${escapeHtml(token)}</p>
      <p>Enter this token on the password reset form along with your new password. It expires in 30 minutes.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))
}

export async function sendUserWelcomeEmail({ email, name, config }) {
  return sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: email,
    subject: 'Welcome to Archique',
    html: `
      <h2>Welcome to Archique</h2>
      <p>Hello ${escapeHtml(name || 'there')},</p>
      <p>Your account is ready. You can now track orders and get personalized recommendations.</p>
      <p>Thank you for joining Archique.</p>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))
}
