import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

const api = () => (window as any).cipherMux

interface EnrichedBugreport {
  title: string
  severity: string
  tags: string[]
  steps_to_reproduce: string[]
  expected_behavior: string
  actual_behavior: string
  summary: string
}

interface BugreportDialogProps {
  visible: boolean
  onClose: () => void
}

export type ReportType = 'bug' | 'feature-request'

/** Relay lifecycle: idle → starting → ready → active (bubbles flowing) */
type RelayState = 'idle' | 'starting' | 'ready' | 'error'

interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

/** Format an enriched bugreport as a Markdown document. */
function formatEnriched(e: EnrichedBugreport): string {
  const lines: string[] = [
    `# ${e.title}`,
    '',
    `**Severity:** ${e.severity}`,
  ]
  if (e.tags.length) lines.push(`**Tags:** ${e.tags.join(', ')}`)
  lines.push('')

  if (e.summary) {
    lines.push('## Summary', e.summary, '')
  }
  if (e.steps_to_reproduce.length) {
    lines.push('## Steps to Reproduce')
    e.steps_to_reproduce.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
    lines.push('')
  }
  if (e.expected_behavior) {
    lines.push('## Expected Behavior', e.expected_behavior, '')
  }
  if (e.actual_behavior) {
    lines.push('## Actual Behavior', e.actual_behavior)
  }
  return lines.join('\n').trim()
}

function ChatBubbles({ turns }: { turns: ChatTurn[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns.length])

  if (turns.length === 0) return null
  return (
    <div class="bugreport-chat">
      {turns.map((turn, i) => (
        <div key={i} class={`bugreport-chat__bubble bugreport-chat__bubble--${turn.role}`}>{turn.text}</div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}

export function BugreportDialog({ visible, onClose }: BugreportDialogProps) {
  const { t } = useTranslation()
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enriched, setEnriched] = useState<EnrichedBugreport | null>(null)
  const [enrichFailed, setEnrichFailed] = useState(false)
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [voiceAvailable, setVoiceAvailable] = useState(false)

  // Voice relay state
  const [relayState, setRelayState] = useState<RelayState>('idle')
  const [relayError, setRelayError] = useState<string | null>(null)
  const [relaySessionId, setRelaySessionId] = useState<string | null>(null)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const closingRef = useRef(false)

  const relayActive = relayState === 'starting' || relayState === 'ready'

  // Load voice availability on mount
  useEffect(() => {
    let mounted = true
    api()?.voice?.available?.().then((res: { available: boolean }) => {
      if (!mounted) return
      setVoiceAvailable(res?.available ?? false)
    }).catch(() => { if (mounted) setVoiceAvailable(false) })
    return () => { mounted = false }
  }, [])

  // Auto-start relay when dialog opens with STT active
  useEffect(() => {
    if (!visible) return
    closingRef.current = false
    const w = window as any
    const sttActive = !!w.__cipherMuxSessionVoiceActive
    if (sttActive && relayState === 'idle') {
      startRelay()
    }
  }, [visible])

  // Listen for relay ready, TTS text (bot bubbles), and dispatched text (user bubbles)
  useEffect(() => {
    if (!visible) return
    const cleanups: Array<() => void> = []

    const br = api()?.bugreport
    if (br?.onRelayReady) {
      cleanups.push(br.onRelayReady((data: { sessionId: string }) => {
        if (relaySessionId && data.sessionId === relaySessionId) {
          setRelayState('ready')
        }
      }))
    }
    if (br?.onTtsText) {
      cleanups.push(br.onTtsText((text: string) => {
        if (relayState === 'ready' || relayState === 'starting') {
          setTurns((prev) => [...prev, { role: 'assistant', text }])
        }
      }))
    }
    const voice = api()?.voice
    if (voice?.onDispatched) {
      cleanups.push(voice.onDispatched((data: { sessionId: string; text: string }) => {
        if (relaySessionId && data.sessionId === relaySessionId) {
          setTurns((prev) => [...prev, { role: 'user', text: data.text }])
        }
      }))
    }

    return () => { for (const c of cleanups) c() }
  }, [visible, relaySessionId, relayState])

  const startRelay = useCallback(async () => {
    closingRef.current = false
    setRelayState('starting')
    setRelayError(null)
    setTurns([])
    try {
      const res = await api().bugreport.startRelay()
      // Dialog may have been closed while awaiting — don't update state
      if (closingRef.current) return
      if (res?.ok && res.sessionId) {
        setRelaySessionId(res.sessionId)
        // relayState will switch to 'ready' via onRelayReady event
      } else {
        setRelayState('error')
        setRelayError(res?.error ?? 'unknown error')
      }
    } catch (err: any) {
      if (closingRef.current) return
      setRelayState('error')
      setRelayError(err?.message ?? 'relay start failed')
    }
  }, [])

  const stopRelay = useCallback(async () => {
    try {
      await api()?.bugreport?.stopRelay()
    } catch { /* best effort */ }
    setRelayState('idle')
    setRelaySessionId(null)
    setTurns([])
    setRelayError(null)
  }, [])

  const resetForm = useCallback(() => {
    setReportType('bug')
    setDescription('')
    setEnriched(null)
    setPreview('')
    setEnrichFailed(false)
    setScreenshots([])
  }, [])

  const handleEnrich = useCallback(async () => {
    if (!description.trim()) return
    setEnriching(true)
    setEnrichFailed(false)
    setEnriched(null)
    try {
      const res: EnrichedBugreport | null = await api().bugreport.enrich(description)
      if (res) {
        setEnriched(res)
        setPreview(formatEnriched(res))
      } else {
        setEnrichFailed(true)
      }
    } catch (err) {
      console.error('[BugreportDialog] enrich failed:', err)
      setEnrichFailed(true)
    } finally {
      setEnriching(false)
    }
  }, [description])

  const handleSubmit = useCallback(async () => {
    const finalDescription = enriched ? preview : description
    if (!finalDescription.trim()) return
    setSubmitting(true)
    try {
      const res = await api().bugreport.submit(
        finalDescription, undefined,
        screenshots.length > 0 ? screenshots : undefined,
        reportType,
        enriched ?? undefined,
      )
      setResult(res.id)
      resetForm()
    } catch (err) {
      console.error('[BugreportDialog] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [description, enriched, preview, screenshots, resetForm, reportType])

  const handleClose = useCallback(() => {
    closingRef.current = true
    setResult(null)
    resetForm()
    // Always stop relay if it was started (starting or ready)
    if (relayState !== 'idle') {
      stopRelay()
    }
    onClose()
  }, [onClose, stopRelay, resetForm, relayState])

  const handleAttachScreenshot = useCallback(async () => {
    const paths: string[] = await api().bugreport.pickScreenshot()
    if (paths.length > 0) setScreenshots((prev) => [...prev, ...paths])
  }, [])

  const handleRemoveScreenshot = useCallback((idx: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  if (!visible) return null

  return (
    <div class="modal-overlay modal-overlay--bugreport" onClick={handleClose}>
      <div class="modal-panel bugreport-panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">{t('bugreport.title')}</span>
          <button class="cell-btn" onClick={handleClose}>&times;</button>
        </div>

        <div class="bugreport-body">
          {result ? (
            <>
              <p class="bugreport-body__text">{t('bugreport.resultText', { id: result })}</p>
              <div class="bugreport-footer">
                <button class="btn btn--sm btn--primary" onClick={handleClose}>OK</button>
              </div>
            </>
          ) : (
            <>
              <div class="bugreport-type-toggle">
                <button
                  class={`btn btn--sm ${reportType === 'bug' ? 'btn--primary' : ''}`}
                  onClick={() => setReportType('bug')}
                >{t('bugreport.typeBug')}</button>
                <button
                  class={`btn btn--sm ${reportType === 'feature-request' ? 'btn--primary' : ''}`}
                  onClick={() => setReportType('feature-request')}
                >{t('bugreport.typeFeature')}</button>
              </div>

              <p class="bugreport-body__text">
                {reportType === 'bug'
                  ? (voiceAvailable ? t('bugreport.describeWithVoice') : t('bugreport.describe'))
                  : t('bugreport.describeFeature')}
              </p>

              {/* Voice relay status */}
              {relayState === 'starting' && (
                <p class="bugreport-body__hint">{t('bugreport.relayStarting')}</p>
              )}
              {relayState === 'ready' && turns.length === 0 && (
                <p class="bugreport-body__hint">{t('bugreport.relayReady')}</p>
              )}
              {relayState === 'error' && relayError && (
                <p class="bugreport-body__notice">{t('bugreport.relayError', { error: relayError })}</p>
              )}

              {/* Chat bubbles from voice relay */}
              {relayActive && <ChatBubbles turns={turns} />}

              <textarea
                class="bugreport-textarea"
                rows={3}
                value={description}
                onInput={(e) => {
                  setDescription((e.target as HTMLTextAreaElement).value)
                  if (enriched) {
                    setEnriched(null)
                    setPreview('')
                    setEnrichFailed(false)
                  }
                }}
                placeholder={reportType === 'bug' ? t('bugreport.placeholder') : t('bugreport.placeholderFeature')}
                autoFocus
                disabled={relayActive}
                style={{ resize: 'vertical', minHeight: '60px' }}
              />

              <div class="bugreport-actions">
                <button class="btn btn--sm" onClick={handleAttachScreenshot} disabled={relayActive}>
                  {t('bugreport.screenshot')}
                </button>
                {voiceAvailable && !relayActive && relayState !== 'starting' && (
                  <button class="btn btn--sm" onClick={startRelay}>
                    {t('bugreport.voice')}
                  </button>
                )}
                {relayActive && (
                  <button class="btn btn--sm" onClick={stopRelay}>
                    {t('bugreport.voiceStop')}
                  </button>
                )}
              </div>

              {screenshots.length > 0 && (
                <div class="bugreport-screenshots__list">
                  {screenshots.map((p, i) => (
                    <div key={p} class="bugreport-screenshots__item">
                      <img src={`file://${p}`} alt={`Screenshot ${i + 1}`} class="bugreport-screenshots__thumb" />
                      <button class="bugreport-screenshots__remove" onClick={() => handleRemoveScreenshot(i)} title={t('bugreport.removeScreenshot')}>&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {enrichFailed && <p class="bugreport-body__notice">{t('bugreport.enrichFailed')}</p>}
              {enriched && (
                <>
                  <p class="bugreport-body__label">{t('bugreport.previewLabel')}</p>
                  <textarea class="bugreport-textarea bugreport-textarea--preview" rows={10} value={preview}
                    onInput={(e) => setPreview((e.target as HTMLTextAreaElement).value)} />
                </>
              )}

              <div class="bugreport-footer">
                <button class="btn btn--sm" onClick={handleClose}>{t('bugreport.cancel')}</button>
                {!enriched && !relayActive && (
                  <button class="btn btn--sm" onClick={handleEnrich} disabled={enriching || !description.trim()}>
                    {enriching ? t('bugreport.analyzing') : t('bugreport.preview')}
                  </button>
                )}
                <button class="btn btn--sm btn--primary" onClick={handleSubmit}
                  disabled={submitting || relayActive || (!description.trim() && !preview.trim())}>
                  {submitting ? t('bugreport.sending') : t('bugreport.submit')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
