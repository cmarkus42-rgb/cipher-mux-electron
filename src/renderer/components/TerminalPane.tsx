import { useTerminal } from '../hooks/useTerminal'
import { PaneHeader } from './PaneHeader'

interface TerminalPaneProps {
  sessionId: string
  sessionName?: string
  contextUsage?: number
}

export function TerminalPane({ sessionId, sessionName, contextUsage }: TerminalPaneProps) {
  // ResizeObserver in useTerminal handles all container size changes,
  // including those triggered by window resize — no separate listener needed.
  const { terminalRef } = useTerminal(sessionId)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <PaneHeader sessionName={sessionName ?? sessionId} contextUsage={contextUsage} />
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      />
    </div>
  )
}
