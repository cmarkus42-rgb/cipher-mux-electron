// src/shared/character-palette.ts — Curated character color palette (Gold/Dark theme)

/** 12-color palette with sufficient perceptual distance for the dark/gold aesthetic. */
export const CHARACTER_PALETTE = [
  '#C9A227', // gold
  '#2ECC71', // emerald
  '#E67E22', // amber
  '#8E44AD', // amethyst
  '#3498DB', // cobalt
  '#E74C3C', // crimson
  '#1ABC9C', // teal
  '#F39C12', // marigold
  '#9B59B6', // violet
  '#2980B9', // steel blue
  '#D35400', // burnt orange
  '#16A085', // jungle green
] as const

/** Parse hex color to RGB tuple. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Euclidean distance in RGB space. */
function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a)
  const [r2, g2, b2] = hexToRgb(b)
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2)
}

/**
 * Pick a color from CHARACTER_PALETTE with maximum distance from existing colors.
 * Falls back to first palette entry if all are taken.
 */
export function assignCharacterColor(existingColors: string[]): string {
  if (existingColors.length === 0) return CHARACTER_PALETTE[0]

  let bestColor: string = CHARACTER_PALETTE[0]
  let bestMinDist = -1

  for (const candidate of CHARACTER_PALETTE) {
    const minDist = Math.min(...existingColors.map(c => colorDistance(candidate, c)))
    if (minDist > bestMinDist) {
      bestMinDist = minDist
      bestColor = candidate
    }
  }
  return bestColor
}
