import { useState, useCallback } from 'preact/hooks'

const api = () => (window as any).cipherMux

interface SessionDialogProps {
  visible: boolean
  onStart: (path: string) => void
  onClose: () => void
}

export function SessionDialog({ visible, onStart, onClose }: SessionDialogProps) {
  const [path, setPath] = useState('')

  const handleBrowse = useCallback(async () => {
    const result = await api().dialog.openDir()
    if (result) setPath(result)
  }, [])

  const handleStart = useCallback(() => {
    onStart(path.trim())
    setPath('')
  }, [path, onStart])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter') handleStart()
  }, [handleStart])

  const handleClose = useCallback(() => {
    setPath('')
    onClose()
  }, [onClose])

  if (!visible) return null

  return (
    <div class="modal-overlay" onClick={handleClose}>
      <div class="modal-panel session-dialog" onClick={(e) => e.stopPropagation()}>
        <div class="modal-header">
          <span class="modal-title">session öffnen</span>
          <button class="cell-btn" onClick={handleClose}>&times;</button>
        </div>
        <div class="session-dialog__body">
          <div class="session-dialog__row">
            <input
              type="text"
              class="project-popup__input"
              placeholder="pfad eingeben oder leer für home..."
              value={path}
              onInput={(e) => setPath((e.target as HTMLInputElement).value)}
              onKeyDown={handleKeyDown}
              autofocus
            />
            <button class="cell-btn" onClick={handleBrowse} title="verzeichnis auswählen">...</button>
          </div>
          <div class="session-dialog__footer">
            <button class="btn btn--sm" onClick={handleClose}>abbrechen</button>
            <button class="btn btn--sm btn--primary" onClick={handleStart}>öffnen</button>
          </div>
        </div>
      </div>
    </div>
  )
}
