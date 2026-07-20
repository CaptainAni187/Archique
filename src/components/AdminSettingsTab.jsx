import { useEffect, useState } from 'react'
import { resetTastePreferences } from '../services/tasteService'
import { fetchShippingRates, updateShippingRates } from '../services/couponService'
import { getUserFriendlyError } from '../utils/userErrors'
import PasswordInput from './PasswordInput'

function DeliveryChargesSettings() {
  const [rates, setRates] = useState({ canvas: '', sketch: '' })
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isActive = true
    fetchShippingRates()
      .then((current) => {
        if (isActive && current) {
          setRates({ canvas: String(current.canvas ?? ''), sketch: String(current.sketch ?? '') })
        }
      })
      .catch((error) => {
        if (isActive) {
          setErrorMessage(getUserFriendlyError(error, 'Could not load delivery charges.'))
        }
      })
      .finally(() => {
        if (isActive) {
          setLoading(false)
        }
      })
    return () => {
      isActive = false
    }
  }, [])

  const onSubmit = async (event) => {
    event.preventDefault()
    setIsSaving(true)
    setMessage('')
    setErrorMessage('')

    try {
      await updateShippingRates({
        canvas: Number(rates.canvas),
        sketch: Number(rates.sketch),
      })
      setMessage('Delivery charges updated.')
    } catch (error) {
      setErrorMessage(getUserFriendlyError(error, 'Could not update delivery charges.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="admin-form" onSubmit={onSubmit}>
      <h3>Delivery Charges</h3>
      <p>Shipping cost added at checkout, by artwork category.</p>
      {loading ? (
        <p className="status-message">Loading...</p>
      ) : (
        <>
          <label>
            Canvas Shipping (Rs.)
            <input
              type="number"
              min="0"
              step="1"
              value={rates.canvas}
              onChange={(event) => setRates((current) => ({ ...current, canvas: event.target.value }))}
              required
            />
          </label>
          <label>
            Sketch Shipping (Rs.)
            <input
              type="number"
              min="0"
              step="1"
              value={rates.sketch}
              onChange={(event) => setRates((current) => ({ ...current, sketch: event.target.value }))}
              required
            />
          </label>
          <div className="btn-row">
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Delivery Charges'}
            </button>
          </div>
        </>
      )}
      {message ? <p className="status-message success">{message}</p> : null}
      {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}
    </form>
  )
}

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
        <DeliveryChargesSettings />
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
