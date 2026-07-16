import './loadEnv.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { unauthorized } from './http.js'
import {
  createAdminResetTokenRecord,
  createAdminSession,
  fetchAdminByEmail,
  fetchAdminById,
  fetchAdminResetTokenByHash,
  fetchAdminSessionById,
  markAdminResetTokenUsed,
  updateAdminPasswordHash,
  updateAdminSessionById,
} from './supabaseAdmin.js'

const SESSION_EXPIRES_IN = '1h'
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30
// Best-effort in-memory store for the env bootstrap admin only (no DB row to
// persist to). Table-backed admins persist to the database.
let runtimePasswordHash = null

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET || ''
  if (!secret || secret.length < 32) {
    const error = new Error('ADMIN_SESSION_SECRET is not configured or is too weak (min 32 chars).')
    error.status = 500
    error.error = 'ADMIN_SESSION_MISCONFIGURED'
    throw error
  }
  return secret
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isMissingTableError(error, tableName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('relation') && message.includes(tableName.toLowerCase())
}

function isAdminStoreUnavailable(error, tableName) {
  // Fall back to the env bootstrap admin only in genuine deploy/bootstrap
  // states: the table doesn't exist yet (fresh project) OR Supabase isn't
  // configured at all (missing URL / service-role key). These are deploy-time
  // conditions, not attacker-inducible at runtime.
  //
  // Deliberately NOT included: 'fetch failed' / timeouts. A transient network
  // failure must not silently downgrade to the env-admin path, since an
  // attacker able to disrupt Supabase reachability could otherwise force it.
  const message = String(error?.message || '').toLowerCase()
  return (
    isMissingTableError(error, tableName) ||
    message.includes('supabase_url') ||
    message.includes('supabase_service_role_key')
  )
}

function getFallbackAdminEmail() {
  return normalizeEmail(process.env.ADMIN_EMAIL || '')
}

export function getAdminBackupEmail() {
  return normalizeEmail(process.env.ADMIN_BACKUP_EMAIL || '')
}

export function isAdminRecoveryEmail(email) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return false
  }
  const primary = getFallbackAdminEmail()
  const backup = getAdminBackupEmail()
  return (primary && normalizedEmail === primary) || (backup && normalizedEmail === backup)
}

function getPasswordHash() {
  if (runtimePasswordHash) {
    return runtimePasswordHash
  }

  const plainPassword = process.env.ADMIN_PASSWORD || ''
  return plainPassword ? bcrypt.hashSync(plainPassword, 10) : ''
}

function getFallbackAdminRecord() {
  const email = getFallbackAdminEmail()
  const passwordHash = getPasswordHash()

  if (!email || !passwordHash) {
    return null
  }

  return {
    id: null,
    name: 'Primary Admin',
    email,
    password_hash: passwordHash,
    role: 'admin',
    auth_source: 'env',
  }
}

function sanitizeAdmin(admin, authSource = 'table') {
  return {
    id: admin.id == null ? null : Number(admin.id),
    name: String(admin.name || admin.email || 'Admin').trim(),
    email: normalizeEmail(admin.email),
    role: String(admin.role || 'admin').trim().toLowerCase() || 'admin',
    auth_source: authSource,
  }
}

export async function validateAdminCredentials(email, password) {
  const normalizedInputEmail = normalizeEmail(email)

  if (!normalizedInputEmail || !password) {
    return null
  }

  try {
    const dbAdmin = await fetchAdminByEmail(normalizedInputEmail)

    if (dbAdmin && dbAdmin.is_active !== false) {
      const matches = await bcrypt.compare(password, String(dbAdmin.password_hash || ''))
      if (matches) {
        return sanitizeAdmin(dbAdmin, 'table')
      }

      return null
    }
  } catch (error) {
    if (!isAdminStoreUnavailable(error, 'admins')) {
      throw error
    }
  }

  const fallbackAdmin = getFallbackAdminRecord()
  if (!fallbackAdmin || normalizedInputEmail !== fallbackAdmin.email) {
    return null
  }

  const matches = await bcrypt.compare(password, fallbackAdmin.password_hash)
  return matches ? sanitizeAdmin(fallbackAdmin, 'env') : null
}

export async function findAdminByEmail(email) {
  const normalizedEmail = normalizeEmail(email)

  try {
    const dbAdmin = await fetchAdminByEmail(normalizedEmail)
    if (dbAdmin && dbAdmin.is_active !== false) {
      return sanitizeAdmin(dbAdmin, 'table')
    }
  } catch (error) {
    if (!isAdminStoreUnavailable(error, 'admins')) {
      throw error
    }
  }

  const fallbackAdmin = getFallbackAdminRecord()
  return fallbackAdmin?.email === normalizedEmail ? sanitizeAdmin(fallbackAdmin, 'env') : null
}

export async function findAdminForPasswordReset(email) {
  const normalizedEmail = normalizeEmail(email)

  if (!isAdminRecoveryEmail(normalizedEmail)) {
    return null
  }

  return findAdminByEmail(getFallbackAdminEmail())
}

export async function createAdminSessionRecord(admin, req) {
  const sessionTokenId = crypto.randomUUID()

  if (admin.auth_source !== 'table' || admin.id == null) {
    return {
      id: null,
      session_token_id: sessionTokenId,
      created_at: new Date().toISOString(),
      auth_source: 'env',
    }
  }

  const session = await createAdminSession({
    admin_id: admin.id,
    session_token_id: sessionTokenId,
    email: admin.email,
    name: admin.name,
    ip_address: req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '',
    user_agent: String(req?.headers?.['user-agent'] || ''),
  })

  return {
    ...session,
    auth_source: 'table',
  }
}

export function createAdminToken(admin, session) {
  return jwt.sign(
    {
      role: admin.role || 'admin',
      admin_id: admin.id,
      admin_name: admin.name,
      email: admin.email,
      auth_source: admin.auth_source || session?.auth_source || 'env',
      session_id: session?.id ?? null,
      session_token_id: session?.session_token_id ?? null,
      login_at: session?.created_at ?? new Date().toISOString(),
    },
    getSessionSecret(),
    {
      expiresIn: SESSION_EXPIRES_IN,
    },
  )
}

export function getAdminSessionFromToken(token) {
  if (!token) {
    return null
  }

  try {
    return jwt.verify(token, getSessionSecret())
  } catch {
    return null
  }
}

export function getBearerToken(req) {
  const authHeader = req.headers.authorization || ''
  return authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : ''
}

export async function requireAdminAuth(req, res) {
  const token = getBearerToken(req)

  if (!token) {
    unauthorized(res, 'Admin authentication required.')
    return null
  }

  const session = getAdminSessionFromToken(token)

  if (!session || session.role !== 'admin' || !session.email) {
    unauthorized(res, 'Invalid or expired admin token.')
    return null
  }

  if (session.auth_source === 'table' && session.admin_id != null && session.session_id != null) {
    try {
      const [dbAdmin, dbSession] = await Promise.all([
        fetchAdminById(session.admin_id),
        fetchAdminSessionById(session.session_id),
      ])

      if (
        !dbAdmin ||
        dbAdmin.is_active === false ||
        !dbSession ||
        dbSession.logged_out_at ||
        dbSession.session_token_id !== session.session_token_id
      ) {
        unauthorized(res, 'Invalid or expired admin token.')
        return null
      }

      await updateAdminSessionById(session.session_id, {
        last_seen_at: new Date().toISOString(),
      }).catch(() => null)

      return {
        admin_id: Number(dbAdmin.id),
        name: String(dbAdmin.name || dbAdmin.email || 'Admin').trim(),
        email: normalizeEmail(dbAdmin.email),
        role: String(dbAdmin.role || 'admin').trim().toLowerCase() || 'admin',
        auth_source: 'table',
        session_id: Number(dbSession.id),
        session_token_id: dbSession.session_token_id,
        login_at: dbSession.created_at || session.login_at || null,
        exp: session.exp,
      }
    } catch (error) {
      if (
        !isAdminStoreUnavailable(error, 'admins') &&
        !isAdminStoreUnavailable(error, 'admin_sessions')
      ) {
        throw error
      }
    }
  }

  const fallbackAdmin = getFallbackAdminRecord()

  if (!fallbackAdmin || session.email !== fallbackAdmin.email) {
    unauthorized(res, 'Invalid or expired admin token.')
    return null
  }

  return {
    admin_id: null,
    name: fallbackAdmin.name,
    email: fallbackAdmin.email,
    role: 'admin',
    auth_source: 'env',
    session_id: null,
    session_token_id: session.session_token_id || null,
    login_at: session.login_at || null,
    exp: session.exp,
  }
}

export async function createPasswordResetToken(admin) {
  const token = crypto.randomBytes(32).toString('hex')

  await createAdminResetTokenRecord({
    token_hash: hashResetToken(token),
    admin_email: normalizeEmail(admin?.email),
    admin_id: admin?.id ?? null,
    expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
  })

  return token
}

export async function consumePasswordResetToken(token, email) {
  if (!token) {
    return null
  }

  const record = await fetchAdminResetTokenByHash(hashResetToken(token))
  if (!record || record.used_at) {
    return null
  }

  const normalizedEmail = normalizeEmail(email)
  const backupEmail = getAdminBackupEmail()
  const isAllowedEmail =
    normalizeEmail(record.admin_email) === normalizedEmail ||
    (backupEmail && normalizedEmail === backupEmail)

  const isExpired = new Date(record.expires_at).getTime() < Date.now()

  if (isExpired || !isAllowedEmail) {
    return null
  }

  await markAdminResetTokenUsed(record.id)

  // Re-resolve the admin from the authoritative store so the returned record
  // matches the current DB/env state.
  return findAdminByEmail(record.admin_email)
}

export async function updateAdminPassword(admin, newPassword) {
  const passwordHash = bcrypt.hashSync(newPassword, 10)

  if (admin?.auth_source === 'table' && admin.id != null) {
    await updateAdminPasswordHash(admin.id, passwordHash)
    return
  }

  runtimePasswordHash = passwordHash
}

export async function logoutAdminSession(session) {
  if (session?.auth_source === 'table' && session.session_id != null) {
    await updateAdminSessionById(session.session_id, {
      logged_out_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
    })
  }
}

export function getAdminEmail() {
  return getFallbackAdminEmail()
}
