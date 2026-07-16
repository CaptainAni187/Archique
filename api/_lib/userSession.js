import './loadEnv.js'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { getBackendConfig } from './env.js'
import { unauthorized } from './http.js'
import {
  createUserResetTokenRecord,
  fetchUserResetTokenByHash,
  markUserResetTokenUsed,
} from './supabaseAdmin.js'

const USER_SESSION_EXPIRES_IN = '7d'
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30

function hashResetToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function getUserSessionSecret() {
  const secret = getBackendConfig().userSessionSecret
  if (!secret || secret.length < 32) {
    const error = new Error('USER_SESSION_SECRET is not configured or is too weak (min 32 chars).')
    error.status = 500
    error.error = 'USER_SESSION_MISCONFIGURED'
    throw error
  }
  return secret
}

export async function hashUserPassword(password) {
  return bcrypt.hash(password, 10)
}

export async function validateUserPassword(password, passwordHash) {
  if (!password || !passwordHash) {
    return false
  }

  return bcrypt.compare(password, passwordHash)
}

export function createUserToken(user) {
  return jwt.sign(
    {
      role: 'user',
      id: user.id,
      email: normalizeEmail(user.email),
      name: user.name,
    },
    getUserSessionSecret(),
    {
      expiresIn: USER_SESSION_EXPIRES_IN,
    },
  )
}

export function getUserSessionFromToken(token) {
  if (!token) {
    return null
  }

  try {
    return jwt.verify(token, getUserSessionSecret())
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

export function requireUserAuth(req, res) {
  const token = getBearerToken(req)

  if (!token) {
    unauthorized(res, 'User authentication required.')
    return null
  }

  const session = getUserSessionFromToken(token)

  if (!session || session.role !== 'user' || !session.email) {
    unauthorized(res, 'Invalid or expired user token.')
    return null
  }

  return session
}

export async function createUserPasswordResetToken(user) {
  const token = crypto.randomBytes(32).toString('hex')

  await createUserResetTokenRecord({
    token_hash: hashResetToken(token),
    user_id: user?.id ?? null,
    email: normalizeEmail(user?.email),
    expires_at: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
  })

  return token
}

// Returns the token record (with user_id/email) if valid & unused, else null.
export async function consumeUserPasswordResetToken(token, email) {
  if (!token) {
    return null
  }

  const record = await fetchUserResetTokenByHash(hashResetToken(token))
  if (!record || record.used_at) {
    return null
  }

  const isExpired = new Date(record.expires_at).getTime() < Date.now()
  const emailMatches = normalizeEmail(record.email) === normalizeEmail(email)

  if (isExpired || !emailMatches) {
    return null
  }

  await markUserResetTokenUsed(record.id)
  return record
}

export { normalizeEmail }
