import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DeliveryAddressFields from '../components/DeliveryAddressFields'
import {
  loginUser,
  saveDeliveryProfile,
  signupUser,
  requestPasswordReset,
  resetPassword,
} from '../services/userAuthService'
import { continueWithGoogle } from '../services/supabaseAuthService'
import { OAUTH_ERROR_KEY } from '../constants/auth'
import usePageMeta from '../hooks/usePageMeta'
import PasswordInput from '../components/PasswordInput'

function UserLogin() {
  usePageMeta({
    title: 'Account Login | Archique',
    description: 'Sign in or create an Archique account.',
  })

  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  // A brand-new account has no phone or address, and asking at checkout is the
  // worst moment. Collect it once, right after signup, so the first purchase is
  // a single confirmation.
  const [needsDetails, setNeedsDetails] = useState(false)
  const [detailsForm, setDetailsForm] = useState({
    name: '', phone: '', email: '',
    address_line1: '', address_line2: '', landmark: '', city: '', state: '', pincode: '',
  })
  const [detailsError, setDetailsError] = useState('')
  const [isSavingDetails, setIsSavingDetails] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [isResetSubmitting, setIsResetSubmitting] = useState(false)

  // Show why a Google login failed, if the global handler recorded a reason.
  useEffect(() => {
    const oauthError = window.sessionStorage.getItem(OAUTH_ERROR_KEY)
    if (oauthError) {
      setErrorMessage(oauthError)
      window.sessionStorage.removeItem(OAUTH_ERROR_KEY)
    }
  }, [])

  const onRequestReset = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setResetMessage('')
    setIsResetSubmitting(true)

    try {
      const response = await requestPasswordReset(form.email.trim())
      setResetMessage(
        response.data?.message ||
          'If an account exists for this email, reset instructions have been sent.',
      )
    } catch (error) {
      setErrorMessage(error.message || 'Unable to request a password reset.')
    } finally {
      setIsResetSubmitting(false)
    }
  }

  const onResetPassword = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setResetMessage('')
    setIsResetSubmitting(true)

    try {
      const response = await resetPassword({
        email: form.email.trim(),
        token: resetToken.trim(),
        newPassword: resetNewPassword,
      })
      setResetMessage(response.data?.message || 'Password reset successful. You can now log in.')
      setResetToken('')
      setResetNewPassword('')
    } catch (error) {
      setErrorMessage(error.message || 'Unable to reset password.')
    } finally {
      setIsResetSubmitting(false)
    }
  }

  const onChange = (event) => {
    const { name, value } = event.target
    setForm((previous) => ({ ...previous, [name]: value }))
  }

  const onSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)

    try {
      if (mode === 'signup') {
        const user = await signupUser(form)
        setDetailsForm((previous) => ({
          ...previous,
          name: user?.name || form.name || '',
          email: user?.email || form.email || '',
        }))
        setNeedsDetails(true)
        return
      }

      const user = await loginUser(form)
      // An existing account that never supplied delivery details gets the same
      // one-time prompt rather than being ambushed at checkout.
      if (user && !user.delivery_profile_complete) {
        setDetailsForm((previous) => ({
          ...previous,
          name: user.name || '',
          email: user.email || '',
          phone: user.phone || '',
          address_line1: user.address_line1 || '',
          address_line2: user.address_line2 || '',
          landmark: user.landmark || '',
          city: user.city || '',
          state: user.state || '',
          pincode: user.pincode || '',
        }))
        setNeedsDetails(true)
        return
      }

      navigate('/account')
    } catch (error) {
      setErrorMessage(error.message || 'Unable to authenticate.')
    } finally {
      setIsSubmitting(false)
    }
  }


  const onDetailsField = (field, value) => {
    setDetailsForm((previous) => ({ ...previous, [field]: value }))
    setDetailsError('')
  }

  const onSaveDetails = async (event) => {
    event.preventDefault()
    setDetailsError('')
    setIsSavingDetails(true)
    try {
      await saveDeliveryProfile(detailsForm)
      navigate('/account')
    } catch (error) {
      setDetailsError(error.message || 'Could not save your details.')
    } finally {
      setIsSavingDetails(false)
    }
  }

  if (needsDetails) {
    return (
      <section className="auth-card auth-card-wide">
        <p className="eyebrow">ONE LAST STEP</p>
        <h2 className="section-title">Where should we deliver?</h2>
        <p className="section-copy">
          Saved to your account, so checkout is just a confirmation next time.
        </p>

        <form className="admin-form" onSubmit={onSaveDetails}>
          <DeliveryAddressFields values={detailsForm} onChange={onDetailsField} emailReadOnly />

          {detailsError ? <p className="status-message error">{detailsError}</p> : null}

          <div className="checkout-step-actions">
            <button type="submit" disabled={isSavingDetails}>
              {isSavingDetails ? 'Saving…' : 'Save and continue'}
            </button>
            <button
              type="button"
              className="text-link-button"
              onClick={() => navigate('/account')}
              disabled={isSavingDetails}
            >
              Skip for now
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section className="auth-card">
      <h2 className="section-title">
        {mode === 'signup' ? 'Create Account' : 'Account Login'}
      </h2>
      <p>Sign in to view your ARCHIQUE orders.</p>

      <form className="admin-form" onSubmit={onSubmit}>
        {mode === 'signup' ? (
          <label>
            Name
            <input name="name" value={form.name} onChange={onChange} required />
          </label>
        ) : null}
        <label>
          Email
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={onChange}
            required
          />
        </label>
        <label>
          Password
          <PasswordInput
            name="password"
            value={form.password}
            onChange={onChange}
            minLength={8}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
          />
        </label>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Please wait...' : mode === 'signup' ? 'Sign Up' : 'Login'}
        </button>

        <div className="auth-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="btn-provider"
          disabled={isGoogleLoading}
          onClick={async () => {
            setErrorMessage('')
            setIsGoogleLoading(true)
            try {
              await continueWithGoogle()
            } catch (error) {
              setErrorMessage(error.message || 'Unable to start Google login.')
              setIsGoogleLoading(false)
            }
          }}
        >
          <svg className="btn-provider-icon" aria-hidden="true">
            <use href="/icons.svg#google-icon" />
          </svg>
          {isGoogleLoading ? 'Redirecting...' : 'Continue with Google'}
        </button>
      </form>

      {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}

      {mode === 'login' ? (
        <div className="auth-link-row">
          <button
            type="button"
            className="text-link-button"
            onClick={() => {
              setErrorMessage('')
              setResetMessage('')
              setShowReset((current) => !current)
            }}
          >
            {showReset ? 'Hide password reset' : 'Forgot password?'}
          </button>
        </div>
      ) : null}

      {mode === 'login' && showReset ? (
        <div className="auth-reset-panel">
          <p className="auth-reset-hint">
            Enter your account email above, then request a reset token. We&apos;ll email you a
            token to set a new password.
          </p>
          <form className="admin-form" onSubmit={onRequestReset}>
            <button type="submit" className="btn-secondary" disabled={isResetSubmitting}>
              {isResetSubmitting ? 'Please wait...' : 'Email me a reset token'}
            </button>
          </form>
          <form className="admin-form" onSubmit={onResetPassword}>
            <label>
              Reset token
              <input
                name="reset_token"
                value={resetToken}
                onChange={(event) => setResetToken(event.target.value)}
                required
              />
            </label>
            <label>
              New password
              <PasswordInput
                name="reset_new_password"
                value={resetNewPassword}
                onChange={(event) => setResetNewPassword(event.target.value)}
                minLength={8}
                autoComplete="new-password"
                revealLabel="new password"
                required
              />
            </label>
            <button type="submit" disabled={isResetSubmitting}>
              {isResetSubmitting ? 'Updating...' : 'Set new password'}
            </button>
          </form>
          {resetMessage ? <p className="status-message success">{resetMessage}</p> : null}
        </div>
      ) : null}

      <div className="auth-link-row">
        <button
          type="button"
          className="text-link-button"
          onClick={() => {
            setErrorMessage('')
            setResetMessage('')
            setShowReset(false)
            setMode((current) => (current === 'login' ? 'signup' : 'login'))
          }}
        >
          {mode === 'login' ? 'Create an account' : 'Already have an account? Login'}
        </button>
      </div>
    </section>
  )
}

export default UserLogin
