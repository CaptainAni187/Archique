const ADMIN_TOKEN_KEY = 'archiverse_admin_token'
const ADMIN_API = '/api/admin'

function adminAction(action) {
  return `${ADMIN_API}?action=${encodeURIComponent(action)}`
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY)
}

async function parseAuthResponse(response) {
  const rawText = await response.text()
  let payload = null

  try {
    payload = rawText ? JSON.parse(rawText) : null
  } catch {
    const normalizedText = rawText.trim().toLowerCase()
    const looksLikeHtml =
      normalizedText.startsWith('<!doctype') ||
      normalizedText.startsWith('<html') ||
      normalizedText.startsWith('<')

    if (response.ok && looksLikeHtml) {
      throw new Error(
        'Admin API is not returning JSON. Start `npm run dev:vercel` alongside `npm run dev`.',
      )
    }

    throw new Error(`Server error (${response.status}). Admin API may be unavailable.`)
  }

  if (import.meta.env.DEV) {
    console.log('API RESPONSE:', payload)
  }

  if (!payload || !response.ok || payload.success === false) {
    throw new Error(payload?.message || `Server error (${response.status}).`)
  }

  return payload
}

export async function loginAdmin(email, password) {
  const response = await fetch(adminAction('login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  })

  const payload = await parseAuthResponse(response)
  if (!payload.data?.token) {
    throw new Error('Server error')
  }
  localStorage.setItem(ADMIN_TOKEN_KEY, payload.data.token)
  return true
}

export async function logoutAdmin() {
  const token = getAdminToken()
  const response = await fetch(adminAction('logout'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token || ''}`,
    },
  })

  await parseAuthResponse(response)
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  return true
}

export async function isAdminAuthenticated() {
  try {
    const payload = await fetchAdminSession()
    return payload.data?.authenticated === true
  } catch {
    localStorage.removeItem(ADMIN_TOKEN_KEY)
    return false
  }
}

export async function fetchAdminSession() {
  const token = getAdminToken()
  if (!token) {
    throw new Error('Admin authentication required.')
  }

  const response = await fetch(adminAction('me'), {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return parseAuthResponse(response)
}

export async function requestAdminPasswordReset(email) {
  const response = await fetch(adminAction('forgot-password'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  })

  return parseAuthResponse(response)
}

export async function resetAdminPassword(email, token, newPassword) {
  const response = await fetch(adminAction('reset-password'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      token,
      new_password: newPassword,
    }),
  })

  return parseAuthResponse(response)
}
