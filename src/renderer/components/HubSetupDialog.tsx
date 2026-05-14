// src/renderer/components/HubSetupDialog.tsx
import { h } from 'preact'
import { useState, useCallback, useEffect } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import '../styles/hub-setup.css'

interface HubSetupDialogProps {
  onComplete: (path: string) => Promise<void>
}

export function HubSetupDialog({ onComplete }: HubSetupDialogProps) {
  const { t } = useTranslation()
  const [path, setPath] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const api = (window as any).cipherMux
    api.hub.defaultPath().then((p: string) => { if (p) setPath(p) })
  }, [])

  const handleBrowse = useCallback(async () => {
    try {
      const api = (window as any).cipherMux
      const selected = await api.dialog.openDir({
        title: t('hub.setupTitle'),
        defaultPath: path || undefined,
      })
      if (selected) setPath(selected)
    } catch {
      // user cancelled
    }
  }, [path, t])

  const handleSubmit = useCallback(async () => {
    const target = path.trim()
    if (!target) return
    setSubmitting(true)
    setError(null)
    try {
      await onComplete(target)
    } catch (err: any) {
      setError(err?.message || 'Setup failed')
      setSubmitting(false)
    }
  }, [path, onComplete])

  return (
    <div class="hub-setup-overlay">
      <div class="hub-setup-card">
        <h2 class="hub-setup-title">{t('hub.setupTitle')}</h2>
        <p class="hub-setup-desc">{t('hub.setupDescription')}</p>

        <div class="hub-setup-path-row">
          <input
            class="hub-setup-path-input"
            type="text"
            value={path}
            placeholder={t('hub.defaultPath')}
            onInput={(e) => setPath((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            autoFocus
          />
          <button class="hub-setup-btn-browse" onClick={handleBrowse}>
            {t('hub.browseButton')}
          </button>
        </div>

        {error && <div class="hub-setup-error">{error}</div>}

        <div class="hub-setup-actions">
          <button
            class="hub-setup-btn-primary"
            disabled={!path.trim() || submitting}
            onClick={handleSubmit}
          >
            {submitting ? '...' : t('hub.createButton')}
          </button>
        </div>
      </div>
    </div>
  )
}
