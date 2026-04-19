import { useState, useCallback } from 'preact/hooks'
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

function MicIcon({ state }: { state: VoiceBugreportState }) {
  const isRecording = state === 'recording'
  const isProcessing = state === 'processing'
  const isSpeaking = state === 'agent_speaking'
  const className = [
    'bugreport-mic',
    isRecording ? 'bugreport-mic--recording' : '',
    isProcessing ? 'bugreport-mic--processing' : '',
    isSpeaking ? 'bugreport-mic--speaking' : '',
  ].filter(Boolean).join(' ')
  return <span class={className}>{isProcessing ? '\u27F3' : isSpeaking ? '\uD83D\uDD0A' : '\uD83C\uDF99'}</span>
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

  const { voiceState, turns, report, error: voiceError, startVoiceInterview, toggleRecording, stopVoiceInterview } = useVoiceBugreport()

  // When interview completes, put report into description
  if (report && !description && voiceState === 'complete') {
    setDescription(report)
    stopVoiceInterview()
  }

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
      const res = await api().bugreport.submit(finalDescription)
      setResult(res.id); setDescription(''); setEnriched(null); setPreview(''); setEnrichFailed(false)
    } catch (err) { console.error('[BugreportDialog] submit failed:', err) }
    finally { setSubmitting(false) }
  }, [description, enriched, preview])

  const handleClose = useCallback(() => {
    setResult(null); setDescription(''); setEnriched(null); setPreview(''); setEnrichFailed(false)
    stopVoiceInterview()
    onClose()
  }, [onClose, stopVoiceInterview])

  const handleMicClick = useCallback(() => {
    if (voiceState === 'idle') startVoiceInterview()
    else if (voiceState === 'ready' || voiceState === 'recording') toggleRecording()
  }, [voiceState, startVoiceInterview, toggleRecording])

  const isVoiceActive = voiceState !== 'idle' && voiceState !== 'complete' && voiceState !== 'error'

  if (!visible) return null

  return (
    <div class="dialog-overlay" onClick={handleClose}>
      <div class="dialog bugreport-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 class="dialog__title">Bugreport</h3>
        {result ? (
          <>
            <p class="dialog__text">Report <strong>{result}</strong> in Outbox abgelegt.</p>
            <div class="dialog__footer">
              <button class="btn btn--sm btn--primary" onClick={handleClose}>OK</button>
            </div>
          </>
        ) : (
          <>
            <p class="dialog__text">Beschreibe das Problem oder nutze das Mikrofon für ein Voice-Interview.</p>
            <ChatBubbles turns={turns} />
            {voiceError && <p class="bugreport-dialog__notice">Voice-Fehler: {voiceError}</p>}
            <div class="bugreport-input-row">
              <textarea class="bugreport-textarea" rows={5} value={description}
                onInput={(e) => { setDescription((e.target as HTMLTextAreaElement).value); if (enriched) { setEnriched(null); setPreview(''); setEnrichFailed(false) } }}
                placeholder="Was ist passiert? Was hast du erwartet?" autoFocus disabled={isVoiceActive} />
              <button class="btn btn--icon bugreport-mic-btn" onClick={handleMicClick}
                disabled={voiceState === 'processing' || voiceState === 'agent_speaking' || voiceState === 'initializing'}
                title={voiceState === 'idle' ? 'Voice-Interview starten' : voiceState === 'recording' ? 'Aufnahme stoppen' : 'Voice aktiv'}>
                <MicIcon state={voiceState} />
              </button>
            </div>
            {enrichFailed && <p class="bugreport-dialog__notice">Ollama nicht erreichbar — Rohtext wird verwendet.</p>}
            {enriched && (
              <>
                <p class="bugreport-dialog__label">Vorschau (bearbeitbar):</p>
                <textarea class="bugreport-textarea bugreport-textarea--preview" rows={10} value={preview}
                  onInput={(e) => setPreview((e.target as HTMLTextAreaElement).value)} />
              </>
            )}
            <div class="dialog__footer">
              <button class="btn btn--sm" onClick={handleClose}>Abbrechen</button>
              {!enriched && !isVoiceActive && (
                <button class="btn btn--sm" onClick={handleEnrich} disabled={enriching || !description.trim()}>
                  {enriching ? 'Analysiere\u2026' : 'Vorschau'}
                </button>
              )}
              <button class="btn btn--sm btn--primary" onClick={handleSubmit}
                disabled={submitting || isVoiceActive || (!description.trim() && !preview.trim())}>
                {submitting ? 'Sende\u2026' : 'Absenden'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
