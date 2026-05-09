// src/renderer/components/PersonaAvatar.tsx
// CSS pixel art avatars for the 6 seed personas

const PIXEL = 3 // px per pixel

/** 8x8 pixel art patterns as [row][col] = 1 (filled) or 0 (empty) */
const PATTERNS: Record<string, number[][]> = {
  relay: [
    [0,0,1,1,1,1,0,0],
    [0,1,0,0,0,0,1,0],
    [1,0,1,0,0,1,0,1],
    [1,0,0,0,0,0,0,1],
    [1,0,1,0,0,1,0,1],
    [1,0,0,1,1,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
  ],
  cipher: [
    [0,1,1,1,1,1,1,0],
    [1,0,0,1,1,0,0,1],
    [1,0,1,0,0,1,0,1],
    [1,1,0,0,0,0,1,1],
    [1,0,0,1,1,0,0,1],
    [1,0,1,1,1,1,0,1],
    [1,0,0,0,0,0,0,1],
    [0,1,1,1,1,1,1,0],
  ],
  wayne: [
    [0,0,0,1,1,0,0,0],
    [0,0,1,1,1,1,0,0],
    [0,1,0,1,1,0,1,0],
    [1,1,0,0,0,0,1,1],
    [1,0,0,1,1,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,0,0,1,1,0,0,0],
  ],
  kyniker: [
    [1,1,0,0,0,0,1,1],
    [1,0,0,0,0,0,0,1],
    [0,0,1,0,0,1,0,0],
    [0,0,0,0,0,0,0,0],
    [0,1,0,0,0,0,1,0],
    [0,0,1,1,1,1,0,0],
    [0,0,0,1,1,0,0,0],
    [0,0,1,0,0,1,0,0],
  ],
  theaitetos: [
    [0,0,1,1,1,1,0,0],
    [0,1,1,1,1,1,1,0],
    [1,0,1,0,0,1,0,1],
    [1,0,0,0,0,0,0,1],
    [0,1,0,0,0,0,1,0],
    [0,0,1,0,0,1,0,0],
    [0,1,1,1,1,1,1,0],
    [0,0,1,0,0,1,0,0],
  ],
  glitch: [
    [1,0,1,0,1,0,1,0],
    [0,1,0,1,0,1,0,1],
    [1,0,0,1,1,0,0,1],
    [0,0,1,0,0,1,0,0],
    [1,1,0,0,0,0,1,1],
    [0,0,1,0,1,0,0,0],
    [1,0,0,1,0,1,0,1],
    [0,1,0,1,0,1,0,0],
  ],
}

function buildBoxShadow(pattern: number[][], color: string): string {
  const shadows: string[] = []
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y].length; x++) {
      if (pattern[y][x]) {
        shadows.push(`${x * PIXEL}px ${y * PIXEL}px 0 ${color}`)
      }
    }
  }
  return shadows.join(',')
}

interface PersonaAvatarProps {
  characterId: string
  color: string
  size?: number // multiplier, default 1
}

export function PersonaAvatar({ characterId, color, size = 1 }: PersonaAvatarProps) {
  const pattern = PATTERNS[characterId]
  if (!pattern) return null

  const px = PIXEL * size
  const totalSize = 8 * px

  const shadows: string[] = []
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y].length; x++) {
      if (pattern[y][x]) {
        shadows.push(`${x * px}px ${y * px}px 0 ${color}`)
      }
    }
  }

  return (
    <span
      class="persona-avatar"
      style={{
        display: 'inline-block',
        width: `${px}px`,
        height: `${px}px`,
        boxShadow: shadows.join(','),
        marginRight: `${totalSize}px`,
        marginBottom: `${totalSize - px}px`,
      }}
      aria-hidden="true"
    />
  )
}
