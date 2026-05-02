import type { AdapterCapabilities, EntityId } from '../../shared/types'

interface PaneHeaderProps {
  sessionName: string
  contextUsage?: number // 0–100 percentage
  capabilities?: AdapterCapabilities
  entityId?: EntityId
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
}

function contextColorClass(pct: number): string {
  if (pct > 80) return 'text-ctx-error'
  if (pct >= 60) return 'text-ctx-warn'
  return 'text-accent'
}

export function PaneHeader({ sessionName, contextUsage, capabilities, entityId }: PaneHeaderProps) {
  const showContextUsage = capabilities?.['status-line'] !== false
  const entityColor = entityId ? ENTITY_COLORS[entityId] : undefined
  return (
    <div class="tab-bar" style={entityColor ? { borderLeft: `3px solid ${entityColor}` } : undefined}>
      <div class="tab-bar__tab tab-bar__tab--active">
        {entityColor
          ? <span class="neon-dot" style={{ background: entityColor, boxShadow: `0 0 4px ${entityColor}` }} />
          : <span class="neon-dot neon-dot--ok" />}
        <span>{sessionName}</span>
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
