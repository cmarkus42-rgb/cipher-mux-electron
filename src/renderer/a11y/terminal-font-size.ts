/**
 * terminal-font-size.ts — Manages terminal font size from a11y settings.
 *
 * Provides synchronous access to the current terminal font size for Terminal
 * construction, and dispatches a custom event when it changes so all open
 * terminals can update live.
 */

const DEFAULT_TERMINAL_FONT_SIZE = 13
let currentSize = DEFAULT_TERMINAL_FONT_SIZE

const api = () => (window as any).cipherMux

/** Load terminal font size from config (call once at app startup). */
export async function initTerminalFontSize(): Promise<void> {
  try {
    const a11y = await api().config.get('a11y')
    if (a11y?.terminalFontSize && typeof a11y.terminalFontSize === 'number') {
      currentSize = Math.max(8, Math.min(28, a11y.terminalFontSize))
    }
  } catch { /* use default */ }
}

/** Get current terminal font size synchronously. */
export function getTerminalFontSize(): number {
  return currentSize
}

/** Update terminal font size and notify all open terminals. */
export function setTerminalFontSize(size: number): void {
  const clamped = Math.max(8, Math.min(28, size))
  if (clamped === currentSize) return
  currentSize = clamped
  window.dispatchEvent(new CustomEvent('a11y:terminal-font-size', { detail: clamped }))
}
