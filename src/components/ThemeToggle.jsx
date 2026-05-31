import { useCallback, useEffect, useState } from 'react'
import {
  THEMES,
  getStoredTheme,
  toggleTheme,
} from '../services/themeService'

function ThemeIcon({ isDark }) {
  if (isDark) {
    return (
      <svg
        className="theme-toggle-icon"
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="12" cy="12" r="4.25" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.7 4.7l1.55 1.55M17.75 17.75l1.55 1.55M2.5 12h2.2M19.3 12h2.2M4.7 19.3l1.55-1.55M17.75 6.25l1.55-1.55" />
      </svg>
    )
  }

  return (
    <svg
      className="theme-toggle-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14.8 3.2a7.2 7.2 0 1 0 7 11.6 6.2 6.2 0 1 1-7-11.6Z" />
    </svg>
  )
}

function ThemeToggle() {
  const [theme, setThemeState] = useState(getStoredTheme)

  const syncTheme = useCallback(() => {
    setThemeState(getStoredTheme())
  }, [])

  useEffect(() => {
    const onThemeChange = () => syncTheme()
    window.addEventListener('archiverse-theme-change', onThemeChange)
    return () =>
      window.removeEventListener('archiverse-theme-change', onThemeChange)
  }, [syncTheme])

  const isDark = theme === THEMES.dark

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => toggleTheme()}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={isDark}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <ThemeIcon isDark={isDark} />
      <span className="sr-only">
        {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      </span>
    </button>
  )
}

export default ThemeToggle
