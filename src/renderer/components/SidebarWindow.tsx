import { h } from 'preact'
import { useState, useCallback, useEffect } from 'preact/hooks'
import { useSessions } from '../hooks/useSessions'
import { useContextUsage } from '../hooks/useContextUsage'
import { useTheme } from '../hooks/useTheme'
import { SidebarPanel } from './SidebarPanel'

/**
 * Standalone window view for the detached sidebar.
 * Loaded via ?view=sidebar URL parameter.
 */
export function SidebarWindow() {
  useTheme() // sets body[data-theme] so CSS custom properties resolve correctly
  const { sessions } = useSessions()
  const contextUsages = useContextUsage()

  const orchestratorActive = sessions.some(s => s.name === 'Orchestrator' && s.status === 'active')
  const cyberFactoryActive = sessions.some(s => s.name === 'Cyber Factory' && s.status === 'active')
  const [voiceComState, setVoiceComState] = useState('idle')

  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.voice?.onComState) return
    const unsub = api.voice.onComState((state: string) => setVoiceComState(state))
    return () => unsub()
  }, [])

  // No auto-close: X-button closes completely, dock button reintegrates

  const handleAddToGrid = useCallback((sessionId: string) => {
    // In detached mode, adding to grid is not directly supported
    // (the grid lives in the main window). Log for now.
    console.log('[SidebarWindow] addToGrid requested for:', sessionId)
  }, [])

  const handleKillSession = useCallback(async (sessionId: string) => {
    const api = (window as any).cipherMux
    await api.sessions.stop(sessionId)
  }, [])

  const handleDock = useCallback(async () => {
    const api = (window as any).cipherMux
    await api.sidebar.dock()
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div class="drag-region" style={{ height: 28, flexShrink: 0 }} />
      <div class="sidebar-window__body">
        <SidebarPanel
          visible={true}
          orchestratorActive={orchestratorActive}
          cyberFactoryActive={cyberFactoryActive}
          sessions={sessions}
          gridSessionIds={[]}
          contextUsages={contextUsages}
          onAddToGrid={handleAddToGrid}
          onKillSession={handleKillSession}
          onReattach={handleDock}
          activeWorkspaceId={null}
          hasNotesCell={false}
          voiceComState={voiceComState}
        />
      </div>
    </div>
  )
}
