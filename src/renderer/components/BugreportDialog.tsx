import { useState, useCallback, useEffect } from 'preact/hooks'
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

  // Notify main process when dialog opens/closes (for STT routing)
  useEffect(() => {
    if (visible) {
      api()?.bugreport?.dialogOpen()
    }
    return () => {
      api()?.bugreport?.dialogClose()
    }
  }, [visible])

  // Receive STT transcriptions and append to textarea
  useEffect(() => {
    if (!visible) return
    const cleanup = api()?.bugreport?.onDialogInsert?.((data: { text: string }) => {
      setDescription((prev) => {
        const separator = prev.length > 0 && !prev.endsWith(' ') ? ' ' : ''
        return prev + separator + data.text
      })
    })
    return () => cleanup?.()
  }, [visible])

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
    setResult(null)
    resetForm()
    onClose()
  }, [onClose, resetForm])

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
                {reportType === 'bug' ? t('bugreport.describe') : t('bugreport.describeFeature')}
              </p>

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
                style={{ resize: 'vertical', minHeight: '60px' }}
              />

              <div class="bugreport-actions">
                <button class="btn btn--sm" onClick={handleAttachScreenshot}>
                  {t('bugreport.screenshot')}
                </button>
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
                {!enriched && (
                  <button class="btn btn--sm" onClick={handleEnrich} disabled={enriching || !description.trim()}>
                    {enriching ? t('bugreport.analyzing') : t('bugreport.preview')}
                  </button>
                )}
                <button class="btn btn--sm btn--primary" onClick={handleSubmit}
                  disabled={submitting || (!description.trim() && !preview.trim())}>
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
