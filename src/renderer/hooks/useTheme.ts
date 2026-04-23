// src/renderer/hooks/useTheme.ts
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { ThemeName } from '../../shared/grid-types'
import { LEGACY_THEME_ALIASES, DEFAULT_THEME } from '../../shared/grid-types'
export { getTerminalTheme } from '../../shared/terminal-theme'

const api = () => (window as any).cipherMux

const ALL_THEMES: ThemeName[] = [
  'cipher-ivory', 'cipher-dark',
  'blueprint', 'warm-paper',
  'gruvbox-dark', 'nord',
  'synthwave', 'matrix',
  'brutalist', 'high-contrast',
]

function isValidTheme(name: string): name is ThemeName {
  return (ALL_THEMES as string[]).includes(name)
}

/** Manages theme state. Sets body[data-theme] and persists choice. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME)

  // Load persisted theme on mount
  useEffect(() => {
    api().config.get('ui').then((ui: any) => {
      const raw: string = ui?.theme ?? 'ivory'
      const mapped = LEGACY_THEME_ALIASES[raw] ?? raw
      const resolved: ThemeName = isValidTheme(mapped) ? mapped : DEFAULT_THEME
      setThemeState(resolved)
      applyTheme(resolved)
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
    applyTheme(next)
    persistTheme(next)
  }, [persistTheme])

  /** Toggle between cipher-ivory and cipher-dark (convenience). */
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeName = prev === 'cipher-ivory' ? 'cipher-dark' : 'cipher-ivory'
      applyTheme(next)
      persistTheme(next)
      return next
    })
  }, [persistTheme])

  return { theme, setTheme, toggleTheme }
}

const LIGHT_THEMES: ThemeName[] = ['cipher-ivory', 'warm-paper', 'brutalist']

function applyTheme(theme: ThemeName): void {
  document.body.dataset.theme = theme
  // Compat: keep body.theme-dark for any remaining CSS that references it
  document.body.classList.toggle('theme-dark', !LIGHT_THEMES.includes(theme))
}
