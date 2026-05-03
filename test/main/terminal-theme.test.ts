import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getTerminalTheme, TerminalThemeColors } from '../../src/shared/terminal-theme'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * WCAG AA requires contrast ratio >= 4.5:1 for normal text.
 * We test that selection highlights meet minimum contrast requirements.
 */

/** Parse hex color to RGB. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

/** Parse rgba() string to RGBA. */
function parseRgba(rgba: string): { r: number; g: number; b: number; a: number } {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/)
  if (!m) throw new Error(`Cannot parse: ${rgba}`)
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 }
}

/** Composite an RGBA color over a solid background, return resulting RGB. */
function compositeOver(fg: { r: number; g: number; b: number; a: number }, bgHex: string): [number, number, number] {
  const [br, bg, bb] = hexToRgb(bgHex)
  const a = fg.a
  return [
    Math.round(fg.r * a + br * (1 - a)),
    Math.round(fg.g * a + bg * (1 - a)),
    Math.round(fg.b * a + bb * (1 - a)),
  ]
}

/** Relative luminance per WCAG 2.1. */
function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

/** WCAG contrast ratio between two RGB colors. */
function contrastRatio(rgb1: [number, number, number], rgb2: [number, number, number]): number {
  const l1 = relativeLuminance(...rgb1)
  const l2 = relativeLuminance(...rgb2)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('getTerminalTheme — selection contrast', () => {
  it('ivory selectionBackground has sufficient contrast against terminal background', () => {
    const theme = getTerminalTheme('cipher-ivory')
    const selBg = parseRgba(theme.selectionBackground!)
    const composited = compositeOver(selBg, theme.background)
    const bgRgb = hexToRgb(theme.background) as [number, number, number]
    // Selection highlight must be clearly distinguishable from background
    // Minimum contrast ratio 1.5:1 for UI element differentiation
    const ratio = contrastRatio(composited, bgRgb)
    assert.ok(
      ratio >= 1.5,
      `Ivory selection-vs-bg contrast ratio ${ratio.toFixed(2)} is below 1.5:1 minimum`,
    )
  })

  it('ivory selectionForeground ensures text readability in selection', () => {
    const theme = getTerminalTheme('cipher-ivory')
    assert.ok(
      theme.selectionForeground,
      'Ivory theme must define selectionForeground for accessible text in selections',
    )
    const selBg = parseRgba(theme.selectionBackground!)
    const composited = compositeOver(selBg, theme.background)
    const fgRgb = hexToRgb(theme.selectionForeground!)
    // WCAG AA: 4.5:1 for normal text
    const ratio = contrastRatio(fgRgb, composited)
    assert.ok(
      ratio >= 4.5,
      `Ivory selectionForeground contrast ${ratio.toFixed(2)} is below WCAG AA 4.5:1`,
    )
  })

  it('dark selectionBackground has sufficient contrast against terminal background', () => {
    const theme = getTerminalTheme('cipher-dark')
    const selBg = parseRgba(theme.selectionBackground!)
    const composited = compositeOver(selBg, theme.background)
    const bgRgb = hexToRgb(theme.background) as [number, number, number]
    const ratio = contrastRatio(composited, bgRgb)
    assert.ok(
      ratio >= 1.5,
      `Dark selection-vs-bg contrast ratio ${ratio.toFixed(2)} is below 1.5:1 minimum`,
    )
  })

  it('dark selectionForeground ensures text readability in selection', () => {
    const theme = getTerminalTheme('cipher-dark')
    assert.ok(
      theme.selectionForeground,
      'Dark theme must define selectionForeground for accessible text in selections',
    )
    const selBg = parseRgba(theme.selectionBackground!)
    const composited = compositeOver(selBg, theme.background)
    const fgRgb = hexToRgb(theme.selectionForeground!)
    const ratio = contrastRatio(fgRgb, composited)
    assert.ok(
      ratio >= 4.5,
      `Dark selectionForeground contrast ${ratio.toFixed(2)} is below WCAG AA 4.5:1`,
    )
  })
})

const ALL_THEME_IDS = [
  'cipher-ivory', 'cipher-dark',
  'blueprint', 'warm-paper',
  'gruvbox-dark', 'nord',
  'synthwave', 'matrix',
  'brutalist', 'high-contrast',
  'cvd-deuteranopia', 'cvd-tritanopia', 'cvd-achromatopsia',
] as const

const ANSI_KEYS: (keyof TerminalThemeColors)[] = [
  'black', 'brightBlack',
  'red', 'brightRed',
  'green', 'brightGreen',
  'yellow', 'brightYellow',
  'blue', 'brightBlue',
  'magenta', 'brightMagenta',
  'cyan', 'brightCyan',
  'white', 'brightWhite',
]

describe('getTerminalTheme — all 13 themes', () => {
  for (const id of ALL_THEME_IDS) {
    it(`${id} returns a valid TerminalThemeColors object`, () => {
      const theme = getTerminalTheme(id)
      assert.ok(theme, `getTerminalTheme('${id}') returned falsy`)
      assert.ok(typeof theme.background === 'string' && theme.background.length > 0,
        `${id}: background missing`)
      assert.ok(typeof theme.foreground === 'string' && theme.foreground.length > 0,
        `${id}: foreground missing`)
      assert.ok(typeof theme.cursor === 'string' && theme.cursor.length > 0,
        `${id}: cursor missing`)

      // All 16 ANSI colors must be present
      for (const key of ANSI_KEYS) {
        assert.ok(typeof theme[key] === 'string' && (theme[key] as string).length > 0,
          `${id}: ${key} missing or empty`)
      }
    })
  }
})

describe('getTerminalTheme — legacy alias fallback', () => {
  it('resolves "ivory" to cipher-ivory theme', () => {
    const theme = getTerminalTheme('ivory' as any)
    const expected = getTerminalTheme('cipher-ivory')
    assert.deepStrictEqual(theme, expected,
      '"ivory" should resolve to the same theme as "cipher-ivory"')
  })

  it('resolves "dark" to cipher-dark theme', () => {
    const theme = getTerminalTheme('dark' as any)
    const expected = getTerminalTheme('cipher-dark')
    assert.deepStrictEqual(theme, expected,
      '"dark" should resolve to the same theme as "cipher-dark"')
  })

  it('falls back to cipher-ivory for unknown theme name', () => {
    const theme = getTerminalTheme('nonexistent' as any)
    const expected = getTerminalTheme('cipher-ivory')
    assert.deepStrictEqual(theme, expected,
      'Unknown theme should fall back to cipher-ivory')
  })
})

describe('themes.json schema validation', () => {
  const themesPath = join(__dirname, '../../src/renderer/themes.json')
  const raw = readFileSync(themesPath, 'utf-8')
  const manifest = JSON.parse(raw)

  it('has exactly 13 theme entries', () => {
    assert.strictEqual(manifest.themes.length, 13,
      `Expected 13 themes, got ${manifest.themes.length}`)
  })

  for (const t of manifest.themes) {
    it(`theme "${t.id}" has required fields`, () => {
      assert.ok(typeof t.id === 'string' && t.id.length > 0, 'id missing')
      assert.ok(typeof t.name === 'string' && t.name.length > 0, 'name missing')
      assert.ok(typeof t.tag === 'string' && t.tag.length > 0, 'tag missing')
      assert.ok(t.mode === 'light' || t.mode === 'dark', `mode must be "light" or "dark", got "${t.mode}"`)
    })

    it(`theme "${t.id}" has 8 previewSwatches`, () => {
      assert.ok(Array.isArray(t.previewSwatches), 'previewSwatches must be an array')
      assert.strictEqual(t.previewSwatches.length, 8,
        `Expected 8 previewSwatches for ${t.id}, got ${t.previewSwatches.length}`)
      for (const swatch of t.previewSwatches) {
        assert.ok(typeof swatch === 'string' && /^#[0-9A-Fa-f]{6}$/.test(swatch),
          `Invalid swatch color "${swatch}" in ${t.id}`)
      }
    })
  }
})
