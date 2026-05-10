// src/renderer/components/WorkspacePopup.tsx
import { useState, useEffect, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { Workspace, WorkspaceCell } from '../../shared/persona-types'
import type { GridState } from '../../shared/grid-types'

interface WorkspacePopupProps {
  visible: boolean
  onClose: () => void
  onApply: (workspaceId: string) => void
  onOpenSettings: (tab: 'personas' | 'workspaces') => void
  currentGrid?: GridState
  sessions?: Array<{ id: string; name: string; projectPath?: string }>
}

/** Inline span calculation (mirrors workspace-manager spanOf) */
function thumbSpanOf(ws: Workspace, col: number, row: number): number {
  if (row > 0 && ws.merges[`${col}:${row - 1}`]) return 0
  let span = 1
  let r = row
  while (ws.merges[`${col}:${r}`] && r + 1 < ws.rows) {
    span++
    r++
  }
  return span
}

function WorkspaceThumbnail({ ws }: { ws: Workspace }) {
  return (
    <div
      class="wp-thumb"
      style={{
        gridTemplateColumns: `repeat(${ws.cols}, 1fr)`,
        gridTemplateRows: `repeat(${ws.rows}, 1fr)`,
      }}
    >
      {Array.from({ length: ws.cols }, (_, col) =>
        Array.from({ length: ws.rows }, (_, row) => {
          const span = thumbSpanOf(ws, col, row)
          if (span === 0) return null
          const cellIdx = row * ws.cols + col
          const cell = ws.cells[cellIdx]
          const hasProject = cell?.project && cell.project !== ''
          const hasPreset = !!cell?.presetId
          return (
            <div
              key={`${col}:${row}`}
              class="vcell"
              style={{
                gridColumn: `${col + 1}`,
                gridRow: `${row + 1} / span ${span}`,
                background: hasPreset ? 'var(--color-accent, #4fc3f7)' : hasProject ? 'var(--color-accent, #4fc3f7)' : '#6A6A72',
              }}
            />
          )
        })
      )}
    </div>
  )
}

function buildSubtitle(ws: Workspace): string {
  const filledCount = ws.cells.filter(c => c.project && c.project !== '').length
  return `${ws.cols}\u00D7${ws.rows} \u00B7 ${filledCount} slot${filledCount === 1 ? '' : 's'}`
}

export function WorkspacePopup({ visible, onClose, onApply, onOpenSettings, currentGrid, sessions: currentSessions }: WorkspacePopupProps) {
  const { t } = useTranslation()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [defaultWsId, setDefaultWsId] = useState<string | null>(null)
  const [saveTags, setSaveTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [allTags, setAllTags] = useState<string[]>([])
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([])
  const [hasDetached, setHasDetached] = useState(false)

  useEffect(() => {
    let mounted = true
    const api = (window as any).cipherMux
    api.workspaces.list().then((wsList: Workspace[]) => {
      if (!mounted) return
      setWorkspaces(wsList ?? [])
      if (wsList?.length && selectedId === null) {
        setSelectedId(wsList[0].id)
      }
    }).catch((err: unknown) => {
      console.error('[WorkspacePopup] Failed to load data:', err)
    })

    api.workspaces.active().then((id: string | null) => {
      if (!mounted) return
      setActiveId(id ?? null)
    }).catch(() => {})

    api.config.get('defaultWorkspaceId').then((id: string | null) => {
      if (!mounted) return
      setDefaultWsId(id ?? null)
    }).catch(() => {})

    // Check for detached windows (blocks save/update)
    api.detach?.hasDetached?.().then((val: boolean) => {
      if (!mounted) return
      setHasDetached(val)
    }).catch(() => {})

    // Load available tags for autocomplete
    api.notes?.tags?.().then((tags: string[]) => {
      if (!mounted) return
      setAllTags(tags ?? [])
    }).catch(() => {})

    return () => { mounted = false }
  }, [visible])

  const handleBackdropClick = useCallback(
    (e: MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains('wp-backdrop')) {
        onClose()
      }
    },
    [onClose]
  )

  const handleRowDoubleClick = useCallback(
    (id: string) => {
      setSelectedId(id)
      onApply(id)
    },
    [onApply]
  )

  const handleLoad = useCallback(() => {
    if (selectedId) onApply(selectedId)
  }, [selectedId, onApply])

  const handleSetDefault = useCallback(async (wsId: string) => {
    const api = (window as any).cipherMux
    const nextId = defaultWsId === wsId ? null : wsId
    await api.config.set('defaultWorkspaceId', nextId)
    setDefaultWsId(nextId)
  }, [defaultWsId])

  const handleTagInputChange = useCallback((value: string) => {
    setTagInput(value)
    if (value.trim()) {
      const lower = value.toLowerCase()
      setTagSuggestions(allTags.filter(t => t.toLowerCase().includes(lower) && !saveTags.includes(t)).slice(0, 5))
    } else {
      setTagSuggestions([])
    }
  }, [allTags, saveTags])

  const handleAddTag = useCallback((tag: string) => {
    const normalized = tag.trim().toLowerCase()
    if (normalized && !saveTags.includes(normalized)) {
      setSaveTags(prev => [...prev, normalized])
    }
    setTagInput('')
    setTagSuggestions([])
  }, [saveTags])

  const handleRemoveTag = useCallback((tag: string) => {
    setSaveTags(prev => prev.filter(t => t !== tag))
  }, [])

  const handleUpdateExisting = useCallback(async (wsId: string) => {
    if (!currentGrid) return
    const ws = workspaces.find(w => w.id === wsId)
    if (!ws) return
    setSaving(true)
    try {
      const api = (window as any).cipherMux
      const sessionMap: Record<string, { name: string; projectPath?: string }> = {}
      for (const s of currentSessions ?? []) {
        sessionMap[s.id] = s
      }

      const cells: WorkspaceCell[] = currentGrid.slots.map(slot => {
        const session = slot.sessionId ? sessionMap[slot.sessionId] : undefined
        return {
          persona: 'empty',
          project: session?.projectPath ?? '',
          prompt: '',
          type: slot.type,
        }
      })

      const updated: Workspace = {
        ...ws,
        cols: currentGrid.config.cols,
        rows: currentGrid.config.rows,
        cells,
        merges: {},
      }

      await api.workspaces.save(updated)
      const wsList = await api.workspaces.list() as Workspace[]
      setWorkspaces(wsList ?? [])
    } catch (err) {
      console.error('[WorkspacePopup] update failed:', err)
    } finally {
      setSaving(false)
    }
  }, [currentGrid, currentSessions, workspaces])

  const handleSaveCurrentOpen = useCallback(() => {
    const now = new Date()
    const defaultName = `Workspace ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    setSaveName(defaultName)
    setSaveTags([])
    setTagInput('')
    setShowSaveDialog(true)
  }, [])

  const handleSaveCurrentConfirm = useCallback(async () => {
    if (!currentGrid || !saveName.trim()) return
    setSaving(true)
    try {
      const api = (window as any).cipherMux
      const sessionMap: Record<string, { name: string; projectPath?: string }> = {}
      for (const s of currentSessions ?? []) {
        sessionMap[s.id] = s
      }

      const cells: WorkspaceCell[] = currentGrid.slots.map(slot => {
        const session = slot.sessionId ? sessionMap[slot.sessionId] : undefined
        return {
          persona: 'empty',
          project: session?.projectPath ?? '',
          prompt: '',
          type: slot.type,
        }
      })

      const ws: Workspace = {
        id: `ws-${Date.now()}`,
        name: saveName.trim(),
        cols: currentGrid.config.cols,
        rows: currentGrid.config.rows,
        cells,
        merges: {},
        promptOverrides: {},
        ...(saveTags.length > 0 ? { defaultTags: saveTags } : {}),
      }

      await api.workspaces.save(ws)
      const wsList = await api.workspaces.list() as Workspace[]
      setWorkspaces(wsList ?? [])
      setSelectedId(ws.id)
      setShowSaveDialog(false)
    } catch (err) {
      console.error('[WorkspacePopup] save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [currentGrid, currentSessions, saveName])

  if (!visible) return null

  return (
    <div class="wp-backdrop" onClick={handleBackdropClick} style={{ position: 'fixed', inset: 0, zIndex: 9 }}>
      <div class="workspaces-popup" data-highlight="popup-workspace" onClick={(e) => e.stopPropagation()}>
        <div class="wp-head">
          <span class="wp-title">{t('workspacePopup.title')}</span>
          <div class="wp-head-actions">
            <button onClick={onClose}>✕</button>
          </div>
        </div>

        <div class="wp-list">
          {workspaces.length === 0 && (
            <div style={{ padding: '16px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--color-text-dim)' }}>
              {t('workspacePopup.noWorkspaces')}
            </div>
          )}
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              class="wp-row"
              aria-current={selectedId === ws.id ? 'true' : 'false'}
              onClick={() => setSelectedId(ws.id)}
              onDblClick={() => handleRowDoubleClick(ws.id)}
            >
              <WorkspaceThumbnail ws={ws} />
              <div class="wp-meta">
                <div class="wp-name">
                  {ws.name}
                  {activeId === ws.id && (
                    <span class="wp-badge">{t('workspacePopup.active')}</span>
                  )}
                </div>
                <div class="wp-sub">
                  {buildSubtitle(ws)}
                  {ws.defaultTags?.length ? ` · ${ws.defaultTags.join(', ')}` : ''}
                </div>
              </div>
              {currentGrid && (
                <button
                  class="wp-update-btn"
                  onClick={(e) => { e.stopPropagation(); handleUpdateExisting(ws.id) }}
                  title={hasDetached ? t('workspacePopup.detachedWarning', 'Dock all detached windows before saving') : t('workspacePopup.updateCurrent')}
                  disabled={saving || hasDetached}
                >
                  {'\u21BB'}
                </button>
              )}
              <button
                class={`wp-default-star${defaultWsId === ws.id ? ' wp-default-star--active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleSetDefault(ws.id) }}
                title={defaultWsId === ws.id ? t('workspacePopup.unsetDefault') : t('workspacePopup.setDefault')}
              >
                {defaultWsId === ws.id ? '\u2605' : '\u2606'}
              </button>
            </div>
          ))}
        </div>

        {showSaveDialog && (
          <div class="wp-save-overlay">
            <div class="wp-save-dialog">
              <div class="wp-save-dialog__title">{t('workspacePopup.saveTitle')}</div>
              <input
                class="input input--sm"
                type="text"
                value={saveName}
                onInput={(e) => setSaveName((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCurrentConfirm() }}
                placeholder={t('workspacePopup.saveNamePlaceholder')}
                autoFocus
                style={{ width: '100%', marginBottom: '8px' }}
              />
              {/* Tag input */}
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '11px', color: 'var(--color-text-dim)', marginBottom: '4px' }}>
                  {t('workspacePopup.projectTags', 'Project Tags')}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '4px' }}>
                  {saveTags.map(tag => (
                    <span key={tag} class="wp-tag-chip">
                      {tag}
                      <span class="wp-tag-chip__remove" onClick={() => handleRemoveTag(tag)}>✕</span>
                    </span>
                  ))}
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    class="input input--sm"
                    type="text"
                    value={tagInput}
                    onInput={(e) => handleTagInputChange((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagInput.trim()) {
                        e.preventDefault()
                        handleAddTag(tagInput)
                      }
                    }}
                    placeholder={t('workspacePopup.tagPlaceholder', 'Add tag...')}
                    style={{ width: '100%' }}
                  />
                  {tagSuggestions.length > 0 && (
                    <div class="wp-tag-suggestions">
                      {tagSuggestions.map(s => (
                        <div key={s} class="wp-tag-suggestion" onClick={() => handleAddTag(s)}>{s}</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div class="wp-save-dialog__info">
                {currentGrid ? `${currentGrid.config.cols}×${currentGrid.config.rows} · ${currentGrid.slots.filter(s => s.sessionId).length} ${t('workspacePopup.activeSessions')}` : ''}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', marginTop: '8px' }}>
                <button class="ghost" onClick={() => setShowSaveDialog(false)}>{t('bugreport.cancel')}</button>
                <button onClick={handleSaveCurrentConfirm} disabled={saving || !saveName.trim()}>
                  {saving ? t('workspacesTab.saved') : t('workspacePopup.save')}
                </button>
              </div>
            </div>
          </div>
        )}

        <div class="wp-foot">
          <button
            class="ghost"
            onClick={handleSaveCurrentOpen}
            disabled={!currentGrid || hasDetached}
            title={hasDetached ? t('workspacePopup.detachedWarning', 'Dock all detached windows before saving') : undefined}
          >{t('workspacePopup.saveCurrent')}</button>
          <button class="ghost" onClick={() => onOpenSettings('workspaces')}>{t('workspacePopup.editBtn')}</button>
          <button onClick={handleLoad} disabled={!selectedId}>{t('workspacePopup.load')}</button>
        </div>
      </div>
    </div>
  )
}
