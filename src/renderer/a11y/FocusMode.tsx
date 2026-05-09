// src/renderer/a11y/FocusMode.tsx
import { useState, useEffect, useCallback } from 'preact/hooks'
import { getTerminalFontSize, setTerminalFontSize } from './terminal-font-size'

interface FocusModeProps {
  enabled: boolean
  sessionName: string | null
  contextPct: number
  onDeactivate: () => void
}

/**
 * Focus Mode control panel — renders when focus mode is active.
 * Full-screen expansion is handled by SessionGrid via grid placement.
 * This component provides the floating control bar with font size controls.
 */
export function FocusMode({ enabled, sessionName, contextPct, onDeactivate }: FocusModeProps) {
  const [fontSize, setFontSize] = useState(() => getTerminalFontSize())
  const [panelExpanded, setPanelExpanded] = useState(false)

  // Escape to deactivate
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && enabled) {
      e.preventDefault()
      e.stopPropagation()
      onDeactivate()
    }
  }, [enabled, onDeactivate])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [enabled, handleKeyDown])

  // Apply saved font size on activate, restore original on deactivate
  const originalFontSize = useState(() => getTerminalFontSize())[0]
  useEffect(() => {
    if (enabled) {
      setTerminalFontSize(fontSize)
    } else {
      setTerminalFontSize(originalFontSize)
    }
  }, [enabled, originalFontSize])

  const adjustFontSize = useCallback((delta: number) => {
    setFontSize(prev => {
      const next = Math.max(8, Math.min(36, prev + delta))
      setTerminalFontSize(next)
      return next
    })
  }, [])

  if (!enabled) return null

  const ctxClass = contextPct >= 85 ? 'focus-bar__ctx--error' :
    contextPct >= 60 ? 'focus-bar__ctx--warn' : 'focus-bar__ctx--ok'

  return (
    <div class="focus-mode-bar" role="status" aria-label="Focus Mode aktiv">
      <span class="focus-bar__name">{sessionName ?? 'Session'}</span>
      <span class={`focus-bar__ctx ${ctxClass}`} aria-label={`Context: ${contextPct}%`}>
        CTX {contextPct}%
      </span>

      <span class="focus-bar__sep">|</span>

      {/* Font size controls */}
      <button
        class="focus-bar__control"
        onClick={() => setPanelExpanded(!panelExpanded)}
        title="Font Size Controls"
      >
        Aa
      </button>
      {panelExpanded && (
        <span class="focus-bar__font-controls">
          <button class="focus-bar__font-btn" onClick={() => adjustFontSize(-2)} title="Smaller">-</button>
          <span class="focus-bar__font-size">{fontSize}px</span>
          <button class="focus-bar__font-btn" onClick={() => adjustFontSize(2)} title="Larger">+</button>
        </span>
      )}

      <span class="focus-bar__sep">|</span>

      <button
        class="focus-bar__exit"
        onClick={onDeactivate}
        title="Focus Mode beenden (Escape)"
        aria-label="Focus Mode beenden"
      >
        ESC
      </button>
    </div>
  )
}
