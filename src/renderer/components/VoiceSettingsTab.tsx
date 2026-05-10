// src/renderer/components/VoiceSettingsTab.tsx
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'

const api = (window as any).cipherMux

interface InstalledVoice {
  name: string
  locale: string
  language: string
  quality: string
  sampleRate: number
  modelPath: string
  isBundled: boolean
}

interface CatalogVoice {
  name: string
  locale: string
  language: string
  quality: string
  downloadSize: number
  installed: boolean
}

interface VoiceSettingsTabProps {
  ttsEnabled: boolean
  onTtsEnabledChange: (v: boolean) => void
  ttsLevel: 1 | 2
  onTtsLevelChange: (v: 1 | 2) => void
  ttsVoice: 'local' | 'macos'
  onTtsVoiceChange: (v: 'local' | 'macos') => void
  voiceCommandsEnabled: boolean
  onVoiceCommandsEnabledChange: (v: boolean) => void
  voiceSubmitMode: 'auto' | 'manual'
  onVoiceSubmitModeChange: (v: 'auto' | 'manual') => void
  btShutterEnabled: boolean
  onBtShutterEnabledChange: (v: boolean) => void
}

export function VoiceSettingsTab({
  ttsEnabled, onTtsEnabledChange,
  ttsLevel, onTtsLevelChange,
  ttsVoice, onTtsVoiceChange,
  voiceCommandsEnabled, onVoiceCommandsEnabledChange,
  voiceSubmitMode, onVoiceSubmitModeChange,
  btShutterEnabled, onBtShutterEnabledChange,
}: VoiceSettingsTabProps) {
  const { t } = useTranslation()

  // Installed voices
  const [installed, setInstalled] = useState<InstalledVoice[]>([])
  const [activeVoice, setActiveVoice] = useState<string>('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Catalog
  const [catalogOpen, setCatalogOpen] = useState(false)
  const [catalog, setCatalog] = useState<CatalogVoice[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [catalogError, setCatalogError] = useState(false)
  const [filterLang, setFilterLang] = useState<string>('')
  const [filterQuality, setFilterQuality] = useState<string>('')

  // Download state
  const [downloading, setDownloading] = useState<string | null>(null)
  const [downloadPercent, setDownloadPercent] = useState(0)

  const loadInstalled = useCallback(async () => {
    const voices: InstalledVoice[] = await api.voice.listInstalled()
    setInstalled(voices)
    const pv = await api.config.get('piperVoice')
    setActiveVoice(pv ?? 'de_DE-cipher_adult-medium')
  }, [])

  useEffect(() => { loadInstalled() }, [loadInstalled])

  // Subscribe to download progress
  useEffect(() => {
    const unsub = api.voice.onDownloadProgress((data: { voice: string; percent: number }) => {
      if (data.voice === downloading) {
        setDownloadPercent(data.percent)
      }
    })
    return unsub
  }, [downloading])

  const handleSetActive = useCallback(async (name: string) => {
    await api.voice.setActive(name)
    setActiveVoice(name)
  }, [])

  const handlePreview = useCallback(async (name: string) => {
    await api.voice.preview(name)
  }, [])

  const handleDelete = useCallback(async (name: string) => {
    setError(null)
    const result = await api.voice.deleteVoice(name)
    if (result.ok) {
      setDeleteConfirm(null)
      await loadInstalled()
    } else {
      setError(t('voice.deleteFailed', { error: result.error }))
    }
  }, [loadInstalled, t])

  const handleOpenCatalog = useCallback(async () => {
    if (catalogOpen) {
      setCatalogOpen(false)
      return
    }
    setCatalogOpen(true)
    setCatalogLoading(true)
    setCatalogError(false)
    try {
      const voices: CatalogVoice[] = await api.voice.catalogSearch()
      // Mark installed voices
      const installedNames = new Set(installed.map(v => v.name))
      setCatalog(voices.map(v => ({ ...v, installed: installedNames.has(v.name) })))
    } catch {
      setCatalogError(true)
    } finally {
      setCatalogLoading(false)
    }
  }, [catalogOpen, installed])

  const handleDownload = useCallback(async (name: string) => {
    setDownloading(name)
    setDownloadPercent(0)
    setError(null)
    const result = await api.voice.download(name)
    setDownloading(null)
    if (result.ok) {
      await loadInstalled()
      // Update catalog to mark as installed
      setCatalog(prev => prev.map(v => v.name === name ? { ...v, installed: true } : v))
    } else {
      setError(t('voice.downloadFailed', { error: result.error }))
    }
  }, [loadInstalled, t])

  // Filtered catalog
  const filteredCatalog = catalog.filter(v => {
    if (filterLang && v.language !== filterLang) return false
    if (filterQuality && v.quality !== filterQuality) return false
    return true
  })

  // Extract unique languages and qualities from catalog
  const catalogLanguages = [...new Set(catalog.map(v => v.language))].sort()
  const catalogQualities = [...new Set(catalog.map(v => v.quality))].sort()

  return (
    <section class="settings-section">
      {/* TTS & Voice Controls (moved from General) */}
      <div class="settings-section__title">{t('voice.title')}</div>

      <div class="settings-row" style={{ marginTop: '8px' }}>
        <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={ttsEnabled}
            onChange={(e) => onTtsEnabledChange((e.target as HTMLInputElement).checked)}
            style={{ marginRight: '8px' }}
          />
          <span>{t('voice.ttsEnabled')}</span>
        </label>
      </div>
      {ttsEnabled && (
        <>
        <div class="settings-row" style={{ marginTop: '8px' }}>
          <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
            <select
              value={ttsVoice}
              onChange={(e) => onTtsVoiceChange((e.target as HTMLSelectElement).value as 'local' | 'macos')}
              style={{ marginRight: '8px' }}
              class="input input--sm"
            >
              <option value="local">{t('voice.engineLocal')}</option>
              <option value="macos">{t('voice.engineMacos')}</option>
            </select>
            <span>{t('voice.ttsEngine')}</span>
          </label>
        </div>
        <div class="settings-row" style={{ marginTop: '8px' }}>
          <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
            <select
              value={String(ttsLevel)}
              onChange={(e) => onTtsLevelChange(Number((e.target as HTMLSelectElement).value) as 1 | 2)}
              style={{ marginRight: '8px' }}
              class="input input--sm"
            >
              <option value="1">{t('voice.ttsLevelMinimal', 'Minimal')}</option>
              <option value="2">{t('voice.ttsLevelFull', 'Alles Relevante')}</option>
            </select>
            <span>{t('voice.ttsLevel', 'TTS-Verbosity')}</span>
          </label>
        </div>
        </>
      )}

      <div class="settings-row" style={{ marginTop: '8px' }}>
        <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={voiceCommandsEnabled}
            onChange={(e) => onVoiceCommandsEnabledChange((e.target as HTMLInputElement).checked)}
            style={{ marginRight: '8px' }}
          />
          <span>{t('voice.voiceCommands')}</span>
        </label>
      </div>

      <div class="settings-row" style={{ marginTop: '8px' }}>
        <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
          <select
            value={voiceSubmitMode}
            onChange={(e) => onVoiceSubmitModeChange((e.target as HTMLSelectElement).value as 'auto' | 'manual')}
            style={{ marginRight: '8px' }}
            class="input input--sm"
          >
            <option value="auto">{t('voice.submitAuto')}</option>
            <option value="manual">{t('voice.submitManual')}</option>
          </select>
          <span>{t('voice.submitMode')}</span>
        </label>
      </div>

      <div id="bt-shutter" class="settings-row" style={{ marginTop: '8px' }}>
        <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={btShutterEnabled}
            onChange={(e) => onBtShutterEnabledChange((e.target as HTMLInputElement).checked)}
            style={{ marginRight: '8px' }}
          />
          <span>{t('voice.btShutter')}</span>
        </label>
      </div>

      {/* Installed Voices */}
      <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>
        {t('voice.installedTitle')}
      </div>

      {error && (
        <div class="settings-section__hint" style={{ color: 'var(--color-neon-red)', marginTop: '6px' }}>
          {error}
        </div>
      )}

      {installed.length === 0 ? (
        <div class="settings-section__hint" style={{ marginTop: '8px' }}>
          {t('voice.noInstalled')}
        </div>
      ) : (
        <div class="voice-list" style={{ marginTop: '8px' }}>
          {installed.map(voice => (
            <div
              key={voice.name}
              class={`voice-item${activeVoice === voice.name ? ' voice-item--active' : ''}`}
            >
              <div class="voice-item__info">
                <span class="voice-item__name">{voice.name}</span>
                <span class="voice-item__meta">
                  {voice.locale} / {voice.quality} / {voice.sampleRate}Hz
                </span>
                {voice.isBundled && (
                  <span class="voice-item__badge">{t('voice.bundled')}</span>
                )}
                {activeVoice === voice.name && (
                  <span class="voice-item__badge voice-item__badge--active">{t('voice.active')}</span>
                )}
              </div>
              <div class="voice-item__actions">
                {activeVoice !== voice.name && (
                  <button class="btn btn--sm" onClick={() => handleSetActive(voice.name)}>
                    {t('voice.setActive')}
                  </button>
                )}
                <button class="btn btn--sm" onClick={() => handlePreview(voice.name)}>
                  {t('voice.preview')}
                </button>
                {!voice.isBundled && (
                  deleteConfirm === voice.name ? (
                    <div class="voice-item__confirm">
                      <span>{t('voice.deleteConfirm', { name: voice.name })}</span>
                      <button class="btn btn--sm btn--danger" onClick={() => handleDelete(voice.name)}>
                        {t('voice.delete')}
                      </button>
                      <button class="btn btn--sm" onClick={() => setDeleteConfirm(null)}>
                        {t('tags.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button class="btn btn--sm" onClick={() => setDeleteConfirm(voice.name)}>
                      {t('voice.delete')}
                    </button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Catalog Browser */}
      <div
        class="settings-section__title"
        style={{ marginTop: 'var(--space-lg)', cursor: 'pointer', userSelect: 'none' }}
        onClick={handleOpenCatalog}
      >
        {catalogOpen ? '\u25BE' : '\u25B8'} {t('voice.catalogTitle')}
      </div>
      <div class="settings-section__hint">{t('voice.catalogHint')}</div>

      {catalogOpen && (
        <div class="voice-catalog" style={{ marginTop: '8px' }}>
          {catalogLoading && (
            <div class="settings-section__hint">{t('voice.catalogLoading')}</div>
          )}
          {catalogError && (
            <div class="settings-section__hint" style={{ color: 'var(--color-neon-red)' }}>
              {t('voice.catalogError')}
            </div>
          )}
          {!catalogLoading && !catalogError && catalog.length > 0 && (
            <>
              <div class="voice-catalog__filters" style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <select
                  class="input input--sm"
                  value={filterLang}
                  onChange={(e) => setFilterLang((e.target as HTMLSelectElement).value)}
                  style={{ width: '120px' }}
                >
                  <option value="">{t('voice.filterAll')} ({t('voice.filterLanguage')})</option>
                  {catalogLanguages.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
                <select
                  class="input input--sm"
                  value={filterQuality}
                  onChange={(e) => setFilterQuality((e.target as HTMLSelectElement).value)}
                  style={{ width: '140px' }}
                >
                  <option value="">{t('voice.filterAll')} ({t('voice.filterQuality')})</option>
                  {catalogQualities.map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>

              {filteredCatalog.length === 0 ? (
                <div class="settings-section__hint">{t('voice.catalogEmpty')}</div>
              ) : (
                <div class="voice-list voice-list--catalog">
                  {filteredCatalog.map(voice => (
                    <div
                      key={voice.name}
                      class={`voice-item${voice.installed ? ' voice-item--installed' : ''}`}
                    >
                      <div class="voice-item__info">
                        <span class="voice-item__name">{voice.name}</span>
                        <span class="voice-item__meta">
                          {voice.locale} / {voice.quality}
                          {voice.downloadSize > 0 && (
                            <> / {t('voice.size', { size: (voice.downloadSize / 1024 / 1024).toFixed(1) })}</>
                          )}
                        </span>
                      </div>
                      <div class="voice-item__actions">
                        {voice.installed ? (
                          <span class="voice-item__badge voice-item__badge--active">{t('voice.installed')}</span>
                        ) : downloading === voice.name ? (
                          <div class="voice-item__progress">
                            <div class="voice-item__progress-bar" style={{ width: `${downloadPercent}%` }} />
                            <span class="voice-item__progress-text">{t('voice.downloading')} {downloadPercent}%</span>
                          </div>
                        ) : (
                          <button
                            class="btn btn--sm btn--primary"
                            onClick={() => handleDownload(voice.name)}
                            disabled={downloading !== null}
                          >
                            {t('voice.download')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
