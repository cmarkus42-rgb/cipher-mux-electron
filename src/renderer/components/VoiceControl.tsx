/**
 * VoiceControl — Floating Pill for voice-to-session input.
 *
 * Sits bottom-left of the app. Collapsed: mic icon with LED dot.
 * Expanded (when active): LED + mode badge + recording indicator.
 * Shows toast overlays for transcription preview and dispatch feedback.
 */

import { useVoiceSession } from '../hooks/useVoiceSession'

interface VoiceControlProps {
  focusedSessionId: string | null
  focusedSessionName: string | null
}

export function VoiceControl({ focusedSessionId, focusedSessionName }: VoiceControlProps) {
  const {
    active,
    recording,
    processing,
    toast,
    error,
    toggle,
  } = useVoiceSession(focusedSessionId, focusedSessionName)

  const ledClass = recording
    ? 'voice-led voice-led--recording'
    : processing
      ? 'voice-led voice-led--processing'
      : active
        ? 'voice-led voice-led--ready'
        : 'voice-led voice-led--off'

  return (
    <div class={`voice-pill${active ? ' voice-pill--active' : ''}`}>
      {/* Toast overlay */}
      {toast && (
        <div class={`voice-toast voice-toast--${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* Error display */}
      {error && !active && (
        <div class="voice-toast voice-toast--error">{error}</div>
      )}

      {/* Pill body */}
      <button
        class="voice-pill__btn"
        onClick={toggle}
        title={active ? 'Disable voice input (Ctrl+Shift+Space to talk)' : 'Enable voice input'}
      >
        <span class={ledClass} />
        <span class="voice-pill__icon">
          {recording ? '\u23FA' : '\u{1F3A4}'}
        </span>
      </button>

      {/* Expanded info */}
      {active && (
        <div class="voice-pill__info">
          <span class="voice-pill__mode">
            {focusedSessionName
              ? `Session: ${focusedSessionName}`
              : 'No session focused'}
          </span>
          <span class="voice-pill__hint">Ctrl+Shift+Space</span>
        </div>
      )}
    </div>
  )
}
