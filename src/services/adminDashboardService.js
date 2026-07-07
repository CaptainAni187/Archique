import { backendAdminRequest } from './backendApiService'

const emptyDashboard = {
  total_orders: 0,
  total_revenue: 0,
  advance_revenue: 0,
  artwork_sales_count: 0,
  unique_artworks_sold: 0,
  orders_per_day: [],
  top_tags: [],
  top_categories: [],
  inspected_events: 0,
  total_accounts: 0,
  google_accounts: 0,
  email_accounts: 0,
  total_logins: 0,
  google_logins: 0,
  email_logins: 0,
  active_users_7d: 0,
  daily_logins: 0,
  last_login_at: null,
  recent_signups: [],
  recent_active_users: [],
  login_frequency: [],
  latest_users: [],
}

export async function fetchDashboardAnalytics() {
  const payload = await backendAdminRequest('/api/admin?action=dashboard')
  let aiSummary = {}

  try {
    const analyticsPayload = await backendAdminRequest('/api/analytics')
    aiSummary = analyticsPayload.data || {}
  } catch {
    aiSummary = {}
  }

  const dashboard = payload.data || {}

  return {
    ...emptyDashboard,
    ...dashboard,
    ...aiSummary,
    orders_per_day: Array.isArray(dashboard.orders_per_day)
      ? dashboard.orders_per_day
      : [],
    top_tags: Array.isArray(aiSummary.top_tags) ? aiSummary.top_tags : [],
    top_categories: Array.isArray(aiSummary.top_categories) ? aiSummary.top_categories : [],
  }
}

export { emptyDashboard }
