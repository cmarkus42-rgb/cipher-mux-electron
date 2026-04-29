import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { RecoveryResult, SessionInfo } from '../../shared/types'

const api = () => (window as any).cipherMux

/** Max time (ms) to poll for recovery result before giving up. */
const POLL_TIMEOUT_MS = 15_000
/** Interval between poll attempts. */
const POLL_INTERVAL_MS = 500

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

  // Store latest callback refs so the effect doesn't need to re-run on prop changes
  const onDoneRef = useRef(onDone)
  const onRecoveredRef = useRef(onRecovered)
  const onAdoptRef = useRef(onAdopt)
  onDoneRef.current = onDone
  onRecoveredRef.current = onRecovered
  onAdoptRef.current = onAdopt

  const processResult = useCallback((result: RecoveryResult) => {
    if (!result || handledRef.current) return
    handledRef.current = true
    console.log(`[RecoveryDialog] processing result: ${result.recovered.length} recovered, ${result.orphaned.length} orphaned`)
    setRecoveryResult(result)

    if (result.recovered.length > 0) {
      setPhase('restore')
    } else if (result.orphaned.length > 0) {
      setOrphans(result.orphaned)
      setSelected(new Set(result.orphaned.map(o => o.id)))
      setPhase('orphans')
    } else {
      onDoneRef.current()
    }
  }, [])

  // Single stable effect — runs once on mount, never re-runs
  useEffect(() => {
    // Push-based: listen for recovery result events
    const unsub = api().sessions.onRecoveryResult((result: RecoveryResult) => {
      processResult(result)
    })

    // Poll-based: retry until we get a result or timeout.
    // The push event may fire before this component mounts, and the
    // first pull may return null if the main process init hasn't finished.
    let pollTimer: ReturnType<typeof setTimeout> | null = null
    const startTime = Date.now()

    const poll = () => {
      if (handledRef.current) return // already processed
      api().sessions.recover().then((result: RecoveryResult | null) => {
        if (handledRef.current) return
        if (result && (result.recovered.length > 0 || result.orphaned.length > 0)) {
          processResult(result)
        } else if (result) {
          // Empty recovery result (no recovered, no orphaned) — finish immediately
          processResult(result)
        } else if (Date.now() - startTime < POLL_TIMEOUT_MS) {
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
        } else {
          // Poll timed out without any result — call onDone so default workspace can load
          if (!handledRef.current) {
            handledRef.current = true
            onDoneRef.current()
          }
        }
      }).catch(() => {
        // Retry on error too (IPC might not be ready yet)
        if (!handledRef.current && Date.now() - startTime < POLL_TIMEOUT_MS) {
          pollTimer = setTimeout(poll, POLL_INTERVAL_MS)
        }
      })
    }
    poll()

    return () => {
      unsub()
      if (pollTimer) clearTimeout(pollTimer)
    }
  }, [processResult])

  // ─── Restore Phase Handlers ─────────────────────────────

  const handleRestoreConfirm = useCallback(() => {
    if (!recoveryResult) return
    if (onRecoveredRef.current) onRecoveredRef.current(recoveryResult)
    // Proceed to orphans or finish
    if (recoveryResult.orphaned.length > 0) {
      setOrphans(recoveryResult.orphaned)
      setSelected(new Set(recoveryResult.orphaned.map(o => o.id)))
      setPhase('orphans')
    } else {
      setPhase('idle')
      onDoneRef.current()
    }
  }, [recoveryResult])

  const handleRestoreDecline = useCallback(async () => {
    if (!recoveryResult) return
    await api().sessions.recoveryDecline()
    if (recoveryResult.orphaned.length > 0) {
      setOrphans(recoveryResult.orphaned)
      setSelected(new Set(recoveryResult.orphaned.map(o => o.id)))
      setPhase('orphans')
    } else {
      setPhase('idle')
      onDoneRef.current()
    }
  }, [recoveryResult])

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
        const adopted = await api().sessions.recoveryAction('adopt', orphan.tmuxSession, orphan.name)
        const adoptedId = adopted?.id
        if (adoptedId && onAdoptRef.current) onAdoptRef.current(adoptedId)
      }
    }
    setOrphans([])
    setPhase('idle')
    onDoneRef.current()
  }, [orphans, selected])

  const handleKillAll = useCallback(async () => {
    for (const orphan of orphans) {
      await api().sessions.recoveryAction('kill', orphan.tmuxSession)
    }
    setOrphans([])
    setPhase('idle')
    onDoneRef.current()
  }, [orphans])

  const handleIgnoreAll = useCallback(() => {
    setOrphans([])
    setPhase('idle')
    onDoneRef.current()
  }, [])

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
