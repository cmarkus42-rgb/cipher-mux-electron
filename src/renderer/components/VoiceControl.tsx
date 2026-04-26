/**
 * VoiceControl — 3-state radio selector for voice modes: OFF / STT / COM.
 *
 * Sits in the StatusBar. Three square radio buttons with LED indicator
 * and session target display.
 */

import { useTranslation } from 'react-i18next'
import { useVoiceSession, type VoiceMode } from '../hooks/useVoiceSession'

interface VoiceControlProps {
  focusedSessionId: string | null
  focusedSessionName: string | null
  inline?: boolean
}

const MODES: VoiceMode[] = ['off', 'stt', 'com']
const MODE_LABELS: Record<VoiceMode, string> = {
  off: 'OFF',
  stt: 'STT',
  com: 'COM',
}

export function VoiceControl({ focusedSessionId, focusedSessionName, inline }: VoiceControlProps) {
  const { t } = useTranslation()
  const {
    mode,
    active,
    recording,
    processing,
    toast,
    error,
    switchMode,
  } = useVoiceSession(focusedSessionId, focusedSessionName)

  const ledClass = recording
    ? 'voice-led voice-led--recording'
    : processing
      ? 'voice-led voice-led--processing'
      : active
        ? 'voice-led voice-led--ready'
        : 'voice-led voice-led--off'

  return (
    <div class={`voice-pill${active ? ' voice-pill--active' : ''}${inline ? ' voice-pill--inline' : ''}`}>
      {/* Toast overlay */}
      {toast && (
        <div class={`voice-toast voice-toast--${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* Error display */}
      {error && !active && (
        <div class="voice-toast voice-toast--error" title={error}>
          {error.length > 60 ? error.slice(0, 60) + '...' : error}
        </div>
      )}

      {/* 3-state radio buttons */}
      <div class="voice-radio-group">
        {MODES.map(m => (
          <button
            key={m}
            class={`voice-radio${mode === m ? ' voice-radio--active' : ''}${m !== 'off' && mode === m ? ` voice-radio--${m}` : ''}`}
            onClick={() => switchMode(m)}
            title={t(`voiceControl.mode_${m}`, MODE_LABELS[m])}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>
      <span class={ledClass} />

      {/* Session target hint (STT mode, inline) */}
      {inline && active && focusedSessionName && mode === 'stt' && (
        <span class="voice-pill__target">{focusedSessionName}</span>
      )}

      {/* COM mode indicator */}
      {inline && mode === 'com' && (
        <span class="voice-pill__target">Voice Relay</span>
      )}
    </div>
  )
}
