// src/renderer/a11y/hooks/useA11ySettings.ts
import { useState, useEffect, useCallback, useRef } from 'preact/hooks'
import { setTerminalFontSize } from '../terminal-font-size'

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
  /** Terminal font size in px (8-28). Separate from UI font size. */
  terminalFontSize: number
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
  terminalFontSize: 13,
  focusModeEnabled: false,
}

const api = () => (window as any).cipherMux

/** Base font sizes (px) from theme.css — used for proportional scaling. */
const BASE_FONT_SIZES = {
  xs: 10, sm: 11, base: 13, md: 14, lg: 16, xl: 20,
}

/** Apply a11y font settings to the document root. Scales all --font-size-* vars proportionally. */
function applyFontSettings(settings: A11ySettings): void {
  const root = document.documentElement

  // Scale all font-size CSS variables proportionally based on UI fontSize vs base (14px default)
  const scale = settings.fontSize / DEFAULTS.fontSize
  if (scale !== 1) {
    for (const [key, basePx] of Object.entries(BASE_FONT_SIZES)) {
      root.style.setProperty(`--font-size-${key}`, `${Math.round(basePx * scale)}px`)
    }
    root.style.setProperty('--a11y-font-size', `${settings.fontSize}px`)
  } else {
    // Reset to theme defaults
    for (const key of Object.keys(BASE_FONT_SIZES)) {
      root.style.removeProperty(`--font-size-${key}`)
    }
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

export function useA11ySettings(onThemeChange?: (theme: string | null) => void) {
  const [settings, setSettingsState] = useState<A11ySettings>(DEFAULTS)
  const [loaded, setLoaded] = useState(false)
  const onThemeChangeRef = useRef(onThemeChange)
  onThemeChangeRef.current = onThemeChange

  // Load persisted settings on mount
  useEffect(() => {
    api().config.get('a11y').then((stored: Partial<A11ySettings> | null) => {
      if (stored) {
        const merged = { ...DEFAULTS, ...stored }
        setSettingsState(merged)
        applyFontSettings(merged)
        applyReducedMotion(merged.reducedMotion)
        if (merged.cvdTheme) {
          onThemeChangeRef.current?.(merged.cvdTheme)
        }
        // Sync terminal font size module with stored value
        if (merged.terminalFontSize !== DEFAULTS.terminalFontSize) {
          setTerminalFontSize(merged.terminalFontSize)
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
        onThemeChangeRef.current?.(next.cvdTheme)
      }
      // Apply terminal font size when changed
      if ('terminalFontSize' in patch) {
        setTerminalFontSize(next.terminalFontSize)
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
