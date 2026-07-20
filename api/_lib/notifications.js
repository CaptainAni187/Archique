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
    type: 'archiverse.order.created',
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
    subject: `New Archiverse order ${order.order_code}`,
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
  return sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: order.customer_email,
    subject: `Your Archiverse order ${order.order_code}`,
    html: `
      <h2>Payment confirmed</h2>
      <p>Thank you for your Archiverse order. Your payment has been received in full and the work is reserved for you.</p>
      <p><strong>Order:</strong> ${escapeHtml(order.order_code)}</p>
      <p><strong>Artwork:</strong> ${escapeHtml(order.product_title)}</p>
      <p><strong>Amount Paid:</strong> ${formatCurrency(order.advance_amount)}</p>
      <p>You can track your order here: /order/${encodeURIComponent(order.order_code || '')}</p>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))
}

export async function notifyCommissionRequest(commission, config) {
  const adminEmail = sendResendEmail({
    resendApiKey: config.resendApiKey,
    fromEmail: config.fromEmail,
    to: getAdminNotificationEmail(config),
    subject: `New Archiverse commission request #${commission.id}`,
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
    subject: 'Your Archiverse commission request was received',
    html: `
      <h2>Commission request received</h2>
      <p>Thank you for sharing your idea with Archiverse.</p>
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
    subject: 'Reset your Archiverse password',
    html: `
      <h2>Reset your Archiverse password</h2>
      <p>Hello ${escapeHtml(name || 'there')},</p>
      <p>We received a request to reset the password for your Archiverse account.</p>
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
    subject: 'Welcome to Archiverse',
    html: `
      <h2>Welcome to Archiverse</h2>
      <p>Hello ${escapeHtml(name || 'there')},</p>
      <p>Your account is ready. You can now track orders and get personalized recommendations.</p>
      <p>Thank you for joining Archiverse.</p>
    `,
  }).catch(() => ({ delivered: false, skipped: false }))
}
