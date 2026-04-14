import type { SessionInfo } from '../../shared/types'

interface StatusBarProps {
  sessions: SessionInfo[]
  mcpPort?: number
  mcpRunning?: boolean
  orchestratorRunning?: boolean
}

export function StatusBar({ sessions, mcpPort, mcpRunning, orchestratorRunning }: StatusBarProps) {
  const activeCount = sessions.filter((s) => s.status === 'active').length

  return (
    <div class="status-bar">
      <div class="status-bar__segment">
        <span class={`neon-dot ${activeCount > 0 ? 'neon-dot--ok' : 'neon-dot--dim'}`} />
        <span>{activeCount} session{activeCount !== 1 ? 's' : ''}</span>
      </div>

      <div class="status-bar__spacer" />

      <div class="status-bar__segment">
        <span class={`neon-dot ${orchestratorRunning ? 'neon-dot--info' : 'neon-dot--dim'}`} />
        <span>Orch: {orchestratorRunning ? 'running' : 'off'}</span>
      </div>

      <div class="status-bar__segment">
        <span class={`neon-dot ${mcpRunning ? 'neon-dot--ok' : 'neon-dot--dim'}`} />
        <span>MCP: {mcpRunning ? `port ${mcpPort}` : 'offline'}</span>
      </div>
    </div>
  )
}
