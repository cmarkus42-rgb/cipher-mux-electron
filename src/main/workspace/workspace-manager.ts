// src/main/workspace/workspace-manager.ts — Pure workspace logic

import type { Persona, Workspace, WorkspaceCell, ResolvedPrompt } from '../../shared/persona-types'

/**
 * resolvePrompt — 3-level priority resolution for a workspace cell's effective prompt.
 *
 * Priority (highest → lowest):
 *   1. cell.prompt (non-empty, trimmed)
 *   2. workspace.promptOverrides[cell.persona] (non-empty, trimmed)
 *   3. persona.defaultPrompt (looked up by cell.persona in personas array)
 *   4. '' with source 'persona-default' when persona not found
 */
export function resolvePrompt(
  workspace: Workspace,
  cell: WorkspaceCell,
  personas: readonly Persona[],
): ResolvedPrompt {
  const cellText = cell.prompt.trim()
  if (cellText !== '') {
    return { text: cellText, source: 'cell' }
  }

  const overrideText = (workspace.promptOverrides[cell.persona] ?? '').trim()
  if (overrideText !== '') {
    return { text: overrideText, source: 'workspace-override' }
  }

  const persona = personas.find((p) => p.id === cell.persona)
  return {
    text: persona?.defaultPrompt ?? '',
    source: 'persona-default',
  }
}

/**
 * spanOf — computes the row span for a cell at (col, row) in a workspace grid.
 *
 * Merges are stored as ws.merges["col:row"] = true meaning "this cell merges DOWN
 * with the cell below it" (i.e. row and row+1 are visually merged).
 *
 * Returns:
 *   0  — cell is hidden (a cell above it merges into its position)
 *   1  — cell is unmerged
 *   N  — cell is the top of a merge chain of length N
 */
export function spanOf(ws: Pick<Workspace, 'merges'>, col: number, row: number): number {
  // If the cell above merges down into this row, this cell is hidden.
  if (row > 0 && ws.merges[`${col}:${row - 1}`]) {
    return 0
  }

  // Count consecutive merges downward from this row.
  let span = 1
  let r = row
  while (ws.merges[`${col}:${r}`]) {
    span += 1
    r += 1
  }

  return span
}

/**
 * resizeCells — resizes a cell grid from (oldCols × oldRows) to (newCols × newRows).
 *
 * - Cells that exist in both grids are copied.
 * - New positions are filled with { persona: 'empty', project: '', prompt: '' }.
 * - Merges whose col >= newCols or row >= newRows - 1 are dropped (no cell below).
 */
export function resizeCells(
  oldCells: WorkspaceCell[],
  oldMerges: Record<string, true>,
  oldCols: number,
  oldRows: number,
  newCols: number,
  newRows: number,
): { cells: WorkspaceCell[]; merges: Record<string, true> } {
  const emptyCell = (): WorkspaceCell => ({ persona: 'empty', project: '', prompt: '' })

  const cells: WorkspaceCell[] = []
  for (let row = 0; row < newRows; row++) {
    for (let col = 0; col < newCols; col++) {
      if (col < oldCols && row < oldRows) {
        const oldIndex = row * oldCols + col
        cells.push(oldCells[oldIndex])
      } else {
        cells.push(emptyCell())
      }
    }
  }

  const merges: Record<string, true> = {}
  for (const key of Object.keys(oldMerges)) {
    const [colStr, rowStr] = key.split(':')
    const col = parseInt(colStr, 10)
    const row = parseInt(rowStr, 10)
    // Drop if out of new bounds: col must be < newCols, row must be < newRows - 1
    // (a merge at row r means r+1 must exist, so r < newRows - 1)
    if (col < newCols && row < newRows - 1) {
      merges[key] = true
    }
  }

  return { cells, merges }
}
