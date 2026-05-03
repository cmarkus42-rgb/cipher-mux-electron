import type { AdapterCapabilities, EntityId } from '../../shared/types'

interface PaneHeaderProps {
  sessionName: string
  contextUsage?: number // 0–100 percentage
  capabilities?: AdapterCapabilities
  entityId?: EntityId
  voiceState?: string   // idle | ready | user_speaking | recording | processing | agent_speaking
  isSpeaking?: boolean  // true when TTS audio is playing in renderer
}

/** Entity color mapping — matches EntityConfig.color values. */
const ENTITY_COLORS: Record<EntityId, string> = {
  orchestrator: '#4fc3f7',
  'cyber-factory': '#ab47bc',
  companion: '#ffb74d',
  refinement: '#ef5350',
  launcher: '#66bb6a',
  'voice-relay': '#9b59b6',
  audit: '#c0392b',
  'ideation-partner': '#26a69a',
  debugger: '#ff7043',
  'testing-assistant': '#2ecc71',
  bugreport: '#78909c',
}

function contextColorClass(pct: number): string {
  if (pct > 80) return 'text-ctx-error'
  if (pct >= 60) return 'text-ctx-warn'
  return 'text-accent'
}

/** Voice status dot class based on voice state. Returns empty string if not active. */
function voiceDotClass(voiceState: string | undefined, isSpeaking: boolean | undefined): string {
  if (isSpeaking) return 'voice-dot voice-dot--speaking'
  if (voiceState === 'user_speaking' || voiceState === 'recording') return 'voice-dot voice-dot--listening'
  if (voiceState === 'processing') return 'voice-dot voice-dot--processing'
  if (voiceState === 'ready') return 'voice-dot voice-dot--idle'
  return ''
}

/** Tooltip text for voice status dot. */
function voiceTooltip(voiceState: string | undefined, isSpeaking: boolean | undefined): string {
  if (isSpeaking) return 'Voice: Speaking'
  if (voiceState === 'user_speaking' || voiceState === 'recording') return 'Voice: Listening'
  if (voiceState === 'processing') return 'Voice: Processing'
  if (voiceState === 'ready') return 'Voice: Idle'
  return ''
}

export function PaneHeader({ sessionName, contextUsage, capabilities, entityId, voiceState, isSpeaking }: PaneHeaderProps) {
  const showContextUsage = capabilities?.['status-line'] !== false
  const entityColor = entityId ? ENTITY_COLORS[entityId] : undefined
  const dotClass = voiceDotClass(voiceState, isSpeaking)
  const voiceActive = voiceState != null && voiceState !== 'idle' && voiceState !== 'error'
  return (
    <div class="tab-bar" style={entityColor ? { borderLeft: `3px solid ${entityColor}` } : undefined}>
      <div class="tab-bar__tab tab-bar__tab--active">
        {entityColor
          ? <span class="neon-dot" style={{ background: entityColor, boxShadow: `0 0 4px ${entityColor}` }} />
          : <span class="neon-dot neon-dot--ok" />}
        <span>{sessionName}</span>
        {voiceActive && dotClass && (
          <span class={dotClass} title={voiceTooltip(voiceState, isSpeaking)} aria-hidden="true" />
        )}
      </div>
      <div style={{ flex: 1 }} />
      {showContextUsage && contextUsage != null && (
        <div
          class="tab-bar__tab"
          style={{ cursor: 'default', borderRight: 'none' }}
        >
          <span class={`text-xs ${contextColorClass(contextUsage)}`}>
            CTX {contextUsage}%
          </span>
        </div>
      )}
      {!showContextUsage && (
        <div
          class="tab-bar__tab"
          style={{ cursor: 'default', borderRight: 'none' }}
        >
          <span class="text-xs text-muted">CTX —</span>
        </div>
      )}
    </div>
  )
}
