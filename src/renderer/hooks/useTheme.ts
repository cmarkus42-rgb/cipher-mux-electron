// src/renderer/hooks/useTheme.ts
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { ThemeName } from '../../shared/grid-types'

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

/** Returns xterm.js theme object for the current app theme. */
export function getTerminalTheme(theme: ThemeName) {
  if (theme === 'dark') {
    return {
      background: '#222228',
      foreground: '#D8D8E0',
      cursor: '#5C9A6E',
      selectionBackground: 'rgba(92, 154, 110, 0.25)',
      black: '#222228', brightBlack: '#6E6E80',
      white: '#D8D8E0', brightWhite: '#FFFFFF',
      green: '#5C9A6E', brightGreen: '#8CC8A0',
      red: '#B85060', brightRed: '#D06070',
      yellow: '#C07840', brightYellow: '#D09060',
      blue: '#5090A8', brightBlue: '#70B0C8',
      cyan: '#5090A8', brightCyan: '#70B0C8',
      magenta: '#8060A0', brightMagenta: '#A080C0',
    }
  }
  // Ivory theme — light terminal
  return {
    background: '#F5F5EC',
    foreground: '#1A1A1D',
    cursor: '#2d8a4e',
    selectionBackground: 'rgba(45, 138, 78, 0.20)',
    black: '#3A3A40', brightBlack: '#6A6A72',
    white: '#1A1A1D', brightWhite: '#000000',
    green: '#2d8a4e', brightGreen: '#1a6b38',
    red: '#cc0030', brightRed: '#aa0028',
    yellow: '#c05000', brightYellow: '#a04400',
    blue: '#006B7A', brightBlue: '#006070',
    cyan: '#006B7A', brightCyan: '#006070',
    magenta: '#7a4a90', brightMagenta: '#603878',
  }
}
