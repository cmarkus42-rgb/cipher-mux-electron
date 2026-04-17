import { useState, useCallback } from 'preact/hooks'

const api = () => (window as any).cipherMux

interface BugreportDialogProps {
  visible: boolean
  onClose: () => void
}

export function BugreportDialog({ visible, onClose }: BugreportDialogProps) {
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    if (!description.trim()) return
    setSubmitting(true)
    try {
      const res = await api().bugreport.submit(description)
      setResult(res.id)
      setDescription('')
    } catch (err) {
      console.error('[BugreportDialog] submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }, [description])

  const handleClose = useCallback(() => {
    setResult(null)
    setDescription('')
    onClose()
  }, [onClose])

  if (!visible) return null

  return (
    <div class="dialog-overlay" onClick={handleClose}>
      <div class="dialog bugreport-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 class="dialog__title">Bugreport</h3>
        {result ? (
          <>
            <p class="dialog__text">
              Report <strong>{result}</strong> in Outbox abgelegt.
            </p>
            <div class="dialog__footer">
              <button class="btn btn--sm btn--primary" onClick={handleClose}>OK</button>
            </div>
          </>
        ) : (
          <>
            <p class="dialog__text">
              Beschreibe das Problem. Diagnostik wird automatisch angehängt.
            </p>
            <textarea
              class="bugreport-textarea"
              rows={6}
              value={description}
              onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
              placeholder="Was ist passiert? Was hast du erwartet?"
              autoFocus
            />
            <div class="dialog__footer">
              <button class="btn btn--sm" onClick={handleClose}>Abbrechen</button>
              <button
                class="btn btn--sm btn--primary"
                onClick={handleSubmit}
                disabled={submitting || !description.trim()}
              >
                {submitting ? 'Sende…' : 'Absenden'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
