/**
 * useScrollHandler — listens for CELL_SCROLL IPC events and scrolls
 * the target terminal via the terminal registry.
 */
import { useEffect } from 'preact/hooks'
import { getTerminal, getMarker } from '../terminal-registry'
import type { GridState } from '../../shared/grid-types'

const api = () => (window as any).cipherMux

interface ScrollPayload {
  sessionId?: string
  cell?: string
  action: 'up' | 'down' | 'top' | 'bottom' | 'to-marker'
  lines?: number
}

/**
 * Resolve a cell identifier like "cell-0-1" to a sessionId
 * using the current grid state.
 */
function resolveCell(cell: string, grid: GridState): string | undefined {
  const match = cell.match(/^cell-(\d+)-(\d+)$/)
  if (!match) return undefined
  const col = parseInt(match[1], 10)
  const row = parseInt(match[2], 10)
  const idx = row * grid.cols + col
  return grid.slots[idx]?.sessionId ?? undefined
}

/**
 * Compute scroll distance based on terminal height.
 * Single-height (~20-35 rows): nearly a full page (rows - 2).
 * Expanded (~50+ rows): 2/3 of visible area, keep 1/3 for context.
 */
function scrollAmount(rows: number): number {
  return rows > 40
    ? Math.floor(rows * 2 / 3)
    : Math.max(rows - 2, 1)
}

export function useScrollHandler(grid: GridState): void {
  useEffect(() => {
    const unsub = api().terminal.onCellScroll((payload: ScrollPayload) => {
      const targetId = payload.sessionId ?? (payload.cell ? resolveCell(payload.cell, grid) : undefined)
      if (!targetId) return

      const term = getTerminal(targetId)
      if (!term) return

      const amount = payload.lines ?? scrollAmount(term.rows)

      switch (payload.action) {
        case 'up':
          term.scrollLines(-amount)
          break
        case 'down':
          term.scrollLines(amount)
          break
        case 'top':
          term.scrollToTop()
          break
        case 'bottom':
          term.scrollToBottom()
          break
        case 'to-marker': {
          const marker = getMarker(targetId)
          if (marker != null) {
            term.scrollToLine(marker)
          } else {
            term.scrollToTop()
          }
          break
        }
      }
    })

    return () => unsub()
  }, [grid])
}
