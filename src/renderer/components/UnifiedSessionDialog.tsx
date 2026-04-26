// src/renderer/components/UnifiedSessionDialog.tsx
import { useState, useCallback, useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { FolderPickerInput } from './FolderPickerInput'
import type { EntityId } from '../../shared/types'

const api = () => (window as any).cipherMux

// ─── Entity preset definitions ───────────────────────────

interface EntityPreset {
  id: EntityId
  nameKey: string // i18n key for display name
  descKey: string // i18n key for description
  color: string
}

const ENTITY_PRESETS: EntityPreset[] = [
  { id: 'orchestrator', nameKey: 'statusBar.orchestrator', descKey: 'unified.desc.orchestrator', color: '#4fc3f7' },
  { id: 'mpo', nameKey: 'statusBar.mpo', descKey: 'unified.desc.mpo', color: '#ab47bc' },
  { id: 'companion', nameKey: 'statusBar.companion', descKey: 'unified.desc.companion', color: '#ffb74d' },
  { id: 'refinement', nameKey: 'statusBar.refinement', descKey: 'unified.desc.refinement', color: '#ef5350' },
  { id: 'voice-relay', nameKey: 'statusBar.voiceRelay', descKey: 'unified.desc.voice', color: '#9b59b6' },
  { id: 'audit', nameKey: 'statusBar.audit', descKey: 'unified.desc.audit', color: '#c0392b' },
]

// ─── Component ───────────────────────────────────────────

type TabMode = 'presets' | 'path'

interface UnifiedSessionDialogProps {
  visible: boolean
  onClose: () => void
  /** Start an entity preset. Returns sessionId or throws. */
  onStartEntity: (entityId: EntityId) => Promise<void>
  /** Focus an already running entity (bring to grid). */
  onFocusEntity: (entityId: EntityId) => void
  /** Start a path-based session. */
  onStartPath: (path: string, opts: PathStartOpts) => void
  /** Entity status: which entities are currently running. */
  entityStatus: Record<string, boolean>
}

export interface PathStartOpts {
  shellOnly?: boolean
  fork?: boolean
  skipPermissions?: boolean
}

export function UnifiedSessionDialog({
  visible, onClose, onStartEntity, onFocusEntity, onStartPath, entityStatus,
}: UnifiedSessionDialogProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<TabMode>('presets')
  const [path, setPath] = useState('')
  const [shellOnly, setShellOnly] = useState(false)
  const [skipPermissions, setSkipPermissions] = useState(true)
  const [fork, setFork] = useState(false)
  const [starting, setStarting] = useState<string | null>(null)

  // Recent paths from config
  const [recentPaths, setRecentPaths] = useState<string[]>([])
  useEffect(() => {
    if (!visible) return
    api().config.get('app').then((cfg: any) => {
      setRecentPaths(cfg?.recentPaths ?? [])
    }).catch(() => {})
  }, [visible])

  // Reset state when dialog opens
  useEffect(() => {
    if (visible) {
      setStarting(null)
    }
  }, [visible])

  const handleEntityClick = useCallback(async (entityId: EntityId) => {
    if (entityStatus[entityId]) {
      onFocusEntity(entityId)
      onClose()
      return
    }
    setStarting(entityId)
    try {
      await onStartEntity(entityId)
      onClose()
    } catch (err) {
      console.error(`[UnifiedSessionDialog] Failed to start ${entityId}:`, err)
    } finally {
      setStarting(null)
    }
  }, [entityStatus, onStartEntity, onFocusEntity, onClose])

  const handlePathStart = useCallback(() => {
    const p = path.trim()
    if (!p) return
    onStartPath(p, { shellOnly, fork, skipPermissions: !shellOnly && skipPermissions })
    // Save to recent paths
    api().config.get('app').then((cfg: any) => {
      const existing: string[] = cfg?.recentPaths ?? []
      const updated = [p, ...existing.filter(x => x !== p)].slice(0, 10)
      api().config.set('app', { ...cfg, recentPaths: updated }).catch(() => {})
    }).catch(() => {})
    setPath('')
    onClose()
  }, [path, shellOnly, fork, skipPermissions, onStartPath, onClose])

  const handlePathKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handlePathStart()
    }
  }, [handlePathStart])

  if (!visible) return null

  return (
    <div class="modal-overlay" onClick={onClose}>
      <div class="modal-panel unified-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">{t('unified.title')}</span>
          <button class="cell-btn" onClick={onClose}>&times;</button>
        </div>

        {/* Tab toggle */}
        <div class="unified-dialog__tabs">
          <button
            class={`unified-dialog__tab${tab === 'presets' ? ' unified-dialog__tab--active' : ''}`}
            onClick={() => setTab('presets')}
          >
            {t('unified.tabPresets')}
          </button>
          <button
            class={`unified-dialog__tab${tab === 'path' ? ' unified-dialog__tab--active' : ''}`}
            onClick={() => setTab('path')}
          >
            {t('unified.tabPath')}
          </button>
        </div>

        {/* Preset mode */}
        {tab === 'presets' && (
          <div class="unified-dialog__body">
            <div class="unified-dialog__presets">
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

        {/* Path mode */}
        {tab === 'path' && (
          <div class="unified-dialog__body">
            <FolderPickerInput
              value={path}
              onChange={setPath}
              placeholder={t('unified.pathPlaceholder')}
              onKeyDown={handlePathKeyDown}
              autofocus
            />

            {/* Recent paths */}
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

            {/* Start options */}
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
      </div>
    </div>
  )
}
