import { useState, useEffect, useCallback } from 'preact/hooks'
import type { RecoveryResult, SessionInfo } from '../../shared/types'

const api = () => (window as any).cipherMux

interface RecoveryDialogProps {
  onDone: () => void
}

export function RecoveryDialog({ onDone }: RecoveryDialogProps) {
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
    await api().sessions.recoveryAction('adopt', orphan.tmuxSession, orphan.name)
    setOrphans((prev) => prev.filter((o) => o.id !== orphan.id))
  }, [])

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
    <div class="dialog-overlay">
      <div class="dialog recovery-dialog">
        <h3 class="dialog__title">Session-Recovery</h3>
        <p class="dialog__text">
          {orphans.length} verwaiste Session{orphans.length > 1 ? 's' : ''} gefunden:
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
                  Übernehmen
                </button>
                <button class="btn btn--sm" onClick={() => handleKill(o)}>
                  Beenden
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div class="dialog__footer">
          <button class="btn btn--sm" onClick={handleKillAll}>
            Alle beenden
          </button>
        </div>
      </div>
    </div>
  )
}
