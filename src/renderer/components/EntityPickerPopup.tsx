// src/renderer/components/EntityPickerPopup.tsx — Shared preset/path/notes picker
import { useState, useEffect, useCallback } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import { useTranslation } from 'react-i18next'
import { FolderPickerInput } from './FolderPickerInput'
import { useNotes } from '../hooks/useNotes'
import { useEntityPresets } from '../hooks/useEntityPresets'
import type { EntityId } from '../../shared/types'
import { isEntityRunningIn } from '../../shared/entity-status'
import { GLOBAL_WORKSPACE_KEY } from '../../shared/workspace-key'

const cipherApi = () => window.cipherMux

// ─── Types ───────────────────────────────────────────────

export interface PathStartOpts {
  shellOnly?: boolean
  fork?: boolean
  resume?: boolean
  skipPermissions?: boolean
}

type TabMode = 'presets' | 'path' | 'notes'

export interface WorkspaceOption {
  id: string
  name: string
}

export interface EntityPickerPopupProps {
  /**
   * Called when the user picks a preset.
   * workspaceId undefined = start in the active workspace (the default path).
   * workspaceId set = start in that workspace instead.
   */
  onSelectPreset: (presetId: EntityId, running: boolean, workspaceId?: string) => void
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
  /** entityId → workspace keys the preset currently runs in — if omitted, no running indicators shown */
  entityStatus?: Record<string, string[]>
  /** Entity currently being started (shows spinner) */
  startingEntity?: string | null
  /**
   * All configured workspaces, for the alternate-start chips. Optional
   * override — the popup loads its own list when omitted. Only meaningful
   * when `allowWorkspaceChoice` is true.
   */
  workspaces?: WorkspaceOption[]
  /**
   * The currently active workspace — excluded from the chip list. Only
   * meaningful when `allowWorkspaceChoice` is true.
   */
  activeWorkspaceId?: string | null
  /**
   * Show the ⤳ "start in another workspace" button and its inline chip row.
   * Default false.
   *
   * This popup has two callers with different meanings for "no active
   * workspace": the launcher (`LauncherCell`, real sessions, an active
   * workspace always exists) and `WorkspacesTab`'s cell-assignment editor
   * (design-time, no session, no active workspace, `activeWorkspaceId` is
   * simply never passed). Gating on `activeWorkspaceId !== undefined`
   * would overload the undefined/null/value distinction this plan uses
   * elsewhere for "no preference vs. explicitly unbound" to also mean
   * "which mode am I in" — same spelling, unrelated meaning. An explicit
   * flag says what it means: only `LauncherCell` passes `true`.
   */
  allowWorkspaceChoice?: boolean
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
  workspaces: workspacesProp,
  activeWorkspaceId,
  allowWorkspaceChoice = false,
}: EntityPickerPopupProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabMode>('presets')
  const [wsPickerFor, setWsPickerFor] = useState<string | null>(null)
  const [loadedWorkspaces, setLoadedWorkspaces] = useState<WorkspaceOption[]>([])

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

  // Load the workspace list for the alternate-start chips — only needed when
  // the caller allows the choice, and only if it didn't already supply a list.
  useEffect(() => {
    if (!allowWorkspaceChoice || workspacesProp) return
    cipherApi().workspaces.list().then((list: Array<{ id: string; name: string }>) => {
      setLoadedWorkspaces((list ?? []).map(w => ({ id: w.id, name: w.name })))
    }).catch(() => { /* no workspaces configured */ })
  }, [allowWorkspaceChoice, workspacesProp])

  const workspaces = workspacesProp ?? loadedWorkspaces

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
                const runningIn = entityStatus?.[preset.id] ?? []
                // Single source of truth for "is it running here?" — see
                // shared/entity-status.ts. Must stay in sync with app.tsx's
                // collapsed boolean map; both call the same function.
                const runsHere = isEntityRunningIn(entityStatus ?? {}, preset.id, activeWorkspaceId ?? null)
                const isStarting = startingEntity === preset.id
                // Focus instead of start only when a singleInstance preset is
                // already running *in this workspace*. Running in another one
                // must still start a fresh instance here — that's the whole
                // point of the second start button.
                const effectiveRunning = runsHere && (preset.singleInstance ?? false)
                // The chip list only makes sense where the caller actually
                // wants a workspace choice (LauncherCell) — WorkspacesTab's
                // cell-assignment editor has no active workspace and no
                // session to start, so it must never show this control even
                // though it self-loads the same workspace list.
                const otherWorkspaces = allowWorkspaceChoice
                  ? workspaces.filter(w => w.id !== activeWorkspaceId)
                  : []
                const expanded = allowWorkspaceChoice && wsPickerFor === preset.id
                // Same concept as the grid/sidebar badge, so the same wording:
                // the unbound case is "ohne Workspace", not a bare dash.
                const runningNames = runningIn.map(k =>
                  k === GLOBAL_WORKSPACE_KEY
                    ? t('unified.workspaceBadgeGlobal')
                    : (workspaces.find(w => w.id === k)?.name ?? k)
                )

                return (
                  <div key={preset.id}>
                    <div class="unified-dialog__card-row">
                      <button
                        class={`unified-dialog__card${runsHere ? ' unified-dialog__card--running' : ''}`}
                        onClick={() => onSelectPreset(preset.id as EntityId, effectiveRunning)}
                        disabled={isStarting}
                        style={{ '--entity-color': preset.color } as any}
                      >
                        <div class="unified-dialog__card-info">
                          <span class="unified-dialog__card-name">
                            {runsHere && <span class="unified-dialog__card-dot" />}
                            {preset.displayName}
                          </span>
                        </div>
                        {runningIn.length > 0 && (
                          <span
                            class="unified-dialog__card-status"
                            title={t('unified.runningInWorkspaces', { names: runningNames.join(', ') })}
                          >
                            {runningNames.slice(0, 2).join(', ')}
                            {runningNames.length > 2 ? ` +${runningNames.length - 2}` : ''}
                          </span>
                        )}
                        {isStarting && (
                          <span class="unified-dialog__card-status">{t('unified.starting')}</span>
                        )}
                      </button>
                      {otherWorkspaces.length > 0 && (
                        <button
                          class="unified-dialog__card-ws"
                          onClick={() => setWsPickerFor(expanded ? null : preset.id)}
                          disabled={isStarting}
                          title={t('unified.startInWorkspace')}
                        >
                          ⤳
                        </button>
                      )}
                      {onResumePreset && (
                        <button
                          class="unified-dialog__card-resume"
                          onClick={() => onResumePreset(preset.id as EntityId)}
                          disabled={isStarting}
                          title={t('unified.resume')}
                        >
                          {t('unified.resumeShort')}
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div class="unified-dialog__ws-chips">
                        {otherWorkspaces.map(w => (
                          <button
                            key={w.id}
                            class="unified-dialog__ws-chip"
                            onClick={() => {
                              setWsPickerFor(null)
                              onSelectPreset(preset.id as EntityId, false, w.id)
                            }}
                          >
                            {w.name}
                          </button>
                        ))}
                      </div>
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
