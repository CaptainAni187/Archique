import { createAdminActivityLog, fetchAdminActivityLogs as fetchLogs } from './supabaseAdmin.js'

function isMissingTableError(error, tableName) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('relation') && message.includes(tableName.toLowerCase())
}

function isActivityStoreUnavailable(error, tableName) {
  const message = String(error?.message || '').toLowerCase()
  return (
    isMissingTableError(error, tableName) ||
    message.includes('schema cache') ||
    message.includes('action_type') ||
    message.includes('admin_activity_logs') ||
    message.includes('supabase_url') ||
    message.includes('supabase_service_role_key') ||
    message.includes('fetch failed')
  )
}

export async function logAdminActivity(session, activity) {
  if (!session) {
    return null
  }

  try {
    return await createAdminActivityLog({
      admin_id: session.admin_id,
      admin_session_id: session.session_id,
      admin_name: session.name,
      admin_email: session.email,
      action_type: activity.action_type,
      resource_type: activity.resource_type,
      resource_id: activity.resource_id == null ? null : String(activity.resource_id),
      details: activity.details || {},
    })
  } catch (error) {
    if (isActivityStoreUnavailable(error, 'admin_activity_logs')) {
      return null
    }

    throw error
  }
}

export async function fetchAdminActivity(limit = 50) {
  try {
    return await fetchLogs(limit)
  } catch (error) {
    if (isActivityStoreUnavailable(error, 'admin_activity_logs')) {
      return []
    }

    throw error
  }
}
