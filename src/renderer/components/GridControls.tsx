// src/renderer/components/GridControls.tsx
import { MIN_GRID_COLS, MAX_GRID_COLS, MIN_GRID_ROWS, MAX_GRID_ROWS } from '../../shared/constants'

interface GridControlsProps {
  cols: number
  rows: number
  onResize: (cols: number, rows: number) => void
}

export function GridControls({ cols, rows, onResize, inline }: GridControlsProps & { inline?: boolean }) {
  return (
    <div class={`grid-controls${inline ? ' grid-controls--inline' : ''}`}>
      <span class="grid-controls__label">spalten</span>
      <button
        class="grid-controls__btn"
        onClick={() => onResize(Math.max(MIN_GRID_COLS, cols - 1), rows)}
        disabled={cols <= MIN_GRID_COLS}
      >−</button>
      <span class="grid-controls__val">{cols}</span>
      <button
        class="grid-controls__btn"
        onClick={() => onResize(Math.min(MAX_GRID_COLS, cols + 1), rows)}
        disabled={cols >= MAX_GRID_COLS}
      >+</button>
      <span class="grid-controls__sep">│</span>
      <span class="grid-controls__label">zeilen</span>
      <button
        class="grid-controls__btn"
        onClick={() => onResize(cols, Math.max(MIN_GRID_ROWS, rows - 1))}
        disabled={rows <= MIN_GRID_ROWS}
      >−</button>
      <span class="grid-controls__val">{rows}</span>
      <button
        class="grid-controls__btn"
        onClick={() => onResize(cols, Math.min(MAX_GRID_ROWS, rows + 1))}
        disabled={rows >= MAX_GRID_ROWS}
      >+</button>
    </div>
  )
}
