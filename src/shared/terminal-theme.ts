// src/shared/terminal-theme.ts — xterm.js theme definitions
// Delegates to auto-generated palette map from the theme-playground.

import { TERMINAL_THEMES } from './terminal-themes.generated'
import type { ThemeName } from './grid-types'
import { LEGACY_THEME_ALIASES } from './grid-types'

export interface TerminalThemeColors {
  background: string
  foreground: string
  cursor: string
  selectionBackground?: string
  selectionForeground?: string
  selectionInactiveBackground?: string
  black: string; brightBlack: string
  white: string; brightWhite: string
  green: string; brightGreen: string
  red: string; brightRed: string
  yellow: string; brightYellow: string
  blue: string; brightBlue: string
  cyan: string; brightCyan: string
  magenta: string; brightMagenta: string
}

/** Returns xterm.js theme object for the current app theme. */
export function getTerminalTheme(theme: ThemeName | string): TerminalThemeColors {
  const resolved = LEGACY_THEME_ALIASES[theme] ?? theme
  return TERMINAL_THEMES[resolved] ?? TERMINAL_THEMES['cipher-ivory']
}
