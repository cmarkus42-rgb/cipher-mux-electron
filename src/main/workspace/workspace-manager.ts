// src/main/workspace/workspace-manager.ts — Pure workspace logic

import type { Persona, Workspace, WorkspaceCell, ResolvedPrompt } from '../../shared/persona-types'

export interface ApplyResult {
  applied: boolean
  sessionsStarted: number
  warnings: string[]
}

export interface SessionStarter {
  start(opts: { name: string; projectPath: string; autoLaunch?: string; workspacePrompt?: string; contextPaths?: string[] }): Promise<{ id: string }>
  startEntity?(entityId: string): Promise<{ id: string }>
}

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
    if (col < newCols && row < newRows - 1) {
      merges[key] = true
    }
  }

  return { cells, merges }
}

/**
 * applyWorkspace — Applies a workspace by resizing the grid and spawning sessions
 * for each cell that has a project assigned.
 */
export interface ApplyResultSession {
  cellIndex: number
  sessionId: string
}

export async function applyWorkspace(
  workspace: Workspace,
  personas: readonly Persona[],
  sessionStarter: SessionStarter,
  gridCallback: (cols: number, rows: number) => void,
): Promise<ApplyResult & { sessions: ApplyResultSession[] }> {
  const warnings: string[] = []
  let sessionsStarted = 0
  const startedSessions: ApplyResultSession[] = []

  // 1. Set grid dimensions
  gridCallback(workspace.cols, workspace.rows)

  // 2. Collect all cells that need sessions, then start them in parallel
  const startTasks: Array<{ cellIndex: number; start: () => Promise<{ id: string }> }> = []

  for (let i = 0; i < workspace.cells.length; i++) {
    const cell = workspace.cells[i]

    // Skip notes cells — they don't spawn sessions, renderer handles them
    if (cell.type === 'notes') continue

    // Skip cells that are hidden by merges (spanOf returns 0)
    const col = i % workspace.cols
    const row = Math.floor(i / workspace.cols)
    if (spanOf(workspace, col, row) === 0) continue

    // Preset-based entity start takes priority
    if (cell.presetId && sessionStarter.startEntity) {
      const presetId = cell.presetId
      startTasks.push({ cellIndex: i, start: () => sessionStarter.startEntity!(presetId) })
      continue
    }

    if (!cell.project) continue

    // Resolve prompt: cell-level overrides workspace-level
    const cellPrompt = cell.prompt.trim()
    const wsPrompt = (workspace.workspacePrompt ?? '').trim()
    const effectivePrompt = cellPrompt || wsPrompt || undefined

    // Resolve context paths: cell-level overrides workspace-level
    const cellPaths = cell.contextPaths?.length ? cell.contextPaths : undefined
    const wsPaths = workspace.contextPaths?.length ? workspace.contextPaths : undefined
    const effectivePaths = cellPaths ?? wsPaths

    const launchCmd = `clear; claude --dangerously-skip-permissions\n`
    const sessionName = cell.project.split('/').pop() || 'session'
    const project = cell.project
    startTasks.push({
      cellIndex: i,
      start: () => sessionStarter.start({ name: sessionName, projectPath: project, autoLaunch: launchCmd, workspacePrompt: effectivePrompt, contextPaths: effectivePaths }),
    })
  }

  // Start all sessions in parallel
  const results = await Promise.allSettled(startTasks.map(async (task) => {
    const session = await task.start()
    return { cellIndex: task.cellIndex, sessionId: session.id }
  }))

  for (const result of results) {
    if (result.status === 'fulfilled') {
      startedSessions.push(result.value)
      sessionsStarted++
    } else {
      warnings.push(`Failed to start session: ${result.reason?.message ?? result.reason}`)
    }
  }

  return { applied: true, sessionsStarted, warnings, sessions: startedSessions }
}
