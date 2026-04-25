import { useState, useEffect, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { RecoveryResult, SessionInfo } from '../../shared/types'

const api = () => (window as any).cipherMux

interface RecoveryDialogProps {
  onDone: () => void
  onAdopt?: (sessionId: string) => void
}

export function RecoveryDialog({ onDone, onAdopt }: RecoveryDialogProps) {
  const { t } = useTranslation()
  const [orphans, setOrphans] = useState<SessionInfo[]>([])
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const unsub = api().sessions.onRecoveryResult((result: RecoveryResult) => {
      if (result.orphaned.length > 0) {
        setOrphans(result.orphaned)
        setVisible(true)
      }
    })
    return () => unsub()
  }, [])

  const handleAdopt = useCallback(async (orphan: SessionInfo) => {
    const adopted = await api().sessions.recoveryAction('adopt', orphan.tmuxSession, orphan.name)
    // Place adopted session in the grid
    const adoptedId = adopted?.id
    if (adoptedId && onAdopt) {
      onAdopt(adoptedId)
    }
    setOrphans((prev) => prev.filter((o) => o.id !== orphan.id))
  }, [onAdopt])

  const handleKill = useCallback(async (orphan: SessionInfo) => {
    await api().sessions.recoveryAction('kill', orphan.tmuxSession)
    setOrphans((prev) => prev.filter((o) => o.id !== orphan.id))
  }, [])

  const handleKillAll = useCallback(async () => {
    for (const orphan of orphans) {
      await api().sessions.recoveryAction('kill', orphan.tmuxSession)
    }
    setOrphans([])
  }, [orphans])

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
            <li key={o.id} class="recovery-list__item">
              <span class="font-mono text-sm">{o.tmuxSession}</span>
              <span class="text-xs text-dim">
                {new Date(o.createdAt).toLocaleString('de-DE')}
              </span>
              <div class="recovery-list__actions">
                <button class="btn btn--sm btn--primary" onClick={() => handleAdopt(o)}>
                  {t('recovery.adopt')}
                </button>
                <button class="btn btn--sm" onClick={() => handleKill(o)}>
                  {t('recovery.kill')}
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div class="dialog__footer">
          <button class="btn btn--sm" onClick={handleKillAll}>
            {t('recovery.killAll')}
          </button>
        </div>
      </div>
    </div>
  )
}
