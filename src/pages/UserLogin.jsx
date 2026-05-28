import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { loginUser, signupUser } from '../services/userAuthService'
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
      </form>

      {errorMessage ? <p className="status-message error">{errorMessage}</p> : null}

      <div className="auth-link-row">
        <button
          type="button"
          className="text-link-button"
          onClick={() => {
            setErrorMessage('')
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
