import { useState } from 'react'
import { resetTastePreferences } from '../services/tasteService'
import PasswordInput from './PasswordInput'

function AdminSettingsTab({
  adminSession,
  activityLogs,
  resetEmail,
  resetToken,
  newPassword,
  onChangePasswordField,
  onRequestResetToken,
  onSubmitPasswordReset,
  onLogout,
  onResetRecommendationData,
}) {
  const [preferenceMessage, setPreferenceMessage] = useState('')

  const onResetPreferences = async () => {
    if (onResetRecommendationData) {
      await onResetRecommendationData()
    } else {
      resetTastePreferences()
    }
    setPreferenceMessage('Preferences reset for this browser.')
  }

  return (
    <section className="admin-tab-panel">
      <section className="order-detail-card">
        <h3>Admin Identity</h3>
        <p>Email: {adminSession?.admin?.email || 'Unavailable'}</p>
        <p>Role: {adminSession?.admin?.role || 'admin'}</p>
        <p>Authenticated: {adminSession?.authenticated ? 'yes' : 'unknown'}</p>
        <p>
          Session Expires:{' '}
          {adminSession?.expires_at ? new Date(adminSession.expires_at).toLocaleString() : 'Unavailable'}
        </p>
      </section>

      <section className="order-detail-card">
        <h3>Visitor Preferences</h3>
        <p>Reset local recommendation signals stored in this browser.</p>
        <div className="btn-row">
          <button type="button" className="btn-secondary" onClick={onResetPreferences}>
            Reset Preferences
          </button>
        </div>
        {preferenceMessage ? <p>{preferenceMessage}</p> : null}
      </section>

      <form className="admin-form" onSubmit={onRequestResetToken}>
        <h3>Request Password Reset Token</h3>
        <label>
          Admin Email
          <input
            type="email"
            name="resetEmail"
            value={resetEmail}
            onChange={onChangePasswordField}
            required
          />
        </label>
        <div className="btn-row">
          <button type="submit">Generate Reset Token</button>
        </div>
      </form>

      <form className="admin-form" onSubmit={onSubmitPasswordReset}>
        <h3>Change Password</h3>
        <label>
          Reset Token
          <input
            type="text"
            name="resetToken"
            value={resetToken}
            onChange={onChangePasswordField}
            required
          />
        </label>
        <label>
          New Password
          <PasswordInput
            name="newPassword"
            value={newPassword}
            onChange={onChangePasswordField}
            autoComplete="new-password"
            revealLabel="new password"
            required
          />
        </label>
        <div className="btn-row">
          <button type="submit">Update Password</button>
          <button type="button" className="btn-secondary" onClick={onLogout}>
            Logout
          </button>
        </div>
      </form>

      <section className="order-detail-card">
        <h3>Recent Activity</h3>
        <div className="admin-list admin-list--compact">
          {activityLogs.length > 0 ? (
            activityLogs.map((entry) => (
              <article key={entry.id} className="admin-item order-item admin-item--compact">
                <div>
                  <h4>{entry.action_type}</h4>
                  <p>{entry.admin_name} ({entry.admin_email})</p>
                  <p>{entry.resource_type}{entry.resource_id ? ` #${entry.resource_id}` : ''}</p>
                  <p>{new Date(entry.created_at).toLocaleString()}</p>
                </div>
              </article>
            ))
          ) : (
            <p>No activity log entries yet.</p>
          )}
        </div>
      </section>
    </section>
  )
}

export default AdminSettingsTab
