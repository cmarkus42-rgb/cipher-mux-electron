import { useState, useCallback } from 'preact/hooks'

interface KickoffDialogProps {
  visible: boolean
  onClose: () => void
  onKickoff: (req: {
    projectDir: string
    requirementsFile?: string
    extraContext?: string
  }) => void
}

const api = (window as any).cipherMux

export function KickoffDialog({ visible, onClose, onKickoff }: KickoffDialogProps) {
  const [projectDir, setProjectDir] = useState('')
  const [requirementsFile, setRequirementsFile] = useState('')
  const [extraContext, setExtraContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handlePickDir = useCallback(async () => {
    const selected = await api.dialog.openDir({
      title: 'Projekt-Verzeichnis wählen (das Obsidian-Verzeichnis)',
    })
    if (selected) setProjectDir(selected)
  }, [])

  const handlePickReqFile = useCallback(async () => {
    // No extension filter — all formats allowed.
    const selected = await api.dialog.openFile({
      title: 'Externe Anforderungsdatei wählen',
    })
    if (selected) setRequirementsFile(selected)
  }, [])

  const handleSubmit = useCallback(async () => {
    setError(null)
    if (!projectDir.trim()) {
      setError('Projekt-Verzeichnis fehlt')
      return
    }

    setLoading(true)
    try {
      await onKickoff({
        projectDir: projectDir.trim(),
        requirementsFile: requirementsFile.trim() || undefined,
        extraContext: extraContext.trim() || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [projectDir, requirementsFile, extraContext, onKickoff])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
  }, [onClose, handleSubmit])

  if (!visible) return null

  return (
    <div class="kickoff-overlay" onKeyDown={handleKeyDown}>
      <div class="kickoff-dialog card card--flat">
        <div class="kickoff-dialog__header">
          <span>Neues Projekt aus Konzept</span>
          <span class="kickoff-dialog__close" onClick={onClose}>✕</span>
        </div>

        <div class="kickoff-dialog__body">
          {/* Project Directory */}
          <label class="kickoff-dialog__label">
            <span>Projekt-Verzeichnis</span>
            <div class="kickoff-dialog__file-row">
              <input
                class="input"
                type="text"
                placeholder="/Users/cipher/Nextcloud/…"
                value={projectDir}
                onInput={(e) => setProjectDir((e.target as HTMLInputElement).value)}
                autoFocus
              />
              <button class="btn btn--sm" onClick={handlePickDir}>…</button>
            </div>
            <span class="text-xs text-dim" style={{ marginTop: '4px' }}>
              Das Obsidian-Verzeichnis, in dem dein Konzept liegt.
            </span>
          </label>

          {/* External Requirements File (optional) */}
          <label class="kickoff-dialog__label">
            <span>Anforderungsdatei (optional)</span>
            <div class="kickoff-dialog__file-row">
              <input
                class="input"
                type="text"
                placeholder="Leer lassen, wenn schon im Projekt-Verzeichnis"
                value={requirementsFile}
                onInput={(e) => setRequirementsFile((e.target as HTMLInputElement).value)}
              />
              <button class="btn btn--sm" onClick={handlePickReqFile}>…</button>
            </div>
            <span class="text-xs text-dim" style={{ marginTop: '4px' }}>
              Beliebiges Format (.md, .txt, .docx, .yaml …). Wird als docs/requirements.&lt;ext&gt; ins Projekt kopiert.
            </span>
          </label>

          {/* Extra Context (optional) */}
          <label class="kickoff-dialog__label">
            <span>Zusätzlicher Kontext (optional)</span>
            <textarea
              class="input"
              rows={6}
              placeholder="Alles, was Claude zusätzlich wissen soll: Stack-Präferenzen, Referenz-Projekte, Miro-URLs, …"
              value={extraContext}
              onInput={(e) => setExtraContext((e.target as HTMLTextAreaElement).value)}
              style={{ fontFamily: "'Fira Code', monospace", fontSize: '12px', resize: 'vertical' }}
            />
          </label>

          {error && <div class="kickoff-dialog__error">{error}</div>}
        </div>

        <div class="kickoff-dialog__footer">
          <button class="btn" onClick={onClose}>Abbrechen</button>
          <button class="btn btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Starte Launcher…' : 'Projekt aufsetzen'}
          </button>
        </div>
      </div>
    </div>
  )
}
