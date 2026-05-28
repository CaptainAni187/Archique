import { useState } from 'react'

function PasswordInput({ className = '', revealLabel = 'password', ...inputProps }) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className={`password-field ${className}`.trim()}>
      <input
        {...inputProps}
        type={isVisible ? 'text' : 'password'}
        autoCapitalize={inputProps.autoCapitalize || 'none'}
        autoCorrect={inputProps.autoCorrect || 'off'}
        spellCheck={inputProps.spellCheck ?? false}
      />
      <button
        type="button"
        className="password-toggle password-eye-toggle"
        onClick={() => setIsVisible((current) => !current)}
        aria-label={isVisible ? `Hide ${revealLabel}` : `Show ${revealLabel}`}
        aria-pressed={isVisible}
      >
        <svg
          className="password-eye-icon"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          {isVisible ? (
            <>
              <path d="M3.6 3.6 20.4 20.4" />
              <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7" />
              <path d="M8.5 5.6A10.9 10.9 0 0 1 12 5c4.7 0 8.2 4 9.4 7-0.5 1.2-1.4 2.6-2.7 3.8" />
              <path d="M15.4 18.1A10.8 10.8 0 0 1 12 18c-4.7 0-8.2-4-9.4-7 0.6-1.5 1.8-3.1 3.4-4.4" />
            </>
          ) : (
            <>
              <path d="M2.6 12c1.2-3 4.7-7 9.4-7s8.2 4 9.4 7c-1.2 3-4.7 7-9.4 7s-8.2-4-9.4-7Z" />
              <circle cx="12" cy="12" r="2.6" />
            </>
          )}
        </svg>
        <span className="sr-only">{isVisible ? 'Hide' : 'Show'}</span>
      </button>
    </div>
  )
}

export default PasswordInput
