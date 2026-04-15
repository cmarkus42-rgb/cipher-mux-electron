import { useState, useCallback } from 'preact/hooks'

interface KickoffDialogProps {
  visible: boolean
  onClose: () => void
  onKickoff: (opts: {
    requirementsFile: string
    targetDir: string
    projectName: string
    autoInterview: boolean
  }) => void
}

const api = (window as any).cipherMux

export function KickoffDialog({ visible, onClose, onKickoff }: KickoffDialogProps) {
  const [requirementsFile, setRequirementsFile] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [projectName, setProjectName] = useState('')
  const [autoInterview, setAutoInterview] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handlePickFile = useCallback(async () => {
    const path = await api.dialog.openFile({
      title: 'Requirements-Datei wählen',
      filters: [{ name: 'Markdown / Text', extensions: ['md', 'txt', 'yaml', 'yml'] }],
    })
    if (path) setRequirementsFile(path)
  }, [])

  const handlePickDir = useCallback(async () => {
    const path = await api.dialog.openDir({ title: 'Zielverzeichnis wählen' })
    if (path) setTargetDir(path)
  }, [])

  const handleSubmit = useCallback(async () => {
    setError(null)
    if (!requirementsFile.trim()) {
      setError('Requirements-Datei fehlt')
      return
    }
    if (!targetDir.trim()) {
      setError('Zielverzeichnis fehlt')
      return
    }
    if (!projectName.trim()) {
      setError('Projektname fehlt')
      return
    }

    setLoading(true)
    try {
      await onKickoff({
        requirementsFile: requirementsFile.trim(),
        targetDir: targetDir.trim(),
        projectName: projectName.trim(),
        autoInterview,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [requirementsFile, targetDir, projectName, autoInterview, onKickoff])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
  }, [onClose, handleSubmit])

  if (!visible) return null

  return (
    <div class="kickoff-overlay" onKeyDown={handleKeyDown}>
      <div class="kickoff-dialog card card--flat">
        <div class="kickoff-dialog__header">
          <span>Neues Projekt</span>
          <span class="kickoff-dialog__close" onClick={onClose}>✕</span>
        </div>

        <div class="kickoff-dialog__body">
          {/* Project Name */}
          <label class="kickoff-dialog__label">
            <span>Projektname</span>
            <input
              class="input"
              type="text"
              placeholder="my-project"
              value={projectName}
              onInput={(e) => setProjectName((e.target as HTMLInputElement).value)}
              autoFocus
            />
          </label>

          {/* Requirements File */}
          <label class="kickoff-dialog__label">
            <span>Requirements-Datei</span>
            <div class="kickoff-dialog__file-row">
              <input
                class="input"
                type="text"
                placeholder="/path/to/requirements.md"
                value={requirementsFile}
                onInput={(e) => setRequirementsFile((e.target as HTMLInputElement).value)}
              />
              <button class="btn btn--sm" onClick={handlePickFile}>...</button>
            </div>
          </label>

          {/* Target Directory */}
          <label class="kickoff-dialog__label">
            <span>Zielverzeichnis</span>
            <div class="kickoff-dialog__file-row">
              <input
                class="input"
                type="text"
                placeholder="Übergeordnetes Verzeichnis (z.B. ~/Projects)"
                value={targetDir}
                onInput={(e) => setTargetDir((e.target as HTMLInputElement).value)}
              />
              <button class="btn btn--sm" onClick={handlePickDir}>...</button>
            </div>
          </label>

          {/* Auto Interview Toggle */}
          <div
            class={`toggle ${autoInterview ? 'toggle--active' : ''}`}
            onClick={() => setAutoInterview((v) => !v)}
          >
            <div class="toggle__track" />
            <span>Auto-Interview starten</span>
          </div>

          {error && <div class="kickoff-dialog__error">{error}</div>}
        </div>

        <div class="kickoff-dialog__footer">
          <button class="btn" onClick={onClose}>Abbrechen</button>
          <button class="btn btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Erstelle...' : 'Projekt erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
