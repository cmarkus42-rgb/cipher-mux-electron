// src/renderer/a11y/hooks/useA11ySettings.ts
import { useState, useEffect, useCallback } from 'preact/hooks'

export interface A11ySettings {
  /** Active CVD theme override (null = use normal theme) */
  cvdTheme: 'cvd-deuteranopia' | 'cvd-tritanopia' | 'cvd-achromatopsia' | null
  /** System preference overrides */
  reducedMotion: 'system' | 'on' | 'off'
  highContrast: 'system' | 'on' | 'off'
  colorScheme: 'system' | 'dark' | 'light'
  /** Font settings (UI text only, not terminal) */
  fontSize: number
  lineHeight: number
  letterSpacing: number
  fontFamily: string
  /** Focus Mode */
  focusModeEnabled: boolean
}

const DEFAULTS: A11ySettings = {
  cvdTheme: null,
  reducedMotion: 'system',
  highContrast: 'system',
  colorScheme: 'system',
  fontSize: 14,
  lineHeight: 1.5,
  letterSpacing: 0,
  fontFamily: '',
  focusModeEnabled: false,
}

const api = () => (window as any).cipherMux

/** Apply a11y font settings to the document root. */
function applyFontSettings(settings: A11ySettings): void {
  const root = document.documentElement
  if (settings.fontSize !== DEFAULTS.fontSize) {
    root.style.setProperty('--a11y-font-size', `${settings.fontSize}px`)
  } else {
    root.style.removeProperty('--a11y-font-size')
  }
  if (settings.lineHeight !== DEFAULTS.lineHeight) {
    root.style.setProperty('--a11y-line-height', `${settings.lineHeight}`)
  } else {
    root.style.removeProperty('--a11y-line-height')
  }
  if (settings.letterSpacing !== DEFAULTS.letterSpacing) {
    root.style.setProperty('--a11y-letter-spacing', `${settings.letterSpacing}px`)
  } else {
    root.style.removeProperty('--a11y-letter-spacing')
  }
  if (settings.fontFamily) {
    root.style.setProperty('--a11y-font-family', settings.fontFamily)
  } else {
    root.style.removeProperty('--a11y-font-family')
  }
}

/** Apply reduced motion preference. */
function applyReducedMotion(value: 'system' | 'on' | 'off'): void {
  document.body.classList.toggle('a11y-reduce-motion', value === 'on')
  document.body.classList.toggle('a11y-force-motion', value === 'off')
}

export function useA11ySettings() {
  const [settings, setSettingsState] = useState<A11ySettings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  // Load persisted settings on mount
  useEffect(() => {
    api().config.get('a11y').then((stored: Partial<A11ySettings> | null) => {
      if (stored) {
        const merged = { ...DEFAULTS, ...stored }
        setSettingsState(merged)
        applyFontSettings(merged)
        applyReducedMotion(merged.reducedMotion)
        if (merged.cvdTheme) {
          api().theme?.set(merged.cvdTheme)
        }
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  const update = useCallback(async (patch: Partial<A11ySettings>) => {
    setSettingsState(prev => {
      const next = { ...prev, ...patch }
      applyFontSettings(next)
      applyReducedMotion(next.reducedMotion)
      // Apply CVD theme when changed
      if ('cvdTheme' in patch) {
        if (next.cvdTheme) {
          api().theme?.set(next.cvdTheme)
        }
      }
      // Persist async
      api().config.get('a11y').then((stored: Partial<A11ySettings> | null) => {
        api().config.set('a11y', { ...(stored ?? {}), ...patch })
      }).catch(() => {})
      return next
    })
  }, [])

  const toggleFocusMode = useCallback(() => {
    update({ focusModeEnabled: !settings.focusModeEnabled })
  }, [settings.focusModeEnabled, update])

  return { settings, loaded, update, toggleFocusMode }
}
