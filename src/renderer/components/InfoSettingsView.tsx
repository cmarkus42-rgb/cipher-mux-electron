// src/renderer/components/InfoSettingsView.tsx
import { useCallback, useEffect, useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { APP_VERSION } from '../../shared/constants'
import type { ThemeName } from '../../shared/grid-types'
import themesManifest from '../themes.json'
import '../styles/workspaces.css'

interface InfoSettingsViewProps {
  onRescan: () => void | Promise<void>
  scanning: boolean
  theme: ThemeName
  onSetTheme: (t: ThemeName) => void
  initialTab?: TabId
}

const api = (window as any).cipherMux

interface AppSection {
  scanPaths: string[]
  scanDepth: number
}

type TabId = 'shortcuts' | 'features' | 'settings'

const SHORTCUT_KEYS = [
  { category: 'global', combo: 'Cmd+B', labelKey: 'info.shortcut.openBugreport' },
  { category: 'global', combo: 'Escape', labelKey: 'info.shortcut.closeDialog' },
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
]

export function InfoSettingsView({ onRescan, scanning, theme, onSetTheme, initialTab }: InfoSettingsViewProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabId>(initialTab ?? 'features')
  const [scanPaths, setScanPaths] = useState<string[]>([])
  const [scanDepth, setScanDepth] = useState(1)
  const [loading, setLoading] = useState(true)
  const [skipPerms, setSkipPerms] = useState(false)
  const [language, setLanguage] = useState<'en' | 'de'>(i18n.language as 'en' | 'de')
  const [themeEditorOpen, setThemeEditorOpen] = useState(false)
  const [customTokens, setCustomTokens] = useState<Record<string, string>>({})
  const [savedNotice, setSavedNotice] = useState(false)

  const load = useCallback(async () => {
    const app: AppSection | null = await api.config.get('app')
    setScanPaths(app?.scanPaths ?? [])
    setScanDepth(app?.scanDepth ?? 1)
    const sp: boolean = await api.config.getSkipPermissions()
    setSkipPerms(sp)
    const ui = await api.config.get('ui')
    if (ui?.language) setLanguage(ui.language)
    if (ui?.customThemeTokens) {
      setCustomTokens(ui.customThemeTokens)
      // Apply custom tokens to document
      for (const [prop, val] of Object.entries(ui.customThemeTokens as Record<string, string>)) {
        document.documentElement.style.setProperty(prop, val)
      }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const persist = useCallback(async (next: Partial<AppSection>) => {
    const current: AppSection | null = await api.config.get('app')
    await api.config.set('app', { ...current, ...next })
  }, [])

  const handleAdd = useCallback(async () => {
    const dir = await api.dialog.openDir({ title: t('settings.addScanPath') })
    if (!dir) return
    if (scanPaths.includes(dir)) return
    const next = [...scanPaths, dir]
    setScanPaths(next)
    await persist({ scanPaths: next })
    await onRescan()
  }, [scanPaths, persist, onRescan, t])

  const handleRemove = useCallback(async (p: string) => {
    const next = scanPaths.filter((x) => x !== p)
    setScanPaths(next)
    await persist({ scanPaths: next })
    await onRescan()
  }, [scanPaths, persist, onRescan])

  const handleDepthChange = useCallback(async (value: number) => {
    const clamped = Math.max(1, Math.min(5, Math.floor(value)))
    setScanDepth(clamped)
    await persist({ scanDepth: clamped })
  }, [persist])

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
    document.documentElement.style.setProperty(prop, value)
    setCustomTokens(prev => ({ ...prev, [prop]: value }))
  }, [])

  /** Save custom tokens to ConfigStore. */
  const handleThemeSave = useCallback(async () => {
    const ui = await api.config.get('ui') ?? {}
    await api.config.set('ui', { ...ui, customThemeTokens: customTokens })
    setSavedNotice(true)
    setTimeout(() => setSavedNotice(false), 2000)
  }, [customTokens])

  /** Reset all custom overrides back to theme defaults. */
  const handleThemeReset = useCallback(() => {
    for (const prop of Object.keys(customTokens)) {
      document.documentElement.style.removeProperty(prop)
    }
    setCustomTokens({})
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

  const shortcuts = SHORTCUT_KEYS.map(s => ({ ...s, label: t(s.labelKey) }))
  const grouped = shortcuts.reduce<Record<string, typeof shortcuts>>((acc, s) => {
    (acc[s.category] ??= []).push(s)
    return acc
  }, {})

  return (
    <div class="settings-view">
      <div class="info-tabs">
        {(['shortcuts', 'features', 'settings'] as TabId[]).map((tab) => (
          <button
            key={tab}
            class={`info-tab ${activeTab === tab ? 'info-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'shortcuts' ? t('info.tabShortcuts') : tab === 'features' ? t('info.tabFeatures') : t('info.tabSettings')}
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

      {activeTab === 'features' && (
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

      {activeTab === 'settings' && !loading && (
        <section class="settings-section">
          <div class="settings-section__title">{t('settings.theme')}</div>
          <div class="settings-section__hint">{t('settings.themeHint')}</div>

          <div class="theme-picker" role="radiogroup" aria-label="theme">
            {themes.map((thm) => (
              <div
                key={thm.id}
                class={`theme-row ${thm.id === theme ? 'theme-row--active' : ''}`}
                role="radio"
                aria-checked={thm.id === theme}
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
          </div>

          {/* Theme Editor */}
          <div
            class="settings-section__title"
            style={{ marginTop: 'var(--space-lg)', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => setThemeEditorOpen(v => !v)}
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
                <button class="btn btn--sm" onClick={handleThemeReset}>{t('themeEditor.reset')}</button>
                <button class="btn btn--sm" onClick={handleThemeExport}>{t('themeEditor.export')}</button>
                {savedNotice && <span class="theme-editor__notice">{t('themeEditor.saved')}</span>}
              </div>
            </div>
          )}

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>{t('settings.language')}</div>
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

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>{t('settings.scanPaths')}</div>
          <div class="settings-section__hint">{t('settings.scanPathsHint')}</div>
          <ul class="settings-list">
            {scanPaths.length === 0 && (
              <li class="settings-list__empty">{t('settings.noScanPaths')}</li>
            )}
            {scanPaths.map((p) => (
              <li key={p} class="settings-list__item">
                <span class="font-mono text-sm truncate" title={p}>{p}</span>
                <button class="btn btn--sm" onClick={() => handleRemove(p)} title={t('settings.removePath')}>✕</button>
              </li>
            ))}
          </ul>
          <div class="settings-row">
            <button class="btn btn--primary btn--sm" onClick={handleAdd}>{t('settings.addPath')}</button>
            <button class="btn btn--sm" onClick={onRescan} disabled={scanning}>
              {scanning ? t('settings.scanning') : t('settings.scanNow')}
            </button>
          </div>
          <div class="settings-row" style={{ marginTop: '12px' }}>
            <label class="settings-label">
              <span>{t('settings.scanDepth')}</span>
              <input
                class="input input--sm"
                type="number"
                min={1}
                max={5}
                value={scanDepth}
                onInput={(e) => handleDepthChange(Number((e.target as HTMLInputElement).value))}
                style={{ width: '64px' }}
              />
            </label>
            <span class="text-xs text-dim">{t('settings.scanDepthHint')}</span>
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

          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>{t('settings.about')}</div>
          <div class="settings-section__hint">
            {t('settings.aboutText', { version: APP_VERSION })}
          </div>
        </section>
      )}
    </div>
  )
}
