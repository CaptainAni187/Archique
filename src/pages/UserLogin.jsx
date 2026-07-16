import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  loginUser,
  signupUser,
  requestPasswordReset,
  resetPassword,
} from '../services/userAuthService'
import { continueWithGoogle, finalizeGoogleLogin } from '../services/supabaseAuthService'
import usePageMeta from '../hooks/usePageMeta'
import PasswordInput from '../components/PasswordInput'

function UserLogin() {
  usePageMeta({
    title: 'Account Login | Archiverse',
    description: 'Sign in or create an Archiverse account.',
  })

  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [showReset, setShowReset] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [resetNewPassword, setResetNewPassword] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [isResetSubmitting, setIsResetSubmitting] = useState(false)

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

  useEffect(() => {
    let isCancelled = false
    async function handleGoogleCallback() {
      const hasAccessToken = window.location.hash.includes('access_token=')
      const hasOauthError = window.location.hash.includes('error=')
      if (!hasAccessToken && !hasOauthError) {
        return
      }

      if (hasOauthError) {
        const errorParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
        setErrorMessage(errorParams.get('error_description') || 'Google login was cancelled.')
        window.history.replaceState({}, document.title, '/login')
        return
      }

      setIsGoogleLoading(true)
      try {
        await finalizeGoogleLogin()
        if (!isCancelled) {
          navigate('/account')
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.message || 'Unable to finish Google login.')
        }
      } finally {
        if (!isCancelled) {
          setIsGoogleLoading(false)
        }
      }
    }

    handleGoogleCallback()
    return () => {
      isCancelled = true
    }
  }, [navigate])

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
        await signupUser(form)
      } else {
        await loginUser(form)
      }

      navigate('/account')
    } catch (error) {
      setErrorMessage(error.message || 'Unable to authenticate.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="auth-card">
      <h2 className="section-title">
        {mode === 'signup' ? 'Create Account' : 'Account Login'}
      </h2>
      <p>Sign in to view your ARCHIVERSE orders.</p>

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
        <button
          type="button"
          className="btn-secondary"
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
        <Link to="/store" className="text-link-button">
          Back to Store
        </Link>
      </div>
    </section>
  )
}

export default UserLogin
