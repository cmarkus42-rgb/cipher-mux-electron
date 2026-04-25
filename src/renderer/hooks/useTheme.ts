// src/renderer/hooks/useTheme.ts
import { useState, useEffect, useCallback } from 'preact/hooks'
import type { ThemeName } from '../../shared/grid-types'
import { LEGACY_THEME_ALIASES, DEFAULT_THEME } from '../../shared/grid-types'
export { getTerminalTheme } from '../../shared/terminal-theme'

const api = () => (window as any).cipherMux

const ALL_THEMES: ThemeName[] = [
  'cipher-ivory', 'cipher-dark',
  'blueprint', 'warm-paper',
  'gruvbox-dark', 'nord',
  'synthwave', 'matrix',
  'brutalist', 'high-contrast',
]

export interface CustomTheme {
  id: string
  name: string
  baseTheme: ThemeName
  tokens: Record<string, string>
}

function isValidTheme(name: string): name is ThemeName {
  return (ALL_THEMES as string[]).includes(name)
}

/** Manages theme state. Sets body[data-theme] and persists choice. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME)
  const [customThemes, setCustomThemes] = useState<CustomTheme[]>([])
  const [activeCustomThemeId, setActiveCustomThemeId] = useState<string | null>(null)

  // Load persisted theme on mount
  useEffect(() => {
    api().config.get('ui').then((ui: any) => {
      const raw: string = ui?.theme ?? 'ivory'
      const mapped = LEGACY_THEME_ALIASES[raw] ?? raw
      const resolved: ThemeName = isValidTheme(mapped) ? mapped : DEFAULT_THEME
      setThemeState(resolved)
      const customs: CustomTheme[] = ui?.customThemes ?? []
      setCustomThemes(customs)
      const activeCustom: string | null = ui?.activeCustomThemeId ?? null
      if (activeCustom) {
        const ct = customs.find(c => c.id === activeCustom)
        if (ct) {
          setActiveCustomThemeId(activeCustom)
          applyTheme(ct.baseTheme)
          applyCustomTokens(ct.tokens)
          return
        }
      }
      applyTheme(resolved)
      // Apply custom token overrides if any
      if (ui?.customThemeTokens) {
        applyCustomTokens(ui.customThemeTokens)
      }
    }).catch(() => {})
  }, [])

  const persistUi = useCallback(async (patch: Record<string, unknown>) => {
    const ui = await api().config.get('ui') ?? {}
    await api().config.set('ui', { ...ui, ...patch })
  }, [])

  const setTheme = useCallback((next: ThemeName) => {
    setThemeState(next)
    setActiveCustomThemeId(null)
    clearCustomTokens()
    applyTheme(next)
    persistUi({ theme: next, activeCustomThemeId: null })
  }, [persistUi])

  const selectCustomTheme = useCallback((ct: CustomTheme) => {
    setThemeState(ct.baseTheme)
    setActiveCustomThemeId(ct.id)
    clearCustomTokens()
    applyTheme(ct.baseTheme)
    applyCustomTokens(ct.tokens)
    persistUi({ theme: ct.baseTheme, activeCustomThemeId: ct.id, customThemeTokens: ct.tokens })
  }, [persistUi])

  const saveCustomTheme = useCallback(async (name: string, baseTheme: ThemeName, tokens: Record<string, string>) => {
    const id = `custom-${Date.now()}`
    const ct: CustomTheme = { id, name, baseTheme, tokens }
    const next = [...customThemes, ct]
    setCustomThemes(next)
    setActiveCustomThemeId(id)
    await persistUi({ customThemes: next, activeCustomThemeId: id })
    return ct
  }, [customThemes, persistUi])

  const deleteCustomTheme = useCallback(async (id: string) => {
    const next = customThemes.filter(c => c.id !== id)
    setCustomThemes(next)
    if (activeCustomThemeId === id) {
      setActiveCustomThemeId(null)
      clearCustomTokens()
      await persistUi({ customThemes: next, activeCustomThemeId: null, customThemeTokens: {} })
    } else {
      await persistUi({ customThemes: next })
    }
  }, [customThemes, activeCustomThemeId, persistUi])

  /** Toggle between cipher-ivory and cipher-dark (convenience). */
  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: ThemeName = prev === 'cipher-ivory' ? 'cipher-dark' : 'cipher-ivory'
      setActiveCustomThemeId(null)
      clearCustomTokens()
      applyTheme(next)
      persistUi({ theme: next, activeCustomThemeId: null })
      return next
    })
  }, [persistUi])

  return { theme, setTheme, toggleTheme, customThemes, activeCustomThemeId, selectCustomTheme, saveCustomTheme, deleteCustomTheme }
}

const LIGHT_THEMES: ThemeName[] = ['cipher-ivory', 'warm-paper', 'brutalist']

function applyTheme(theme: ThemeName): void {
  document.body.dataset.theme = theme
  document.body.classList.toggle('theme-dark', !LIGHT_THEMES.includes(theme))
}

function applyCustomTokens(tokens: Record<string, string>): void {
  for (const [prop, val] of Object.entries(tokens)) {
    document.documentElement.style.setProperty(prop, val)
  }
}

function clearCustomTokens(): void {
  const style = document.documentElement.style
  for (let i = style.length - 1; i >= 0; i--) {
    const prop = style[i]
    if (prop.startsWith('--color-')) {
      style.removeProperty(prop)
    }
  }
}
