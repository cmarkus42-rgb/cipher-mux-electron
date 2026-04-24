import { h } from 'preact'
import { useState } from 'preact/hooks'
import { useMessages } from '../hooks/useMessages'

interface SidebarPanelProps {
  visible: boolean
  orchestratorActive: boolean
  mpoActive: boolean
  sessions: Array<{ id: string; name: string; status: string; projectPath?: string }>
  gridSessionIds: string[]
  contextUsages: Record<string, { usedPercentage: number; used?: number; total?: number }>
  onAddToGrid: (sessionId: string) => void
  onDetach?: () => void
}

function formatTime(ts: string | number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function SidebarPanel({
  visible, orchestratorActive, mpoActive, sessions, gridSessionIds,
  contextUsages, onAddToGrid, onDetach,
}: SidebarPanelProps) {
  const { messages } = useMessages()
  const [messagesExpanded, setMessagesExpanded] = useState(true)
  const [bgExpanded, setBgExpanded] = useState(true)

  const backgroundSessions = sessions.filter(
    (s) => s.status === 'active' && !gridSessionIds.includes(s.id)
  )

  const showMessages = orchestratorActive && messages.length > 0
  const showBackground = backgroundSessions.length > 0

  if (!visible) return null

  return (
    <aside class="sidebar-panel">
      <div class="sidebar-panel__header">
        <span class="sidebar-panel__title">SIDEBAR</span>
        {onDetach && (
          <button class="sidebar-panel__detach" onClick={onDetach} title="Detach as window">⧉</button>
        )}
      </div>

      {showMessages && (
        <section class="sidebar-section">
          <div class="sidebar-section__head" onClick={() => setMessagesExpanded(v => !v)}>
            <span>{messagesExpanded ? '▾' : '▸'} MESSAGES ({messages.length})</span>
          </div>
          {messagesExpanded && (
            <div class="sidebar-section__feed">
              {messages.map((m) => (
                <div key={m.id} class={`sidebar-msg ${m.sender === 'system' ? 'sidebar-msg--system' : ''}`}>
                  <div class="sidebar-msg__head">
                    <span class="sidebar-msg__sender">{m.sender}</span>
                    <span class="sidebar-msg__time">{formatTime(m.createdAt)}</span>
                  </div>
                  <div class="sidebar-msg__text">{m.payload.text as string}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showBackground && (
        <section class="sidebar-section">
          <div class="sidebar-section__head" onClick={() => setBgExpanded(v => !v)}>
            <span>{bgExpanded ? '▾' : '▸'} BACKGROUND SESSIONS ({backgroundSessions.length})</span>
          </div>
          {bgExpanded && backgroundSessions.map(s => (
            <div key={s.id} class="bg-card" onClick={() => onAddToGrid(s.id)} title="Click to place in grid">
              <div class="bg-card__head">
                <span class="bg-card__name">{s.name}</span>
                <span class="bg-card__path">{s.projectPath ?? ''}</span>
              </div>
              {contextUsages[s.id] && (
                <div class="bg-card__context">
                  <span class="bg-card__tokens">
                    {contextUsages[s.id].used != null ? `${Math.round(contextUsages[s.id].used! / 1000)}k` : '?'}
                    /{contextUsages[s.id].total != null ? `${Math.round(contextUsages[s.id].total! / 1000)}k` : '?'}
                  </span>
                  <div class="bg-card__bar">
                    <div class="bg-card__fill" style={{ width: `${contextUsages[s.id].usedPercentage}%` }} />
                  </div>
                </div>
              )}
              <div class="bg-card__preview" />
            </div>
          ))}
        </section>
      )}

      {!showMessages && !showBackground && (
        <div class="sidebar-panel__empty">No active background content.</div>
      )}
    </aside>
  )
}
