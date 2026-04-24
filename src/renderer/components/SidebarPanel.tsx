import { h } from 'preact'
import { useState, useEffect } from 'preact/hooks'
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
            <BackgroundSessionCard
              key={s.id}
              session={s}
              contextUsage={contextUsages[s.id]}
              onClick={() => onAddToGrid(s.id)}
            />
          ))}
        </section>
      )}

      {!showMessages && !showBackground && (
        <div class="sidebar-panel__empty">No active background content.</div>
      )}
    </aside>
  )
}

interface BackgroundSessionCardProps {
  session: { id: string; name: string; projectPath?: string }
  contextUsage?: { usedPercentage: number; used?: number; total?: number }
  onClick: () => void
}

function BackgroundSessionCard({ session, contextUsage, onClick }: BackgroundSessionCardProps) {
  const [lastOutput, setLastOutput] = useState<string>('')

  useEffect(() => {
    const api = (window as any).cipherMux
    if (!api?.sessions?.capture) return

    const fetchPreview = async () => {
      const content = await api.sessions.capture(session.id)
      if (content) setLastOutput(content)
    }

    fetchPreview()
    const interval = setInterval(fetchPreview, 5000)
    return () => clearInterval(interval)
  }, [session.id])

  return (
    <div class="bg-card" onClick={onClick} title="Click to place in grid">
      <div class="bg-card__head">
        <span class="bg-card__name">{session.name}</span>
        <span class="bg-card__path">{session.projectPath ?? ''}</span>
      </div>
      {contextUsage && (
        <div class="bg-card__context">
          <span class="bg-card__tokens">
            {contextUsage.used != null ? `${Math.round(contextUsage.used / 1000)}k` : '?'}
            /{contextUsage.total != null ? `${Math.round(contextUsage.total / 1000)}k` : '?'}
          </span>
          <div class="bg-card__bar">
            <div class="bg-card__fill" style={{ width: `${contextUsage.usedPercentage}%` }} />
          </div>
        </div>
      )}
      {lastOutput && (
        <div class="bg-card__preview">{lastOutput}</div>
      )}
    </div>
  )
}
