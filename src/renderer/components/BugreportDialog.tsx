import { useState, useCallback, useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

const api = () => (window as any).cipherMux

interface BugreportDialogProps {
  visible: boolean
  onClose: () => void
}

export type ReportType = 'bug' | 'feature-request'

export function BugreportDialog({ visible, onClose }: BugreportDialogProps) {
  const { t } = useTranslation()
  const [reportType, setReportType] = useState<ReportType>('bug')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ id: string; issueUrl?: string } | null>(null)
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
    setScreenshots([])
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) return
    setSubmitting(true)
    try {
      const res = await api().bugreport.submit(
        description, undefined,
        screenshots.length > 0 ? screenshots : undefined,
        reportType,
      )
      setResult({ id: res.id, issueUrl: res.issueUrl })
      resetForm()
    } catch (err) {
      console.error('[BugreportDialog] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [description, screenshots, resetForm, reportType])

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
              <p class="bugreport-body__text">{t('bugreport.resultText', { id: result.id })}</p>
              {result.issueUrl && (
                <p class="bugreport-body__text">
                  <a href="#" onClick={(e) => { e.preventDefault(); api()?.openExternal?.(result.issueUrl) }}
                    style={{ color: 'var(--color-accent)', textDecoration: 'underline', cursor: 'pointer' }}>
                    GitHub Issue öffnen
                  </a>
                </p>
              )}
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
                rows={5}
                value={description}
                onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                placeholder={reportType === 'bug' ? t('bugreport.placeholder') : t('bugreport.placeholderFeature')}
                autoFocus
                style={{ resize: 'vertical', minHeight: '80px' }}
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

              <div class="bugreport-footer">
                <button class="btn btn--sm" onClick={handleClose}>{t('bugreport.cancel')}</button>
                <button class="btn btn--sm btn--primary" onClick={handleSubmit}
                  disabled={submitting || !description.trim()}>
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
