import { createClient } from '@supabase/supabase-js'
import { getAnonymousSessionId } from './analyticsService'
import { backendRequest } from './backendApiService'

const USER_TOKEN_KEY = 'archiverse_user_token'
const USER_PROFILE_KEY = 'archiverse_user_profile'
export const OAUTH_ERROR_KEY = 'archiverse_oauth_error'

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-public-anon-key'

const hasValidSupabaseConfig =
  SUPABASE_URL !== 'https://your-project.supabase.co' &&
  SUPABASE_ANON_KEY !== 'your-public-anon-key'

// The SDK handles both PKCE (?code=) and implicit (#access_token=) callbacks,
// and parses whichever one Supabase returns out of the URL for us.
const supabase = hasValidSupabaseConfig
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

function ensureSupabaseConfig() {
  if (!supabase) {
    throw new Error('Google login is not configured yet.')
  }
}

function storeSession(payload) {
  localStorage.setItem(USER_TOKEN_KEY, payload.token)
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(payload.user))
}

export async function continueWithGoogle() {
  ensureSupabaseConfig()

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/login`,
      queryParams: { prompt: 'select_account' },
    },
  })

  if (error) {
    throw new Error(error.message || 'Unable to start Google login.')
  }
}

/**
 * Completes a Google login if Supabase has established a session.
 * Safe to call on any page load: returns null when there's nothing to do.
 */
export async function finalizeGoogleLogin() {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) {
    return null
  }

  const payload = await backendRequest('/api/user/google-exchange', {
    method: 'POST',
    body: JSON.stringify({
      provider: 'google',
      access_token: data.session.access_token,
      session_id: getAnonymousSessionId(),
    }),
  })

  storeSession(payload)

  // Drop any leftover OAuth params from the URL without forcing a route.
  window.history.replaceState({}, document.title, window.location.pathname)

  return payload.user
}

export async function signOutSupabase() {
  if (!supabase) {
    return
  }
  await supabase.auth.signOut().catch(() => null)
}
