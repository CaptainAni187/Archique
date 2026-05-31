import { getAnonymousSessionId } from './analyticsService'
import { backendRequest } from './backendApiService'

const USER_TOKEN_KEY = 'archiverse_user_token'
const USER_PROFILE_KEY = 'archiverse_user_profile'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-public-anon-key'

const hasValidSupabaseConfig =
  SUPABASE_URL !== 'https://your-project.supabase.co' &&
  SUPABASE_ANON_KEY !== 'your-public-anon-key'

function ensureSupabaseConfig() {
  if (!hasValidSupabaseConfig) {
    throw new Error('Google login is not configured yet.')
  }
}

function storeSession(payload) {
  localStorage.setItem(USER_TOKEN_KEY, payload.token)
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(payload.user))
}

export async function continueWithGoogle() {
  ensureSupabaseConfig()
  const redirectTo = `${window.location.origin}/login`
  const authorizeUrl = new URL(`${SUPABASE_URL}/auth/v1/authorize`)
  authorizeUrl.searchParams.set('provider', 'google')
  authorizeUrl.searchParams.set('redirect_to', redirectTo)
  authorizeUrl.searchParams.set('response_type', 'token')
  authorizeUrl.searchParams.set('flow_type', 'implicit')
  authorizeUrl.searchParams.set('prompt', 'select_account')
  authorizeUrl.searchParams.set('scopes', 'email profile')
  authorizeUrl.searchParams.set('apikey', SUPABASE_ANON_KEY)

  window.location.assign(authorizeUrl.toString())
}

export async function finalizeGoogleLogin() {
  ensureSupabaseConfig()
  const hash = String(window.location.hash || '').replace(/^#/, '')
  const hashParams = new URLSearchParams(hash)
  const accessToken = hashParams.get('access_token')
  if (!accessToken) {
    return null
  }

  const payload = await backendRequest('/api/user/google-exchange', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      access_token: accessToken,
      session_id: getAnonymousSessionId(),
    }),
  })

  storeSession(payload)
  window.history.replaceState({}, document.title, '/login')

  return payload.user
}
