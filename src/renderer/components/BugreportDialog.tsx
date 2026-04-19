import { useState, useCallback, useEffect, useRef } from 'preact/hooks'
import { useVoiceBugreport, type ChatTurn, type VoiceBugreportState } from '../voice/use-voice-bugreport'

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

function formatEnriched(e: EnrichedBugreport): string {
  const lines: string[] = []
  lines.push(`# ${e.title}`)
  lines.push(``)
  lines.push(`**Severity:** ${e.severity}`)
  if (e.tags.length) lines.push(`**Tags:** ${e.tags.join(', ')}`)
  lines.push(``)
  if (e.summary) { lines.push(`## Summary`); lines.push(e.summary); lines.push(``) }
  if (e.steps_to_reproduce.length) {
    lines.push(`## Steps to Reproduce`)
    e.steps_to_reproduce.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
    lines.push(``)
  }
  if (e.expected_behavior) { lines.push(`## Expected Behavior`); lines.push(e.expected_behavior); lines.push(``) }
  if (e.actual_behavior) { lines.push(`## Actual Behavior`); lines.push(e.actual_behavior) }
  return lines.join('\n').trim()
}

function ChatBubbles({ turns }: { turns: ChatTurn[] }) {
  if (turns.length === 0) return null
  return (
    <div class="bugreport-chat">
      {turns.map((turn, i) => (
        <div key={i} class={`bugreport-chat__bubble bugreport-chat__bubble--${turn.role}`}>{turn.text}</div>
      ))}
    </div>
  )
}

export function BugreportDialog({ visible, onClose }: BugreportDialogProps) {
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [enriching, setEnriching] = useState(false)
  const [enriched, setEnriched] = useState<EnrichedBugreport | null>(null)
  const [enrichFailed, setEnrichFailed] = useState(false)
  const [preview, setPreview] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const [screenshots, setScreenshots] = useState<string[]>([])
  const [voiceAvailable, setVoiceAvailable] = useState(false)

  const { voiceState, turns, report, error: voiceError, startVoiceInterview, toggleRecording, stopVoiceInterview } = useVoiceBugreport()

  // Check voice availability on mount
  useEffect(() => {
    api()?.voice?.available?.().then((res: { available: boolean }) => {
      setVoiceAvailable(res?.available ?? false)
    }).catch(() => setVoiceAvailable(false))
  }, [])

  useEffect(() => {
    if (report && !description && voiceState === 'complete') {
      setDescription(report)
      stopVoiceInterview()
    }
  }, [report, description, voiceState, stopVoiceInterview])

  const handleEnrich = useCallback(async () => {
    if (!description.trim()) return
    setEnriching(true); setEnrichFailed(false); setEnriched(null)
    try {
      const res: EnrichedBugreport | null = await api().bugreport.enrich(description)
      if (res) { setEnriched(res); setPreview(formatEnriched(res)) }
      else setEnrichFailed(true)
    } catch (err) { console.error('[BugreportDialog] enrich failed:', err); setEnrichFailed(true) }
    finally { setEnriching(false) }
  }, [description])

  const handleSubmit = useCallback(async () => {
    const finalDescription = enriched ? preview : description
    if (!finalDescription.trim()) return
    setSubmitting(true)
    try {
      const res = await api().bugreport.submit(finalDescription, undefined, screenshots.length > 0 ? screenshots : undefined)
      setResult(res.id); setDescription(''); setEnriched(null); setPreview(''); setEnrichFailed(false); setScreenshots([])
    } catch (err) { console.error('[BugreportDialog] submit failed:', err) }
    finally { setSubmitting(false) }
  }, [description, enriched, preview, screenshots])

  const handleClose = useCallback(() => {
    setResult(null); setDescription(''); setEnriched(null); setPreview(''); setEnrichFailed(false); setScreenshots([])
    stopVoiceInterview()
    onClose()
  }, [onClose, stopVoiceInterview])

  const handleAttachScreenshot = useCallback(async () => {
    const paths: string[] = await api().bugreport.pickScreenshot()
    if (paths.length > 0) setScreenshots((prev) => [...prev, ...paths])
  }, [])

  const handleRemoveScreenshot = useCallback((idx: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const handleVoiceClick = useCallback(() => {
    if (voiceState === 'idle' || voiceState === 'error') startVoiceInterview()
    else if (voiceState === 'ready' || voiceState === 'recording') toggleRecording()
  }, [voiceState, startVoiceInterview, toggleRecording])

  const isVoiceActive = voiceState === 'initializing' || voiceState === 'ready' || voiceState === 'recording' || voiceState === 'processing' || voiceState === 'agent_speaking'

  if (!visible) return null

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal-panel bugreport-panel" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">bug-assistant</span>
          <button class="cell-btn" onClick={handleClose}>&times;</button>
        </div>

        <div class="bugreport-body">
          {result ? (
            <>
              <p class="bugreport-body__text">Report <strong>{result}</strong> in Outbox abgelegt.</p>
              <div class="bugreport-footer">
                <button class="btn btn--sm btn--primary" onClick={handleClose}>OK</button>
              </div>
            </>
          ) : (
            <>
              <p class="bugreport-body__text">
                {voiceAvailable ? 'beschreibe das problem oder nutze voice-interview.' : 'beschreibe das problem.'}
              </p>
              <ChatBubbles turns={turns} />
              {voiceAvailable && voiceError && <p class="bugreport-body__notice">voice: {voiceError}</p>}

              <textarea class="bugreport-textarea" rows={5} value={description}
                onInput={(e) => { setDescription((e.target as HTMLTextAreaElement).value); if (enriched) { setEnriched(null); setPreview(''); setEnrichFailed(false) } }}
                placeholder="was ist passiert? was hast du erwartet?" autoFocus disabled={isVoiceActive} />

              <div class="bugreport-actions">
                <button class="btn btn--sm" onClick={handleAttachScreenshot} disabled={isVoiceActive}>
                  screenshot
                </button>
                {voiceAvailable && (
                  <button class="btn btn--sm" onClick={handleVoiceClick}
                    disabled={voiceState === 'processing' || voiceState === 'agent_speaking' || voiceState === 'initializing'}>
                    {voiceState === 'recording' ? 'aufnahme stoppen' : isVoiceActive ? 'bitte warten...' : 'voice'}
                  </button>
                )}
              </div>

              {screenshots.length > 0 && (
                <div class="bugreport-screenshots__list">
                  {screenshots.map((p, i) => (
                    <div key={p} class="bugreport-screenshots__item">
                      <img src={`file://${p}`} alt={`Screenshot ${i + 1}`} class="bugreport-screenshots__thumb" />
                      <button class="bugreport-screenshots__remove" onClick={() => handleRemoveScreenshot(i)} title="Entfernen">&times;</button>
                    </div>
                  ))}
                </div>
              )}

              {enrichFailed && <p class="bugreport-body__notice">ollama nicht erreichbar — rohtext wird verwendet.</p>}
              {enriched && (
                <>
                  <p class="bugreport-body__label">vorschau (bearbeitbar):</p>
                  <textarea class="bugreport-textarea bugreport-textarea--preview" rows={10} value={preview}
                    onInput={(e) => setPreview((e.target as HTMLTextAreaElement).value)} />
                </>
              )}

              <div class="bugreport-footer">
                <button class="btn btn--sm" onClick={handleClose}>abbrechen</button>
                {!enriched && !isVoiceActive && (
                  <button class="btn btn--sm" onClick={handleEnrich} disabled={enriching || !description.trim()}>
                    {enriching ? 'analysiere\u2026' : 'vorschau'}
                  </button>
                )}
                <button class="btn btn--sm btn--primary" onClick={handleSubmit}
                  disabled={submitting || isVoiceActive || (!description.trim() && !preview.trim())}>
                  {submitting ? 'sende\u2026' : 'absenden'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
