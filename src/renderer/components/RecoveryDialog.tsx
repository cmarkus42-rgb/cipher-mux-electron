import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { RecoveryResult, SessionInfo } from '../../shared/types'

const api = () => (window as any).cipherMux

interface RecoveryDialogProps {
  onDone: () => void
  onAdopt?: (sessionId: string) => void
  /** Called when recovery restores sessions — provides grid state + session list for placement. */
  onRecovered?: (result: RecoveryResult) => void
}

type Phase = 'idle' | 'restore' | 'orphans'

export function RecoveryDialog({ onDone, onAdopt, onRecovered }: RecoveryDialogProps) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>('idle')
  const [recoveryResult, setRecoveryResult] = useState<RecoveryResult | null>(null)
  const [orphans, setOrphans] = useState<SessionInfo[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const handledRef = useRef(false)

  const proceedToOrphans = useCallback((result: RecoveryResult) => {
    if (result.orphaned.length > 0) {
      setOrphans(result.orphaned)
      setSelected(new Set(result.orphaned.map(o => o.id)))
      setPhase('orphans')
    } else {
      setPhase('idle')
      onDone()
    }
  }, [onDone])

  const handleResult = useCallback((result: RecoveryResult) => {
    if (!result || handledRef.current) return
    handledRef.current = true
    setRecoveryResult(result)

    if (result.recovered.length > 0) {
      // Show restore dialog — ask user before placing sessions
      setPhase('restore')
    } else {
      // No recovered sessions — go directly to orphan handling
      proceedToOrphans(result)
    }
  }, [proceedToOrphans])

  useEffect(() => {
    // Push-based: listen for recovery result events
    const unsub = api().sessions.onRecoveryResult((result: RecoveryResult) => {
      handleResult(result)
    })

    // Pull-based: fetch cached recovery result in case the push event
    // was sent before this component mounted (race condition on startup)
    api().sessions.recover().then((result: RecoveryResult | null) => {
      if (result && (result.recovered.length > 0 || result.orphaned.length > 0)) {
        handleResult(result)
      }
    }).catch(() => {})

    return () => unsub()
  }, [handleResult])

  // ─── Restore Phase Handlers ─────────────────────────────

  const handleRestoreConfirm = useCallback(() => {
    if (!recoveryResult) return
    if (onRecovered) onRecovered(recoveryResult)
    proceedToOrphans(recoveryResult)
  }, [recoveryResult, onRecovered, proceedToOrphans])

  const handleRestoreDecline = useCallback(async () => {
    if (!recoveryResult) return
    await api().sessions.recoveryDecline()
    proceedToOrphans(recoveryResult)
  }, [recoveryResult, proceedToOrphans])

  // ─── Orphan Phase Handlers ──────────────────────────────

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
    setPhase('idle')
    onDone()
  }, [orphans, selected, onAdopt, onDone])

  const handleKillAll = useCallback(async () => {
    for (const orphan of orphans) {
      await api().sessions.recoveryAction('kill', orphan.tmuxSession)
    }
    setOrphans([])
    setPhase('idle')
    onDone()
  }, [orphans, onDone])

  const handleIgnoreAll = useCallback(() => {
    // Leave all orphans running in background (don't adopt, don't kill)
    setOrphans([])
    setPhase('idle')
    onDone()
  }, [onDone])

  if (phase === 'idle') return null

  // ─── Restore Dialog (Phase 1) ──────────────────────────

  if (phase === 'restore' && recoveryResult) {
    const sessions = recoveryResult.recovered
    return (
      <div class="modal-overlay">
        <div class="dialog recovery-dialog">
          <h3 class="dialog__title">{t('recovery.restoreTitle')}</h3>
          <p class="dialog__text">
            {t('recovery.restoreMessage', { count: sessions.length })}
          </p>
          <ul class="recovery-list">
            {sessions.map((s) => (
              <li key={s.id} class="recovery-list__item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', width: '100%' }}>
                  <div style={{ flex: 1 }}>
                    <span class="font-mono text-sm">{s.name || s.tmuxSession}</span>
                    {s.projectPath && (
                      <div class="text-xs text-dim" style={{ marginTop: '2px' }}>
                        {s.projectPath}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div class="dialog__footer" style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'flex-end' }}>
            <button class="btn btn--sm" onClick={handleRestoreDecline}>
              {t('recovery.restoreNo')}
            </button>
            <button class="btn btn--sm btn--primary" onClick={handleRestoreConfirm}>
              {t('recovery.restoreYes')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Orphan Dialog (Phase 2) ───────────────────────────

  if (phase === 'orphans' && orphans.length > 0) {
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

  return null
}
