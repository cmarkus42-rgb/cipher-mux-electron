import { useState, useCallback } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  const [projectDir, setProjectDir] = useState('')
  const [requirementsFile, setRequirementsFile] = useState('')
  const [extraContext, setExtraContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handlePickDir = useCallback(async () => {
    const selected = await api.dialog.openDir({
      title: t('kickoff.projectDir'),
    })
    if (selected) setProjectDir(selected)
  }, [])

  const handlePickReqFile = useCallback(async () => {
    // No extension filter — all formats allowed.
    const selected = await api.dialog.openFile({
      title: t('kickoff.reqFile'),
    })
    if (selected) setRequirementsFile(selected)
  }, [])

  const handleSubmit = useCallback(async () => {
    setError(null)
    if (!projectDir.trim()) {
      setError(t('kickoff.errorMissing'))
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
          <span>{t('kickoff.title')}</span>
          <span class="kickoff-dialog__close" onClick={onClose}>✕</span>
        </div>

        <div class="kickoff-dialog__body">
          {/* Project Directory */}
          <label class="kickoff-dialog__label">
            <span>{t('kickoff.projectDir')}</span>
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
              {t('kickoff.projectDirHint')}
            </span>
          </label>

          {/* External Requirements File (optional) */}
          <label class="kickoff-dialog__label">
            <span>{t('kickoff.reqFile')}</span>
            <div class="kickoff-dialog__file-row">
              <input
                class="input"
                type="text"
                placeholder={t('kickoff.reqFilePlaceholder')}
                value={requirementsFile}
                onInput={(e) => setRequirementsFile((e.target as HTMLInputElement).value)}
              />
              <button class="btn btn--sm" onClick={handlePickReqFile}>…</button>
            </div>
            <span class="text-xs text-dim" style={{ marginTop: '4px' }}>
              {t('kickoff.reqFileHint')}
            </span>
          </label>

          {/* Extra Context (optional) */}
          <label class="kickoff-dialog__label">
            <span>{t('kickoff.extraContext')}</span>
            <textarea
              class="input"
              rows={6}
              placeholder={t('kickoff.extraContextPlaceholder')}
              value={extraContext}
              onInput={(e) => setExtraContext((e.target as HTMLTextAreaElement).value)}
              style={{ fontFamily: "'Fira Code', monospace", fontSize: '12px', resize: 'vertical' }}
            />
          </label>

          {error && <div class="kickoff-dialog__error">{error}</div>}
        </div>

        <div class="kickoff-dialog__footer">
          <button class="btn" onClick={onClose}>{t('kickoff.cancel')}</button>
          <button class="btn btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? t('kickoff.starting') : t('kickoff.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
