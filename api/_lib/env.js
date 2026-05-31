import './loadEnv.js'

function readEnv(name, fallback = '') {
  return process.env[name] || fallback
}

export function getBackendConfig() {
  return {
    supabaseUrl: readEnv('SUPABASE_URL', readEnv('VITE_SUPABASE_URL')),
    supabaseAnonKey: readEnv('VITE_SUPABASE_ANON_KEY'),
    supabaseServiceRoleKey: readEnv('SUPABASE_SERVICE_ROLE_KEY'),
    razorpayKeyId: readEnv('RAZORPAY_KEY_ID', readEnv('VITE_RAZORPAY_KEY_ID')),
    razorpayKeySecret: readEnv('RAZORPAY_KEY_SECRET'),
    adminNotificationWebhookUrl: readEnv('ADMIN_NOTIFICATION_WEBHOOK_URL'),
    adminNotificationEmail: readEnv('ADMIN_NOTIFICATION_EMAIL'),
    resendApiKey: readEnv('RESEND_API_KEY'),
    fromEmail: readEnv('FROM_EMAIL'),
    userSessionSecret: readEnv('USER_SESSION_SECRET', readEnv('ADMIN_SESSION_SECRET')),
  }
}

export function requireConfigValues(values) {
  for (const [key, value] of Object.entries(values)) {
    if (!value) {
      throw new Error(`Missing required environment variable: ${key}`)
    }
  }
}
