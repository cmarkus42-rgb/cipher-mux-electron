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
import { VoiceSettingsTab } from './VoiceSettingsTab'

interface RegisteredShortcut {
  combo: string
  label: string
  category: string
}

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
  registeredShortcuts?: RegisteredShortcut[]
}

const api = (window as any).cipherMux

interface LlmConfig {
  ollamaHost: string
  ollamaPort: number
  ollamaModel: string
}

type TabId = 'general' | 'voice' | 'themes' | 'models' | 'shortcuts' | 'a11y' | 'about'
// Legacy alias for external consumers
type LegacyTabId = 'settings' | TabId

// Built-in shortcuts not managed by ShortcutRegistry (OS/browser/editor defaults)
const BUILTIN_SHORTCUTS = [
  { category: 'Aktionen', combo: 'Cmd+S', labelKey: 'info.shortcut.saveNote' },
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
  {
    labelKey: 'themeEditor.groupSession',
    tokens: ['--color-session-header-bg', '--shadow-inset'],
  },
  {
    labelKey: 'themeEditor.groupEntity',
    tokens: [
      '--entity-color-1', '--entity-color-2', '--entity-color-3',
      '--entity-color-4', '--entity-color-5', '--entity-color-6',
      '--entity-color-7', '--entity-color-8', '--entity-color-9',
      '--entity-color-10', '--entity-color-11',
    ],
  },
]

/** Human-readable labels for entity color tokens. */
const ENTITY_COLOR_LABELS: Record<string, string> = {
  '--entity-color-1': 'orchestrator',
  '--entity-color-2': 'cyber-factory',
  '--entity-color-3': 'companion',
  '--entity-color-4': 'refinement',
  '--entity-color-5': 'launcher',
  '--entity-color-6': 'voice-relay',
  '--entity-color-7': 'audit',
  '--entity-color-8': 'ideation',
  '--entity-color-9': 'debugger',
  '--entity-color-10': 'testing',
  '--entity-color-11': 'bugreport',
}

/** Available monospace fonts for the terminal font picker. */
const TERMINAL_FONTS = [
  "'Fira Code', 'Roboto Mono', 'SF Mono', Menlo, monospace",
  "'JetBrains Mono', 'SF Mono', Menlo, monospace",
  "'IBM Plex Mono', 'SF Mono', Menlo, monospace",
  "'Space Mono', 'SF Mono', Menlo, monospace",
  "'Share Tech Mono', 'Fira Code', monospace",
  "'VT323', 'Fira Code', monospace",
  "'SF Mono', Menlo, monospace",
  "Menlo, monospace",
  "'Courier New', monospace",
]

export function InfoSettingsView({ theme, onSetTheme, initialTab, onThemeEditorToggle, customThemes = [], activeCustomThemeId, onSelectCustomTheme, onSaveCustomTheme, onDeleteCustomTheme, onOpenBugreport, registeredShortcuts = [] }: InfoSettingsViewProps) {
  const { t } = useTranslation()
  // Map legacy 'settings' tab to 'general', validate tab name
  const ALL_TABS: TabId[] = ['general', 'voice', 'themes', 'models', 'shortcuts', 'a11y', 'about']
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
  const [ttsLevel, setTtsLevel] = useState<1 | 2>(1)
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
    const ttsLv = await api.config.get('ttsLevel')
    setTtsLevel((ttsLv as 1 | 2) ?? 1)
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

  // Merge live registry shortcuts with built-in (OS/browser) shortcuts
  const builtinMapped = BUILTIN_SHORTCUTS.map(s => ({ combo: s.combo, label: t(s.labelKey), category: s.category }))
  const allShortcuts = [...registeredShortcuts, ...builtinMapped]
  const grouped = allShortcuts.reduce<Record<string, typeof allShortcuts>>((acc, s) => {
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
    voice: t('info.tabVoice', 'Voice'),
    themes: t('info.tabThemes', 'Themes'),
    models: t('info.tabModels', 'Models'),
    shortcuts: t('info.tabShortcuts'),
    a11y: 'A11y',
    about: t('info.tabAbout'),
  }

  return (
    <div class="settings-view" data-highlight="popup-info">
      <div class="info-tabs">
        {(['general', 'voice', 'themes', 'models', 'shortcuts', 'a11y', 'about'] as TabId[]).map((tab) => (
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

      {activeTab === 'voice' && !loading && (
        <VoiceSettingsTab
          ttsEnabled={ttsEnabled}
          onTtsEnabledChange={async (v) => { setTtsEnabled(v); await api.config.set('ttsEnabled', v) }}
          ttsLevel={ttsLevel}
          onTtsLevelChange={async (v) => { setTtsLevel(v); await api.config.set('ttsLevel', v) }}
          ttsVoice={ttsVoice}
          onTtsVoiceChange={async (v) => { setTtsVoice(v); await api.config.set('ttsVoice', v) }}
          voiceCommandsEnabled={voiceCommandsEnabled}
          onVoiceCommandsEnabledChange={async (v) => { setVoiceCommandsEnabled(v); await api.config.set('voiceCommandsEnabled', v) }}
          voiceSubmitMode={voiceSubmitMode}
          onVoiceSubmitModeChange={async (v) => { setVoiceSubmitMode(v); await api.config.set('voiceSubmitMode', v) }}
          btShutterEnabled={btShutterEnabled}
          onBtShutterEnabledChange={async (v) => {
            setBtShutterEnabled(v)
            const current = await api.config.get('btShutter') ?? {}
            await api.config.set('btShutter', { ...current, enabled: v })
          }}
          keepWorking={keepWorking}
          onKeepWorkingChange={async (v) => { setKeepWorking(v); await api.config.set('keepWorking', v) }}
        />
      )}

      {activeTab === 'about' && (
        <section class="settings-section wiki-section">
          {/* ─── Version & Links ─── */}
          <div class="wiki-entry">
            <div class="settings-section__title">cipher-mux</div>
            <p class="wiki-text">
              {t('about.version', { version: APP_VERSION })}
            </p>
            <p class="wiki-text" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
              <a class="about-link" onClick={() => api.openExternal('https://cipher-mux.dev')}>{t('about.website')}</a>
              <a class="about-link" onClick={() => api.openExternal('https://cipher-mux.dev/docs')}>{t('about.howTo')}</a>
              <a class="about-link" onClick={() => api.openExternal('https://cipher-mux.dev/changelog')}>{t('about.changelog')}</a>
            </p>
          </div>

          {/* ─── Keyboard Shortcuts ─── */}
          <div class="wiki-entry">
            <div class="settings-section__title">{t('about.shortcuts')}</div>
            <table class="shortcut-table">
              <tbody>
                {allShortcuts.map((s) => (
                  <tr key={s.combo}>
                    <td class="shortcut-table__combo"><kbd>{s.combo}</kbd></td>
                    <td class="shortcut-table__label">{s.label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ─── Features ─── */}
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
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">{t('info.feature.orchestrator.title')}</div>
            <p class="wiki-text">{t('info.feature.orchestrator.p1')}</p>
          </div>

          {/* ─── Credits ─── */}
          <div class="wiki-entry">
            <div class="settings-section__title">{t('about.credits')}</div>
            <ul class="wiki-list">
              <li>{t('about.creditElectron', { version: api.versions?.electron ?? '—' })}</li>
              <li>{t('about.creditNode', { version: api.versions?.node ?? '—' })}</li>
              <li>{t('about.creditChromium', { version: api.versions?.chrome ?? '—' })}</li>
              <li>{t('about.creditPiper')}</li>
              <li>{t('about.creditWhisper')}</li>
              <li>{t('about.creditXterm')}</li>
              <li>{t('about.creditCodeMirror')}</li>
            </ul>
            <p class="wiki-text" style={{ marginTop: '8px', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-dim)' }}>
              {t('about.license')}
            </p>
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
                      const isColorToken = !prop.includes('shadow')
                      const label = ENTITY_COLOR_LABELS[prop]
                        ?? prop.replace('--color-', '').replace('--', '')
                      return isColorToken ? (
                        <label key={prop} class="theme-editor__token">
                          <input
                            type="color"
                            value={current}
                            onInput={(e) => handleTokenChange(prop, (e.target as HTMLInputElement).value)}
                            class="theme-editor__picker"
                          />
                          <span class="theme-editor__label">{label}</span>
                        </label>
                      ) : (
                        <label key={prop} class="theme-editor__token theme-editor__token--text">
                          <input
                            type="text"
                            class="input input--sm"
                            value={current}
                            onInput={(e) => handleTokenChange(prop, (e.target as HTMLInputElement).value)}
                            style={{ width: '180px' }}
                          />
                          <span class="theme-editor__label">{label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Terminal font / size / line-height */}
              <div class="theme-editor__group">
                <div class="theme-editor__group-label">{t('themeEditor.groupTerminal')}</div>
                <div class="theme-editor__grid" style={{ flexDirection: 'column', gap: '6px' }}>
                  <label class="settings-label" style={{ gap: '4px' }}>
                    <span class="theme-editor__label">{t('themeEditor.terminalFont')}</span>
                    <select
                      class="input input--sm"
                      value={customTokens['--terminal-font-family'] ?? getBaseToken('--terminal-font-family')}
                      onChange={(e) => handleTokenChange('--terminal-font-family', (e.target as HTMLSelectElement).value)}
                      style={{ width: '280px', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}
                    >
                      {TERMINAL_FONTS.map(f => (
                        <option key={f} value={f}>{f.split(',')[0].replace(/'/g, '')}</option>
                      ))}
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <label class="settings-label" style={{ gap: '4px' }}>
                      <span class="theme-editor__label">{t('themeEditor.terminalFontSize')}</span>
                      <input
                        type="number"
                        class="input input--sm"
                        min={9}
                        max={24}
                        value={parseInt(customTokens['--terminal-font-size'] ?? getBaseToken('--terminal-font-size')) || 13}
                        onInput={(e) => handleTokenChange('--terminal-font-size', `${(e.target as HTMLInputElement).value}px`)}
                        style={{ width: '60px' }}
                      />
                    </label>
                    <label class="settings-label" style={{ gap: '4px' }}>
                      <span class="theme-editor__label">{t('themeEditor.terminalLineHeight')}</span>
                      <input
                        type="number"
                        class="input input--sm"
                        min={1.0}
                        max={2.0}
                        step={0.1}
                        value={parseFloat(customTokens['--terminal-line-height'] ?? getBaseToken('--terminal-line-height')) || 1.3}
                        onInput={(e) => handleTokenChange('--terminal-line-height', (e.target as HTMLInputElement).value)}
                        style={{ width: '60px' }}
                      />
                    </label>
                  </div>
                </div>
              </div>
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
