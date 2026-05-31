function formatPrice(price) {
  return `Rs. ${Number(price).toLocaleString()}`
}

function AdminDashboardTab({ dashboardStats }) {
  return (
    <section className="admin-tab-panel">
      <div className="stats-grid">
        <article className="stat-card">
          <p>Total Orders</p>
          <strong>{dashboardStats.total_orders}</strong>
        </article>
        <article className="stat-card">
          <p>Total Revenue</p>
          <strong>{formatPrice(dashboardStats.total_revenue)}</strong>
        </article>
        <article className="stat-card">
          <p>Artwork Sales Count</p>
          <strong>{dashboardStats.artwork_sales_count}</strong>
        </article>
        <article className="stat-card">
          <p>Unique Artworks Sold</p>
          <strong>{dashboardStats.unique_artworks_sold}</strong>
        </article>
        <article className="stat-card">
          <p>Total Accounts</p>
          <strong>{dashboardStats.total_accounts}</strong>
        </article>
        <article className="stat-card">
          <p>Google Accounts</p>
          <strong>{dashboardStats.google_accounts}</strong>
        </article>
        <article className="stat-card">
          <p>Email Accounts</p>
          <strong>{dashboardStats.email_accounts}</strong>
        </article>
        <article className="stat-card">
          <p>Daily Logins</p>
          <strong>{dashboardStats.daily_logins}</strong>
        </article>
      </div>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>Orders Per Day</h3>
        <div className="dashboard-daily-list">
          {dashboardStats.orders_per_day.length > 0 ? (
            dashboardStats.orders_per_day.map((item) => (
              <p key={item.date}>
                <span>{item.date}</span>
                <strong>{item.count}</strong>
              </p>
            ))
          ) : (
            <p>
              <span>No daily order data yet.</span>
              <strong>0</strong>
            </p>
          )}
        </div>
      </section>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>Top Viewed AI Signals</h3>
        <div className="dashboard-daily-list">
          {dashboardStats.top_categories.length > 0 ? (
            dashboardStats.top_categories.map((item) => (
              <p key={`category-${item.label}`}>
                <span>Category: {item.label}</span>
                <strong>{item.count}</strong>
              </p>
            ))
          ) : (
            <p>
              <span>No viewed category data yet.</span>
              <strong>0</strong>
            </p>
          )}
          {dashboardStats.top_tags.length > 0 ? (
            dashboardStats.top_tags.map((item) => (
              <p key={`tag-${item.label}`}>
                <span>Tag: {item.label}</span>
                <strong>{item.count}</strong>
              </p>
            ))
          ) : (
            <p>
              <span>No viewed tag data yet.</span>
              <strong>0</strong>
            </p>
          )}
        </div>
      </section>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>User Login Insights</h3>
        <div className="dashboard-daily-list">
          <p>
            <span>Total Logins</span>
            <strong>{dashboardStats.total_logins}</strong>
          </p>
          <p>
            <span>Google Logins</span>
            <strong>{dashboardStats.google_logins}</strong>
          </p>
          <p>
            <span>Email Logins</span>
            <strong>{dashboardStats.email_logins}</strong>
          </p>
          <p>
            <span>Active Users (7d)</span>
            <strong>{dashboardStats.active_users_7d}</strong>
          </p>
          <p>
            <span>Last Login</span>
            <strong>{dashboardStats.last_login_at || '-'}</strong>
          </p>
        </div>
      </section>

      <section className="order-detail-card dashboard-daily-orders">
        <h3>Latest Users</h3>
        <div className="dashboard-daily-list">
          {Array.isArray(dashboardStats.latest_users) && dashboardStats.latest_users.length > 0 ? (
            dashboardStats.latest_users.map((user) => (
              <p key={`latest-user-${user.id}`}>
                <span>
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt={user.name || user.email || `User ${user.id}`}
                      className="admin-user-avatar"
                    />
                  ) : null}
                  {user.name || user.email || `User ${user.id}`} ({user.provider})
                </span>
                <strong>{user.login_count}</strong>
              </p>
            ))
          ) : (
            <p>
              <span>No user records yet.</span>
              <strong>0</strong>
            </p>
          )}
        </div>
      </section>
    </section>
  )
}

export default AdminDashboardTab
