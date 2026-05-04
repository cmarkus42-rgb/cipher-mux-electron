// src/renderer/a11y/FocusMode.tsx
import { useEffect, useCallback } from 'preact/hooks'

interface FocusModeProps {
  enabled: boolean
  sessionName: string | null
  contextPct: number
  onDeactivate: () => void
}

/**
 * Focus Mode overlay — renders the compact status bar when active.
 * The actual 2x2 cell spanning is handled by SessionGrid via inline grid placement.
 */
export function FocusMode({ enabled, sessionName, contextPct, onDeactivate }: FocusModeProps) {
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

  if (!enabled) return null

  const ctxClass = contextPct >= 85 ? 'focus-bar__ctx--error' :
    contextPct >= 60 ? 'focus-bar__ctx--warn' : 'focus-bar__ctx--ok'

  return (
    <div class="focus-mode-bar" role="status" aria-label="Focus Mode aktiv">
      <span class="focus-bar__name">{sessionName ?? 'Session'}</span>
      <span class={`focus-bar__ctx ${ctxClass}`} aria-label={`Context: ${contextPct}%`}>
        CTX {contextPct}%
      </span>
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
