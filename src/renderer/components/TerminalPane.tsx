import { useEffect, useCallback } from 'preact/hooks'
import { useTerminal } from '../hooks/useTerminal'
import { PaneHeader } from './PaneHeader'

interface TerminalPaneProps {
  sessionId: string
  sessionName?: string
}

export function TerminalPane({ sessionId, sessionName }: TerminalPaneProps) {
  const { terminalRef, fit } = useTerminal(sessionId)

  const handleResize = useCallback(() => {
    fit()
  }, [fit])

  useEffect(() => {
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [handleResize])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      <PaneHeader sessionName={sessionName ?? sessionId} />
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
