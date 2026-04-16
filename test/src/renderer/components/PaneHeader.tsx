interface PaneHeaderProps {
  sessionName: string
  contextUsage?: number // 0–100 percentage, placeholder
}

export function PaneHeader({ sessionName, contextUsage }: PaneHeaderProps) {
  return (
    <div class="tab-bar">
      <div class="tab-bar__tab tab-bar__tab--active">
        <span class="neon-dot neon-dot--ok" />
        <span>{sessionName}</span>
      </div>
      <div style={{ flex: 1 }} />
      {contextUsage != null && (
        <div
          class="tab-bar__tab"
          style={{ cursor: 'default', borderRight: 'none' }}
        >
          <span class="text-dim text-xs">CTX {contextUsage}%</span>
        </div>
      )}
    </div>
  )
}
