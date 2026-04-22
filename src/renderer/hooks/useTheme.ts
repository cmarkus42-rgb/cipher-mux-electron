// src/renderer/hooks/useTheme.ts
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { ThemeName } from '../../shared/grid-types'
export { getTerminalTheme } from '../../shared/terminal-theme'

const api = () => (window as any).cipherMux

/** Manages theme state. Toggles body.theme-dark class and persists choice. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>('ivory')

  // Load persisted theme on mount
  useEffect(() => {
    api().config.get('ui').then((ui: any) => {
      const saved: ThemeName = ui?.theme === 'dark' ? 'dark' : 'ivory'
      setThemeState(saved)
      applyThemeClass(saved)
    }).catch(() => {})
  }, [])

  const persistTheme = useCallback((next: ThemeName) => {
    // Read current ui config first to avoid overwriting grid state
    api().config.get('ui').then((ui: any) => {
      api().config.set('ui', { ...ui, theme: next })
    }).catch((err: unknown) =>
      console.error('[useTheme] persist failed:', err),
    )
  }, [])

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next)
    applyThemeClass(next)
    persistTheme(next)
  }, [persistTheme])

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeName = prev === 'ivory' ? 'dark' : 'ivory'
      applyThemeClass(next)
      persistTheme(next)
      return next
    })
  }, [persistTheme])

  return { theme, setTheme, toggleTheme }
}

function applyThemeClass(theme: ThemeName): void {
  if (theme === 'dark') {
    document.body.classList.add('theme-dark')
  } else {
    document.body.classList.remove('theme-dark')
  }
}

