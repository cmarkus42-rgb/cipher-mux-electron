import { useState, useCallback } from 'preact/hooks'
import type { ActiveView, ProjectInfo } from '../shared/types'
import { useSessions } from './hooks/useSessions'
import { useMessages } from './hooks/useMessages'
import { ActivityRail } from './components/ActivityRail'
import { CockpitView } from './components/CockpitView'
import { TerminalPane } from './components/TerminalPane'
import { ChatroomPanel } from './components/ChatroomPanel'

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('cockpit')
  const [chatroomVisible, setChatroomVisible] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)

  const { sessions, startSession, stopSession } = useSessions()
  const { unreadCount } = useMessages()

  const toggleChatroom = useCallback(() => {
    setChatroomVisible((v) => !v)
  }, [])

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

  const handleStartSession = useCallback(async (project: ProjectInfo) => {
    try {
      const session = await startSession({
        name: project.name,
        projectPath: project.path,
      })
      setActiveSessionId(session.id)
      setActiveView('terminal')
    } catch (err) {
      console.error('[App] Failed to start session:', err)
    }
  }, [startSession])

  const activeSession = activeSessionId
    ? sessions.find((s) => s.id === activeSessionId)
    : null

  const activeSessions = sessions.filter((s) => s.status === 'active')

  return (
    <div class="app-shell">
      {/* ── Drag Region / Title Bar ── */}
      <div class="drag-region">
        <span class="title">cipher-mux</span>
        <span class="title-version">v0.1.0</span>
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
          onViewChange={handleViewChange}
          onToggleChatroom={toggleChatroom}
          onSessionSelect={handleSessionSelect}
        />

        {/* Main Content */}
        <main class="main-content">
          <div class="content-viewport">
            {activeView === 'cockpit' && (
              <CockpitView
                sessions={sessions}
                onStartSession={handleStartSession}
              />
            )}
            {activeView === 'terminal' && activeSession && (
              <TerminalPane
                sessionId={activeSession.id}
                sessionName={activeSession.name}
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
      <div class="status-bar">
        <div class="status-bar__segment">
          <span class={`neon-dot ${activeSessions.length > 0 ? 'neon-dot--ok' : 'neon-dot--dim'}`} />
          <span>{activeSessions.length} session{activeSessions.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="status-bar__spacer" />
        <div class="status-bar__segment">
          <span>MCP: offline</span>
        </div>
      </div>
    </div>
  )
}

function InfoView() {
  return (
    <div class="empty-state">
      <div class="empty-state__title">Info</div>
      <div class="empty-state__text">
        cipher-mux v0.1.0 — Electron-based command center for Claude Code projects.
      </div>
    </div>
  )
}
