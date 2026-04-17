import { useState, useCallback, useEffect, useMemo } from 'preact/hooks'
import type { ActiveView, ProjectInfo, SplitDirection } from '../shared/types'
import { useSessions } from './hooks/useSessions'
import { useMessages } from './hooks/useMessages'
import { useContextUsage } from './hooks/useContextUsage'
import { useProjects } from './hooks/useProjects'
import { useShortcuts } from './hooks/useShortcuts'
import { useLayout } from './hooks/useLayout'
import { ActivityRail } from './components/ActivityRail'
import { CockpitView } from './components/CockpitView'
import { TerminalPane } from './components/TerminalPane'
import { SplitContainer } from './components/SplitContainer'
import { ChatroomPanel } from './components/ChatroomPanel'
import { KickoffDialog } from './components/KickoffDialog'
import { SettingsView } from './components/SettingsView'
import { StatusBar } from './components/StatusBar'

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('cockpit')
  const [chatroomVisible, setChatroomVisible] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const { sessions, startSession, stopSession } = useSessions()
  const { unreadCount } = useMessages()
  const contextUsages = useContextUsage()
  const { projects, scanning, rescan } = useProjects()
  const { layout, splitPane, closePane, updateRatio, setActivePane, pruneInvalidPanes } = useLayout()
  const [mcpPort, setMcpPort] = useState<number | undefined>(undefined)
  const [orchestratorRunning, setOrchestratorRunning] = useState(false)
  const [kickoffVisible, setKickoffVisible] = useState(false)

  // Load MCP config to show port in status bar
  useEffect(() => {
    const api = (window as any).cipherMux
    api.config.get('mcp').then((cfg: any) => {
      if (cfg?.port) setMcpPort(cfg.port)
    })
  }, [])

  const toggleChatroom = useCallback(() => {
    setChatroomVisible((v) => !v)
  }, [])

  // Check orchestrator status on mount + listen for autostart
  useEffect(() => {
    const api = (window as any).cipherMux
    api.orchestrator.status().then((s: { running: boolean }) => {
      setOrchestratorRunning(s.running)
    })
    // Listen for orchestrator auto-start event from main process
    const unsub = api.orchestrator.onStarted(() => {
      setOrchestratorRunning(true)
    })
    return () => unsub()
  }, [])

  // Listen for kickoff completion — focus follow-up session and rescan projects.
  useEffect(() => {
    const api = (window as any).cipherMux
    const unsub = api.projects.onCompleted((data: any) => {
      if (data?.status === 'complete' && data.event?.followupSessionId) {
        setActiveSessionId(data.event.followupSessionId)
        setActiveView('terminal')
        // Project dir is now populated — refresh scan so the tile appears.
        rescan().catch((err) => console.error('[App] rescan failed:', err))
      } else if (data?.status === 'timeout') {
        console.warn('[App] Kickoff timed out:', data.handle)
      } else if (data?.status === 'error') {
        console.error('[App] Kickoff error:', data.error)
      }
    })
    return () => unsub()
  }, [rescan])

  const handleOrchestratorToggle = useCallback(async () => {
    const api = (window as any).cipherMux
    try {
      if (orchestratorRunning) {
        await api.orchestrator.stop()
        setOrchestratorRunning(false)
      } else {
        await api.orchestrator.start()
        setOrchestratorRunning(true)
      }
    } catch (err) {
      console.error('[App] Orchestrator toggle failed:', err)
      // Re-sync UI state with backend on error
      const status = await api.orchestrator.status()
      setOrchestratorRunning(status.running)
    }
  }, [orchestratorRunning])

  const handleViewChange = useCallback((view: ActiveView) => {
    setActiveView(view)
    if (view !== 'terminal') {
      setActiveSessionId(null)
    }
  }, [])

  const handleSessionSelect = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId)
    setActiveView('terminal')
    if (layout.root) {
      setActivePane(sessionId)
    }
  }, [layout.root, setActivePane])

  const handleKickoff = useCallback(async (req: {
    projectDir: string
    requirementsFile?: string
    extraContext?: string
  }) => {
    const api = (window as any).cipherMux
    // Main process starts the launcher session; we just close the dialog.
    // The focus switch to the follow-up session happens via the
    // PROJECT_KICKOFF_COMPLETED event listener below.
    await api.projects.kickoff(req)
    setKickoffVisible(false)
  }, [])

  const handleStartSession = useCallback(async (project: ProjectInfo) => {
    try {
      const session = await startSession({
        name: project.name,
        projectPath: project.path,
        // Claude is launched by the main process once the renderer reports
        // the real terminal size (TERMINAL_READY), so the TUI starts at the
        // correct cols/rows instead of tmux's default 80x24.
        autoLaunch: 'clear; claude --dangerously-skip-permissions\n',
      })
      setActiveSessionId(session.id)
      setActiveView('terminal')
    } catch (err) {
      console.error('[App] Failed to start session:', err)
    }
  }, [startSession])

  // Start a plain shell session in a user-selected directory (no claude)
  const handleAddSession = useCallback(async () => {
    const api = (window as any).cipherMux
    const dir = await api.dialog.openDir({ title: 'Session-Verzeichnis wählen' })
    if (!dir) return
    try {
      const name = dir.split('/').pop() || 'shell'
      const session = await startSession({
        name,
        projectPath: dir,
      })
      setActiveSessionId(session.id)
      setActiveView('terminal')
    } catch (err) {
      console.error('[App] Failed to start shell session:', err)
    }
  }, [startSession])

  // Split active pane in given direction
  const handleSplit = useCallback(async (direction: SplitDirection) => {
    const api = (window as any).cipherMux
    const dir = await api.dialog.openDir({ title: 'Session-Verzeichnis wählen' })
    if (!dir) return
    try {
      const name = dir.split('/').pop() || 'shell'
      const session = await startSession({ name, projectPath: dir })
      const targetSessionId = layout.activePaneId ?? activeSessionId
      if (targetSessionId) {
        splitPane(targetSessionId, direction, session.id)
      } else {
        // First split — create layout from scratch
        splitPane(session.id, direction, session.id)
        setActiveSessionId(session.id)
      }
      setActiveView('terminal')
    } catch (err) {
      console.error('[App] Failed to split:', err)
    }
  }, [startSession, layout.activePaneId, activeSessionId, splitPane])

  const handleClosePane = useCallback(() => {
    const target = layout.activePaneId
    if (!target) return
    closePane(target)
  }, [layout.activePaneId, closePane])

  // Prune layout when sessions change
  useEffect(() => {
    if (!layout.root) return
    const validIds = new Set(sessions.map((s) => s.id))
    pruneInvalidPanes(validIds)
  }, [sessions, layout.root, pruneInvalidPanes])

  const shortcutEntries = useMemo(() => {
    const entries = [
      { combo: 'Cmd+0', label: 'Cockpit', category: 'Navigation' as const, action: () => handleViewChange('cockpit') },
      { combo: 'Cmd+K', label: 'Chatroom toggle', category: 'Navigation' as const, action: toggleChatroom },
      { combo: 'Cmd+N', label: 'Neues Projekt', category: 'Aktionen' as const, action: () => setKickoffVisible((v) => !v) },
      { combo: 'Cmd+\\', label: 'Split vertikal', category: 'Layout' as const, action: () => handleSplit('vertical') },
      { combo: 'Cmd+-', label: 'Split horizontal', category: 'Layout' as const, action: () => handleSplit('horizontal') },
      { combo: 'Cmd+W', label: 'Pane schließen', category: 'Layout' as const, action: handleClosePane },
    ]
    // Cmd+1..9 — jump to session by index
    sessions.slice(0, 9).forEach((s, i) => {
      entries.push({
        combo: `Cmd+${i + 1}`,
        label: s.name,
        category: 'Navigation' as const,
        action: () => handleSessionSelect(s.id),
      })
    })
    return entries
  }, [handleViewChange, toggleChatroom, handleSplit, handleClosePane, sessions, handleSessionSelect])

  const registeredShortcuts = useShortcuts(shortcutEntries)

  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : null

  return (
    <div class="app-shell">
      {/* ── Drag Region / Title Bar ── */}
      <div class="drag-region">
        <span class="title">cipher-mux</span>
        <span class="title-version">v0.2.0</span>
      </div>

      {/* ── Body: Rail + Content + Chatroom ── */}
      <div class="app-body">
        {/* Activity Rail */}
        <ActivityRail
          activeView={activeView}
          sessions={sessions}
          chatroomVisible={chatroomVisible}
          activeSessionId={activeSessionId}
          unreadCount={unreadCount}
          orchestratorRunning={orchestratorRunning}
          onViewChange={handleViewChange}
          onToggleChatroom={toggleChatroom}
          onSessionSelect={handleSessionSelect}
          onOrchestratorToggle={handleOrchestratorToggle}
          onAddSession={handleAddSession}
        />

        {/* Main Content */}
        <main class="main-content">
          <div class="content-viewport">
            {activeView === 'cockpit' && (
              <CockpitView
                sessions={sessions}
                contextUsages={contextUsages}
                projects={projects}
                scanning={scanning}
                onRescan={rescan}
                onStartSession={handleStartSession}
              />
            )}
            {activeView === 'terminal' && layout.root && (
              <SplitContainer
                node={layout.root}
                path={[]}
                sessions={sessions}
                contextUsages={contextUsages}
                activePaneId={layout.activePaneId}
                onUpdateRatio={updateRatio}
                onPaneClick={setActivePane}
              />
            )}
            {activeView === 'terminal' && !layout.root && activeSession && (
              <TerminalPane
                sessionId={activeSession.id}
                sessionName={activeSession.name}
                contextUsage={contextUsages[activeSession.id]?.usedPercentage}
              />
            )}
            {activeView === 'terminal' && !layout.root && !activeSession && (
              <div class="empty-state">
                <div class="empty-state__title">Terminal</div>
                <div class="empty-state__text">No active session. Start a session from the Cockpit.</div>
              </div>
            )}
            {activeView === 'info' && <SettingsView onRescan={rescan} scanning={scanning} />}
          </div>
        </main>

        {/* Chatroom Panel */}
        <ChatroomPanel visible={chatroomVisible} />
      </div>

      {/* Status Bar */}
      <StatusBar sessions={sessions} mcpPort={mcpPort} mcpRunning={mcpPort != null} orchestratorRunning={orchestratorRunning} />

      {/* Kickoff Dialog (Cmd+N) */}
      <KickoffDialog
        visible={kickoffVisible}
        onClose={() => setKickoffVisible(false)}
        onKickoff={handleKickoff}
      />
    </div>
  )
}

