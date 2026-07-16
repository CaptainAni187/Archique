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
    <h2>Archiverse admin password reset</h2>
    <p>A password reset was requested for the Archiverse admin dashboard.</p>
    <p><strong>Reset token:</strong> ${resetToken}</p>
    <p>This token expires in 30 minutes. If you did not request this, ignore this email.</p>
  `

  await Promise.allSettled(
    recipients.map((to) =>
      sendResendEmail({
        resendApiKey: config.resendApiKey,
        fromEmail: config.fromEmail,
        to,
        subject: 'Archiverse admin password reset token',
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
  return sendJson(res, 200, {
    success: true,
    data: {
      ...buildDashboardAnalytics(orders),
      ...buildUserAnalytics(
        Array.isArray(users) ? users : [],
        Array.isArray(loginEvents) ? loginEvents : [],
      ),
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

    return sendJson(res, 405, {
      success: false,
      error: 'METHOD_NOT_ALLOWED',
      message: 'Method not allowed.',
    })
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: error.error || 'ADMIN_REQUEST_FAILED',
      message: error.message || 'Unable to process admin request.',
    })
  }
}
