import { useState, useCallback, useEffect } from 'preact/hooks'
import type { ActiveView, ProjectInfo } from '../shared/types'
import { useSessions } from './hooks/useSessions'
import { useMessages } from './hooks/useMessages'
import { useContextUsage } from './hooks/useContextUsage'
import { useProjects } from './hooks/useProjects'
import { ActivityRail } from './components/ActivityRail'
import { CockpitView } from './components/CockpitView'
import { TerminalPane } from './components/TerminalPane'
import { ChatroomPanel } from './components/ChatroomPanel'
import { KickoffDialog } from './components/KickoffDialog'
import { StatusBar } from './components/StatusBar'

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('cockpit')
  const [chatroomVisible, setChatroomVisible] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const { sessions, startSession, stopSession } = useSessions()
  const { unreadCount } = useMessages()
  const contextUsages = useContextUsage()
  const { projects, scanning, rescan } = useProjects()
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
  }, [])

  const handleKickoff = useCallback(async (opts: {
    requirementsFile: string
    targetDir: string
    projectName: string
    autoInterview: boolean
  }) => {
    const api = (window as any).cipherMux
    await api.projects.kickoff(opts)
    setKickoffVisible(false)
    // Refresh project list so the new tile appears immediately
    await rescan()
  }, [rescan])

  // Cmd+N keyboard shortcut for kickoff dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'n') {
        e.preventDefault()
        setKickoffVisible((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleStartSession = useCallback(async (project: ProjectInfo) => {
    try {
      const session = await startSession({
        name: project.name,
        projectPath: project.path,
      })
      setActiveSessionId(session.id)
      setActiveView('terminal')
      // Auto-launch Claude in project sessions after terminal has time to resize
      const api = (window as any).cipherMux
      setTimeout(() => {
        api.terminal.write(session.id, 'claude --dangerously-skip-permissions\n')
      }, 1000)
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
            {activeView === 'terminal' && activeSession && (
              <TerminalPane
                sessionId={activeSession.id}
                sessionName={activeSession.name}
                contextUsage={contextUsages[activeSession.id]?.usedPercentage}
              />
            )}
            {activeView === 'terminal' && !activeSession && (
              <div class="empty-state">
                <div class="empty-state__title">Terminal</div>
                <div class="empty-state__text">No active session. Start a session from the Cockpit.</div>
              </div>
            )}
            {activeView === 'info' && <InfoView />}
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

function InfoView() {
  return (
    <div class="empty-state">
      <div class="empty-state__title">Info</div>
      <div class="empty-state__text">
        cipher-mux v0.2.0 — Electron-based command center for Claude Code projects.
      </div>
    </div>
  )
}
