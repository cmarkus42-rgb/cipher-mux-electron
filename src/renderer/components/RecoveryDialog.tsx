import { useState, useEffect, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { RecoveryResult, SessionInfo } from '../../shared/types'

const api = () => (window as any).cipherMux

interface RecoveryDialogProps {
  onDone: () => void
  onAdopt?: (sessionId: string) => void
  /** Called when recovery restores sessions — provides grid state + session list for placement. */
  onRecovered?: (result: RecoveryResult) => void
}

export function RecoveryDialog({ onDone, onAdopt, onRecovered }: RecoveryDialogProps) {
  const { t } = useTranslation()
  const [orphans, setOrphans] = useState<SessionInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsub = api().sessions.onRecoveryResult((result: RecoveryResult) => {
      // Notify parent about recovered sessions + grid state for placement
      if (result.recovered.length > 0 && onRecovered) {
        onRecovered(result)
      }

      if (result.orphaned.length > 0) {
        setOrphans(result.orphaned)
        // Default: all selected for grid adoption
        setSelected(new Set(result.orphaned.map(o => o.id)))
        setVisible(true)
      }
    })
    return () => unsub()
  }, [onRecovered])

  const toggleOrphan = useCallback((id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleConfirm = useCallback(async () => {
    for (const orphan of orphans) {
      if (selected.has(orphan.id)) {
        // Adopt into grid
        const adopted = await api().sessions.recoveryAction('adopt', orphan.tmuxSession, orphan.name)
        const adoptedId = adopted?.id
        if (adoptedId && onAdopt) onAdopt(adoptedId)
      }
      // Unselected orphans stay in background — don't kill, don't adopt
    }
    setOrphans([])
    setVisible(false)
    onDone()
  }, [orphans, selected, onAdopt, onDone])

  const handleKillAll = useCallback(async () => {
    for (const orphan of orphans) {
      await api().sessions.recoveryAction('kill', orphan.tmuxSession)
    }
    setOrphans([])
    setVisible(false)
    onDone()
  }, [orphans, onDone])

  const handleIgnoreAll = useCallback(() => {
    // Leave all orphans running in background (don't adopt, don't kill)
    setOrphans([])
    setVisible(false)
    onDone()
  }, [onDone])

  useEffect(() => {
    if (visible && orphans.length === 0) {
      setVisible(false)
      onDone()
    }
  }, [visible, orphans.length, onDone])

  if (!visible) return null

  return (
    <div class="modal-overlay">
      <div class="dialog recovery-dialog">
        <h3 class="dialog__title">{t('recovery.title')}</h3>
        <p class="dialog__text">
          {t('recovery.orphansFound', { count: orphans.length })}
        </p>
        <ul class="recovery-list">
          {orphans.map((o) => (
            <li key={o.id} class="recovery-list__item" onClick={() => toggleOrphan(o.id)} style={{ cursor: 'pointer' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', width: '100%' }}>
                <input
                  type="checkbox"
                  checked={selected.has(o.id)}
                  onChange={() => toggleOrphan(o.id)}
                />
                <div style={{ flex: 1 }}>
                  <span class="font-mono text-sm">{o.name || o.tmuxSession}</span>
                  {o.projectPath && (
                    <div class="text-xs text-dim" style={{ marginTop: '2px' }}>
                      {o.projectPath}
                    </div>
                  )}
                </div>
              </label>
            </li>
          ))}
        </ul>
        <div class="dialog__footer" style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
          <button class="btn btn--sm" onClick={handleKillAll}>
            {t('recovery.killAll')}
          </button>
          <button class="btn btn--sm" onClick={handleIgnoreAll}>
            {t('recovery.ignoreAll')}
          </button>
          <button class="btn btn--sm btn--primary" onClick={handleConfirm}>
            {t('recovery.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
