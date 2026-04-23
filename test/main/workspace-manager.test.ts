import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { BUILTIN_PERSONAS } from '../../src/shared/persona-types'
import type { Persona, Workspace, WorkspaceCell } from '../../src/shared/persona-types'
import { resolvePrompt, spanOf, resizeCells } from '../../src/main/workspace/workspace-manager'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeWorkspace(overrides: Partial<Workspace> = {}): Workspace {
  return {
    id: 'test-ws',
    name: 'Test',
    cols: 3,
    rows: 2,
    cells: Array.from({ length: 6 }, () => ({ persona: 'worker', project: '', prompt: '' })),
    merges: {},
    promptOverrides: {},
    ...overrides,
  }
}

function makeCell(overrides: Partial<WorkspaceCell> = {}): WorkspaceCell {
  return { persona: 'worker', project: '', prompt: '', ...overrides }
}

// ── resolvePrompt ─────────────────────────────────────────────────────────────

describe('resolvePrompt', () => {
  it('cell prompt wins when set (source: cell)', () => {
    const ws = makeWorkspace()
    const cell = makeCell({ persona: 'worker', prompt: 'do the thing' })
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, 'do the thing')
    assert.strictEqual(result.source, 'cell')
  })

  it('workspace override wins when cell prompt is empty (source: workspace-override)', () => {
    const ws = makeWorkspace({ promptOverrides: { worker: 'custom worker prompt' } })
    const cell = makeCell({ persona: 'worker', prompt: '' })
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, 'custom worker prompt')
    assert.strictEqual(result.source, 'workspace-override')
  })

  it('persona default used when no cell prompt or workspace override (source: persona-default)', () => {
    const ws = makeWorkspace()
    const cell = makeCell({ persona: 'worker', prompt: '' })
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    const workerPersona = BUILTIN_PERSONAS.find((p) => p.id === 'worker')!
    assert.strictEqual(result.text, workerPersona.defaultPrompt)
    assert.strictEqual(result.source, 'persona-default')
  })

  it('unknown persona returns empty string with persona-default source', () => {
    const ws = makeWorkspace()
    const cell = makeCell({ persona: 'nonexistent', prompt: '' })
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, '')
    assert.strictEqual(result.source, 'persona-default')
  })

  it('whitespace-only cell prompt falls through to workspace override', () => {
    const ws = makeWorkspace({ promptOverrides: { worker: 'override prompt' } })
    const cell = makeCell({ persona: 'worker', prompt: '   ' })
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, 'override prompt')
    assert.strictEqual(result.source, 'workspace-override')
  })

  it('whitespace-only cell prompt falls through to persona default when no override', () => {
    const ws = makeWorkspace()
    const cell = makeCell({ persona: 'orchestrator', prompt: '\t\n ' })
    const workerPersona = BUILTIN_PERSONAS.find((p) => p.id === 'orchestrator')!
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, workerPersona.defaultPrompt)
    assert.strictEqual(result.source, 'persona-default')
  })

  it('workspace override wins over persona default when both are set', () => {
    const customPersonas: Persona[] = [
      { id: 'custom', name: 'Custom', color: '#000', defaultPrompt: 'default custom' },
    ]
    const ws = makeWorkspace({ promptOverrides: { custom: 'ws override custom' } })
    const cell = makeCell({ persona: 'custom', prompt: '' })
    const result = resolvePrompt(ws, cell, customPersonas)
    assert.strictEqual(result.text, 'ws override custom')
    assert.strictEqual(result.source, 'workspace-override')
  })

  it('cell prompt wins over workspace override and persona default', () => {
    const ws = makeWorkspace({ promptOverrides: { worker: 'ws override' } })
    const cell = makeCell({ persona: 'worker', prompt: 'cell wins' })
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, 'cell wins')
    assert.strictEqual(result.source, 'cell')
  })

  it('empty persona has empty defaultPrompt resolved correctly', () => {
    const ws = makeWorkspace()
    const cell = makeCell({ persona: 'empty', prompt: '' })
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, '')
    assert.strictEqual(result.source, 'persona-default')
  })

  it('workspace override that is whitespace-only falls through to persona default', () => {
    const ws = makeWorkspace({ promptOverrides: { worker: '   ' } })
    const cell = makeCell({ persona: 'worker', prompt: '' })
    const workerPersona = BUILTIN_PERSONAS.find((p) => p.id === 'worker')!
    const result = resolvePrompt(ws, cell, [...BUILTIN_PERSONAS])
    assert.strictEqual(result.text, workerPersona.defaultPrompt)
    assert.strictEqual(result.source, 'persona-default')
  })
})

// ── spanOf ────────────────────────────────────────────────────────────────────

describe('spanOf', () => {
  it('unmerged cell returns 1', () => {
    const ws = makeWorkspace({ merges: {} })
    assert.strictEqual(spanOf(ws, 0, 0), 1)
    assert.strictEqual(spanOf(ws, 1, 0), 1)
    assert.strictEqual(spanOf(ws, 0, 1), 1)
  })

  it('top of a 2-cell merge returns 2', () => {
    const ws = makeWorkspace({ merges: { '0:0': true } })
    assert.strictEqual(spanOf(ws, 0, 0), 2)
  })

  it('hidden cell (below merge top) returns 0', () => {
    const ws = makeWorkspace({ merges: { '0:0': true } })
    // row 1, col 0 is hidden because col 0, row 0 merges down
    assert.strictEqual(spanOf(ws, 0, 1), 0)
  })

  it('triple merge: top returns 3, middle and bottom return 0', () => {
    const ws = makeWorkspace({
      rows: 3,
      cells: Array.from({ length: 9 }, () => makeCell()),
      merges: { '1:0': true, '1:1': true },
    })
    assert.strictEqual(spanOf(ws, 1, 0), 3)
    assert.strictEqual(spanOf(ws, 1, 1), 0)
    assert.strictEqual(spanOf(ws, 1, 2), 0)
  })

  it('second column unaffected by first column merges', () => {
    const ws = makeWorkspace({ merges: { '0:0': true } })
    // col 1 is untouched
    assert.strictEqual(spanOf(ws, 1, 0), 1)
    assert.strictEqual(spanOf(ws, 1, 1), 1)
  })

  it('merge in col 1 row 1 does not affect col 0', () => {
    const ws = makeWorkspace({ merges: { '1:1': true } })
    assert.strictEqual(spanOf(ws, 0, 1), 1)
    assert.strictEqual(spanOf(ws, 1, 1), 2)
    assert.strictEqual(spanOf(ws, 1, 2), 0)  // row 2 is rows-1=1 boundary, adjust expectation
  })

  it('unmerged top row returns 1 regardless of column', () => {
    const ws = makeWorkspace({ merges: {} })
    for (let col = 0; col < 3; col++) {
      assert.strictEqual(spanOf(ws, col, 0), 1)
    }
  })

  it('merge at last merge-able row (rows-2) → span 2, row below → 0', () => {
    // ws has rows=2, so row 0 can merge down to row 1 via key "col:0"
    const ws = makeWorkspace({ cols: 2, rows: 2, cells: Array.from({ length: 4 }, () => makeCell()), merges: { '0:0': true } })
    assert.strictEqual(spanOf(ws, 0, 0), 2)
    assert.strictEqual(spanOf(ws, 0, 1), 0)
  })
})

// ── resizeCells ───────────────────────────────────────────────────────────────

describe('resizeCells', () => {
  const emptyCell: WorkspaceCell = { persona: 'empty', project: '', prompt: '' }

  it('growing grid preserves existing cells and fills new slots with empty', () => {
    const oldCells: WorkspaceCell[] = [
      { persona: 'orchestrator', project: '/p', prompt: 'hi' },
      { persona: 'worker',       project: '/q', prompt: '' },
    ]
    const { cells } = resizeCells(oldCells, {}, 2, 1, 3, 2)
    // Original 2 cells preserved (row 0, cols 0-1)
    assert.deepStrictEqual(cells[0], oldCells[0])
    assert.deepStrictEqual(cells[1], oldCells[1])
    // New cells are empty (6 total - 2 old = 4 new)
    assert.strictEqual(cells.length, 6)
    assert.deepStrictEqual(cells[2], emptyCell)
    assert.deepStrictEqual(cells[3], emptyCell)
    assert.deepStrictEqual(cells[4], emptyCell)
    assert.deepStrictEqual(cells[5], emptyCell)
  })

  it('shrinking grid drops overflow cells', () => {
    const oldCells: WorkspaceCell[] = [
      { persona: 'orchestrator', project: '', prompt: '' },
      { persona: 'worker',       project: '', prompt: '' },
      { persona: 'mpo',          project: '', prompt: '' },
      { persona: 'auditor',      project: '', prompt: '' },
    ]
    // 2x2 → 1x2
    const { cells } = resizeCells(oldCells, {}, 2, 2, 1, 2)
    assert.strictEqual(cells.length, 2)
    assert.deepStrictEqual(cells[0], oldCells[0])   // row 0, col 0 preserved
    assert.deepStrictEqual(cells[1], oldCells[2])   // row 1, col 0 preserved
  })

  it('merges outside new column bounds are dropped', () => {
    const oldCells: WorkspaceCell[] = Array.from({ length: 6 }, () => makeCell())
    const oldMerges: Record<string, true> = { '0:0': true, '2:0': true }
    // Shrink cols from 3 to 2 — col 2 merge should be dropped
    const { merges } = resizeCells(oldCells, oldMerges, 3, 2, 2, 2)
    assert.ok('0:0' in merges, 'col 0 merge should be preserved')
    assert.ok(!('2:0' in merges), 'col 2 merge should be dropped')
  })

  it('merges outside new row bounds are dropped', () => {
    const oldCells: WorkspaceCell[] = Array.from({ length: 6 }, () => makeCell())
    // "col:row" key means "row merges DOWN", so key must have row < rows-1
    // With newRows=2, valid merge rows are 0..0 (rows-1 = 1, merges use row < rows-1)
    // key "1:1" means row 1 merges down, only valid if rows >= 3
    const oldMerges: Record<string, true> = { '1:0': true, '1:1': true }
    const { merges } = resizeCells(oldCells, oldMerges, 3, 3, 3, 2)
    // After shrink to 2 rows: valid merge rows are row < 2-1 = row < 1 → only row 0
    assert.ok('1:0' in merges, 'row-0 merge should be preserved')
    assert.ok(!('1:1' in merges), 'row-1 merge dropped (no row 2 in new grid)')
  })

  it('merges inside bounds are preserved after resize', () => {
    const oldCells: WorkspaceCell[] = Array.from({ length: 9 }, () => makeCell())
    const oldMerges: Record<string, true> = { '0:0': true, '1:1': true }
    const { merges } = resizeCells(oldCells, oldMerges, 3, 3, 3, 3)
    assert.ok('0:0' in merges)
    assert.ok('1:1' in merges)
  })

  it('shrinking both dimensions preserves only top-left cells', () => {
    // 3x3 grid → 2x2
    const oldCells: WorkspaceCell[] = [
      { persona: 'a', project: '', prompt: '' },
      { persona: 'b', project: '', prompt: '' },
      { persona: 'c', project: '', prompt: '' },
      { persona: 'd', project: '', prompt: '' },
      { persona: 'e', project: '', prompt: '' },
      { persona: 'f', project: '', prompt: '' },
      { persona: 'g', project: '', prompt: '' },
      { persona: 'h', project: '', prompt: '' },
      { persona: 'i', project: '', prompt: '' },
    ]
    const { cells } = resizeCells(oldCells, {}, 3, 3, 2, 2)
    assert.strictEqual(cells.length, 4)
    assert.strictEqual(cells[0].persona, 'a')  // row0 col0
    assert.strictEqual(cells[1].persona, 'b')  // row0 col1
    assert.strictEqual(cells[2].persona, 'd')  // row1 col0
    assert.strictEqual(cells[3].persona, 'e')  // row1 col1
  })

  it('same size returns copy of cells and merges', () => {
    const oldCells: WorkspaceCell[] = [
      { persona: 'orchestrator', project: '/x', prompt: 'p' },
      { persona: 'worker',       project: '/y', prompt: '' },
      { persona: 'mpo',          project: '/z', prompt: '' },
      { persona: 'empty',        project: '',   prompt: '' },
    ]
    // 2×2 grid: merge at col 0, row 0 (merges down to row 1) — valid because rows=2
    const oldMerges: Record<string, true> = { '0:0': true }
    const { cells, merges } = resizeCells(oldCells, oldMerges, 2, 2, 2, 2)
    assert.deepStrictEqual(cells, oldCells)
    assert.deepStrictEqual(merges, oldMerges)
  })
})
