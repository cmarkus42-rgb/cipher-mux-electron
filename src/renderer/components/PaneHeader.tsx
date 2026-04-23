import type { AdapterCapabilities } from '../../shared/types'

interface PaneHeaderProps {
  sessionName: string
  contextUsage?: number // 0–100 percentage
  capabilities?: AdapterCapabilities
}

function contextColorClass(pct: number): string {
  if (pct > 80) return 'text-ctx-error'
  if (pct >= 60) return 'text-ctx-warn'
  return 'text-accent'
}

export function PaneHeader({ sessionName, contextUsage, capabilities }: PaneHeaderProps) {
  const showContextUsage = capabilities?.['status-line'] !== false
  return (
    <div class="tab-bar">
      <div class="tab-bar__tab tab-bar__tab--active">
        <span class="neon-dot neon-dot--ok" />
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
