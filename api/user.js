import { getBackendConfig, requireConfigValues } from './_lib/env.js'
import { methodNotAllowed, readJson, sendJson } from './_lib/http.js'
import { sendUserPasswordResetEmail, sendUserWelcomeEmail } from './_lib/notifications.js'
import { getClientIp, consumeRateLimit } from './_lib/rateLimit.js'
import { fetchSupabaseUserFromAccessToken } from './_lib/supabaseAuth.js'
import {
  consumeUserPasswordResetToken,
  createUserPasswordResetToken,
  createUserToken,
  hashUserPassword,
  normalizeEmail,
  requireUserAuth,
  validateUserPassword,
} from './_lib/userSession.js'
import {
  createUserAccount,
  createUserLoginEvent,
  createUserSavedArtwork,
  createUserCollection,
  createUserCollectionArtwork,
  createUserRoomProfile,
  deleteUserAccountById,
  deleteUserCollectionArtworkById,
  deleteUserCollectionById,
  deleteUserRoomProfileById,
  deleteUserSavedArtworkById,
  fetchRecentVisitorEventsByUserId,
  fetchUserByGoogleId,
  fetchUserById,
  fetchOrdersByCustomerEmail,
  fetchUserByEmail,
  fetchUserSavedArtworkByArtworkId,
  fetchUserSavedArtworksByUserId,
  fetchUserCollectionsByUserId,
  fetchUserCollectionArtworksByCollectionId,
  fetchUserRoomProfilesByUserId,
  fetchUserTasteProfileByUserId,
  fetchVisitorTasteProfileBySessionId,
  updateUserAccountById,
  updateVisitorEventsForSession,
  upsertUserTasteProfile,
} from './_lib/supabaseAdmin.js'
import { createEmptyTasteProfile } from '../shared/ai/core/index.js'

function getAction(req) {
  const queryAction = String(req.query?.action || '').trim().toLowerCase()
  if (queryAction) {
    return queryAction
  }

  const path = String(req.url || '').split('?')[0].replace(/\/+$/, '')
  const match = path.match(/\/api\/user\/([^/]+)$/)
  return String(match?.[1] || '').trim().toLowerCase()
}

function serializeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: normalizeEmail(user.email),
    provider: user.provider || 'email',
    avatar_url: user.avatar_url || null,
    last_login_at: user.last_login_at || null,
    login_count: Number(user.login_count || 0),
    taste_profile: user.taste_profile || null,
    digest_opt_in: user.digest_opt_in === true,
    digest_frequency: user.digest_frequency || 'weekly',
  }
}

function normalizeOrder(order) {
  return {
    ...order,
    total_amount: Number(order.total_amount),
    advance_amount: Number(order.advance_amount),
    processing_at: order.processing_at || null,
    shipped_at: order.shipped_at || null,
    delivered_at: order.delivered_at || null,
  }
}

function requireUserSessionSecret() {
  requireConfigValues({
    USER_SESSION_SECRET: getBackendConfig().userSessionSecret,
  })
}

function ensurePostWithCsrf(req, res) {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST'])
    return false
  }

  return ensureSameOriginRequest(req, res)
}

// Origin/CSRF validation without a method constraint. Callers that accept more
// than POST (e.g. POST + DELETE) use this directly — never spread `req` to fake
// the method, because `req.headers` is a prototype getter and would be lost.
function ensureSameOriginRequest(req, res) {
  const origin = String(req.headers?.origin || '')
  const host = String(req.headers?.host || '')
  const forwardedHost = String(req.headers?.['x-forwarded-host'] || '')

  if (origin && (host || forwardedHost)) {
    try {
      const originUrl = new URL(origin)
      const originHost = originUrl.host
      const originHostname = originUrl.hostname
      const allowedHosts = [host, forwardedHost]
        .flatMap((value) => String(value || '').split(','))
        .map((value) => value.trim())
        .filter(Boolean)

      const sameHostMatch = allowedHosts.includes(originHost)
      const localDevMatch =
        ['localhost', '127.0.0.1', '::1'].includes(originHostname) &&
        allowedHosts.some((allowedHost) => {
          const allowedHostname = allowedHost.split(':')[0]
          return ['localhost', '127.0.0.1', '::1'].includes(allowedHostname)
        })

      if (!sameHostMatch && !localDevMatch) {
        sendJson(res, 403, {
          success: false,
          error: 'CSRF_VALIDATION_FAILED',
          message: 'Origin validation failed.',
        })
        return false
      }
    } catch {
      sendJson(res, 403, {
        success: false,
        error: 'CSRF_VALIDATION_FAILED',
        message: 'Invalid request origin.',
      })
      return false
    }
  }

  return true
}

function getProviderAfterGoogleLink(existingProvider = 'email') {
  if (existingProvider === 'google' || existingProvider === 'email+google') {
    return existingProvider
  }
  return 'email+google'
}

async function trackLoginSuccess({ user, provider, req }) {
  const now = new Date().toISOString()
  await updateUserAccountById(user.id, {
    last_login_at: now,
    login_count: Number(user.login_count || 0) + 1,
  })
  await createUserLoginEvent({
    user_id: user.id,
    provider,
    login_at: now,
    ip_address: getClientIp(req),
    user_agent: String(req.headers['user-agent'] || ''),
  })
}

async function sendWelcomeEmailIfNeeded(user) {
  if (user.welcome_email_sent) {
    return
  }

  const config = getBackendConfig()
  const emailStatus = await sendUserWelcomeEmail({
    email: user.email,
    name: user.name,
    config,
  })

  if (emailStatus.delivered) {
    await updateUserAccountById(user.id, {
      welcome_email_sent: true,
    })
  }
}

async function mergeAnonymousProfileIntoUser({ sessionId, userId }) {
  const normalizedSessionId = String(sessionId || '').trim()
  if (!normalizedSessionId || !userId) {
    return
  }

  const anonymousProfile = await fetchVisitorTasteProfileBySessionId(normalizedSessionId)
  if (!anonymousProfile?.taste_profile) {
    await updateVisitorEventsForSession(normalizedSessionId, { user_id: userId })
    return
  }

  const existingUserProfile = await fetchUserTasteProfileByUserId(userId)
  const mergedProfile =
    existingUserProfile?.taste_profile && typeof existingUserProfile.taste_profile === 'object'
      ? {
          ...existingUserProfile.taste_profile,
          ...anonymousProfile.taste_profile,
          tags: {
            ...(existingUserProfile.taste_profile.tags || {}),
            ...(anonymousProfile.taste_profile.tags || {}),
          },
          categories: {
            ...(existingUserProfile.taste_profile.categories || {}),
            ...(anonymousProfile.taste_profile.categories || {}),
          },
        }
      : anonymousProfile.taste_profile || createEmptyTasteProfile()

  await upsertUserTasteProfile({
    user_id: userId,
    taste_profile: mergedProfile,
    source_session_ids: Array.from(
      new Set([...(existingUserProfile?.source_session_ids || []), normalizedSessionId]),
    ),
    updated_at: new Date().toISOString(),
  })

  await updateVisitorEventsForSession(normalizedSessionId, { user_id: userId })
}

async function handleSignup(req, res) {
  if (!ensurePostWithCsrf(req, res)) {
    return null
  }

  requireUserSessionSecret()

  const body = await readJson(req)
  const name = String(body.name || '').trim()
  const email = normalizeEmail(body.email)
  const password = String(body.password || '')

  if (!name || !email || !password) {
    return sendJson(res, 400, {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Name, email, and password are required.',
    })
  }

  if (password.length < 8) {
    return sendJson(res, 400, {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Password must be at least 8 characters.',
    })
  }

  const existingUser = await fetchUserByEmail(email)
  if (existingUser) {
    return sendJson(res, 409, {
      success: false,
      error: 'ACCOUNT_EXISTS',
      message: 'An account already exists for this email.',
    })
  }

  const user = await createUserAccount({
    name,
    email,
    password_hash: await hashUserPassword(password),
    provider: 'email',
  })

  await trackLoginSuccess({ user, provider: 'email', req })
  const nextUser = {
    ...user,
    login_count: Number(user.login_count || 0) + 1,
    last_login_at: new Date().toISOString(),
  }
  await sendWelcomeEmailIfNeeded(nextUser)

  const safeUser = serializeUser(nextUser)

  return sendJson(res, 201, {
    success: true,
    token: createUserToken(safeUser),
    user: safeUser,
  })
}

async function handleLogin(req, res) {
  if (!ensurePostWithCsrf(req, res)) {
    return null
  }

  requireUserSessionSecret()

  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  const password = String(body.password || '')
  const ipAddress = getClientIp(req)
  const rateLimit = await consumeRateLimit(`user-login:${ipAddress}`, {
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds))
    return sendJson(res, 429, {
      success: false,
      error: 'RATE_LIMITED',
      message: 'Too many login attempts. Please try again later.',
    })
  }

  const user = await fetchUserByEmail(email)
  const isValid = await validateUserPassword(password, user?.password_hash)
  if (user?.deleted_at) {
    return sendJson(res, 403, {
      success: false,
      error: 'ACCOUNT_DELETED',
      message: 'This account has been deleted.',
    })
  }

  if (user?.provider === 'google' && !user?.password_hash) {
    return sendJson(res, 409, {
      success: false,
      error: 'PROVIDER_CONFLICT',
      message: 'This account uses Google login. Continue with Google instead.',
    })
  }

  if (!user || !isValid) {
    console.warn(`[user-auth] Failed email login attempt for ${email || 'unknown-email'} from ${ipAddress}.`)
    return sendJson(res, 401, {
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    })
  }

  await trackLoginSuccess({ user, provider: 'email', req })
  const safeUser = serializeUser({
    ...user,
    login_count: Number(user.login_count || 0) + 1,
    last_login_at: new Date().toISOString(),
  })

  return sendJson(res, 200, {
    success: true,
    token: createUserToken(safeUser),
    user: safeUser,
  })
}

async function handleForgotPassword(req, res) {
  if (!ensurePostWithCsrf(req, res)) {
    return null
  }

  requireUserSessionSecret()

  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  const ipAddress = getClientIp(req)

  const rateLimit = await consumeRateLimit(`user-password-reset:${ipAddress}`, {
    limit: 5,
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

  // Always respond the same way to avoid leaking which emails have accounts.
  const genericResponse = () =>
    sendJson(res, 200, {
      success: true,
      data: {
        message: 'If an account exists for this email, reset instructions have been sent.',
      },
    })

  if (!email) {
    return genericResponse()
  }

  const user = await fetchUserByEmail(email)

  // Only email-based accounts (with a password) can reset. Google-only accounts
  // have no password to reset — silently no-op with the same generic response.
  if (user && !user.deleted_at && user.password_hash) {
    const token = await createUserPasswordResetToken(user)
    await sendUserPasswordResetEmail({
      email: user.email,
      name: user.name,
      token,
      config: getBackendConfig(),
    })
  }

  return genericResponse()
}

async function handleResetPassword(req, res) {
  if (!ensurePostWithCsrf(req, res)) {
    return null
  }

  requireUserSessionSecret()

  const body = await readJson(req)
  const email = normalizeEmail(body.email)
  const token = String(body.token || '').trim()
  const newPassword = String(body.new_password || body.password || '')

  if (!email || !token || !newPassword) {
    return sendJson(res, 400, {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Email, token, and new password are required.',
    })
  }

  if (newPassword.length < 8) {
    return sendJson(res, 400, {
      success: false,
      error: 'WEAK_PASSWORD',
      message: 'Password must be at least 8 characters.',
    })
  }

  const record = await consumeUserPasswordResetToken(token, email)
  if (!record) {
    return sendJson(res, 401, {
      success: false,
      error: 'INVALID_RESET_TOKEN',
      message: 'Reset token is invalid or expired.',
    })
  }

  const user = record.user_id ? await fetchUserById(record.user_id) : await fetchUserByEmail(email)
  if (!user || user.deleted_at) {
    return sendJson(res, 401, {
      success: false,
      error: 'INVALID_RESET_TOKEN',
      message: 'Reset token is invalid or expired.',
    })
  }

  await updateUserAccountById(user.id, {
    password_hash: await hashUserPassword(newPassword),
  })

  return sendJson(res, 200, {
    success: true,
    data: { message: 'Password reset successful. You can now log in.' },
  })
}

async function handleLogout(req, res) {
  if (!ensurePostWithCsrf(req, res)) {
    return null
  }

  return sendJson(res, 200, {
    success: true,
    message: 'Logged out.',
  })
}

async function handleGoogleExchange(req, res) {
  if (!ensurePostWithCsrf(req, res)) {
    return null
  }

  requireUserSessionSecret()
  const body = await readJson(req)
  const accessToken = String(body.access_token || '').trim()
  const sessionId = String(body.session_id || '').trim()
  const providerInput = String(body.provider || '').trim().toLowerCase()

  if (providerInput && providerInput !== 'google') {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_PROVIDER',
      message: 'Unsupported auth provider.',
    })
  }

  const supabaseUser = await fetchSupabaseUserFromAccessToken(accessToken)
  const identities = Array.isArray(supabaseUser?.identities) ? supabaseUser.identities : []
  const googleIdentity = identities.find((identity) => identity?.provider === 'google')
  const email = normalizeEmail(supabaseUser?.email)

  if (!supabaseUser || !googleIdentity || !email) {
    return sendJson(res, 401, {
      success: false,
      error: 'INVALID_GOOGLE_SESSION',
      message: 'Google authentication could not be verified.',
    })
  }

  const googleId = String(googleIdentity.id || googleIdentity.user_id || '').trim()
  if (!googleId) {
    return sendJson(res, 400, {
      success: false,
      error: 'INVALID_GOOGLE_IDENTITY',
      message: 'Google identity is missing required fields.',
    })
  }

  const fullName =
    String(supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '').trim() ||
    email.split('@')[0]
  const avatarUrl = String(supabaseUser.user_metadata?.avatar_url || '').trim() || null

  let user = await fetchUserByGoogleId(googleId)
  if (!user) {
    user = await fetchUserByEmail(email)
  }

  let isNewAccount = false
  if (!user) {
    user = await createUserAccount({
      name: fullName,
      email,
      password_hash: '',
      provider: 'google',
      google_id: googleId,
      avatar_url: avatarUrl,
    })
    isNewAccount = true
  } else {
    if (user.deleted_at) {
      return sendJson(res, 403, {
        success: false,
        error: 'ACCOUNT_DELETED',
        message: 'This account has been deleted.',
      })
    }
    const nextProvider = getProviderAfterGoogleLink(user.provider || 'email')
    user = await updateUserAccountById(user.id, {
      provider: nextProvider,
      google_id: googleId,
      avatar_url: avatarUrl || user.avatar_url || null,
      name: user.name || fullName,
    })
  }

  await trackLoginSuccess({ user, provider: 'google', req })
  await mergeAnonymousProfileIntoUser({ sessionId, userId: user.id })
  if (isNewAccount) {
    await sendWelcomeEmailIfNeeded({
      ...user,
      welcome_email_sent: false,
    })
  }

  const safeUser = serializeUser({
    ...user,
    login_count: Number(user.login_count || 0) + 1,
    last_login_at: new Date().toISOString(),
  })

  return sendJson(res, 200, {
    success: true,
    token: createUserToken(safeUser),
    user: safeUser,
  })
}

async function handleMe(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  const [userProfile, userAccount] = await Promise.all([
    fetchUserTasteProfileByUserId(session.id),
    fetchUserById(session.id),
  ])
  if (!userAccount || userAccount.deleted_at) {
    return sendJson(res, 401, {
      success: false,
      error: 'ACCOUNT_UNAVAILABLE',
      message: 'Account is no longer available.',
    })
  }
  return sendJson(res, 200, {
    success: true,
    authenticated: true,
    user: {
      ...serializeUser({
        ...userAccount,
        taste_profile: userProfile?.taste_profile || null,
      }),
      taste_profile: userProfile?.taste_profile || null,
    },
  })
}

async function handleSavedArtworks(req, res) {
  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  if (req.method === 'GET') {
    const saved = await fetchUserSavedArtworksByUserId(session.id)
    return sendJson(res, 200, {
      success: true,
      saved_artworks: saved,
    })
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
  }

  if (!ensureSameOriginRequest(req, res)) {
    return null
  }

  const body = await readJson(req)
  const artworkId = Number(body.artwork_id)
  if (!Number.isInteger(artworkId) || artworkId <= 0) {
    return sendJson(res, 400, {
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'A valid artwork_id is required.',
    })
  }

  if (req.method === 'POST') {
    const existing = await fetchUserSavedArtworkByArtworkId(session.id, artworkId)
    if (existing) {
      return sendJson(res, 200, { success: true, saved: existing, duplicated: true })
    }
    const saved = await createUserSavedArtwork({
      user_id: session.id,
      artwork_id: artworkId,
    })
    return sendJson(res, 201, { success: true, saved })
  }

  const existing = await fetchUserSavedArtworkByArtworkId(session.id, artworkId)
  if (!existing) {
    return sendJson(res, 200, { success: true, removed: false })
  }
  await deleteUserSavedArtworkById(existing.id)
  return sendJson(res, 200, { success: true, removed: true })
}

async function handleCollections(req, res) {
  const session = requireUserAuth(req, res)
  if (!session) return null

  if (req.method === 'GET') {
    const collections = await fetchUserCollectionsByUserId(session.id)
    const withItems = await Promise.all(
      collections.map(async (collection) => ({
        ...collection,
        items: await fetchUserCollectionArtworksByCollectionId(collection.id),
      })),
    )
    return sendJson(res, 200, { success: true, collections: withItems })
  }

  if (!ensureSameOriginRequest(req, res)) {
    return null
  }
  const body = await readJson(req)

  if (req.method === 'POST') {
    const name = String(body.name || '').trim()
    if (!name) {
      return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'Collection name is required.' })
    }
    const collection = await createUserCollection({
      user_id: session.id,
      name,
    })
    return sendJson(res, 201, { success: true, collection })
  }

  if (req.method === 'PUT') {
    const collectionId = Number(body.collection_id)
    const artworkId = Number(body.artwork_id)
    const comboId = body.combo_id || null
    if (!Number.isInteger(collectionId) || collectionId <= 0) {
      return sendJson(res, 400, { success: false, error: 'VALIDATION_ERROR', message: 'collection_id is required.' })
    }
    const item = await createUserCollectionArtwork({
      collection_id: collectionId,
      artwork_id: Number.isInteger(artworkId) && artworkId > 0 ? artworkId : null,
      combo_id: comboId || null,
    })
    return sendJson(res, 200, { success: true, item })
  }

  if (req.method === 'DELETE') {
    if (body.item_id) {
      await deleteUserCollectionArtworkById(Number(body.item_id))
      return sendJson(res, 200, { success: true, removed: true })
    }
    if (body.collection_id) {
      await deleteUserCollectionById(Number(body.collection_id))
      return sendJson(res, 200, { success: true, removed: true })
    }
  }

  return methodNotAllowed(res, ['GET', 'POST', 'PUT', 'DELETE'])
}

async function handleRoomProfiles(req, res) {
  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  if (req.method === 'GET') {
    const profiles = await fetchUserRoomProfilesByUserId(session.id)
    return sendJson(res, 200, { success: true, profiles })
  }

  if (!ensureSameOriginRequest(req, res)) {
    return null
  }

  const body = await readJson(req)

  if (req.method === 'POST') {
    const label = String(body.label || 'My Space').trim() || 'My Space'
    const spaceType = String(body.space_type || '').trim() || null
    const profile = body.profile && typeof body.profile === 'object' ? body.profile : {}
    const roomPersonality = String(body.room_personality || profile.room_personality || '').trim()

    if (!roomPersonality) {
      return sendJson(res, 400, {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'room_personality is required.',
      })
    }

    const saved = await createUserRoomProfile({
      user_id: session.id,
      label,
      space_type: spaceType,
      room_personality: roomPersonality,
      profile,
      updated_at: new Date().toISOString(),
    })

    return sendJson(res, 201, { success: true, profile: saved })
  }

  if (req.method === 'DELETE') {
    const profileId = Number(body.profile_id)
    if (!Number.isInteger(profileId) || profileId <= 0) {
      return sendJson(res, 400, {
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'profile_id is required.',
      })
    }
    await deleteUserRoomProfileById(profileId)
    return sendJson(res, 200, { success: true, removed: true })
  }

  return methodNotAllowed(res, ['GET', 'POST', 'DELETE'])
}

async function handlePersonalization(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  const [events, saved, tasteProfile] = await Promise.all([
    fetchRecentVisitorEventsByUserId(session.id, 180),
    fetchUserSavedArtworksByUserId(session.id),
    fetchUserTasteProfileByUserId(session.id),
  ])

  const recentViewedArtworkIds = Array.from(
    new Set(
      events
        .filter((event) => ['artwork_view', 'product_open'].includes(event.event_type))
        .map((event) => Number(event.artwork_id))
        .filter((value) => Number.isInteger(value) && value > 0),
    ),
  ).slice(0, 24)

  const recommendationEvents = events.filter((event) =>
    String(event.event_type || '').startsWith('recommendation_'),
  )

  return sendJson(res, 200, {
    success: true,
    data: {
      welcome_back_name: session.name,
      recent_viewed_artwork_ids: recentViewedArtworkIds,
      saved_artwork_ids: saved.map((item) => Number(item.artwork_id)).filter(Boolean),
      recommendation_interactions: recommendationEvents.length,
      taste_profile: tasteProfile?.taste_profile || null,
    },
  })
}

async function handleSettings(req, res) {
  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }

  if (!ensurePostWithCsrf(req, res)) {
    return null
  }

  const body = await readJson(req)
  const digestOptIn = body.digest_opt_in === true
  const digestFrequency = ['weekly', 'biweekly', 'monthly'].includes(body.digest_frequency)
    ? body.digest_frequency
    : 'weekly'
  const updated = await updateUserAccountById(session.id, {
    digest_opt_in: digestOptIn,
    digest_frequency: digestFrequency,
  })
  return sendJson(res, 200, {
    success: true,
    user: serializeUser(updated),
  })
}

async function handleExport(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }
  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }
  const [account, orders, saved, events, tasteProfile] = await Promise.all([
    fetchUserById(session.id),
    fetchOrdersByCustomerEmail(session.email),
    fetchUserSavedArtworksByUserId(session.id),
    fetchRecentVisitorEventsByUserId(session.id, 500),
    fetchUserTasteProfileByUserId(session.id),
  ])
  return sendJson(res, 200, {
    success: true,
    exported_at: new Date().toISOString(),
    data: {
      account: serializeUser({
        ...(account || {}),
        taste_profile: tasteProfile?.taste_profile || null,
      }),
      orders: orders.map(normalizeOrder),
      saved_artworks: saved,
      recommendation_events: events.filter((event) =>
        String(event.event_type || '').startsWith('recommendation_'),
      ),
      analytics_events: events,
    },
  })
}

async function handleDeleteAccount(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(res, ['POST'])
  }
  if (!ensurePostWithCsrf(req, res)) {
    return null
  }
  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  await updateUserAccountById(session.id, {
    deleted_at: new Date().toISOString(),
    email: `deleted-${session.id}-${Date.now()}@archiverse.local`,
    name: 'Deleted User',
    google_id: null,
    avatar_url: null,
    welcome_email_sent: true,
    digest_opt_in: false,
  })
  await deleteUserAccountById(session.id)

  return sendJson(res, 200, {
    success: true,
    deleted: true,
  })
}

async function handleOrders(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, ['GET'])
  }

  const session = requireUserAuth(req, res)
  if (!session) {
    return null
  }

  const orders = await fetchOrdersByCustomerEmail(session.email)

  return sendJson(res, 200, {
    success: true,
    orders: orders.map(normalizeOrder),
  })
}

export default async function handler(req, res) {
  try {
    const action = getAction(req)

    if (action === 'signup') {
      return await handleSignup(req, res)
    }

    if (action === 'login') {
      return await handleLogin(req, res)
    }

    if (action === 'forgot-password') {
      return await handleForgotPassword(req, res)
    }

    if (action === 'reset-password') {
      return await handleResetPassword(req, res)
    }

    if (action === 'logout') {
      return await handleLogout(req, res)
    }

    if (action === 'google-exchange') {
      return await handleGoogleExchange(req, res)
    }

    if (action === 'me') {
      return await handleMe(req, res)
    }

    if (action === 'orders') {
      return await handleOrders(req, res)
    }

    if (action === 'saved-artworks') {
      return await handleSavedArtworks(req, res)
    }

    if (action === 'personalization') {
      return await handlePersonalization(req, res)
    }

    if (action === 'collections') {
      return await handleCollections(req, res)
    }

    if (action === 'room-profiles') {
      return await handleRoomProfiles(req, res)
    }

    if (action === 'settings') {
      return await handleSettings(req, res)
    }

    if (action === 'export') {
      return await handleExport(req, res)
    }

    if (action === 'delete') {
      return await handleDeleteAccount(req, res)
    }

    return sendJson(res, 404, {
      success: false,
      error: 'ROUTE_NOT_FOUND',
      message: 'User route not found.',
    })
  } catch (error) {
    return sendJson(res, error.status || 500, {
      success: false,
      error: error.code || 'USER_REQUEST_FAILED',
      message: error.message || 'Unable to process user request.',
    })
  }
}
