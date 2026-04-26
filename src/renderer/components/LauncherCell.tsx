// src/renderer/components/LauncherCell.tsx
import { useState, useCallback, useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { FolderPickerInput } from './FolderPickerInput'
import { useNotes } from '../hooks/useNotes'
import type { EntityId } from '../../shared/types'

const cipherApi = () => (window as any).cipherMux

// ─── Entity preset definitions ───────────────────────────

interface EntityPreset {
  id: EntityId
  nameKey: string
  descKey: string
  color: string
}

const ENTITY_PRESETS: EntityPreset[] = [
  { id: 'companion', nameKey: 'statusBar.companion', descKey: 'unified.desc.companion', color: '#ffb74d' },
  { id: 'refinement', nameKey: 'statusBar.refinement', descKey: 'unified.desc.refinement', color: '#ef5350' },
  { id: 'voice-relay', nameKey: 'statusBar.voiceRelay', descKey: 'unified.desc.voice', color: '#9b59b6' },
  { id: 'audit', nameKey: 'statusBar.audit', descKey: 'unified.desc.audit', color: '#c0392b' },
  { id: 'orchestrator', nameKey: 'statusBar.orchestrator', descKey: 'unified.desc.orchestrator', color: '#4fc3f7' },
  { id: 'mpo', nameKey: 'statusBar.mpo', descKey: 'unified.desc.mpo', color: '#ab47bc' },
]

// ─── Types ───────────────────────────────────────────────

export interface PathStartOpts {
  shellOnly?: boolean
  resume?: boolean
  fork?: boolean
  skipPermissions?: boolean
}

type TabMode = 'presets' | 'path' | 'notes'

interface LauncherCellProps {
  slotIndex: number
  onStartEntity: (entityId: EntityId) => Promise<void>
  onFocusEntity: (entityId: EntityId) => void
  onStartPath: (path: string, opts: PathStartOpts) => void
  onOpenNotes: () => void
  onOpenNote: (note: any) => void
  entityStatus: Record<string, boolean>
  activeWorkspaceId: string | null
  onDragOver: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function LauncherCell({
  slotIndex, onStartEntity, onFocusEntity, onStartPath,
  onOpenNotes, onOpenNote, entityStatus,
  activeWorkspaceId, onDragOver, onDrop,
}: LauncherCellProps) {
  const { t } = useTranslation()
  const [popupOpen, setPopupOpen] = useState(false)
  const [tab, setTab] = useState<TabMode>('presets')
  const [starting, setStarting] = useState<string | null>(null)

  // Path state
  const [path, setPath] = useState('')
  const [shellOnly, setShellOnly] = useState(false)
  const [skipPermissions, setSkipPermissions] = useState(true)
  const [resume, setResume] = useState(false)
  const [fork, setFork] = useState(false)
  const [recentPaths, setRecentPaths] = useState<string[]>([])

  // Notes
  const scope = activeWorkspaceId ? `workspace-${activeWorkspaceId}` : 'global'
  const { notes } = useNotes(scope)

  // Listen for Cmd+N launcher-open event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.slotIndex === slotIndex) {
        setPopupOpen(true)
        setTab('presets')
      }
    }
    window.addEventListener('launcher-open', handler)
    return () => window.removeEventListener('launcher-open', handler)
  }, [slotIndex])

  // Load recent paths when popup opens
  useEffect(() => {
    if (!popupOpen) return
    cipherApi().config.get('app').then((cfg: any) => {
      setRecentPaths(cfg?.recentPaths ?? [])
    }).catch(() => {})
  }, [popupOpen])

  // Reset state when popup opens
  useEffect(() => {
    if (popupOpen) {
      setStarting(null)
    }
  }, [popupOpen])

  const handleOpen = useCallback(() => {
    setPopupOpen(true)
    setTab('presets')
  }, [])

  const handleClose = useCallback(() => {
    setPopupOpen(false)
  }, [])

  const handleEntityClick = useCallback(async (entityId: EntityId) => {
    if (entityStatus[entityId]) {
      onFocusEntity(entityId)
      setPopupOpen(false)
      return
    }
    setStarting(entityId)
    try {
      await onStartEntity(entityId)
      setPopupOpen(false)
    } catch (err) {
      console.error(`[LauncherCell] Failed to start ${entityId}:`, err)
    } finally {
      setStarting(null)
    }
  }, [entityStatus, onStartEntity, onFocusEntity])

  const handlePathStart = useCallback(() => {
    const p = path.trim()
    if (!p) return
    onStartPath(p, { shellOnly, resume, fork, skipPermissions: !shellOnly && skipPermissions })
    // Save to recent paths
    cipherApi().config.get('app').then((cfg: any) => {
      const existing: string[] = cfg?.recentPaths ?? []
      const updated = [p, ...existing.filter((x: string) => x !== p)].slice(0, 10)
      cipherApi().config.set('app', { ...cfg, recentPaths: updated }).catch(() => {})
    }).catch(() => {})
    setPath('')
    setPopupOpen(false)
  }, [path, shellOnly, resume, fork, skipPermissions, onStartPath])

  const handlePathKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePathStart()
    }
  }, [handlePathStart])

  const handleNoteClick = useCallback((note: any) => {
    onOpenNote(note)
    setPopupOpen(false)
  }, [onOpenNote])

  const handleNewNote = useCallback(() => {
    onOpenNotes()
    setPopupOpen(false)
  }, [onOpenNotes])

  return (
    <div
      class="launcher-cell"
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {!popupOpen ? (
        <div class="launcher-cell__trigger" onClick={handleOpen}>
          <div class="launcher-circle"><span>+</span></div>
        </div>
      ) : (
        <div class="launcher-popup">
          <div class="launcher-popup__header">
            <span class="launcher-popup__title">{t('unified.title')}</span>
            <button class="cell-btn" onClick={handleClose}>&times;</button>
          </div>

          {/* Tab bar */}
          <div class="launcher-popup__tabs">
            <button
              class={`launcher-popup__tab${tab === 'presets' ? ' launcher-popup__tab--active' : ''}`}
              onClick={() => setTab('presets')}
            >
              {t('unified.tabPresets')}
            </button>
            <button
              class={`launcher-popup__tab${tab === 'path' ? ' launcher-popup__tab--active' : ''}`}
              onClick={() => setTab('path')}
            >
              {t('unified.tabPath')}
            </button>
            <button
              class={`launcher-popup__tab${tab === 'notes' ? ' launcher-popup__tab--active' : ''}`}
              onClick={() => setTab('notes')}
            >
              {t('launcher.notes')}
            </button>
          </div>

          {/* Presets tab */}
          {tab === 'presets' && (
            <div class="launcher-popup__body">
              <div class="launcher-popup__presets">
                {ENTITY_PRESETS.map(preset => {
                  const running = entityStatus[preset.id]
                  const isStarting = starting === preset.id
                  return (
                    <button
                      key={preset.id}
                      class={`unified-dialog__card${running ? ' unified-dialog__card--running' : ''}`}
                      onClick={() => handleEntityClick(preset.id)}
                      disabled={isStarting}
                      style={{ '--entity-color': preset.color } as any}
                    >
                      <div class="unified-dialog__card-info">
                        <span class="unified-dialog__card-name">{t(preset.nameKey)}</span>
                        <span class="unified-dialog__card-desc">{t(preset.descKey)}</span>
                      </div>
                      {running && (
                        <span class="unified-dialog__card-status">{t('unified.running')}</span>
                      )}
                      {isStarting && (
                        <span class="unified-dialog__card-status">{t('unified.starting')}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Path tab */}
          {tab === 'path' && (
            <div class="launcher-popup__body">
              <FolderPickerInput
                value={path}
                onChange={setPath}
                placeholder={t('unified.pathPlaceholder')}
                onKeyDown={handlePathKeyDown}
                autofocus
              />

              {recentPaths.length > 0 && (
                <div class="unified-dialog__recents">
                  <span class="unified-dialog__recents-label">{t('unified.recentPaths')}</span>
                  {recentPaths.map(rp => (
                    <button
                      key={rp}
                      class="unified-dialog__recent-item"
                      onClick={() => setPath(rp)}
                    >
                      {rp.split('/').filter(Boolean).pop()} <span class="unified-dialog__recent-path">{rp}</span>
                    </button>
                  ))}
                </div>
              )}

              <div class="unified-dialog__options">
                <label class="unified-dialog__option">
                  <input type="checkbox" checked={shellOnly} onChange={(e) => {
                    setShellOnly((e.target as HTMLInputElement).checked)
                  }} />
                  <span>{t('unified.shellOnly')}</span>
                </label>
                {!shellOnly && (
                  <>
                    <label class="unified-dialog__option">
                      <input type="checkbox" checked={skipPermissions} onChange={(e) => {
                        setSkipPermissions((e.target as HTMLInputElement).checked)
                      }} />
                      <span>{t('unified.skipPermissions')}</span>
                    </label>
                    <label class="unified-dialog__option">
                      <input type="checkbox" checked={resume} onChange={(e) => {
                        setResume((e.target as HTMLInputElement).checked)
                      }} />
                      <span>{t('unified.resume')}</span>
                    </label>
                    <label class="unified-dialog__option">
                      <input type="checkbox" checked={fork} onChange={(e) => {
                        setFork((e.target as HTMLInputElement).checked)
                      }} />
                      <span>{t('unified.fork')}</span>
                    </label>
                  </>
                )}
              </div>

              <div class="unified-dialog__footer">
                <button class="btn btn--sm" onClick={handleClose}>{t('unified.cancel')}</button>
                <button class="btn btn--sm btn--primary" onClick={handlePathStart} disabled={!path.trim()}>
                  {t('unified.start')}
                </button>
              </div>
            </div>
          )}

          {/* Notes tab */}
          {tab === 'notes' && (
            <div class="launcher-popup__body">
              <button class="btn btn--sm btn--primary" onClick={handleNewNote} style={{ marginBottom: '8px' }}>
                {t('launcher.newNote')}
              </button>
              {notes.length > 0 ? (
                <div class="launcher-popup__notes-list">
                  {notes.map(note => (
                    <button
                      key={note.id}
                      class="launcher-popup__note-item"
                      onClick={() => handleNoteClick(note)}
                    >
                      <span class="launcher-popup__note-title">{note.title || note.id}</span>
                      {note.tags.length > 0 && (
                        <span class="launcher-popup__note-tags">
                          {note.tags.map((tag: string) => `#${tag}`).join(' ')}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div class="sidebar-panel__empty">{t('sidebar.noNotes')}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

