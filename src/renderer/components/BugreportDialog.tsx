import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { useVoiceBugreport, type ChatTurn } from '../voice/use-voice-bugreport'

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

/** States where the voice interview is actively running. */
const VOICE_ACTIVE_STATES = new Set(['initializing', 'ready', 'user_speaking', 'recording', 'processing', 'agent_speaking'])

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

export type ReportType = 'bug' | 'feature-request'

type EnrichBackend = 'cloud' | 'local'

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
  const [enrichBackend, setEnrichBackend] = useState<EnrichBackend>('cloud')

  const { voiceState, turns, report, error: voiceError, startVoiceInterview, stopVoiceInterview } = useVoiceBugreport()

  // Load enrich backend + voice availability on mount
  useEffect(() => {
    let mounted = true
    api()?.voice?.available?.().then((res: { available: boolean }) => {
      if (!mounted) return
      setVoiceAvailable(res?.available ?? false)
    }).catch(() => { if (mounted) setVoiceAvailable(false) })
    api()?.config?.get?.('llm').then((llm: any) => {
      if (!mounted) return
      if (llm?.bugreportEnrichBackend === 'local' || llm?.bugreportEnrichBackend === 'cloud') {
        setEnrichBackend(llm.bugreportEnrichBackend)
      }
    }).catch(() => {})
    return () => { mounted = false }
  }, [])

  // Pause app-level STT when BugReport opens, resume on close (B12)
  const sttWasPausedRef = useRef(false)
  useEffect(() => {
    const w = window as any
    if (visible && w.__cipherMuxSessionVoiceActive) {
      console.log('[BugreportDialog] Pausing app STT while BugReport open')
      api()?.voice?.setRoutingMode?.('off')
      sttWasPausedRef.current = true
    }
    return () => {
      if (sttWasPausedRef.current) {
        console.log('[BugreportDialog] Resuming app STT after BugReport close')
        api()?.voice?.setRoutingMode?.('session')
        sttWasPausedRef.current = false
      }
    }
  }, [visible])

  useEffect(() => {
    if (report && !description && voiceState === 'complete') {
      setDescription(report)
      stopVoiceInterview()
    }
  }, [report, description, voiceState, stopVoiceInterview])

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
    setResult(null)
    resetForm()
    stopVoiceInterview()
    onClose()
  }, [onClose, stopVoiceInterview, resetForm])

  const handleAttachScreenshot = useCallback(async () => {
    const paths: string[] = await api().bugreport.pickScreenshot()
    if (paths.length > 0) setScreenshots((prev) => [...prev, ...paths])
  }, [])

  const handleRemoveScreenshot = useCallback((idx: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleBackendToggle = useCallback((backend: EnrichBackend) => {
    setEnrichBackend(backend)
    api()?.config?.get?.('llm').then((llm: any) => {
      api()?.config?.set?.('llm', { ...llm, bugreportEnrichBackend: backend })
    }).catch(() => {})
  }, [])

  const isVoiceActive = VOICE_ACTIVE_STATES.has(voiceState)

  const handleVoiceClick = useCallback(() => {
    if (voiceState === 'idle' || voiceState === 'error') startVoiceInterview()
    else if (isVoiceActive) stopVoiceInterview()
  }, [voiceState, startVoiceInterview, stopVoiceInterview, isVoiceActive])

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
                <span class="bugreport-type-toggle__separator" />
                <button
                  class={`btn btn--sm ${enrichBackend === 'cloud' ? 'btn--primary' : ''}`}
                  onClick={() => handleBackendToggle('cloud')}
                >{t('bugreport.backendCloud')}</button>
                <button
                  class={`btn btn--sm ${enrichBackend === 'local' ? 'btn--primary' : ''}`}
                  onClick={() => handleBackendToggle('local')}
                >{t('bugreport.backendLocal')}</button>
              </div>
              <p class="bugreport-body__text">
                {reportType === 'bug'
                  ? (voiceAvailable ? t('bugreport.describeWithVoice') : t('bugreport.describe'))
                  : t('bugreport.describeFeature')}
              </p>
              {isVoiceActive && <ChatBubbles turns={turns} />}
              {isVoiceActive && turns.length === 0 && (
                <p class="bugreport-body__hint">{t('bugreport.voiceHint')}</p>
              )}
              {voiceAvailable && voiceError && (
                <p class="bugreport-body__notice">
                  voice: {voiceError.length > 80 ? voiceError.slice(0, 80) + '…' : voiceError}
                </p>
              )}

              <textarea class="bugreport-textarea" rows={5} value={description}
                onInput={(e) => {
                  setDescription((e.target as HTMLTextAreaElement).value)
                  if (enriched) {
                    setEnriched(null)
                    setPreview('')
                    setEnrichFailed(false)
                  }
                }}
                placeholder={reportType === 'bug' ? t('bugreport.placeholder') : t('bugreport.placeholderFeature')} autoFocus disabled={isVoiceActive} />

              <div class="bugreport-actions">
                <button class="btn btn--sm" onClick={handleAttachScreenshot} disabled={isVoiceActive}>
                  {t('bugreport.screenshot')}
                </button>
                {voiceAvailable && (
                  <button class="btn btn--sm" onClick={handleVoiceClick}
                    disabled={voiceState === 'initializing'}>
                    {isVoiceActive ? t('bugreport.voiceStop') : t('bugreport.voice')}
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
                {!enriched && !isVoiceActive && (
                  <button class="btn btn--sm" onClick={handleEnrich} disabled={enriching || !description.trim()}>
                    {enriching ? t('bugreport.analyzing') : t('bugreport.preview')}
                  </button>
                )}
                <button class="btn btn--sm btn--primary" onClick={handleSubmit}
                  disabled={submitting || isVoiceActive || (!description.trim() && !preview.trim())}>
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
