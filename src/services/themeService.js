const STORAGE_KEY = 'archiverse-theme'

export const THEMES = {
  light: 'light',
  dark: 'dark',
}

// Dark is the default: only an explicit stored 'light' opts out.
export function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === THEMES.light ? THEMES.light : THEMES.dark
  } catch {
    return THEMES.dark
  }
}

export function applyTheme(theme) {
  const resolved = theme === THEMES.dark ? THEMES.dark : THEMES.light
  const root = document.documentElement
  if (resolved === THEMES.dark) {
    root.setAttribute('data-theme', 'dark')
  } else {
    root.removeAttribute('data-theme')
  }
  root.dataset.themeResolved = resolved
}

export function setTheme(theme) {
  const resolved = theme === THEMES.dark ? THEMES.dark : THEMES.light
  applyTheme(resolved)
  try {
    localStorage.setItem(STORAGE_KEY, resolved)
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(
    new CustomEvent('archiverse-theme-change', { detail: resolved }),
  )
  return resolved
}

export function toggleTheme() {
  const next =
    getStoredTheme() === THEMES.dark ? THEMES.light : THEMES.dark
  return setTheme(next)
}

export function initTheme() {
  applyTheme(getStoredTheme())
}
