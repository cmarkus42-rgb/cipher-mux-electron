import { h } from 'preact'
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { useMessages } from '../hooks/useMessages'
import { useInputRequests } from '../hooks/useInputRequests'
import { useNotes } from '../hooks/useNotes'
import { CompanionMemoryView } from './CompanionMemoryView'
import { useTranslation } from 'react-i18next'

interface SidebarPanelProps {
  visible: boolean
  orchestratorActive: boolean
  mpoActive: boolean
  sessions: Array<{ id: string; name: string; status: string; projectPath?: string }>
  gridSessionIds: string[]
  contextUsages: Record<string, { usedPercentage: number; used?: number; total?: number }>
  onAddToGrid: (sessionId: string) => void
  onKillSession: (sessionId: string) => void
  onDetach?: () => void
  onReattach?: () => void
  activeWorkspaceId: string | null
  hasNotesCell: boolean
  onOpenNoteInGrid?: (note: any) => void
  voiceComState?: string
}

function formatTime(ts: string | number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Derive a human-readable display name from a session or orphan entry. */
function displayName(name: string, projectPath?: string | null): string {
  if (projectPath) {
    const parts = projectPath.replace(/\/+$/, '').split('/')
    return parts[parts.length - 1] || name
  }
  return name
}

export function SidebarPanel({
  visible, orchestratorActive, mpoActive, sessions, gridSessionIds,
  contextUsages, onAddToGrid, onKillSession, onDetach, onReattach, activeWorkspaceId, hasNotesCell,
  onOpenNoteInGrid, voiceComState,
}: SidebarPanelProps) {
  const { t } = useTranslation()
  const { messages } = useMessages()
  const { requests, openCount, answerRequest, openReview } = useInputRequests()

  // Collapse states — loaded from configStore on mount, persisted on change
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({
    notes: false,
    background: false,
    orphans: false,
    requests: false,
    memory: true,
    messages: false,
  })
  const collapsedLoaded = useRef(false)

  useEffect(() => {
    const api = (window as any).cipherMux
    api?.config?.get?.('sidebarCollapsed')?.then((saved: Record<string, boolean> | null) => {
      if (saved && typeof saved === 'object') {
        setCollapsed(prev => ({ ...prev, ...saved }))
      }
      collapsedLoaded.current = true
    }).catch(() => { collapsedLoaded.current = true })
  }, [])

  const toggleSection = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      const api = (window as any).cipherMux
      api?.config?.set?.('sidebarCollapsed', next).catch(() => {})
      return next
    })
  }, [])

  const [orphans, setOrphans] = useState<Array<{ id: string; name: string; tmuxSession: string; projectPath?: string | null }>>([])
  const [tagFilter, setTagFilter] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  const { notes, tagRepo, deleteNote } = useNotes()

  // Pre-select workspace defaultTags as filter when workspace changes
  useEffect(() => {
    if (!activeWorkspaceId) {
      setTagFilter([])
      return
    }
    const api = (window as any).cipherMux
    api?.config?.get?.('workspaces')?.then((workspaces: any[]) => {
      const ws = workspaces?.find((w: any) => w.id === activeWorkspaceId)
      if (ws?.defaultTags?.length) {
        setTagFilter(ws.defaultTags)
      } else {
        setTagFilter([])
      }
    }).catch(() => {})
  }, [activeWorkspaceId])

  // Orphan detection: listen for periodic events + initial scan
  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    if (!api?.sessions?.detectOrphans || !api?.sessions?.onOrphansDetected) return

    // Initial scan
    api.sessions.detectOrphans().then((result: any[]) => {
      if (!mounted) return
      if (result?.length) setOrphans(result)
    }).catch(() => {})

    // Listen for periodic updates
    const unsub = api.sessions.onOrphansDetected((detected: any[]) => {
      setOrphans(detected)
    })
    return () => { mounted = false; unsub() }
  }, [])

  const handleOrphanAdopt = useCallback(async (tmuxSession: string) => {
    const api = (window as any).cipherMux
    await api.sessions.recoveryAction('adopt', tmuxSession)
    setOrphans(prev => prev.filter(o => o.tmuxSession !== tmuxSession))
  }, [])

  const handleOrphanKill = useCallback(async (tmuxSession: string) => {
    const api = (window as any).cipherMux
    await api.sessions.recoveryAction('kill', tmuxSession)
    setOrphans(prev => prev.filter(o => o.tmuxSession !== tmuxSession))
  }, [])

  // Filter notes
  const filteredNotes = notes.filter(n => {
    if (tagFilter.length > 0 && !tagFilter.every(t => n.tags.includes(t))) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return n.title.toLowerCase().includes(q) || n.tags.some(t => t.includes(q))
    }
    return true
  })

  const availableTags = [...new Set(notes.flatMap(n => n.tags))].sort()

  const handleNoteDoubleClick = useCallback((note: any) => {
    if (onOpenNoteInGrid) {
      onOpenNoteInGrid(note)
    } else {
      const openFn = (window as any).__notesCell_openNote
      if (openFn) openFn(note)
    }
  }, [onOpenNoteInGrid])

  const handleNoteDelete = useCallback(async (note: any, e: Event) => {
    e.stopPropagation()
    if (!confirm(t('sidebar.confirmDelete', { title: note.title || t('notesCell.untitled') }))) return
    await deleteNote(note.id)
  }, [deleteNote])

  const toggleTag = useCallback((tag: string) => {
    setTagFilter(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }, [])

  const backgroundSessions = sessions.filter(
    (s) => s.status === 'active' && !gridSessionIds.includes(s.id)
  )

  const hasNotes = notes.length > 0
  const hasBackground = backgroundSessions.length > 0
  const hasOrphans = orphans.length > 0
  const hasRequests = mpoActive && requests.length > 0
  const hasMessages = messages.length > 0

  if (!visible) return null

  return (
    <aside class="sidebar-panel">
      <div class="sidebar-panel__header">
        <span class="sidebar-panel__title">{t('sidebar.title')}</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {onReattach && (
            <button class="sidebar-panel__detach" onClick={onReattach} title={t('sidebar.reattach', 'Dock')}>⇤</button>
          )}
          {onDetach && (
            <button class="sidebar-panel__detach" onClick={onDetach} title={t('sidebar.detach')}>⧉</button>
          )}
        </div>
      </div>

      {/* Section order: Notes → Background → Memory → Messages */}

      {/* ─── Notes ─── */}
      <section class="sidebar-section sidebar-section--grow" data-highlight="side-notes">
        <div
          class={`sidebar-section__head${!hasNotes ? ' sidebar-section__head--empty' : ''}`}
          onClick={() => toggleSection('notes')}
        >
          <span>{collapsed.notes ? '▸' : '▾'} {t('sidebar.notes')}</span>
        </div>
        {!collapsed.notes && (
          <div class="sidebar-section__feed sidebar-section__feed--flex">
            {/* Search */}
            <input
              type="text"
              class="sidebar-notes__search"
              placeholder={t('sidebar.notesSearch')}
              value={searchTerm}
              onInput={(e) => setSearchTerm((e.target as HTMLInputElement).value)}
            />
            {/* Tag chips */}
            {availableTags.length > 0 && (
              <div class="sidebar-notes__tags">
                {availableTags.map(tag => (
                  <span
                    key={tag}
                    class={`sidebar-notes__tag ${tagFilter.includes(tag) ? 'sidebar-notes__tag--active' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >#{tag}</span>
                ))}
              </div>
            )}
            {/* Note list */}
            {filteredNotes.map(note => (
              <div
                key={note.id}
                class="bg-card"
                onDblClick={() => handleNoteDoubleClick(note)}
                title={t('sidebar.noteDoubleClick')}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer?.setData('text/plain', JSON.stringify(note))
                }}
              >
                <div class="bg-card__head">
                  <span class="bg-card__name">{note.title && note.title !== 'Untitled' ? note.title : t('notesCell.untitled')}</span>
                  <button
                    class="bg-card__delete"
                    onClick={(e) => handleNoteDelete(note, e)}
                    title={t('sidebar.noteDelete')}
                  >✕</button>
                </div>
                <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)' }}>
                  {note.tags.map(t => `#${t}`).join(' ')}
                </div>
                <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)', opacity: 0.5 }}>
                  {note.modifiedAt ? new Date(note.modifiedAt).toLocaleDateString() : ''}
                </div>
              </div>
            ))}
            {filteredNotes.length === 0 && (
              <div class="sidebar-panel__empty" style={{ padding: 'var(--space-sm)' }}>{t('sidebar.noNotes')}</div>
            )}
          </div>
        )}
      </section>

      {/* ─── Background Sessions ─── */}
      <section class="sidebar-section" data-highlight="side-background">
        <div
          class={`sidebar-section__head${!hasBackground ? ' sidebar-section__head--empty' : ''}`}
          onClick={() => toggleSection('background')}
        >
          <span>{collapsed.background ? '▸' : '▾'} {t('sidebar.backgroundSessions')}</span>
        </div>
        {!collapsed.background && hasBackground && backgroundSessions.map(s => (
          <BackgroundSessionCard
            key={s.id}
            session={s}
            contextUsage={contextUsages[s.id]}
            onClick={() => onAddToGrid(s.id)}
            onKill={() => onKillSession(s.id)}
            voiceGlow={s.name === 'Voice' ? voiceComState : undefined}
          />
        ))}
      </section>

      {/* ─── Orphaned Sessions (conditional) ─── */}
      {hasOrphans && (
        <section class="sidebar-section">
          <div class="sidebar-section__head" onClick={() => toggleSection('orphans')}>
            <span>
              {collapsed.orphans ? '▸' : '▾'} {t('sidebar.orphanedSessions')}
              <span class="sidebar-section__badge">{orphans.length}</span>
            </span>
          </div>
          {!collapsed.orphans && (
            <div class="sidebar-section__feed">
              {orphans.map(o => (
                <div key={o.tmuxSession} class="bg-card">
                  <div class="bg-card__head">
                    <span class="bg-card__name">{displayName(o.name || o.tmuxSession, o.projectPath)}</span>
                  </div>
                  {o.projectPath && (
                    <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)', opacity: 0.6 }}>
                      {o.projectPath}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 'var(--space-xs)', marginTop: 'var(--space-xs)' }}>
                    <button class="btn btn--sm btn--primary" onClick={() => handleOrphanAdopt(o.tmuxSession)}>
                      {t('sidebar.orphanAdopt')}
                    </button>
                    <button class="btn btn--sm" onClick={() => handleOrphanKill(o.tmuxSession)}>
                      {t('sidebar.orphanKill')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── Requests (conditional) ─── */}
      {hasRequests && (
        <section class="sidebar-section" data-highlight="side-requests">
          <div class="sidebar-section__head" onClick={() => toggleSection('requests')}>
            <span>
              {collapsed.requests ? '▸' : '▾'} {t('sidebar.requests')}
              {openCount > 0 && <span class="sidebar-section__badge">{openCount}</span>}
            </span>
          </div>
          {!collapsed.requests && (
            <div class="sidebar-section__feed">
              {requests.map((req: any) => (
                <RequestCard key={req.id} request={req} onAnswer={answerRequest} onOpenReview={openReview} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* ─── Memory ─── */}
      <CompanionMemoryView
        expanded={!collapsed.memory}
        onToggle={() => toggleSection('memory')}
      />

      {/* ─── Messages ─── */}
      <section class="sidebar-section" data-highlight="side-messages">
        <div
          class={`sidebar-section__head${!hasMessages ? ' sidebar-section__head--empty' : ''}`}
          onClick={() => toggleSection('messages')}
        >
          <span>{collapsed.messages ? '▸' : '▾'} {t('sidebar.messages')}</span>
        </div>
        {!collapsed.messages && hasMessages && (
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
    </aside>
  )
}

interface BackgroundSessionCardProps {
  session: { id: string; name: string; projectPath?: string }
  contextUsage?: { usedPercentage: number; used?: number; total?: number }
  onClick: () => void
  onKill: () => void
  voiceGlow?: string
}

function BackgroundSessionCard({ session, contextUsage, onClick, onKill, voiceGlow }: BackgroundSessionCardProps) {
  const { t } = useTranslation()
  const [lastOutput, setLastOutput] = useState<string>('')

  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    if (!api?.sessions?.capture) return

    const fetchPreview = async () => {
      const content = await api.sessions.capture(session.id)
      if (mounted && content) setLastOutput(content)
    }

    fetchPreview()
    const interval = setInterval(fetchPreview, 5000)
    return () => { mounted = false; clearInterval(interval) }
  }, [session.id])

  const handleKill = useCallback((e: Event) => {
    e.stopPropagation()
    if (!confirm(t('sidebar.confirmKillSession', { name: session.name }))) return
    onKill()
  }, [onKill, session.name, t])

  return (
    <div class={`bg-card${voiceGlow ? ` bg-card--voice-${voiceGlow}` : ''}`} onClick={onClick} title={t('sidebar.clickToPlace')}>
      <div class="bg-card__head">
        <span class="bg-card__name">{displayName(session.name, session.projectPath)}</span>
        <button
          class="bg-card__kill"
          onClick={handleKill}
          title={t('sidebar.killSession')}
        >✕</button>
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

// ─── Request Card ────────────────────────────────────────

interface RequestCardProps {
  request: any
  onAnswer: (id: string, answer: string) => void
  onOpenReview: (filePath: string) => void
}

function RequestCard({ request, onAnswer, onOpenReview }: RequestCardProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null!)

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [editing])

  const handleSave = useCallback(() => {
    if (!draft.trim()) return
    onAnswer(request.id, draft.trim())
    setEditing(false)
  }, [draft, onAnswer, request.id])

  if (request.type === 'review-link') {
    return (
      <div class="bg-card" onClick={() => onOpenReview(request.filePath)} style={{ cursor: 'pointer' }}>
        <div class="bg-card__head">
          <span class="bg-card__name">Review: {request.projectId}</span>
        </div>
        <div class="bg-card__preview">{request.filePath?.split('/').pop()}</div>
        <div class="bg-card__preview" style={{ fontSize: 'var(--font-size-xs)', opacity: 0.6 }}>{request.title}</div>
      </div>
    )
  }

  return (
    <div class="bg-card">
      <div class="bg-card__head">
        <span class="bg-card__name">{request.projectId}</span>
      </div>
      <div class="bg-card__preview">{request.question}</div>
      {request.options && request.options.length > 0 && (
        <div class="bg-card__preview" style={{ marginTop: '4px' }}>
          {request.options.map((o: any) => (
            <div
              key={o.key}
              style={{ cursor: request.status === 'open' ? 'pointer' : 'default' }}
              onClick={() => {
                if (request.status === 'open') {
                  setDraft(o.key)
                  setEditing(true)
                }
              }}
            >
              • <strong>{o.key}</strong> {o.label}
              {o.key === request.recommendation && <span style={{ color: 'var(--color-neon)', marginLeft: '4px' }}>{t('sidebar.recommended')}</span>}
            </div>
          ))}
        </div>
      )}
      {request.status === 'answered' ? (
        <div class="bg-card__preview" style={{ color: 'var(--color-neon)', marginTop: '4px' }}>
          → {request.answer}
        </div>
      ) : editing ? (
        <div style={{ marginTop: 'var(--space-xs)' }}>
          <textarea
            ref={textareaRef}
            class="request-textarea"
            value={draft}
            onInput={(e) => setDraft((e.target as HTMLTextAreaElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault()
                handleSave()
              }
            }}
            rows={2}
          />
          <button class="btn btn--primary btn--sm" onClick={handleSave}>
            {t('sidebar.send')}
          </button>
        </div>
      ) : (
        <button class="btn btn--sm" style={{ marginTop: 'var(--space-xs)' }} onClick={() => setEditing(true)}>
          {t('sidebar.answer')}
        </button>
      )}
    </div>
  )
}
