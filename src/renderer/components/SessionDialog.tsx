import { useState, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import { FolderPickerInput } from './FolderPickerInput'

interface SessionDialogProps {
  visible: boolean
  onStart: (path: string, opts?: { resume?: boolean }) => void
  onClose: () => void
}

export function SessionDialog({ visible, onStart, onClose }: SessionDialogProps) {
  const { t } = useTranslation()
  const [path, setPath] = useState('')
  const [resume, setResume] = useState(false)

  const handleStart = useCallback(() => {
    onStart(path.trim(), { resume })
    setPath('')
    setResume(false)
  }, [path, resume, onStart])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') handleStart()
  }, [handleStart])

  const handleClose = useCallback(() => {
    setPath('')
    setResume(false)
    onClose()
  }, [onClose])

  if (!visible) return null

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal-panel session-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">{t('sessionDialog.title')}</span>
          <button class="cell-btn" onClick={handleClose}>&times;</button>
        </div>
        <div class="session-dialog__body">
          <FolderPickerInput
            value={path}
            onChange={setPath}
            placeholder={t('sessionDialog.placeholder')}
            onKeyDown={handleKeyDown}
            autofocus
          />
          <label class="session-dialog__checkbox">
            <input
              type="checkbox"
              checked={resume}
              onChange={(e) => setResume((e.target as HTMLInputElement).checked)}
            />
            <span>{t('sessionDialog.resumeLabel')}</span>
          </label>
          <div class="session-dialog__footer">
            <button class="btn btn--sm" onClick={handleClose}>{t('sessionDialog.cancel')}</button>
            <button class="btn btn--sm btn--primary" onClick={handleStart}>{t('sessionDialog.open')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
