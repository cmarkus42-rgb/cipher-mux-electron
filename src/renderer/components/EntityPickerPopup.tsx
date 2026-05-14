// src/renderer/components/EntityPickerPopup.tsx — Shared preset/path/notes picker
import { useState, useEffect, useCallback } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { useTranslation } from 'react-i18next'
import { FolderPickerInput } from './FolderPickerInput'
import { useNotes } from '../hooks/useNotes'
import { useEntityPresets } from '../hooks/useEntityPresets'
import type { EntityId } from '../../shared/types'

const cipherApi = () => (window as any).cipherMux

// ─── Types ───────────────────────────────────────────────

export interface PathStartOpts {
  shellOnly?: boolean
  fork?: boolean
  resume?: boolean
  skipPermissions?: boolean
}

type TabMode = 'presets' | 'path' | 'notes'

export interface EntityPickerPopupProps {
  /** Called when user clicks a preset. If entityStatus shows running, this is a focus action. */
  onSelectPreset: (presetId: EntityId, running: boolean) => void
  /** Called when user clicks Resume on a running preset */
  onResumePreset?: (presetId: EntityId) => void
  /** Called when user confirms a path start */
  onSelectPath: (path: string, opts: PathStartOpts) => void
  /** Called when user clicks a note */
  onSelectNote: (note: any) => void
  /** Called when user clicks "New Note" */
  onNewNote?: () => void
  /** Close the popup */
  onClose: () => void
  /** Running status per entity id — if omitted, no running indicators shown */
  entityStatus?: Record<string, boolean>
  /** Entity currently being started (shows spinner) */
  startingEntity?: string | null
}

export function EntityPickerPopup({
  onSelectPreset,
  onResumePreset,
  onSelectPath,
  onSelectNote,
  onNewNote,
  onClose,
  entityStatus,
  startingEntity,
}: EntityPickerPopupProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabMode>('presets')

  // Path state
  const [path, setPath] = useState('')
  const [shellOnly, setShellOnly] = useState(false)
  const [skipPermissions, setSkipPermissions] = useState(true)
  const [fork, setFork] = useState(false)
  const [resume, setResume] = useState(false)
  const [recentPaths, setRecentPaths] = useState<string[]>([])

  // Notes
  const { notes } = useNotes()

  // Entity presets (dynamic from registry)
  const entityPresets = useEntityPresets()

  // Hub projects dir for folder picker default
  const [hubProjectsDir, setHubProjectsDir] = useState<string | undefined>(undefined)

  // Load recent paths and hub projects dir when mounted
  useEffect(() => {
    cipherApi().config.get('app').then((cfg: any) => {
      setRecentPaths(cfg?.recentPaths ?? [])
    }).catch(() => {})
    cipherApi().hub.projectsDir().then((dir: string) => {
      if (dir) setHubProjectsDir(dir)
    }).catch(() => {})
  }, [])

  // Escape to close
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handlePathStart = useCallback(() => {
    const p = path.trim()
    if (!p) return
    onSelectPath(p, { shellOnly, fork, resume, skipPermissions: !shellOnly && skipPermissions })
    // Save to recent paths
    cipherApi().config.get('app').then((cfg: any) => {
      const existing: string[] = cfg?.recentPaths ?? []
      const updated = [p, ...existing.filter((x: string) => x !== p)].slice(0, 10)
      cipherApi().config.set('app', { ...cfg, recentPaths: updated }).catch(() => {})
    }).catch(() => {})
    setPath('')
  }, [path, shellOnly, fork, resume, skipPermissions, onSelectPath])

  const handlePathKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePathStart()
    }
  }, [handlePathStart])

  return createPortal(
    <div class="launcher-popup-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div class="launcher-popup" data-highlight="popup-launcher">
        <div class="launcher-popup__header">
          <span class="launcher-popup__title">{t('unified.title')}</span>
          <button class="cell-btn" onClick={onClose}>&times;</button>
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
              {entityPresets.map(preset => {
                const running = entityStatus?.[preset.id] ?? false
                const isStarting = startingEntity === preset.id
                // Multi-instance presets: always start new, never focus-only
                const effectiveRunning = running && (preset.singleInstance ?? false)
                return (
                  <div key={preset.id} class="unified-dialog__card-row">
                    <button
                      class={`unified-dialog__card${running ? ' unified-dialog__card--running' : ''}`}
                      onClick={() => onSelectPreset(preset.id as EntityId, effectiveRunning)}
                      disabled={isStarting}
                      style={{ '--entity-color': preset.color } as any}
                    >
                      <div class="unified-dialog__card-info">
                        <span class="unified-dialog__card-name">
                          {running && <span class="unified-dialog__card-dot" />}
                          {preset.displayName}
                        </span>
                      </div>
                      {running && preset.singleInstance && (
                        <span class="unified-dialog__card-status">{t('unified.running')}</span>
                      )}
                      {running && !preset.singleInstance && (
                        <span class="unified-dialog__card-status">+</span>
                      )}
                      {isStarting && (
                        <span class="unified-dialog__card-status">{t('unified.starting')}</span>
                      )}
                    </button>
                    {onResumePreset && (
                      <button
                        class="unified-dialog__card-resume"
                        onClick={(e: any) => { e.stopPropagation(); onResumePreset(preset.id as EntityId) }}
                        disabled={isStarting}
                        title={t('unified.resume')}
                      >
                        {t('unified.resumeShort')}
                      </button>
                    )}
                  </div>
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
              defaultPath={hubProjectsDir}
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
              <button class="btn btn--sm" onClick={onClose}>{t('unified.cancel')}</button>
              <button class="btn btn--sm btn--primary" onClick={handlePathStart} disabled={!path.trim()}>
                {t('unified.start')}
              </button>
            </div>
          </div>
        )}

        {/* Notes tab */}
        {tab === 'notes' && (
          <div class="launcher-popup__body">
            {onNewNote && (
              <button class="btn btn--sm btn--primary" onClick={onNewNote} style={{ marginBottom: '8px' }}>
                {t('launcher.newNote')}
              </button>
            )}
            {notes.length > 0 ? (
              <div class="launcher-popup__notes-list">
                {notes.map(note => (
                  <button
                    key={note.id}
                    class="launcher-popup__note-item"
                    onClick={() => onSelectNote(note)}
                  >
                    <span class="launcher-popup__note-title">{note.title && note.title !== 'Untitled' ? note.title : t('notesCell.untitled')}</span>
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
    </div>,
    document.body
  )
}
