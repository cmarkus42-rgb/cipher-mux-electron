import { h } from 'preact'
import { useCallback } from 'preact/hooks'
import { useSessions } from '../hooks/useSessions'
import { useContextUsage } from '../hooks/useContextUsage'
import { SidebarPanel } from './SidebarPanel'

/**
 * Standalone window view for the detached sidebar.
 * Loaded via ?view=sidebar URL parameter.
 */
export function SidebarWindow() {
  const { sessions } = useSessions()
  const contextUsages = useContextUsage()

  const orchestratorActive = sessions.some(s => s.name === 'Orchestrator' && s.status === 'active')
  const mpoActive = sessions.some(s => s.name === 'MPO' && s.status === 'active')

  const handleAddToGrid = useCallback((sessionId: string) => {
    // In detached mode, adding to grid is not directly supported
    // (the grid lives in the main window). Log for now.
    console.log('[SidebarWindow] addToGrid requested for:', sessionId)
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div class="drag-region" style={{ height: 28, flexShrink: 0 }} />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <SidebarPanel
          visible={true}
          orchestratorActive={orchestratorActive}
          mpoActive={mpoActive}
          sessions={sessions}
          gridSessionIds={[]}
          contextUsages={contextUsages}
          onAddToGrid={handleAddToGrid}
        />
      </div>
    </div>
  )
}
