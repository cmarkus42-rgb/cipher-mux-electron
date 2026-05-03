// src/renderer/components/InfoSettingsView.tsx
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { APP_VERSION } from '../../shared/constants'
import type { ThemeName } from '../../shared/grid-types'
import type { CustomTheme } from '../hooks/useTheme'
import themesManifest from '../themes.json'
import '../styles/workspaces.css'
import '../styles/a11y.css'
import { A11ySettingsPage } from '../a11y/A11ySettingsPage'
import { useA11ySettings } from '../a11y/hooks/useA11ySettings'

interface InfoSettingsViewProps {
  theme: ThemeName
  onSetTheme: (t: ThemeName) => void
  initialTab?: string
  onThemeEditorToggle?: (open: boolean) => void
  customThemes?: CustomTheme[]
  activeCustomThemeId?: string | null
  onSelectCustomTheme?: (ct: CustomTheme) => void
  onSaveCustomTheme?: (name: string, baseTheme: ThemeName, tokens: Record<string, string>) => Promise<CustomTheme>
  onDeleteCustomTheme?: (id: string) => Promise<void>
  onOpenBugreport?: () => void
}

const api = (window as any).cipherMux

interface LlmConfig {
  ollamaHost: string
  ollamaPort: number
  ollamaModel: string
}

type TabId = 'general' | 'themes' | 'models' | 'shortcuts' | 'a11y' | 'about'
// Legacy alias for external consumers
type LegacyTabId = 'settings' | TabId

const SHORTCUT_KEYS = [
  // Navigation
  { category: 'navigation', combo: 'Cmd+1–5', labelKey: 'info.shortcut.focusSession' },
  { category: 'navigation', combo: 'Escape', labelKey: 'info.shortcut.closeDialog' },
  // Layout
  { category: 'layout', combo: 'Cmd+←/→', labelKey: 'info.shortcut.gridCols' },
  { category: 'layout', combo: 'Cmd+↑/↓', labelKey: 'info.shortcut.gridRows' },
  // Actions
  { category: 'actions', combo: 'Cmd+N', labelKey: 'info.shortcut.newSession' },
  { category: 'actions', combo: 'Cmd+B', labelKey: 'info.shortcut.openBugreport' },
  { category: 'actions', combo: 'Cmd+S', labelKey: 'info.shortcut.saveNote' },
  // Terminal
  { category: 'terminal', combo: 'Cmd+C', labelKey: 'info.shortcut.copy' },
  { category: 'terminal', combo: 'Cmd+V', labelKey: 'info.shortcut.paste' },
]

const themes = themesManifest.themes

/** Token groups for the theme editor color pickers. */
const THEME_TOKEN_GROUPS: Array<{ labelKey: string; tokens: string[] }> = [
  {
    labelKey: 'themeEditor.groupBg',
    tokens: ['--color-bg', '--color-bg-elevated', '--color-bg-sunken', '--color-bg-terminal'],
  },
  {
    labelKey: 'themeEditor.groupText',
    tokens: ['--color-text', '--color-text-secondary', '--color-text-dim', '--color-text-accent'],
  },
  {
    labelKey: 'themeEditor.groupBorder',
    tokens: ['--color-border', '--color-border-light', '--color-border-focus'],
  },
  {
    labelKey: 'themeEditor.groupAccent',
    tokens: ['--color-accent', '--color-neon-green', '--color-neon-red', '--color-neon-orange', '--color-neon-cyan'],
  },
  {
    labelKey: 'themeEditor.groupCtx',
    tokens: ['--color-ctx-ok', '--color-ctx-warn', '--color-ctx-error'],
  },
  {
    labelKey: 'themeEditor.groupHighlight',
    tokens: ['--color-highlight', '--color-highlight-dim'],
  },
]

export function InfoSettingsView({ theme, onSetTheme, initialTab, onThemeEditorToggle, customThemes = [], activeCustomThemeId, onSelectCustomTheme, onSaveCustomTheme, onDeleteCustomTheme, onOpenBugreport }: InfoSettingsViewProps) {
  const { t } = useTranslation()
  // Map legacy 'settings' tab to 'general', validate tab name
  const ALL_TABS: TabId[] = ['general', 'themes', 'models', 'shortcuts', 'a11y', 'about']
  const resolveTab = (t?: string): TabId => {
    if (t === 'settings') return 'general'
    if (ALL_TABS.includes(t as TabId)) return t as TabId
    return 'general'
  }
  const [activeTab, setActiveTab] = useState<TabId>(resolveTab(initialTab))
  const [loading, setLoading] = useState(true)
  const [skipPerms, setSkipPerms] = useState(false)
  const [language, setLanguage] = useState<'en' | 'de'>(i18n.language as 'en' | 'de')
  const [themeEditorOpen, setThemeEditorOpen] = useState(false)
  const [customTokens, setCustomTokens] = useState<Record<string, string>>({})
  const [previewing, setPreviewing] = useState(false)
  const preEditTokensRef = useRef<Record<string, string>>({})
  const [savedNotice, setSavedNotice] = useState(false)
  const [saveAsName, setSaveAsName] = useState('')
  const [saveAsOpen, setSaveAsOpen] = useState(false)

  // LLM Provider state
  const [ollamaHost, setOllamaHost] = useState('127.0.0.1')
  const [ollamaPort, setOllamaPort] = useState(11434)
  const [ollamaModel, setOllamaModel] = useState('gemma4:26b')
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [llmTestResult, setLlmTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [llmTesting, setLlmTesting] = useState(false)
  const [llmSaved, setLlmSaved] = useState(false)

  // Voice / Sprachsteuerung state
  const [btShutterEnabled, setBtShutterEnabled] = useState(false)
  const [voiceSubmitMode, setVoiceSubmitMode] = useState<'auto' | 'manual'>('auto')
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [ttsVoice, setTtsVoice] = useState<'local' | 'macos'>('local')
  const [voiceCommandsEnabled, setVoiceCommandsEnabled] = useState(true)
  const [keepWorking, setKeepWorking] = useState(false)

  const load = useCallback(async () => {
    const sp: boolean = await api.config.getSkipPermissions()
    setSkipPerms(sp)
    const ui = await api.config.get('ui')
    if (ui?.language) setLanguage(ui.language)
    if (ui?.customThemeTokens) {
      setCustomTokens(ui.customThemeTokens)
      // Apply custom tokens to document
      for (const [prop, val] of Object.entries(ui.customThemeTokens as Record<string, string>)) {
        document.body.style.setProperty(prop, val)
      }
    }
    // Load BT Shutter config
    const btShutter = await api.config.get('btShutter')
    if (btShutter) setBtShutterEnabled(btShutter.enabled ?? false)
    const vsm = await api.config.get('voiceSubmitMode')
    if (vsm) setVoiceSubmitMode(vsm)
    const ttsEn = await api.config.get('ttsEnabled')
    setTtsEnabled(ttsEn ?? true)
    const ttsV = await api.config.get('ttsVoice')
    if (ttsV) setTtsVoice(ttsV)
    const vcEn = await api.config.get('voiceCommandsEnabled')
    setVoiceCommandsEnabled(vcEn ?? true)
    const kw = await api.config.get('keepWorking')
    setKeepWorking(kw ?? false)
    // Load LLM config
    const llm: LlmConfig | null = await api.config.get('llm')
    if (llm) {
      setOllamaHost(llm.ollamaHost ?? '127.0.0.1')
      setOllamaPort(llm.ollamaPort ?? 11434)
      setOllamaModel(llm.ollamaModel ?? 'gemma4:26b')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleLanguageChange = useCallback(async (lng: 'en' | 'de') => {
    setLanguage(lng)
    i18n.changeLanguage(lng)
    const ui = await api.config.get('ui') ?? {}
    await api.config.set('ui', { ...ui, language: lng })
  }, [])

  /** Get the current base token value from the active theme manifest. */
  const getBaseToken = useCallback((prop: string): string => {
    const activeTheme = themes.find(th => th.id === theme)
    return (activeTheme?.tokens as Record<string, string>)?.[prop] ?? '#888888'
  }, [theme])

  /** Change a single token — live-apply + track in state. */
  const handleTokenChange = useCallback((prop: string, value: string) => {
    document.body.style.setProperty(prop, value)
    setCustomTokens(prev => ({ ...prev, [prop]: value }))
  }, [])

  /** Save custom tokens to ConfigStore — only allowed for custom themes. */
  const handleThemeSave = useCallback(async () => {
    if (!activeCustomThemeId) {
      // Built-in theme: open Save As dialog instead of overwriting
      setSaveAsOpen(true)
      return
    }
    const ui = await api.config.get('ui') ?? {}
    // Update the active custom theme's tokens
    const customs: CustomTheme[] = ui?.customThemes ?? []
    const updated = customs.map(ct =>
      ct.id === activeCustomThemeId ? { ...ct, tokens: { ...ct.tokens, ...customTokens } } : ct
    )
    await api.config.set('ui', { ...ui, customThemes: updated, customThemeTokens: customTokens })
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2000)
  }, [customTokens, activeCustomThemeId])

  /** Reset all custom overrides back to theme defaults. */
  const handleThemeReset = useCallback(() => {
    for (const prop of Object.keys(customTokens)) {
      document.body.style.removeProperty(prop)
    }
    setCustomTokens({})
    setPreviewing(false)
  }, [customTokens])

  /** Preview: apply current tokens live without saving. */
  const handlePreview = useCallback(() => {
    preEditTokensRef.current = { ...customTokens }
    // Tokens are already applied live by handleTokenChange
    setPreviewing(true)
  }, [customTokens])

  /** Revert: undo preview, restore pre-edit tokens. */
  const handleRevert = useCallback(() => {
    // Remove all currently applied tokens
    for (const prop of Object.keys(customTokens)) {
      document.body.style.removeProperty(prop)
    }
    // Restore pre-edit tokens
    const original = preEditTokensRef.current
    for (const [prop, val] of Object.entries(original)) {
      document.body.style.setProperty(prop, val)
    }
    setCustomTokens(original)
    setPreviewing(false)
  }, [customTokens])

  /** Export custom tokens as JSON to clipboard. */
  const handleThemeExport = useCallback(async () => {
    const exportData = {
      baseTheme: theme,
      tokens: customTokens,
      exportedAt: new Date().toISOString(),
    }
    await navigator.clipboard.writeText(JSON.stringify(exportData, null, 2))
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2000)
  }, [theme, customTokens])

  const handleSaveAs = useCallback(async () => {
    const name = saveAsName.trim()
    if (!name || !onSaveCustomTheme) return
    await onSaveCustomTheme(name, theme, { ...customTokens })
    setSaveAsName('')
    setSaveAsOpen(false)
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2000)
  }, [saveAsName, theme, customTokens, onSaveCustomTheme])

  // ─── LLM Provider Handlers ─────────────────────────────

  const handleLlmTestConnection = useCallback(async () => {
    setLlmTesting(true)
    setLlmTestResult(null)
    try {
      const result = await api.llm.testConnection(ollamaHost, ollamaPort)
      setLlmTestResult(result)
      if (result.ok) {
        const models = await api.llm.listModels(ollamaHost, ollamaPort)
        setAvailableModels(models)
      }
    } catch (err: any) {
      setLlmTestResult({ ok: false, error: err?.message ?? 'Unknown error' })
    } finally {
      setLlmTesting(false)
    }
  }, [ollamaHost, ollamaPort])

  const handleLlmSave = useCallback(async () => {
    await api.config.set('llm', {
      ollamaHost,
      ollamaPort,
      ollamaModel,
    })
    setLlmSaved(true)
    setTimeout(() => setLlmSaved(false), 2000)
  }, [ollamaHost, ollamaPort, ollamaModel])

  const shortcuts = SHORTCUT_KEYS.map(s => ({ ...s, label: t(s.labelKey) }))
  const grouped = shortcuts.reduce<Record<string, typeof shortcuts>>((acc, s) => {
    (acc[s.category] ??= []).push(s)
    return acc
  }, {})

  // Store the non-CVD theme so we can restore it when CVD is deselected
  const baseThemeRef = useRef<ThemeName>(theme)
  if (!theme.startsWith('cvd-')) baseThemeRef.current = theme

  const handleA11yThemeChange = useCallback((cvdTheme: string | null) => {
    if (cvdTheme) {
      onSetTheme(cvdTheme as ThemeName)
    } else {
      onSetTheme(baseThemeRef.current)
    }
  }, [onSetTheme])

  const { settings: a11ySettings, update: updateA11y } = useA11ySettings(handleA11yThemeChange)

  const TAB_LABELS: Record<TabId, string> = {
    general: t('info.tabGeneral', 'General'),
    themes: t('info.tabThemes', 'Themes'),
    models: t('info.tabModels', 'Models'),
    shortcuts: t('info.tabShortcuts'),
    a11y: 'A11y',
    about: t('info.tabAbout'),
  }

  return (
    <div class="settings-view" data-highlight="popup-info">
      <div class="info-tabs">
        {(['general', 'themes', 'models', 'shortcuts', 'a11y', 'about'] as TabId[]).map((tab) => (
          <button
            key={tab}
            class={`info-tab ${activeTab === tab ? 'info-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'shortcuts' && (
        <section class="settings-section">
          {Object.entries(grouped).map(([category, entries]) => (
            <div key={category}>
              <div class="settings-section__title">{category}</div>
              <table class="shortcut-table">
                <tbody>
                  {entries.map((s) => (
                    <tr key={s.combo}>
                      <td class="shortcut-table__combo"><kbd>{s.combo}</kbd></td>
                      <td class="shortcut-table__label">{s.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          <div class="settings-section__hint" style={{ marginTop: '12px' }}>
            {t('info.shortcutHint')}
          </div>
        </section>
      )}

      {activeTab === 'a11y' && (
        <section class="settings-section">
          <A11ySettingsPage settings={a11ySettings} onUpdate={updateA11y} />
        </section>
      )}

      {activeTab === 'about' && (
        <section class="settings-section wiki-section">
          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.whatIs.title')}</div>
            <p class="wiki-text">{t('info.feature.whatIs.p1')}</p>
            <p class="wiki-text">
              <strong>{t('info.feature.whatIs.p2strong')}</strong>{t('info.feature.whatIs.p2')}
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.grid.title')}</div>
            <p class="wiki-text">{t('info.feature.grid.p1')}</p>
            <p class="wiki-text">
              <strong>{t('info.feature.grid.p2strong')}</strong>{t('info.feature.grid.p2')}
            </p>
            <p class="wiki-text">
              <strong>{t('info.feature.grid.p3strong')}</strong>{t('info.feature.grid.p3')}
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.orchestrator.title')}</div>
            <p class="wiki-text">{t('info.feature.orchestrator.p1')}</p>
            <ul class="wiki-list">
              <li>{t('info.feature.orchestrator.li1')}</li>
              <li>{t('info.feature.orchestrator.li2')}</li>
              <li>{t('info.feature.orchestrator.li3')}</li>
              <li>{t('info.feature.orchestrator.li4')}</li>
            </ul>
            <p class="wiki-text">{t('info.feature.orchestrator.p2')}</p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.messageBus.title')}</div>
            <p class="wiki-text">{t('info.feature.messageBus.p1')}</p>
            <p class="wiki-text">
              <strong>{t('info.feature.messageBus.p2strong')}</strong>{t('info.feature.messageBus.p2')}
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.mcp.title')}</div>
            <p class="wiki-text">{t('info.feature.mcp.p1')}</p>
            <p class="wiki-text">
              <strong>{t('info.feature.mcp.p2strong')}</strong>{t('info.feature.mcp.p2')}
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.context.title')}</div>
            <p class="wiki-text">{t('info.feature.context.p1')}</p>
            <ul class="wiki-list">
              <li><span style={{ color: 'var(--color-neon-green)' }}>{t('info.feature.context.green')}</span>{t('info.feature.context.greenDesc')}</li>
              <li><span style={{ color: 'var(--color-neon-orange)' }}>{t('info.feature.context.orange')}</span>{t('info.feature.context.orangeDesc')}</li>
              <li><span style={{ color: 'var(--color-neon-red)' }}>{t('info.feature.context.red')}</span>{t('info.feature.context.redDesc')}</li>
            </ul>
            <p class="wiki-text">{t('info.feature.context.p2')}</p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.bugreport.title')}</div>
            <p class="wiki-text">{t('info.feature.bugreport.p1')}</p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.themes.title')}</div>
            <p class="wiki-text">{t('info.feature.themes.p1')}</p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.scanner.title')}</div>
            <p class="wiki-text">{t('info.feature.scanner.p1')}</p>
            <p class="wiki-text">{t('info.feature.scanner.p2')}</p>
          </div>
        </section>
      )}

      {/* ─── General Tab ─────────────────────────────── */}
      {activeTab === 'general' && !loading && (
        <section class="settings-section">
          <div class="settings-section__title">{t('settings.language')}</div>
          <div class="settings-section__hint">{t('settings.languageHint')}</div>
          <div class="settings-row" style={{ marginTop: '8px' }}>
            <select
              class="input input--sm"
              value={language}
              onChange={(e) => handleLanguageChange((e.target as HTMLSelectElement).value as 'en' | 'de')}
              style={{ width: '160px' }}
            >
              <option value="en">English</option>
              <option value="de">Deutsch</option>
            </select>
          </div>

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>{t('settings.agent')}</div>
          <div class="settings-row" style={{ marginTop: '8px' }}>
            <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={skipPerms}
                onChange={async (e) => {
                  const v = (e.target as HTMLInputElement).checked
                  setSkipPerms(v)
                  await api.config.setSkipPermissions(v)
                }}
                style={{ marginRight: '8px' }}
              />
              <span>{t('settings.skipPermissions')}</span>
            </label>
          </div>
          {skipPerms && (
            <div class="settings-section__hint" style={{ color: 'var(--color-warning)', marginTop: '6px' }}>
              {t('settings.skipPermissionsWarning')}
            </div>
          )}

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>{t('settings.bugreport')}</div>
          <div class="settings-section__hint">{t('settings.bugreportHint')}</div>
          <div class="settings-row" style={{ marginTop: '8px' }}>
            <button class="btn btn--sm btn--primary" onClick={() => onOpenBugreport?.()}>
              {t('settings.bugreportCreate')}
            </button>
          </div>

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>Sprachsteuerung</div>
          <div class="settings-section__hint">TTS, Voice Commands, BT Shutter und Submit-Modus.</div>

          <div class="settings-row" style={{ marginTop: '8px' }}>
            <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={ttsEnabled}
                onChange={async (e) => {
                  const v = (e.target as HTMLInputElement).checked
                  setTtsEnabled(v)
                  await api.config.set('ttsEnabled', v)
                }}
                style={{ marginRight: '8px' }}
              />
              <span>TTS (Text-to-Speech)</span>
            </label>
          </div>
          {ttsEnabled && (
            <div class="settings-row" style={{ marginTop: '8px' }}>
              <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
                <select
                  value={ttsVoice}
                  onChange={async (e) => {
                    const v = (e.target as HTMLSelectElement).value as 'local' | 'macos'
                    setTtsVoice(v)
                    await api.config.set('ttsVoice', v)
                  }}
                  style={{ marginRight: '8px' }}
                  class="input input--sm"
                >
                  <option value="local">Lokal (Piper)</option>
                  <option value="macos">macOS Systemstimme</option>
                </select>
                <span>TTS-Stimme</span>
              </label>
            </div>
          )}

          <div class="settings-row" style={{ marginTop: '8px' }}>
            <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={voiceCommandsEnabled}
                onChange={async (e) => {
                  const v = (e.target as HTMLInputElement).checked
                  setVoiceCommandsEnabled(v)
                  await api.config.set('voiceCommandsEnabled', v)
                }}
                style={{ marginRight: '8px' }}
              />
              <span>Voice Commands (Scroll, Grid-Navigation)</span>
            </label>
          </div>

          <div class="settings-row" style={{ marginTop: '8px' }}>
            <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
              <select
                value={voiceSubmitMode}
                onChange={async (e) => {
                  const v = (e.target as HTMLSelectElement).value as 'auto' | 'manual'
                  setVoiceSubmitMode(v)
                  await api.config.set('voiceSubmitMode', v)
                }}
                style={{ marginRight: '8px' }}
                class="input input--sm"
              >
                <option value="auto">Auto-Enter nach STT</option>
                <option value="manual">Manuell (BT-Clicker)</option>
              </select>
              <span>Voice Submit Mode</span>
            </label>
          </div>

          <div id="bt-shutter" class="settings-row" style={{ marginTop: '8px' }}>
            <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={btShutterEnabled}
                onChange={async (e) => {
                  const v = (e.target as HTMLInputElement).checked
                  setBtShutterEnabled(v)
                  const current = await api.config.get('btShutter') ?? {}
                  await api.config.set('btShutter', { ...current, enabled: v })
                }}
                style={{ marginRight: '8px' }}
              />
              <span>BT Shutter Remote</span>
            </label>
          </div>

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>Keep Working</div>
          <div class="settings-section__hint">Beim Beenden alle Sessions speichern und beim naechsten Start mit Resume wieder hochfahren.</div>
          <div class="settings-row" style={{ marginTop: '8px' }}>
            <label class="settings-label" style={{ cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={keepWorking}
                onChange={async (e) => {
                  const v = (e.target as HTMLInputElement).checked
                  setKeepWorking(v)
                  await api.config.set('keepWorking', v)
                }}
                style={{ marginRight: '8px' }}
              />
              <span>Keep Working — Sessions bei App-Neustart mit Resume fortsetzen</span>
            </label>
          </div>
        </section>
      )}

      {/* ─── Themes Tab ─────────────────────────────── */}
      {activeTab === 'themes' && !loading && (
        <section class="settings-section">
          <div class="settings-section__title">{t('settings.theme')}</div>
          <div class="settings-section__hint">{t('settings.themeHint')}</div>

          <div class="theme-picker" role="radiogroup" aria-label="theme">
            {themes.map((thm) => (
              <div
                key={thm.id}
                class={`theme-row ${thm.id === theme && !activeCustomThemeId ? 'theme-row--active' : ''}`}
                role="radio"
                aria-checked={thm.id === theme && !activeCustomThemeId}
                tabIndex={0}
                onClick={() => onSetTheme(thm.id as ThemeName)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSetTheme(thm.id as ThemeName)
                  }
                }}
              >
                <div class="theme-radio" />
                <div class="theme-strip" aria-hidden="true">
                  {thm.previewSwatches.map((c, i) => <span key={i} style={{ background: c }} />)}
                </div>
                <div class="theme-meta">
                  <div class="theme-name">{thm.name}</div>
                  <div class="theme-tag">{thm.tag}</div>
                </div>
                <div class="theme-mode">{thm.mode}</div>
              </div>
            ))}
            {customThemes.map((ct) => (
              <div
                key={ct.id}
                class={`theme-row ${activeCustomThemeId === ct.id ? 'theme-row--active' : ''}`}
                role="radio"
                aria-checked={activeCustomThemeId === ct.id}
                tabIndex={0}
                onClick={() => onSelectCustomTheme?.(ct)}
              >
                <div class="theme-radio" />
                <div class="theme-strip" aria-hidden="true">
                  {Object.values(ct.tokens).slice(0, 5).map((c, i) => <span key={i} style={{ background: c }} />)}
                </div>
                <div class="theme-meta">
                  <div class="theme-name">{ct.name}</div>
                  <div class="theme-tag">{t('themeEditor.custom')}</div>
                </div>
                <button
                  class="btn btn--sm theme-row__delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteCustomTheme?.(ct.id) }}
                  title={t('themeEditor.deleteTheme')}
                >✕</button>
              </div>
            ))}
          </div>

          {/* Theme Editor */}
          <div
            class="settings-section__title"
            style={{ marginTop: 'var(--space-lg)', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => { setThemeEditorOpen(v => { const next = !v; onThemeEditorToggle?.(next); return next }) }}
          >
            {themeEditorOpen ? '▾' : '▸'} {t('themeEditor.title')}
          </div>
          <div class="settings-section__hint">{t('themeEditor.hint')}</div>
          {themeEditorOpen && (
            <div class="theme-editor">
              {THEME_TOKEN_GROUPS.map(group => (
                <div key={group.labelKey} class="theme-editor__group">
                  <div class="theme-editor__group-label">{t(group.labelKey)}</div>
                  <div class="theme-editor__grid">
                    {group.tokens.map(prop => {
                      const current = customTokens[prop] ?? getBaseToken(prop)
                      return (
                        <label key={prop} class="theme-editor__token">
                          <input
                            type="color"
                            value={current}
                            onInput={(e) => handleTokenChange(prop, (e.target as HTMLInputElement).value)}
                            class="theme-editor__picker"
                          />
                          <span class="theme-editor__label">{prop.replace('--color-', '')}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div class="theme-editor__actions">
                <button class="btn btn--sm btn--primary" onClick={handleThemeSave}>{t('themeEditor.save')}</button>
                <button class="btn btn--sm" onClick={() => setSaveAsOpen(v => !v)}>{t('themeEditor.saveAs')}</button>
                {!previewing
                  ? <button class="btn btn--sm" onClick={handlePreview}>{t('themeEditor.preview', 'Preview')}</button>
                  : <button class="btn btn--sm" onClick={handleRevert}>{t('themeEditor.revert', 'Revert')}</button>
                }
                <button class="btn btn--sm" onClick={handleThemeReset}>{t('themeEditor.reset')}</button>
                <button class="btn btn--sm" onClick={handleThemeExport}>{t('themeEditor.export')}</button>
                {savedNotice && <span class="theme-editor__notice">{t('themeEditor.saved')}</span>}
              </div>
              {saveAsOpen && (
                <div class="theme-editor__save-as">
                  <input
                    type="text"
                    class="input input--sm"
                    placeholder={t('themeEditor.saveAsPlaceholder')}
                    value={saveAsName}
                    onInput={(e) => setSaveAsName((e.target as HTMLInputElement).value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveAs() }}
                  />
                  <button class="btn btn--sm btn--primary" onClick={handleSaveAs} disabled={!saveAsName.trim()}>{t('themeEditor.saveAsConfirm')}</button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ─── Models Tab ─────────────────────────────── */}
      {activeTab === 'models' && !loading && (
        <section class="settings-section">
          <div class="settings-section__title">{t('settings.llmProvider')}</div>
          <div class="settings-section__hint">{t('settings.llmProviderHint')}</div>

          <div class="settings-row" style={{ marginTop: '8px', gap: '8px' }}>
            <label class="settings-label">
              <span>{t('settings.ollamaHost')}</span>
              <input
                class="input input--sm"
                type="text"
                value={ollamaHost}
                onInput={(e) => setOllamaHost((e.target as HTMLInputElement).value)}
                style={{ width: '180px' }}
              />
            </label>
            <label class="settings-label">
              <span>{t('settings.ollamaPort')}</span>
              <input
                class="input input--sm"
                type="number"
                value={ollamaPort}
                onInput={(e) => setOllamaPort(Number((e.target as HTMLInputElement).value))}
                style={{ width: '80px' }}
              />
            </label>
          </div>

          <div class="settings-row" style={{ marginTop: '8px', gap: '8px' }}>
            <label class="settings-label">
              <span>{t('settings.ollamaModel')}</span>
              {availableModels.length > 0 ? (
                <select
                  class="input input--sm"
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel((e.target as HTMLSelectElement).value)}
                  style={{ width: '220px' }}
                >
                  {!availableModels.includes(ollamaModel) && (
                    <option value={ollamaModel}>{ollamaModel}</option>
                  )}
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  class="input input--sm"
                  type="text"
                  value={ollamaModel}
                  onInput={(e) => setOllamaModel((e.target as HTMLInputElement).value)}
                  style={{ width: '220px' }}
                />
              )}
            </label>
          </div>

          <div class="settings-row" style={{ marginTop: '8px', gap: '8px' }}>
            <button class="btn btn--sm" onClick={handleLlmTestConnection} disabled={llmTesting}>
              {llmTesting ? t('settings.llmTesting') : t('settings.llmTestConnection')}
            </button>
            <button class="btn btn--sm btn--primary" onClick={handleLlmSave}>
              {t('settings.llmSave')}
            </button>
            {llmSaved && <span class="theme-editor__notice">{t('settings.llmSaved')}</span>}
          </div>

          {llmTestResult && (
            <div class="settings-section__hint" style={{
              marginTop: '6px',
              color: llmTestResult.ok ? 'var(--color-neon-green)' : 'var(--color-neon-red)',
            }}>
              {llmTestResult.ok ? t('settings.llmConnected') : t('settings.llmConnectionFailed', { error: llmTestResult.error })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
