import { reportServerError } from './_lib/errorReporting.js'
import {
  consumePasswordResetToken,
  createAdminToken,
  createPasswordResetToken,
  createAdminSessionRecord,
  findAdminForPasswordReset,
  getAdminBackupEmail,
  logoutAdminSession,
  requireAdminAuth,
  updateAdminPassword,
  validateAdminCredentials,
} from './_lib/adminSession.js'
import { fetchAdminActivity, logAdminActivity } from './_lib/adminActivity.js'
import { getClientIp, consumeRateLimit } from './_lib/rateLimit.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import {
  fetchOrderAnalyticsRows,
  fetchUserAccounts,
  fetchUserLoginEvents,
  supabaseAdminRequest,
} from './_lib/supabaseAdmin.js'
import { getBackendConfig } from './_lib/env.js'
import { sendResendEmail } from './_lib/notifications.js'

const REVENUE_STATUSES = ['advance_paid', 'processing', 'shipped', 'delivered']

function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 12 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

function getAction(req) {
  return String(req.query?.action || '').trim().toLowerCase()
}

function getPathname(req) {
  const rawUrl = String(req.url || '').trim()

  if (!rawUrl) {
    return ''
  }

  try {
    return new URL(rawUrl, 'http://localhost').pathname.toLowerCase()
  } catch {
    return rawUrl.split('?')[0].toLowerCase()
  }
}

function matchesAdminRoute(pathname, route) {
  if (!pathname || !route) {
    return false
  }

  return pathname === route || pathname.endsWith(route)
}

function toDateKey(value) {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10)
  }

  return date.toISOString().slice(0, 10)
}

function getLastSevenDayKeys(now = new Date()) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - (6 - index))
    return date.toISOString().slice(0, 10)
  })
}

function buildDashboardAnalytics(orders) {
  const successfulOrders = orders.filter((order) =>
    REVENUE_STATUSES.includes(order.payment_status),
  )
  const ordersByDay = new Map()

  orders.forEach((order) => {
    const dateKey = toDateKey(order.created_at)
    ordersByDay.set(dateKey, (ordersByDay.get(dateKey) || 0) + 1)
  })

  return {
    total_orders: orders.length,
    total_revenue: successfulOrders.reduce(
      (sum, order) => sum + Number(order.total_amount || 0),
      0,
    ),
    advance_revenue: successfulOrders.reduce(
      (sum, order) => sum + Number(order.advance_amount || 0),
      0,
    ),
    artwork_sales_count: successfulOrders.length,
    unique_artworks_sold: new Set(
      successfulOrders.map((order) => order.product_id).filter(Boolean),
    ).size,
    orders_per_day: getLastSevenDayKeys().map((date) => ({
      date,
      count: ordersByDay.get(date) || 0,
    })),
  }
}

function buildUserAnalytics(users, loginEvents) {
  const today = new Date().toISOString().slice(0, 10)
  const sevenDayCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  const usersById = new Map(users.map((user) => [user.id, user]))

  const totalAccounts = users.length
  const googleAccounts = users.filter((user) =>
    ['google', 'email+google'].includes(String(user.provider || 'email')),
  ).length
  const emailAccounts = users.filter((user) =>
    ['email', 'email+google'].includes(String(user.provider || 'email')),
  ).length
  const dailyLogins = loginEvents.filter((event) => String(event.login_at || '').slice(0, 10) === today)
    .length
  const activeUsers = new Set(
    loginEvents
      .filter((event) => new Date(event.login_at).getTime() >= sevenDayCutoff)
      .map((event) => event.user_id),
  ).size

  const loginFrequency = users
    .map((user) => ({
      user_id: user.id,
      login_count: Number(user.login_count || 0),
      provider: user.provider || 'email',
    }))
    .sort((a, b) => b.login_count - a.login_count)
    .slice(0, 8)

  const latestUsers = [...users]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 8)
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url || null,
      provider: user.provider || 'email',
      created_at: user.created_at,
      last_login_at: user.last_login_at,
      login_count: Number(user.login_count || 0),
    }))

  const recentSignups = [...users]
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 14)
    .map((user) => ({
      id: user.id,
      date: String(user.created_at || '').slice(0, 10),
      provider: user.provider || 'email',
    }))

  const recentActiveUsers = [...loginEvents]
    .slice(0, 20)
    .map((event) => ({
      user_id: event.user_id,
      provider: event.provider,
      login_at: event.login_at,
      account_provider: usersById.get(event.user_id)?.provider || 'email',
    }))

  const totalLogins = loginEvents.length
  const googleLogins = loginEvents.filter((event) => event.provider === 'google').length
  const emailLogins = loginEvents.filter((event) => event.provider === 'email').length
  const lastLoginTimestamp = loginEvents[0]?.login_at || null

  return {
    total_accounts: totalAccounts,
    google_accounts: googleAccounts,
    email_accounts: emailAccounts,
    total_logins: totalLogins,
    google_logins: googleLogins,
    email_logins: emailLogins,
    active_users_7d: activeUsers,
    daily_logins: dailyLogins,
    last_login_at: lastLoginTimestamp,
    recent_signups: recentSignups,
    recent_active_users: recentActiveUsers,
    login_frequency: loginFrequency,
    latest_users: latestUsers,
  }
}

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const body = await readJson(req)
  const email = String(body.email || '').trim().toLowerCase()
  const password = body.password || ''
  const ipAddress = getClientIp(req)
  const rateLimit = await consumeRateLimit(`admin-login:${ipAddress}`, {
    limit: 5,
    windowMs: 15 * 60 * 1000,
    // Never degrade to a per-instance counter for admin credentials.
    failClosed: true,
  })

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendJson(res, 429, {
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many admin login attempts. Please try again later.',
    })
  }

  if (!process.env.ADMIN_SESSION_SECRET) {
    return sendJson(res, 500, {
      success: false,
      error: 'ADMIN_CONFIG_MISSING',
      message: 'Admin authentication environment variables are not configured.',
    })
  }

  const admin = await validateAdminCredentials(email, password)

  if (!admin) {
    console.warn(`[admin-auth] Failed login attempt for ${email || 'unknown-email'} from ${ipAddress}.`)
    return sendJson(res, 401, {
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid admin credentials.',
    })
  }

  const session = await createAdminSessionRecord(admin, req)
  const token = createAdminToken(admin, session)

  await logAdminActivity(
    {
      admin_id: admin.id,
      session_id: session.id,
      name: admin.name,
      email: admin.email,
    },
    {
      action_type: 'login',
      resource_type: 'admin_session',
      resource_id: session.id || session.session_token_id,
      details: {
        auth_source: admin.auth_source,
      },
    },
  ).catch((error) => {
    console.warn('[admin-auth] Login succeeded but activity logging failed:', error.message)
  })

  return sendJson(res, 200, {
    success: true,
    token,
    data: {
      token,
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    },
  })
}

async function handleLogout(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  await logoutAdminSession(session)
  await logAdminActivity(session, {
    action_type: 'logout',
    resource_type: 'admin_session',
    resource_id: session.session_id || session.session_token_id,
  })

  return sendJson(res, 200, { success: true, data: { loggedOut: true } })
}

async function handleMe(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  return sendJson(res, 200, {
    success: true,
    data: {
      authenticated: true,
      admin: {
        id: session.admin_id,
        name: session.name,
        email: session.email,
        role: session.role,
      },
      login_at: session.login_at || null,
      expires_at:
        typeof session.exp === 'number' ? new Date(session.exp * 1000).toISOString() : null,
    },
  })
}

async function handleActivity(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  if (req.method === 'POST') {
    const body = await readJson(req)
    await logAdminActivity(session, {
      action_type: String(body.action_type || 'admin_activity'),
      resource_type: String(body.resource_type || 'admin'),
      resource_id: body.resource_id || null,
      details: body.details || {},
    })

    return sendJson(res, 201, {
      success: true,
      data: {
        logged: true,
      },
    })
  }

  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET', 'POST'])
  }

  const activity = await fetchAdminActivity(50)
  return sendJson(res, 200, {
    success: true,
    data: activity,
  })
}

async function handleForgotPassword(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const body = await readJson(req)
  const email = body.email?.trim()
  const ipAddress = getClientIp(req)
  const rateLimit = await consumeRateLimit(`admin-password-reset:${ipAddress}`, {
    limit: 3,
    windowMs: 60 * 60 * 1000,
  })

  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendJson(res, 429, {
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many reset attempts. Please try again later.',
    })
  }

  const admin = await findAdminForPasswordReset(email)

  if (!email || !admin) {
    return sendJson(res, 200, {
      success: true,
      data: {
        message: 'If the email is authorized, reset instructions have been sent.',
      },
    })
  }

  const resetToken = await createPasswordResetToken(admin)
  const config = getBackendConfig()
  const recipients = Array.from(new Set([admin.email, getAdminBackupEmail()].filter(Boolean)))
  const emailHtml = `
    <h2>Archique admin password reset</h2>
    <p>A password reset was requested for the Archique admin dashboard.</p>
    <p><strong>Reset token:</strong> ${resetToken}</p>
    <p>This token expires in 30 minutes. If you did not request this, ignore this email.</p>
  `

  await Promise.allSettled(
    recipients.map((to) =>
      sendResendEmail({
        resendApiKey: config.resendApiKey,
        fromEmail: config.fromEmail,
        to,
        subject: 'Archique admin password reset token',
        html: emailHtml,
      }),
    ),
  )

  return sendJson(res, 200, {
    success: true,
    data: {
      message: 'Reset instructions have been sent to the admin recovery emails.',
    },
  })
}

async function handleResetPassword(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  const body = await readJson(req)
  const email = body.email?.trim()
  const token = body.token?.trim()
  const newPassword = body.new_password || ''

  if (!email || !token || !newPassword) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_REQUEST',
      message: 'Email, token, and new_password are required.',
    })
  }

  if (!isStrongPassword(newPassword)) {
    return sendJson(res, 400, {
      success: false,
      error: 'WEAK_PASSWORD',
      message:
        'New password must be at least 12 characters and include uppercase, lowercase, number, and symbol.',
    })
  }

  const admin = await consumePasswordResetToken(token, email)
  if (!admin) {
    return sendJson(res, 401, {
      success: false,
      error: 'INVALID_RESET_TOKEN',
      message: 'Reset token is invalid or expired.',
    })
  }

  await updateAdminPassword(admin, newPassword)
  await logAdminActivity(
    {
      admin_id: admin.id,
      session_id: null,
      name: admin.name,
      email: admin.email,
    },
    {
      action_type: 'password_reset',
      resource_type: 'admin',
      resource_id: admin.id || admin.email,
    },
  ).catch(() => null)

  return sendJson(res, 200, {
    success: true,
    data: {
      message: 'Password reset successful.',
    },
  })
}

/**
 * Per-artwork engagement, aggregated from the analytics event stream.
 *
 * Answers the questions the dashboard could not: which pieces are people
 * actually opening, which ones hold attention, and which get shown a lot but
 * clicked rarely. Impressions come from `recommendation_shown`, so the
 * click-through rate is genuinely "of the times we surfaced it".
 */
function buildArtworkEngagement(events, artworks) {
  const titleById = new Map(artworks.map((a) => [Number(a.id), a.title || `#${a.id}`]))
  const stats = new Map()

  const bucket = (id) => {
    const key = Number(id)
    if (!stats.has(key)) {
      stats.set(key, {
        artwork_id: key,
        title: titleById.get(key) || `#${key}`,
        impressions: 0,
        views: 0,
        clicks: 0,
        opens: 0,
        saves: 0,
        dwell_total_ms: 0,
        dwell_samples: 0,
      })
    }
    return stats.get(key)
  }

  events.forEach((event) => {
    const meta = event?.metadata || {}
    const artworkId = meta.artwork_id
    if (artworkId === undefined || artworkId === null || Number.isNaN(Number(artworkId))) {
      return
    }
    const row = bucket(artworkId)

    switch (event.event_type) {
      case 'recommendation_shown':
        row.impressions += 1
        break
      case 'artwork_view':
        row.views += 1
        break
      case 'artwork_click':
      case 'recommendation_clicked':
        row.clicks += 1
        break
      case 'favorite_added':
      case 'recommendation_saved':
        row.saves += 1
        break
      case 'product_open': {
        row.opens += 1
        const dwell = Number(meta.dwell_time_ms)
        if (Number.isFinite(dwell) && dwell > 0 && dwell < 30 * 60 * 1000) {
          row.dwell_total_ms += dwell
          row.dwell_samples += 1
        }
        break
      }
      default:
        break
    }
  })

  return [...stats.values()]
    .map((row) => ({
      artwork_id: row.artwork_id,
      title: row.title,
      impressions: row.impressions,
      views: row.views,
      clicks: row.clicks,
      opens: row.opens,
      saves: row.saves,
      avg_dwell_seconds: row.dwell_samples
        ? Math.round(row.dwell_total_ms / row.dwell_samples / 1000)
        : 0,
      click_through_rate: row.impressions
        ? Number(((row.clicks / row.impressions) * 100).toFixed(1))
        : 0,
    }))
    .filter((row) => row.impressions + row.views + row.clicks + row.opens > 0)
    .sort((left, right) => right.clicks - left.clicks || right.views - left.views)
    .slice(0, 15)
}

async function handleDashboard(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  const orders = await fetchOrderAnalyticsRows()
  const users = await fetchUserAccounts().catch(() => [])
  const loginEvents = await fetchUserLoginEvents(1000).catch(() => [])
  const [events, artworks] = await Promise.all([
    supabaseAdminRequest(
      'analytics_events?select=event_type,metadata&order=created_at.desc&limit=5000',
    ).catch(() => []),
    supabaseAdminRequest('artworks?select=id,title').catch(() => []),
  ])

  return sendJson(res, 200, {
    success: true,
    data: {
      ...buildDashboardAnalytics(orders),
      ...buildUserAnalytics(
        Array.isArray(users) ? users : [],
        Array.isArray(loginEvents) ? loginEvents : [],
      ),
      artwork_engagement: buildArtworkEngagement(
        Array.isArray(events) ? events : [],
        Array.isArray(artworks) ? artworks : [],
      ),
    },
  })
}

/**
 * Payment reconciliation feed.
 *
 * Surfaces `payment_logs` — in particular `orphan_payment` rows written by the
 * Razorpay webhook when money was captured but no order exists. Previously all
 * of this was written and never read, so a lost order was invisible.
 */
/**
 * Orders as CSV, for actually fulfilling them.
 *
 * Opens directly in Excel or Google Sheets, one row per order with the full
 * delivery address split out, so a batch of orders can be worked through or
 * handed to a courier without copying fields out of the dashboard by hand.
 */
function toCsvValue(value) {
  const text = value === null || value === undefined ? '' : String(value)
  // Escape quotes, and wrap anything containing a delimiter or newline.
  const escaped = text.replace(/"/g, '""')
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

async function handleOrdersExport(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
    })
  }

  const status = String(req.query?.status || '').trim()
  const filter = status && status !== 'all' ? `&payment_status=eq.${encodeURIComponent(status)}` : ''
  const rows = await supabaseAdminRequest(
    `orders?select=*&order=created_at.desc&limit=2000${filter}`,
  ).catch(() => [])

  const orders = Array.isArray(rows) ? rows : []

  const columns = [
    ['Order code', (o) => o.order_code || `#${o.id}`],
    ['Date', (o) => (o.created_at ? new Date(o.created_at).toISOString().slice(0, 10) : '')],
    ['Status', (o) => o.payment_status || ''],
    ['Artwork', (o) => o.product_title || ''],
    ['Artwork ID', (o) => o.product_id ?? ''],
    ['Total', (o) => Number(o.total_amount || 0)],
    ['Customer', (o) => o.customer_name || ''],
    ['Phone', (o) => o.customer_phone || ''],
    ['Email', (o) => o.customer_email || ''],
    ['Address', (o) => o.customer_address || ''],
    ['Gift', (o) => (o.is_gift ? 'YES - no prices in parcel' : '')],
    ['Gift recipient', (o) => o.gift_recipient_name || ''],
    ['Gift message', (o) => o.gift_message || ''],
    ['Coupon', (o) => o.coupon_code || ''],
    ['Payment ID', (o) => o.razorpay_payment_id || ''],
    ['Shipped on', (o) => (o.shipped_at ? new Date(o.shipped_at).toISOString().slice(0, 10) : '')],
    ['Delivered on', (o) => (o.delivered_at ? new Date(o.delivered_at).toISOString().slice(0, 10) : '')],
  ]

  const lines = [columns.map(([label]) => toCsvValue(label)).join(',')]
  orders.forEach((order) => {
    lines.push(columns.map(([, read]) => toCsvValue(read(order))).join(','))
  })

  await logAdminActivity(session, {
    action_type: 'orders_exported',
    resource_type: 'order',
    details: { count: orders.length, status: status || 'all' },
  })

  const filename = `archique-orders-${new Date().toISOString().slice(0, 10)}.csv`
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Cache-Control', 'no-store')
  // A BOM so Excel opens UTF-8 (and the rupee sign) correctly.
  res.status(200).send('\uFEFF' + lines.join('\r\n'))
  return null
}

async function handlePaymentLogs(req, res) {
  const session = await requireAdminAuth(req, res)
  if (!session) {
    return null
  }

  if (req.method !== 'GET') {
    return sendJson(res, 405, {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
    })
  }

  const onlyUnresolved = String(req.query?.unresolved || '') === 'true'
  const filter = onlyUnresolved
    ? '&status=in.(orphan_payment,payment_mismatch,artwork_sold_race,invalid_signature)'
    : ''

  const logs = await supabaseAdminRequest(
    `payment_logs?select=*&order=created_at.desc&limit=200${filter}`,
  ).catch(() => [])

  const rows = Array.isArray(logs) ? logs : []
  const needsAttention = rows.filter((row) =>
    ['orphan_payment', 'payment_mismatch', 'artwork_sold_race', 'invalid_signature'].includes(
      row.status,
    ),
  )

  return sendJson(res, 200, {
    success: true,
    data: {
      logs: rows,
      needs_attention_count: needsAttention.length,
    },
  })
}

export default async function handler(req, res) {
  try {
    const pathname = getPathname(req)
    const action = getAction(req)

    if (matchesAdminRoute(pathname, '/login') && req.method === 'POST') {
      return await handleLogin(req, res)
    }

    if (matchesAdminRoute(pathname, '/logout') && req.method === 'POST') {
      return await handleLogout(req, res)
    }

    if (
      (matchesAdminRoute(pathname, '/me') || matchesAdminRoute(pathname, '/session')) &&
      req.method === 'GET'
    ) {
      return await handleMe(req, res)
    }

    if (matchesAdminRoute(pathname, '/forgot-password')) {
      return await handleForgotPassword(req, res)
    }

    if (matchesAdminRoute(pathname, '/reset-password')) {
      return await handleResetPassword(req, res)
    }

    if (matchesAdminRoute(pathname, '/dashboard')) {
      return await handleDashboard(req, res)
    }

    if (matchesAdminRoute(pathname, '/activity')) {
      return await handleActivity(req, res)
    }

    if (action === 'login') {
      return await handleLogin(req, res)
    }

    if (action === 'logout') {
      return await handleLogout(req, res)
    }

    if (action === 'me' || action === 'session') {
      return await handleMe(req, res)
    }

    if (action === 'forgot-password') {
      return await handleForgotPassword(req, res)
    }

    if (action === 'reset-password') {
      return await handleResetPassword(req, res)
    }

    if (action === 'dashboard') {
      return await handleDashboard(req, res)
    }

    if (action === 'activity') {
      return await handleActivity(req, res)
    }

    if (action === 'orders-export') {
      return await handleOrdersExport(req, res)
    }

    if (action === 'payment-logs') {
      return await handlePaymentLogs(req, res)
    }

    return sendJson(res, 405, {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
    })
  } catch (error) {
    // Surfaced rather than left in a log nobody reads.
    await reportServerError(error, { route: 'admin', action: getAction(req) }).catch(
      () => null,
    )

    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'ADMIN_REQUEST_FAILED',
      message: error.message || 'Unable to process admin request.',
    })
  }
}
