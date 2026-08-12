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

export async function sendResendEmail({ resendApiKey, fromEmail, to, subject, html }) {
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
  const subtotal = Number(order.total_amount || 0)
  const couponDiscount = Number(order.coupon_discount_amount || 0)
  const paid = Number(order.advance_amount || 0)

  // An itemised receipt rather than a bare confirmation: the buyer should be
  // able to see exactly what was charged without asking for it.
  const rows = [
    ['Artwork', escapeHtml(order.product_title || '')],
    couponDiscount > 0
      ? [`Coupon${order.coupon_code ? ` (${escapeHtml(order.coupon_code)})` : ''}`, `- ${formatCurrency(couponDiscount)}`]
      : null,
    ['Order total', formatCurrency(subtotal)],
    ['Amount paid', `<strong>${formatCurrency(paid)}</strong>`],
  ].filter(Boolean)

  return sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: order.customer_email,
    subject: `Your Archique receipt - order ${order.order_code}`,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:#2b2b2b;">
        <h2 style="font-weight:400;letter-spacing:0.08em;">PAYMENT CONFIRMED</h2>
        <p>Thank you. Your payment has been received in full and the work is reserved for you.</p>

        <p style="margin:20px 0 6px;"><strong>Order ${escapeHtml(order.order_code || '')}</strong><br/>
        <span style="color:#666;">Placed ${escapeHtml(new Date(order.created_at || Date.now()).toDateString())}</span></p>

        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          ${rows
            .map(
              ([label, value]) =>
                `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;color:#666;">${label}</td>` +
                `<td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right;">${value}</td></tr>`,
            )
            .join('')}
        </table>

        <p style="margin:18px 0 4px;color:#666;">Delivering to</p>
        <p style="margin:0;">${escapeHtml(order.customer_name || '')}<br/>
        ${escapeHtml(order.customer_address || '').replaceAll('\n', '<br/>')}<br/>
        ${escapeHtml(order.customer_phone || '')}</p>

        <p style="margin:24px 0;">
          <a href="${trackingUrl}" style="background:#c6a962;color:#1a1a1a;padding:12px 22px;text-decoration:none;border-radius:2px;display:inline-block;">Track your order</a>
        </p>

        <p style="color:#666;font-size:13px;">Ready pieces are dispatched within 4-7 business days. You will receive an update when your work ships.</p>
        <p style="color:#666;font-size:13px;">Questions? Reply to this email or write to archi@archique.in</p>
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
    to: order.customer_email,
    subject: copy.subject,
    html: `
      <div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;color:#2b2b2b;">
        <h2 style="font-weight:400;letter-spacing:0.08em;">${copy.heading}</h2>
        <p>${copy.body}</p>
        <p><strong>Order:</strong> ${escapeHtml(order.order_code || '')}<br/>
        <strong>Artwork:</strong> ${escapeHtml(order.product_title || '')}</p>
        <p style="margin:24px 0;">
          <a href="${trackingUrl}" style="background:#c6a962;color:#1a1a1a;padding:12px 22px;text-decoration:none;border-radius:2px;display:inline-block;">Track your order</a>
        </p>
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
