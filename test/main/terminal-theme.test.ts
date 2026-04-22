import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getTerminalTheme } from '../../src/shared/terminal-theme'

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
    const theme = getTerminalTheme('ivory')
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
    const theme = getTerminalTheme('ivory')
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
    const theme = getTerminalTheme('dark')
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
    const theme = getTerminalTheme('dark')
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
