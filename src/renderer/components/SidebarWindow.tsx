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
  const mpoActive = sessions.some(s => s.name === 'MPO' && s.status === 'active')
  const [voiceComState, setVoiceComState] = useState('idle')

  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.voice?.onComState) return
    const unsub = api.voice.onComState((state: string) => setVoiceComState(state))
    return () => unsub()
  }, [])

  // Auto-close the detached window when there are no active sessions to display.
  // 3-second delay prevents flicker during brief session transitions.
  useEffect(() => {
    const hasContent = sessions.some(s => s.status === 'active')
    if (!hasContent) {
      const timer = setTimeout(() => {
        const api = (window as any).cipherMux
        api.sidebar?.reattach?.()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [sessions])

  const handleAddToGrid = useCallback((sessionId: string) => {
    // In detached mode, adding to grid is not directly supported
    // (the grid lives in the main window). Log for now.
    console.log('[SidebarWindow] addToGrid requested for:', sessionId)
  }, [])

  const handleKillSession = useCallback(async (sessionId: string) => {
    const api = (window as any).cipherMux
    await api.sessions.stop(sessionId)
  }, [])

  const handleReattach = useCallback(async () => {
    const api = (window as any).cipherMux
    await api.sidebar.reattach()
  }, [])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div class="drag-region" style={{ height: 28, flexShrink: 0 }} />
      <div class="sidebar-window__body">
        <SidebarPanel
          visible={true}
          orchestratorActive={orchestratorActive}
          mpoActive={mpoActive}
          sessions={sessions}
          gridSessionIds={[]}
          contextUsages={contextUsages}
          onAddToGrid={handleAddToGrid}
          onKillSession={handleKillSession}
          onReattach={handleReattach}
          activeWorkspaceId={null}
          hasNotesCell={false}
          voiceComState={voiceComState}
        />
      </div>
    </div>
  )
}
