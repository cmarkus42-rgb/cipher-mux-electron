/**
 * VoiceControl — Floating Pill for voice-to-session input.
 *
 * Sits bottom-left of the app. Shows a cyberpunk CSS toggle switch
 * with LED indicator. Expanded (when active): LED + mode badge + hint.
 * Toast overlays for transcription preview and dispatch feedback.
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

      {/* Toggle switch + LED */}
      <label
        class="voice-switch"
        title={active ? 'Disable voice input (Ctrl+Shift+Space to talk)' : 'Enable voice input'}
      >
        <input
          type="checkbox"
          checked={active}
          onChange={toggle}
        />
        <span class="voice-switch__track" />
      </label>
      <span class={ledClass} />

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
