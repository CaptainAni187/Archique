import { getBackendConfig, requireConfigValues } from './env.js'

export async function fetchSupabaseUserFromAccessToken(accessToken) {
  const token = String(accessToken || '').trim()
  const config = getBackendConfig()
  const supabaseAnonKey = config.supabaseAnonKey

  requireConfigValues({
    SUPABASE_URL: config.supabaseUrl,
    VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
  })

  if (!token) {
    return null
  }

  const response = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
    method: 'GET',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
    },
  })

  if (!response.ok) {
    return null
  }

  const payload = await response.json().catch(() => null)
  return payload || null
}
