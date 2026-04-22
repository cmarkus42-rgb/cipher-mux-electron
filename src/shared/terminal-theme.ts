// src/shared/terminal-theme.ts — xterm.js theme definitions
// Extracted from useTheme.ts so themes are testable without Preact.

import type { ThemeName } from './grid-types'

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
export function getTerminalTheme(theme: ThemeName): TerminalThemeColors {
  if (theme === 'dark') {
    return {
      background: '#222228',
      foreground: '#D8D8E0',
      cursor: '#5C9A6E',
      selectionBackground: 'rgba(92, 154, 110, 0.40)',
      selectionForeground: '#FFFFFF',
      black: '#222228', brightBlack: '#888898',
      white: '#D8D8E0', brightWhite: '#FFFFFF',
      green: '#5C9A6E', brightGreen: '#8CC8A0',
      red: '#D47080', brightRed: '#E08090',
      yellow: '#C07840', brightYellow: '#D09060',
      blue: '#60A0B8', brightBlue: '#70B0C8',
      cyan: '#60A0B8', brightCyan: '#70B0C8',
      magenta: '#A080C0', brightMagenta: '#A480C4',
    }
  }
  // Ivory theme — light terminal
  return {
    background: '#F5F5EC',
    foreground: '#1A1A1D',
    cursor: '#2d8a4e',
    selectionBackground: 'rgba(45, 138, 78, 0.45)',
    selectionForeground: '#1A1A1D',
    black: '#3A3A40', brightBlack: '#6A6A72',
    white: '#1A1A1D', brightWhite: '#000000',
    green: '#247842', brightGreen: '#1a6b38',
    red: '#cc0030', brightRed: '#aa0028',
    yellow: '#a84600', brightYellow: '#a04400',
    blue: '#006B7A', brightBlue: '#006070',
    cyan: '#006B7A', brightCyan: '#006070',
    magenta: '#7a4a90', brightMagenta: '#603878',
  }
}
