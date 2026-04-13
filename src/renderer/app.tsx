import { useState, useCallback } from 'preact/hooks'
import type { ActiveView } from '../shared/types'

export function App() {
  const [activeView, setActiveView] = useState<ActiveView>('cockpit')
  const [chatroomVisible, setChatroomVisible] = useState(false)

  const toggleChatroom = useCallback(() => {
    setChatroomVisible((v) => !v)
  }, [])

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
        <nav class="activity-rail">
          <RailItem
            icon="◉"
            label="Cockpit"
            active={activeView === 'cockpit'}
            onClick={() => setActiveView('cockpit')}
          />
          <div class="activity-rail__spacer" />
          <RailItem
            icon="💬"
            label="Chat"
            active={chatroomVisible}
            onClick={toggleChatroom}
          />
          <RailItem icon="ℹ" label="Info" active={activeView === 'info'} onClick={() => setActiveView('info')} />
        </nav>

        {/* Main Content */}
        <main class="main-content">
          <div class="content-viewport">
            {activeView === 'cockpit' && <CockpitPlaceholder />}
            {activeView === 'terminal' && <TerminalPlaceholder />}
            {activeView === 'info' && <InfoPlaceholder />}
          </div>
        </main>

        {/* Chatroom Panel */}
        <aside class={`chatroom-panel ${chatroomVisible ? 'chatroom-panel--open' : ''}`}>
          <div class="chatroom-panel__header">
            <span>Chatroom</span>
          </div>
          <div class="chatroom-panel__messages">
            <div class="empty-state">
              <div class="empty-state__text">No messages yet</div>
            </div>
          </div>
          <div class="chatroom-panel__input">
            <input type="text" placeholder="Message..." disabled />
          </div>
        </aside>
      </div>

      {/* Status Bar */}
      <div class="status-bar">
        <div class="status-bar__segment">
          <span class="neon-dot neon-dot--ok" />
          <span>0 sessions</span>
        </div>
        <div class="status-bar__spacer" />
        <div class="status-bar__segment">
          <span>MCP: offline</span>
        </div>
      </div>
    </div>
  )
}

// ─── Placeholder Components ──────────────────────────────

function RailItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <div
      class={`activity-rail__item ${active ? 'activity-rail__item--active' : ''}`}
      onClick={onClick}
      title={label}
    >
      {icon}
    </div>
  )
}

function CockpitPlaceholder() {
  return (
    <div class="empty-state">
      <div class="empty-state__title">Cockpit</div>
      <div class="empty-state__text">
        No projects found. Configure scan paths or use Cmd+N to kick off a new project.
      </div>
      <button class="btn btn--primary">Scan Projects</button>
    </div>
  )
}

function TerminalPlaceholder() {
  return (
    <div class="empty-state">
      <div class="empty-state__title">Terminal</div>
      <div class="empty-state__text">No active session. Start a session from the Cockpit.</div>
    </div>
  )
}

function InfoPlaceholder() {
  return (
    <div class="empty-state">
      <div class="empty-state__title">Info</div>
      <div class="empty-state__text">
        cipher-mux v0.1.0 — Electron-based command center for Claude Code projects.
      </div>
    </div>
  )
}
