/**
 * a11y-config.ts — Accessibility configuration for ConfigStore
 *
 * Font settings (family, size, line-height, letter-spacing) and
 * system preference overrides (motion, contrast, color-scheme).
 *
 * REQ-A11Y-003, REQ-A11Y-005
 */

/** Accessibility settings persisted in ConfigStore under `a11y` key. */
export interface A11yConfig {
  /** UI font family override. Empty string = system default. */
  fontFamily: string
  /** UI font size in px (10-32). */
  fontSize: number
  /** Terminal font size in px (8-28). Separate from UI font size. */
  terminalFontSize: number
  /** UI line height multiplier (1.0-3.0). */
  lineHeight: number
  /** UI letter spacing in px (0-5). */
  letterSpacing: number
  /** Override for prefers-reduced-motion: 'system' | 'reduce' | 'allow'. */
  motionOverride: 'system' | 'reduce' | 'allow'
  /** Override for prefers-contrast: 'system' | 'more' | 'normal'. */
  contrastOverride: 'system' | 'more' | 'normal'
  /** Override for prefers-color-scheme: 'system' | 'dark' | 'light'. */
  colorSchemeOverride: 'system' | 'dark' | 'light'
}

export const A11Y_DEFAULTS: A11yConfig = {
  fontFamily: '',
  fontSize: 14,
  terminalFontSize: 13,
  lineHeight: 1.5,
  letterSpacing: 0,
  motionOverride: 'system',
  contrastOverride: 'system',
  colorSchemeOverride: 'system',
}

/** Clamp a11y font values to safe ranges. */
export function sanitizeA11yConfig(raw: Partial<A11yConfig>): A11yConfig {
  const merged = { ...A11Y_DEFAULTS, ...raw }
  return {
    fontFamily: typeof merged.fontFamily === 'string' ? merged.fontFamily : '',
    fontSize: clamp(merged.fontSize, 10, 32),
    terminalFontSize: clamp(merged.terminalFontSize, 8, 28),
    lineHeight: clampFloat(merged.lineHeight, 1.0, 3.0),
    letterSpacing: clamp(merged.letterSpacing, 0, 5),
    motionOverride: validateEnum(merged.motionOverride, ['system', 'reduce', 'allow'], 'system'),
    contrastOverride: validateEnum(merged.contrastOverride, ['system', 'more', 'normal'], 'system'),
    colorSchemeOverride: validateEnum(merged.colorSchemeOverride, ['system', 'dark', 'light'], 'system'),
  }
}

/** Build CSS variable style string for renderer injection. */
export function a11yFontVars(config: A11yConfig): Record<string, string> {
  const vars: Record<string, string> = {}
  if (config.fontFamily) {
    vars['--a11y-font-family'] = config.fontFamily
  }
  if (config.fontSize !== A11Y_DEFAULTS.fontSize) {
    vars['--a11y-font-size'] = `${config.fontSize}px`
  }
  if (config.lineHeight !== A11Y_DEFAULTS.lineHeight) {
    vars['--a11y-line-height'] = `${config.lineHeight}`
  }
  if (config.letterSpacing > 0) {
    vars['--a11y-letter-spacing'] = `${config.letterSpacing}px`
  }
  return vars
}

/** Check whether any font setting deviates from defaults. */
export function hasCustomFontSettings(config: A11yConfig): boolean {
  return (
    config.fontFamily !== '' ||
    config.fontSize !== A11Y_DEFAULTS.fontSize ||
    config.terminalFontSize !== A11Y_DEFAULTS.terminalFontSize ||
    config.lineHeight !== A11Y_DEFAULTS.lineHeight ||
    config.letterSpacing !== A11Y_DEFAULTS.letterSpacing
  )
}

/** Build data-attributes for <body> based on a11y overrides. */
export function a11yBodyAttributes(config: A11yConfig): Record<string, string> {
  const attrs: Record<string, string> = {}

  if (hasCustomFontSettings(config)) {
    attrs['data-a11y-fonts'] = 'true'
  }
  if (config.motionOverride !== 'system') {
    attrs['data-a11y-motion'] = config.motionOverride
  }
  if (config.contrastOverride !== 'system') {
    attrs['data-a11y-contrast'] = config.contrastOverride
  }
  if (config.colorSchemeOverride !== 'system') {
    attrs['data-a11y-color-scheme'] = config.colorSchemeOverride
  }

  return attrs
}

function clamp(val: number, min: number, max: number): number {
  const n = typeof val === 'number' ? val : min
  return Math.max(min, Math.min(max, Math.round(n)))
}

function clampFloat(val: number, min: number, max: number): number {
  const n = typeof val === 'number' ? val : min
  return Math.max(min, Math.min(max, Math.round(n * 10) / 10))
}

function validateEnum<T extends string>(val: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(val as T) ? (val as T) : fallback
}
