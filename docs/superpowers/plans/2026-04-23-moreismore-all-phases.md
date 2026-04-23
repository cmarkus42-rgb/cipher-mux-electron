# Moreismore — All Remaining Phases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete all remaining moreismore phases (C4, D, E, F, G) — from persona/workspace system through communication, voice repair, and polish.

**Architecture:** Phases build on the existing cipher-mux-electron Electron app. Phase D (Workspaces + Personas) is the largest piece: new ConfigStore keys, Preact components for the Settings tabs, a Workspace Popup, and a prompt resolution engine. Phase E extends the message bus with visible sessions. Phase F repairs native voice modules. Phase G is backlog polish.

**Tech Stack:** TypeScript strict, Preact (JSX), Electron IPC (contextIsolation), SQLite (better-sqlite3), tmux control mode, CSS custom properties, Node.js test runner.

---

## Phase Overview & Dependencies

```
C4 (small) ──→ D (large, ~25 files) ──→ E (medium, ~10 files)
                                          F (small, ~5 files) — parallel to D/E
                                          G (variable) — after D/E/F
```

**What's already done by agents (committed):**
- E1: `BUILD_PROFILE=cipher` in package.json dev/start scripts
- E2/E3: `mux_send` push-delivery with `escapeForTmux`, `findSessionByName`, tests
- F1 partial: `rebuild:voice` script, ABI mismatch detection in VOICE_AVAILABLE
- C4 partial: Colored dots on orchestrator/mpo buttons in StatusBar

---

## Phase C4: Session-List Coloring (Small)

### Task C4-1: Orchestrator + MPO in Session Status Line

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/styles/components.css`

The StatusBar already shows orchestrator/mpo buttons with colored dots. C4 wants them styled as **links** (clickable session names) in the bottom status area, visually distinguishable from regular sessions.

- [ ] **Step 1: Add session-name display for active orchestrator/mpo**

In `StatusBar.tsx`, modify the orchestrator/mpo buttons to show the session name when active:

```tsx
<button
  class={`status-bar__btn status-bar__btn--session${orchestratorRunning ? ' status-bar__btn--active' : ''}`}
  style={{ '--session-color': '#B8601A' } as any}
  onClick={onOrchestrator}
>
  <span class="status-bar__dot" />orchestrator
</button>
```

- [ ] **Step 2: Add CSS for session-colored buttons**

In `components.css`:

```css
.status-bar__btn--session {
  position: relative;
}
.status-bar__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 4px;
  background: var(--session-color, var(--color-text-dim));
}
.status-bar__btn--session.status-bar__btn--active .status-bar__dot {
  box-shadow: 0 0 4px var(--session-color);
}
```

- [ ] **Step 3: Remove inline styles from StatusBar buttons**

Replace the current `style={{ color: '#B8601A' }}` inline styles with the CSS class approach.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/StatusBar.tsx src/renderer/styles/components.css
git commit -m "feat(C4): colored session indicators for orchestrator/mpo in statusbar"
```

---

## Phase D: Workspaces + Personas (Large)

### File Structure

**New files:**
- `src/shared/persona-types.ts` — Persona, Workspace, WorkspaceCell interfaces
- `src/main/workspace/workspace-manager.ts` — CRUD, prompt resolution, apply logic
- `src/main/workspace/persona-skill-sync.ts` — Sync personas → `.claude/skills/personas/`
- `src/renderer/components/PersonasTab.tsx` — Settings tab: persona list + editor
- `src/renderer/components/WorkspacesTab.tsx` — Settings tab: workspace grid editor
- `src/renderer/components/WorkspacePopup.tsx` — Bottom-left popup for quick-pick
- `src/renderer/styles/workspaces.css` — Workspace/persona shared styles
- `test/main/workspace-manager.test.ts` — Unit tests
- `test/main/persona-skill-sync.test.ts` — Skill sync tests

**Modified files:**
- `src/shared/types.ts` — Add Persona/Workspace types export
- `src/main/config/config-store.ts` — Add `personas`, `workspaces`, `activeWorkspaceId` keys
- `src/renderer/components/InfoSettingsView.tsx` — Add Personas + Workspaces tabs
- `src/renderer/app.tsx` — Add WorkspacePopup, wire apply logic
- `src/main/ipc-hub.ts` — Register persona/workspace IPC channels
- `src/shared/ipc-channels.ts` — Add new channel constants

### Task D1: Type Definitions

**Files:**
- Create: `src/shared/persona-types.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Create persona-types.ts**

```typescript
// src/shared/persona-types.ts

export interface Persona {
  id: string
  name: string
  color: string
  defaultPrompt: string
  builtin?: boolean
}

export interface WorkspaceCell {
  persona: string    // persona.id
  project: string    // project path or slug
  prompt: string     // per-cell override (empty = use persona/workspace default)
}

export interface Workspace {
  id: string
  name: string
  cols: number       // 1..10
  rows: number       // 1..6
  cells: WorkspaceCell[]  // row-major, length === cols * rows
  merges: Record<string, true>  // "col:row" → merged DOWN
  promptOverrides: Record<string, string>  // personaId → workspace-level prompt
}

export type PromptSource = 'cell' | 'workspace-override' | 'persona-default'

export interface ResolvedPrompt {
  text: string
  source: PromptSource
}

export const BUILTIN_PERSONA_IDS = ['orchestrator', 'mpo', 'worker', 'empty'] as const

export const BUILTIN_PERSONAS: readonly Persona[] = [
  {
    id: 'orchestrator',
    name: 'Orchestrator',
    color: '#B8601A',
    builtin: true,
    defaultPrompt:
      'You coordinate the work in this session grid. Read the user goal, split it into concrete tasks, assign them to worker cells, and gate merges via the MPO. Keep a short running plan at the top of every reply.',
  },
  {
    id: 'mpo',
    name: 'MPO',
    color: '#2d8a4e',
    builtin: true,
    defaultPrompt:
      'You are the Meta-Prompt Officer. Verify every claim the orchestrator or workers make by reading source. Block merges with concrete evidence. Keep a compact log: file:line → claim → verdict.',
  },
  {
    id: 'worker',
    name: 'Worker',
    color: '#6A6A72',
    builtin: true,
    defaultPrompt:
      'You execute one focused task at a time. Read what you need, do the thing, report back concisely. No speculation, no extra work. Surface blockers immediately.',
  },
  {
    id: 'empty',
    name: '(empty)',
    color: '#D4D4C8',
    builtin: true,
    defaultPrompt: '',
  },
]

export const SEED_CUSTOM_PERSONAS: readonly Persona[] = [
  {
    id: 'requirements-engineer',
    name: 'Requirements Engineer',
    color: '#4A6FA5',
    builtin: false,
    defaultPrompt:
      'You elicit and structure requirements. Conduct stakeholder interviews, write user stories with acceptance criteria, and maintain docs/requirements.md. Ask clarifying questions before assuming.',
  },
  {
    id: 'system-engineer',
    name: 'System Engineer',
    color: '#0E7FA8',
    builtin: false,
    defaultPrompt:
      'You handle system architecture, infrastructure, CI/CD, deployment, and cross-subsystem integration. Focus on reliability, monitoring, and performance. Document decisions in ADRs.',
  },
  {
    id: 'developer',
    name: 'Developer',
    color: '#7B3F99',
    builtin: false,
    defaultPrompt:
      'You implement features and fix bugs. Write clean, tested code. Follow TDD — failing test first, then minimal implementation. Small focused commits. Surface blockers immediately.',
  },
  {
    id: 'architect',
    name: 'Architect',
    color: '#C79A2B',
    builtin: false,
    defaultPrompt:
      'You make technical decisions and write ADRs. Design APIs, evaluate tradeoffs, analyze dependencies. Keep specs in docs/SPEC.md. Patterns over point solutions.',
  },
  {
    id: 'auditor',
    name: 'Auditor',
    color: '#A8322E',
    builtin: false,
    defaultPrompt:
      'You review code for quality and security. Check OWASP top 10, test coverage, performance bottlenecks, and style drift. Output line-referenced findings as structured reports.',
  },
]

export const PERSONA_SWATCHES = [
  '#B8601A', '#2d8a4e', '#A8322E', '#4A6FA5',
  '#7B3F99', '#C79A2B', '#0E7FA8', '#8A6B2B',
  '#6A6A72', '#1A1A1D',
] as const

export const SEED_WORKSPACES: readonly Workspace[] = [
  {
    id: 'triage',
    name: 'TRIAGE 3×2',
    cols: 3,
    rows: 2,
    promptOverrides: {
      orchestrator: 'You coordinate a triage. Read the latest failing CI run, split into a repro task (→ worker A) and a code-read task (→ worker B). Gate merges via MPO.',
    },
    cells: [
      { persona: 'orchestrator', project: '', prompt: '' },
      { persona: 'mpo',          project: '', prompt: '' },
      { persona: 'worker',       project: '', prompt: 'grep stacktrace' },
      { persona: 'worker',       project: '', prompt: 'read changelog' },
      { persona: 'auditor',      project: '', prompt: 'review open PR' },
      { persona: 'empty',        project: '', prompt: '' },
    ],
    merges: {},
  },
  {
    id: 'dual',
    name: 'DUAL SPLIT',
    cols: 2,
    rows: 2,
    promptOverrides: {},
    cells: [
      { persona: 'orchestrator', project: '', prompt: '' },
      { persona: 'developer',    project: '', prompt: '' },
      { persona: 'auditor',      project: '', prompt: 'review' },
      { persona: 'empty',        project: '', prompt: '' },
    ],
    merges: {},
  },
]
```

- [ ] **Step 2: Re-export from types.ts**

Add to `src/shared/types.ts`:

```typescript
export type {
  Persona,
  WorkspaceCell,
  Workspace,
  PromptSource,
  ResolvedPrompt,
} from './persona-types'
```

- [ ] **Step 3: Build to verify types**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/shared/persona-types.ts src/shared/types.ts
git commit -m "feat(D1): persona and workspace type definitions"
```

### Task D2: Workspace Manager (Core Logic)

**Files:**
- Create: `src/main/workspace/workspace-manager.ts`
- Create: `test/main/workspace-manager.test.ts`

- [ ] **Step 1: Write failing tests for resolvePrompt**

```typescript
// test/main/workspace-manager.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  resolvePrompt,
  spanOf,
  resizeCells,
} from '../../src/main/workspace/workspace-manager'
import type { Workspace, WorkspaceCell, Persona } from '../../src/shared/persona-types'
import { BUILTIN_PERSONAS } from '../../src/shared/persona-types'

const testPersonas: Persona[] = [
  ...BUILTIN_PERSONAS,
  { id: 'dev', name: 'Dev', color: '#000', defaultPrompt: 'Write code.', builtin: false },
]

describe('resolvePrompt', () => {
  it('returns cell prompt when set (source: cell)', () => {
    const ws: Workspace = {
      id: 'w1', name: 'test', cols: 1, rows: 1,
      cells: [{ persona: 'worker', project: '', prompt: 'cell-level' }],
      merges: {}, promptOverrides: {},
    }
    const result = resolvePrompt(ws, ws.cells[0], testPersonas)
    assert.equal(result.text, 'cell-level')
    assert.equal(result.source, 'cell')
  })

  it('returns workspace override when cell prompt empty (source: workspace-override)', () => {
    const ws: Workspace = {
      id: 'w1', name: 'test', cols: 1, rows: 1,
      cells: [{ persona: 'worker', project: '', prompt: '' }],
      merges: {}, promptOverrides: { worker: 'ws-override' },
    }
    const result = resolvePrompt(ws, ws.cells[0], testPersonas)
    assert.equal(result.text, 'ws-override')
    assert.equal(result.source, 'workspace-override')
  })

  it('returns persona default when no cell or override (source: persona-default)', () => {
    const ws: Workspace = {
      id: 'w1', name: 'test', cols: 1, rows: 1,
      cells: [{ persona: 'worker', project: '', prompt: '' }],
      merges: {}, promptOverrides: {},
    }
    const result = resolvePrompt(ws, ws.cells[0], testPersonas)
    assert.equal(result.source, 'persona-default')
    assert.ok(result.text.includes('one focused task'))
  })

  it('returns empty for unknown persona', () => {
    const ws: Workspace = {
      id: 'w1', name: 'test', cols: 1, rows: 1,
      cells: [{ persona: 'nonexistent', project: '', prompt: '' }],
      merges: {}, promptOverrides: {},
    }
    const result = resolvePrompt(ws, ws.cells[0], testPersonas)
    assert.equal(result.text, '')
    assert.equal(result.source, 'persona-default')
  })

  it('whitespace-only cell prompt falls through to override', () => {
    const ws: Workspace = {
      id: 'w1', name: 'test', cols: 1, rows: 1,
      cells: [{ persona: 'dev', project: '', prompt: '   ' }],
      merges: {}, promptOverrides: { dev: 'override' },
    }
    const result = resolvePrompt(ws, ws.cells[0], testPersonas)
    assert.equal(result.source, 'workspace-override')
  })
})

describe('spanOf', () => {
  it('returns 1 for unmerged cell', () => {
    const ws: Workspace = {
      id: 'w', name: 't', cols: 2, rows: 2,
      cells: Array(4).fill({ persona: 'empty', project: '', prompt: '' }),
      merges: {}, promptOverrides: {},
    }
    assert.equal(spanOf(ws, 0, 0), 1)
  })

  it('returns 2 for top cell of a merge', () => {
    const ws: Workspace = {
      id: 'w', name: 't', cols: 2, rows: 3,
      cells: Array(6).fill({ persona: 'empty', project: '', prompt: '' }),
      merges: { '0:0': true }, promptOverrides: {},
    }
    assert.equal(spanOf(ws, 0, 0), 2)
  })

  it('returns 0 for hidden cell (merged below top)', () => {
    const ws: Workspace = {
      id: 'w', name: 't', cols: 2, rows: 3,
      cells: Array(6).fill({ persona: 'empty', project: '', prompt: '' }),
      merges: { '0:0': true }, promptOverrides: {},
    }
    assert.equal(spanOf(ws, 0, 1), 0)
  })

  it('returns 3 for triple merge', () => {
    const ws: Workspace = {
      id: 'w', name: 't', cols: 1, rows: 3,
      cells: Array(3).fill({ persona: 'empty', project: '', prompt: '' }),
      merges: { '0:0': true, '0:1': true }, promptOverrides: {},
    }
    assert.equal(spanOf(ws, 0, 0), 3)
  })
})

describe('resizeCells', () => {
  it('grows grid preserving existing cells', () => {
    const cells: WorkspaceCell[] = [
      { persona: 'worker', project: 'p1', prompt: 'go' },
      { persona: 'mpo', project: 'p2', prompt: '' },
    ]
    const result = resizeCells(cells, { '0:0': true }, 2, 1, 3, 2)
    assert.equal(result.cells.length, 6)
    assert.equal(result.cells[0].persona, 'worker')
    assert.equal(result.cells[1].persona, 'mpo')
    assert.equal(result.cells[2].persona, 'empty')
  })

  it('shrinks grid dropping overflow cells', () => {
    const cells: WorkspaceCell[] = Array(6).fill(null).map((_, i) => ({
      persona: `p${i}`, project: '', prompt: '',
    }))
    const result = resizeCells(cells, {}, 3, 2, 2, 1)
    assert.equal(result.cells.length, 2)
    assert.equal(result.cells[0].persona, 'p0')
    assert.equal(result.cells[1].persona, 'p1')
  })

  it('drops merges outside new bounds', () => {
    const cells: WorkspaceCell[] = Array(6).fill({ persona: 'empty', project: '', prompt: '' })
    const result = resizeCells(cells, { '0:0': true, '2:1': true }, 3, 2, 2, 2)
    assert.ok(result.merges['0:0'])
    assert.ok(!result.merges['2:1'], 'col 2 is out of bounds for 2-col grid')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test 2>&1 | grep -E '(FAIL|ERR|Cannot find)'`
Expected: Module not found errors.

- [ ] **Step 3: Implement workspace-manager.ts**

```typescript
// src/main/workspace/workspace-manager.ts
import type {
  Persona,
  Workspace,
  WorkspaceCell,
  ResolvedPrompt,
} from '../../shared/persona-types'

const EMPTY_CELL: WorkspaceCell = { persona: 'empty', project: '', prompt: '' }

/**
 * Resolve the effective prompt for a workspace cell.
 * Priority: cell.prompt > workspace.promptOverrides[persona] > persona.defaultPrompt
 */
export function resolvePrompt(
  workspace: Workspace,
  cell: WorkspaceCell,
  personas: Persona[],
): ResolvedPrompt {
  if (cell.prompt && cell.prompt.trim()) {
    return { text: cell.prompt, source: 'cell' }
  }
  const override = workspace.promptOverrides[cell.persona]
  if (override && override.trim()) {
    return { text: override, source: 'workspace-override' }
  }
  const persona = personas.find(p => p.id === cell.persona)
  return { text: persona?.defaultPrompt ?? '', source: 'persona-default' }
}

/**
 * Compute the row span for a cell at (col, row).
 * Returns 0 if the cell is hidden (merged below a top cell).
 * Returns 1 for normal cells, 2+ for the top cell of a merge chain.
 */
export function spanOf(ws: Workspace, col: number, row: number): number {
  // If previous row merges down into this row, this cell is hidden
  if (row > 0 && ws.merges[`${col}:${row - 1}`]) return 0
  // Check upward — if any earlier row merged into us, we're hidden
  for (let r = row - 1; r >= 0; r--) {
    if (!ws.merges[`${col}:${r}`]) break
    // This shouldn't happen because the first check covers it,
    // but guard against chains
    return 0
  }
  let span = 1
  let r = row
  while (ws.merges[`${col}:${r}`] && r + 1 < ws.rows) {
    span++
    r++
  }
  return span
}

/**
 * Resize a cell array from (oldCols × oldRows) to (newCols × newRows).
 * Preserves existing cells that fit, fills new slots with empty cells.
 * Drops merges outside new bounds.
 */
export function resizeCells(
  oldCells: WorkspaceCell[],
  oldMerges: Record<string, true>,
  oldCols: number,
  oldRows: number,
  newCols: number,
  newRows: number,
): { cells: WorkspaceCell[]; merges: Record<string, true> } {
  const cells: WorkspaceCell[] = []
  for (let r = 0; r < newRows; r++) {
    for (let c = 0; c < newCols; c++) {
      const oldIdx = r * oldCols + c
      if (r < oldRows && c < oldCols && oldCells[oldIdx]) {
        cells.push({ ...oldCells[oldIdx] })
      } else {
        cells.push({ ...EMPTY_CELL })
      }
    }
  }
  const merges: Record<string, true> = {}
  for (const key of Object.keys(oldMerges)) {
    const [c, r] = key.split(':').map(Number)
    if (c < newCols && r < newRows - 1) {
      merges[key] = true
    }
  }
  return { cells, merges }
}
```

- [ ] **Step 4: Run tests**

Run: `npm run test 2>&1 | tail -15`
Expected: All workspace-manager tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/workspace/workspace-manager.ts test/main/workspace-manager.test.ts
git commit -m "feat(D2): workspace manager with resolvePrompt, spanOf, resizeCells"
```

### Task D3: ConfigStore Extension

**Files:**
- Modify: `src/main/config/config-store.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add persona/workspace keys to AppConfig**

In `src/shared/types.ts`, extend `AppConfig`:

```typescript
import type { Persona, Workspace } from './persona-types'

// Add to AppConfig interface:
personas: Persona[]
workspaces: Workspace[]
activeWorkspaceId: string | null
```

- [ ] **Step 2: Add defaults in ConfigStore**

In `config-store.ts`, add default values:

```typescript
import { BUILTIN_PERSONAS, SEED_CUSTOM_PERSONAS, SEED_WORKSPACES } from '../../shared/persona-types'

// In defaults:
personas: [...BUILTIN_PERSONAS, ...SEED_CUSTOM_PERSONAS],
workspaces: [...SEED_WORKSPACES],
activeWorkspaceId: null,
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/main/config/config-store.ts src/shared/types.ts
git commit -m "feat(D3): ConfigStore personas + workspaces + activeWorkspaceId keys"
```

### Task D4: IPC Channels for Personas/Workspaces

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/ipc-hub.ts`
- Modify: `src/main/preload.ts` (if needed for API exposure)

- [ ] **Step 1: Add IPC channel constants**

In `ipc-channels.ts`:

```typescript
// Personas
PERSONAS_LIST: 'personas:list',
PERSONAS_GET: 'personas:get',
PERSONAS_SAVE: 'personas:save',        // save single persona (create or update)
PERSONAS_DELETE: 'personas:delete',

// Workspaces
WORKSPACES_LIST: 'workspaces:list',
WORKSPACES_GET: 'workspaces:get',
WORKSPACES_SAVE: 'workspaces:save',     // save single workspace
WORKSPACES_DELETE: 'workspaces:delete',
WORKSPACES_APPLY: 'workspaces:apply',   // load + spawn sessions
WORKSPACES_ACTIVE: 'workspaces:active', // get/set active workspace ID
```

- [ ] **Step 2: Register handlers in IpcHub**

In `ipc-hub.ts`, add `registerPersonaChannels()` and `registerWorkspaceChannels()`:

```typescript
private registerPersonaChannels(): void {
  ipcMain.handle(IPC.PERSONAS_LIST, () => {
    return this.configStore.get('personas')
  })

  ipcMain.handle(IPC.PERSONAS_SAVE, (_e, persona: Persona) => {
    const personas = this.configStore.get('personas')
    const idx = personas.findIndex(p => p.id === persona.id)
    if (idx >= 0) {
      // Preserve builtin flag
      personas[idx] = { ...persona, builtin: personas[idx].builtin }
    } else {
      personas.push({ ...persona, builtin: false })
    }
    this.configStore.set('personas', personas)
    return { ok: true }
  })

  ipcMain.handle(IPC.PERSONAS_DELETE, (_e, personaId: string) => {
    const personas = this.configStore.get('personas')
    const target = personas.find(p => p.id === personaId)
    if (target?.builtin) return { ok: false, error: 'Cannot delete built-in persona' }
    this.configStore.set('personas', personas.filter(p => p.id !== personaId))
    return { ok: true }
  })
}

private registerWorkspaceChannels(): void {
  ipcMain.handle(IPC.WORKSPACES_LIST, () => {
    return this.configStore.get('workspaces')
  })

  ipcMain.handle(IPC.WORKSPACES_SAVE, (_e, workspace: Workspace) => {
    const workspaces = this.configStore.get('workspaces')
    const idx = workspaces.findIndex(w => w.id === workspace.id)
    if (idx >= 0) workspaces[idx] = workspace
    else workspaces.push(workspace)
    this.configStore.set('workspaces', workspaces)
    return { ok: true }
  })

  ipcMain.handle(IPC.WORKSPACES_DELETE, (_e, workspaceId: string) => {
    const workspaces = this.configStore.get('workspaces')
    this.configStore.set('workspaces', workspaces.filter(w => w.id !== workspaceId))
    return { ok: true }
  })

  ipcMain.handle(IPC.WORKSPACES_ACTIVE, (_e, id?: string) => {
    if (id !== undefined) {
      this.configStore.set('activeWorkspaceId' as any, id)
    }
    return this.configStore.get('activeWorkspaceId' as any)
  })
}
```

- [ ] **Step 3: Expose in preload API**

Add `personas` and `workspaces` namespaces to preload.ts:

```typescript
personas: {
  list: () => ipcRenderer.invoke('personas:list'),
  save: (p: Persona) => ipcRenderer.invoke('personas:save', p),
  delete: (id: string) => ipcRenderer.invoke('personas:delete', id),
},
workspaces: {
  list: () => ipcRenderer.invoke('workspaces:list'),
  save: (ws: Workspace) => ipcRenderer.invoke('workspaces:save', ws),
  delete: (id: string) => ipcRenderer.invoke('workspaces:delete', id),
  apply: (id: string) => ipcRenderer.invoke('workspaces:apply', id),
  active: (id?: string) => ipcRenderer.invoke('workspaces:active', id),
},
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/ipc-hub.ts src/main/preload.ts
git commit -m "feat(D4): IPC channels for persona/workspace CRUD"
```

### Task D5: Personas Settings Tab

**Files:**
- Create: `src/renderer/components/PersonasTab.tsx`
- Modify: `src/renderer/components/InfoSettingsView.tsx`
- Modify: `src/renderer/styles/workspaces.css` (copy from design assets)

- [ ] **Step 1: Copy workspace CSS from design assets**

Copy `moreismore/CipherMux-design-set/claude-code-handoff/workspaces.css` to `src/renderer/styles/workspaces.css`. Adapt `:root` variables to use existing theme tokens (replace hardcoded colors with `var(--color-*)` references already in `theme.css`).

- [ ] **Step 2: Create PersonasTab component**

Build `PersonasTab.tsx` following the `settings-personas.html` mockup:
- Left panel: scrollable list of personas with color dot + name + prompt preview + BUILT-IN badge
- Right panel: edit area with name input, color swatches, prompt textarea, usage counter, save/revert buttons
- Built-in personas: name/color/delete locked, only prompt editable
- CRUD: add new, duplicate, delete (with confirm)
- Save persists via `api.personas.save()`

Key Preact structure:

```tsx
export function PersonasTab() {
  const [personas, setPersonas] = useState<Persona[]>([])
  const [activeId, setActiveId] = useState<string>('')
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])

  useEffect(() => {
    api.personas.list().then(setPersonas)
    api.workspaces.list().then(setWorkspaces)
  }, [])

  // ... list + editor rendering per mockup
}
```

- [ ] **Step 3: Add "Personas" tab to InfoSettingsView**

In `InfoSettingsView.tsx`, add a new tab entry and render `<PersonasTab />` when selected.

- [ ] **Step 4: Build and visual check**

Run: `npm run build && npm run dev`
Expected: Settings → Personas tab renders with seeded personas.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/PersonasTab.tsx src/renderer/components/InfoSettingsView.tsx src/renderer/styles/workspaces.css
git commit -m "feat(D5): Personas settings tab with list + editor"
```

### Task D6: Workspaces Settings Tab (Grid Editor)

**Files:**
- Create: `src/renderer/components/WorkspacesTab.tsx`
- Modify: `src/renderer/components/InfoSettingsView.tsx`

- [ ] **Step 1: Create WorkspacesTab component**

Build following the `settings-workspaces.html` mockup:
- Left panel: workspace list with mini color-coded thumbnails
- Right panel:
  - Name input + duplicate/delete buttons
  - Dimension stepper (Cols 1-10, Rows 1-6)
  - Interactive grid with clickable cells and merge handles
  - Cell Inspector (persona select, project select, prompt textarea with source note)
  - Persona Prompt Overrides section
  - Save/revert footer

Key features:
- `spanOf()` from workspace-manager for merge visualization
- `resolvePrompt()` for showing effective prompt + source in inspector
- Merge handles: 4px bottom edge, hover → accent line, click → toggle merge
- Cell selection → inspector updates

- [ ] **Step 2: Wire project list from useProjects**

Inspector's project `<select>` should pull from `api.projects.list()` (existing IPC channel), not mock data.

- [ ] **Step 3: Add "Workspaces" tab to InfoSettingsView**

Add tab entry, render `<WorkspacesTab />`.

- [ ] **Step 4: Build and visual check**

Run: `npm run build && npm run dev`
Expected: Settings → Workspaces tab renders with seeded workspaces, grid editor interactive.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/WorkspacesTab.tsx src/renderer/components/InfoSettingsView.tsx
git commit -m "feat(D6): Workspace grid editor settings tab"
```

### Task D7: Workspace Popup (Statusbar)

**Files:**
- Create: `src/renderer/components/WorkspacePopup.tsx`
- Modify: `src/renderer/components/StatusBar.tsx`
- Modify: `src/renderer/app.tsx`

- [ ] **Step 1: Create WorkspacePopup component**

Build following the `workspaces-popup.html` mockup:
- Popup anchored above statusbar (absolute positioned from bottom-left)
- List of workspaces with color-coded mini-grid thumbnails
- Persona legend for selected workspace
- Footer: `personas...` → opens settings personas tab, `edit...` → opens settings workspaces tab, `load` → applies selected workspace
- Double-click on row → immediate apply

```tsx
interface WorkspacePopupProps {
  visible: boolean
  onClose: () => void
  onApply: (workspaceId: string) => void
  onOpenSettings: (tab: 'personas' | 'workspaces') => void
}
```

- [ ] **Step 2: Add "workspaces" button to StatusBar**

Add a button between the grid controls and orchestrator button:

```tsx
<button
  class={`status-bar__btn${workspacesPopupVisible ? ' status-bar__btn--active' : ''}`}
  onClick={onToggleWorkspaces}
>
  workspaces
</button>
```

- [ ] **Step 3: Wire popup in App.tsx**

Add state: `workspacesPopupVisible`, toggle handler, apply handler that calls `api.workspaces.apply(id)`.

- [ ] **Step 4: Build and visual check**

Run: `npm run build && npm run dev`
Expected: "workspaces" button in statusbar, popup opens/closes, shows seeded workspaces.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/WorkspacePopup.tsx src/renderer/components/StatusBar.tsx src/renderer/app.tsx
git commit -m "feat(D7): workspace popup in statusbar"
```

### Task D8: Workspace Apply Logic

**Files:**
- Modify: `src/main/ipc-hub.ts`
- Modify: `src/main/workspace/workspace-manager.ts`

- [ ] **Step 1: Implement applyWorkspace in workspace-manager**

```typescript
export interface ApplyResult {
  applied: boolean
  sessionsStarted: number
  warnings: string[]
}

export async function applyWorkspace(
  workspace: Workspace,
  personas: Persona[],
  sessionManager: SessionManager,
  gridCallback: (cols: number, rows: number) => void,
): Promise<ApplyResult> {
  const warnings: string[] = []
  let sessionsStarted = 0

  // 1. Set grid dimensions
  gridCallback(workspace.cols, workspace.rows)

  // 2. For each non-empty cell, spawn a session
  for (let i = 0; i < workspace.cells.length; i++) {
    const cell = workspace.cells[i]
    if (cell.persona === 'empty') continue

    const persona = personas.find(p => p.id === cell.persona)
    if (!persona) {
      warnings.push(`Persona "${cell.persona}" not found — cell ${i} skipped`)
      continue
    }

    if (!cell.project) {
      warnings.push(`Cell ${i} (${persona.name}) has no project — skipped`)
      continue
    }

    const resolved = resolvePrompt(workspace, cell, personas)
    try {
      await sessionManager.start({
        name: `${persona.name}`,
        projectPath: cell.project,
        autoLaunch: resolved.text ? `claude "${resolved.text}"` : 'claude',
      })
      sessionsStarted++
    } catch (err) {
      warnings.push(`Failed to start ${persona.name}: ${(err as Error).message}`)
    }
  }

  return { applied: true, sessionsStarted, warnings }
}
```

- [ ] **Step 2: Wire WORKSPACES_APPLY IPC handler**

```typescript
ipcMain.handle(IPC.WORKSPACES_APPLY, async (_e, workspaceId: string) => {
  const workspaces = this.configStore.get('workspaces')
  const ws = workspaces.find(w => w.id === workspaceId)
  if (!ws) return { applied: false, error: 'Workspace not found' }

  const personas = this.configStore.get('personas')
  const result = await applyWorkspace(ws, personas, this.sessionManager, (cols, rows) => {
    this.mainWindow?.webContents.send('grid:resize', { cols, rows })
  })

  this.configStore.set('activeWorkspaceId' as any, workspaceId)
  return result
})
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/main/workspace/workspace-manager.ts src/main/ipc-hub.ts
git commit -m "feat(D8): workspace apply logic — spawn sessions per cell"
```

### Task D9: Persona Skill Sync

**Files:**
- Create: `src/main/workspace/persona-skill-sync.ts`
- Create: `test/main/persona-skill-sync.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { syncPersonaSkills, generateSkillContent } from '../../src/main/workspace/persona-skill-sync'

describe('generateSkillContent', () => {
  it('generates valid skill markdown with persona prompt', () => {
    const content = generateSkillContent({
      id: 'developer',
      name: 'Developer',
      color: '#7B3F99',
      defaultPrompt: 'Write clean code.',
      builtin: false,
    })
    assert.ok(content.includes('name: persona-developer'))
    assert.ok(content.includes('Write clean code.'))
  })

  it('skips empty persona', () => {
    const content = generateSkillContent({
      id: 'empty', name: '(empty)', color: '#ccc', defaultPrompt: '', builtin: true,
    })
    assert.equal(content, null)
  })
})

describe('syncPersonaSkills', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-sync-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates skill files for all non-empty personas', () => {
    const personas = [
      { id: 'worker', name: 'Worker', color: '#666', defaultPrompt: 'Do work.', builtin: true },
      { id: 'empty', name: '(empty)', color: '#ccc', defaultPrompt: '', builtin: true },
      { id: 'dev', name: 'Dev', color: '#000', defaultPrompt: 'Code.', builtin: false },
    ]
    syncPersonaSkills(personas, tmpDir)

    assert.ok(fs.existsSync(path.join(tmpDir, 'persona-worker', 'SKILL.md')))
    assert.ok(fs.existsSync(path.join(tmpDir, 'persona-dev', 'SKILL.md')))
    assert.ok(!fs.existsSync(path.join(tmpDir, 'persona-empty')))
  })

  it('removes skill dirs for deleted personas', () => {
    const dir = path.join(tmpDir, 'persona-old')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'SKILL.md'), 'old')

    syncPersonaSkills([
      { id: 'worker', name: 'Worker', color: '#666', defaultPrompt: 'Do work.', builtin: true },
    ], tmpDir)

    assert.ok(!fs.existsSync(dir), 'old persona dir should be removed')
  })
})
```

- [ ] **Step 2: Implement persona-skill-sync.ts**

```typescript
import * as fs from 'fs'
import * as path from 'path'
import type { Persona } from '../../shared/persona-types'

export function generateSkillContent(persona: Persona): string | null {
  if (persona.id === 'empty' || !persona.defaultPrompt?.trim()) return null

  return `---
name: persona-${persona.id}
description: Load the ${persona.name} persona into the current session
---

# Persona: ${persona.name}

You are now operating as **${persona.name}**.

${persona.defaultPrompt}
`
}

export function syncPersonaSkills(personas: Persona[], skillsDir: string): void {
  fs.mkdirSync(skillsDir, { recursive: true })

  const expectedDirs = new Set<string>()

  for (const persona of personas) {
    const content = generateSkillContent(persona)
    if (!content) continue

    const dirName = `persona-${persona.id}`
    expectedDirs.add(dirName)
    const dir = path.join(skillsDir, dirName)
    fs.mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, 'SKILL.md')

    // Only write if content changed
    const existing = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null
    if (existing !== content) {
      fs.writeFileSync(filePath, content)
    }
  }

  // Remove skill dirs for deleted personas
  for (const entry of fs.readdirSync(skillsDir)) {
    if (entry.startsWith('persona-') && !expectedDirs.has(entry)) {
      fs.rmSync(path.join(skillsDir, entry), { recursive: true, force: true })
    }
  }
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test 2>&1 | tail -15`
Expected: All persona-skill-sync tests pass.

- [ ] **Step 4: Wire sync on app start**

In `main.ts` or `ipc-hub.ts` initialization, after ConfigStore loads:

```typescript
import { syncPersonaSkills } from './workspace/persona-skill-sync'
// After config loads:
const personas = configStore.get('personas')
const skillsDir = path.join(process.cwd(), '.claude', 'skills', 'personas')
syncPersonaSkills(personas, skillsDir)
```

Also trigger sync after persona save/delete IPC handlers.

- [ ] **Step 5: Commit**

```bash
git add src/main/workspace/persona-skill-sync.ts test/main/persona-skill-sync.test.ts src/main/ipc-hub.ts
git commit -m "feat(D9): persona skill sync — auto-generate .claude/skills/personas/"
```

### Task D10-D12: Detachable Panels (Deferred)

These tasks (D10: Sessions panel detach, D11: InputRequests panel detach, D12: Detach state persistence) are **deferred to Phase G** as they require opening secondary BrowserWindows — complex and not blocking other work.

---

## Phase E: Communication (E4-E6)

E1-E3 are already implemented (BUILD_PROFILE fix, mux_send push delivery, escapeForTmux/findSessionByName).

### Task E4: Visible Sessions (mux_create_session Enhancement)

**Files:**
- Modify: `src/main/mcp/mcp-tools.ts`
- Modify: `src/main/ipc-hub.ts`

- [ ] **Step 1: Add `visible` parameter to mux_create_session**

In `mcp-tools.ts`, extend the `mux_create_session` tool schema:

```typescript
visible: z.boolean().optional().describe('If true, session appears in the grid with focus'),
```

- [ ] **Step 2: Emit grid-add event when visible=true**

After session creation succeeds, if `visible` is true, send an IPC event to the renderer:

```typescript
if (args.visible) {
  ctx.mainWindow?.webContents.send('session:visible-add', { sessionId: session.id })
}
```

- [ ] **Step 3: Handle in App.tsx**

Listen for `session:visible-add` and place the session in the next free grid slot (same logic as orchestrator placement).

- [ ] **Step 4: Build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/mcp-tools.ts src/main/ipc-hub.ts src/renderer/app.tsx
git commit -m "feat(E4): visible mode for mux_create_session — sessions appear in grid"
```

### Task E5: Background Session Cards in Chatroom

**Files:**
- Modify: `src/renderer/components/ChatroomPanel.tsx`

- [ ] **Step 1: Add session cards section to ChatroomPanel**

Above the message feed, add a collapsible "Background Sessions" section:

```tsx
const backgroundSessions = sessions.filter(s =>
  s.status === 'active' && !gridSlots.some(slot => slot.sessionId === s.id)
)
```

Render each as a compact card:
- Session name + project path
- Context usage bar (from useContextUsage)
- Click → place in grid (call onAddToGrid callback)

- [ ] **Step 2: Build and visual check**

Run: `npm run build && npm run dev`
Expected: Background sessions appear as cards in chatroom.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ChatroomPanel.tsx
git commit -m "feat(E5): background session cards in chatroom panel"
```

### Task E6: Communication Tests

**Files:**
- Already done: `test/main/message-bus-delivery.test.ts` (escapeForTmux, findSessionByName)

Additional tests to add:

- [ ] **Step 1: Test mux_send push delivery with mock sessionManager**

Add integration-style tests to `message-bus-delivery.test.ts`:

```typescript
describe('mux_send push delivery flow', () => {
  it('delivers to active session when sessionName provided', () => {
    // Test findSessionByName → lookup → session exists
  })

  it('returns delivered:false for stopped session', () => {
    // Session status !== 'active'
  })

  it('escapes special characters in long messages', () => {
    const text = 'a'.repeat(501)
    const escaped = escapeForTmux(text)
    assert.ok(escaped.includes('base64'))
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add test/main/message-bus-delivery.test.ts
git commit -m "test(E6): extended message bus delivery tests"
```

---

## Phase F: Voice Pipeline Repair

### Task F1: Native Module Rebuild

**Files:**
- Modify: `package.json` (already has rebuild:voice script)

- [ ] **Step 1: Run rebuild:voice**

```bash
npm run rebuild:voice
```

Expected: `whisper.node` and `sherpa-onnx-node` compiled for Electron ABI.

- [ ] **Step 2: Test voice availability in Electron**

```bash
npm start
# In app: click microphone toggle → should not show ABI mismatch error
```

- [ ] **Step 3: If rebuild fails, check node-gyp deps**

```bash
xcode-select --install  # Ensure Xcode CLI tools
npm run rebuild:voice 2>&1 | head -30
```

- [ ] **Step 4: Commit any fixes**

### Task F2: Bugreport Voice Mode

**Files:**
- Modify: `src/renderer/components/BugreportDialog.tsx`
- Modify: `src/main/voice/voice-manager.ts`

- [ ] **Step 1: Add voice toggle to BugreportDialog**

Mirror the VoiceControl toggle inside the dialog. When enabled, use the bugreport conversation engine (ConversationEngine with TTS) instead of session-input mode.

- [ ] **Step 2: Restore TTS output in bugreport interview**

Check `ConversationEngine` for TTS integration. If Piper is available, play interview questions via TTS. If Piper binary not found, log warning and proceed text-only.

- [ ] **Step 3: Build and test**

Run: `npm run build && npm start`
Test: Open bugreport dialog → voice toggle → speak → should transcribe into description field.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/BugreportDialog.tsx src/main/voice/voice-manager.ts
git commit -m "feat(F2): voice toggle in bugreport dialog with TTS"
```

---

## Phase G: Polish & Backlog

### Task G1: Shell Session Button

**Files:**
- Modify: `src/renderer/components/PaneHeader.tsx`
- Modify: `src/main/session/session-manager.ts`

- [ ] **Step 1: Add "shell" button to PaneHeader**

Small terminal icon button next to close. Clicking spawns a new session in the same projectPath but without `autoLaunch` (just a plain zsh shell).

- [ ] **Step 2: Handle in SessionManager**

`start({ name: 'Shell', projectPath, command: undefined })` — no claude CLI launch, just tmux pane with shell.

- [ ] **Step 3: Commit**

### Task G2: Architecture Docs Update

- [ ] **Step 1: Run /doc-review skill**

Update CLAUDE.md, SPEC.md, todo.md to reflect all new systems (Personas, Workspaces, Communication).

- [ ] **Step 2: Commit**

### Task G3: How-To in Info Window

**Files:**
- Modify: `src/renderer/components/InfoSettingsView.tsx`

- [ ] **Step 1: Add "How-To" tab or expand features tab**

Add practical usage instructions: how to start a workspace, use personas, voice commands, MCP tools.

- [ ] **Step 2: Commit**

### Task G4-G7: Remaining Backlog (Deferred)

- G4: Notes-Editor as grid cell option
- G5: LLM-Provider Settings (Bug-Assistant Ollama model selection)
- G6: GitHub CI templates + AppImage config
- G7: Extended voice control

These are prioritized after G1-G3 based on need.

---

## Manual Test Checklist (for tomorrow)

### Pre-Test Setup

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
npm run build && npm start
```

### Test Suite: Personas (Phase D)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| P1 | **Personas tab opens** | Settings → Personas tab | Left: persona list with colored dots. Right: editor panel. Seeded personas visible (Orchestrator, MPO, Worker, empty, + custom ones). |
| P2 | **Built-in persona locked** | Select "Orchestrator" | Name field disabled, color swatches disabled, delete button disabled. Only prompt textarea editable. |
| P3 | **Custom persona editable** | Select "Developer" | Name editable, color swatches clickable, delete enabled. |
| P4 | **Create new persona** | Click "+ NEW" | New entry appears in list with default name "NEW PERSONA". Editor opens for it. |
| P5 | **Delete custom persona** | Select custom persona → Delete → Confirm | Persona removed from list. If used in workspaces, cells fall back to (empty). |
| P6 | **Duplicate persona** | Select any → Duplicate | Copy appears with " COPY" suffix, fully editable. |
| P7 | **Save persona prompt** | Edit prompt → Save | Prompt persists across app restart. |
| P8 | **Usage counter** | Check bottom of editor | Shows which workspaces reference this persona. |

### Test Suite: Workspaces (Phase D)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| W1 | **Workspaces tab opens** | Settings → Workspaces tab | Left: workspace list with mini thumbnails. Right: grid editor. |
| W2 | **Grid editor interactive** | Click cells in editor | Cell Inspector updates: shows persona, project, prompt with source note. |
| W3 | **Dimension stepper** | Click Cols +/- and Rows +/- | Grid resizes (1-10 cols, 1-6 rows). Existing cells preserved, new cells empty. |
| W4 | **Merge handle** | Hover bottom edge of cell → click | Cell merges with cell below (grid-row: span 2). Click again → unmerge. |
| W5 | **Prompt resolution display** | Cell with no prompt, persona has default | Inspector shows "Using persona default from Personas tab" source note. |
| W6 | **Workspace override** | Set override in Persona Prompt Overrides section | Cells with that persona show "Using this workspace's persona override" source note. |
| W7 | **Cell prompt wins** | Type prompt in cell inspector textarea | Source note changes to "Per-cell override in effect". |
| W8 | **Create workspace** | Click "+ NEW" in list | New workspace with default 3×2 grid, all empty cells. |
| W9 | **Delete workspace** | Select → Delete → Confirm | Workspace removed. |
| W10 | **Save/Revert** | Make changes → Revert | Changes undone. Make changes → Save → restart app | Changes persist. |

### Test Suite: Workspace Popup (Phase D)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| WP1 | **Popup opens** | Click "workspaces" in statusbar | Popup appears above statusbar. Shows workspace list with color-coded thumbnails. |
| WP2 | **Persona legend** | Select different workspaces | Legend updates showing which personas are in the workspace + count. |
| WP3 | **Load workspace** | Select workspace → Load | Grid resizes, sessions spawn per non-empty cells with correct project paths. |
| WP4 | **Quick links** | Click "personas..." / "edit..." | Opens Settings on correct tab. |

### Test Suite: Communication (Phase E)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| E1 | **mux_send without target** | MCP call: `mux_send(topic: "chat", sender: "test", text: "hello")` | Message appears in chatroom. No push delivery. Response: `{ ok: true, id: "..." }` |
| E2 | **mux_send with push** | MCP call: `mux_send(topic: "system", sender: "Orch", text: "do X", sessionName: "Worker-1")` | Message in bus AND injected into Worker-1 tmux pane. Response: `{ ok: true, id: "...", delivered: true }` |
| E3 | **mux_send to dead session** | Send to stopped/nonexistent session | Response: `{ ok: true, id: "...", delivered: false }` |
| E4 | **Visible session** | MCP call: `mux_create_session(name: "visible-test", visible: true)` | Session appears in grid automatically, focus shifts to it. |
| E5 | **Background session cards** | Create session via MCP (no visible flag) → open chatroom | Session appears as card in chatroom. Click card → session placed in grid. |

### Test Suite: Voice (Phase F)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| V1 | **Voice available** | Click mic toggle in statusbar | No ABI mismatch error. Toggle activates (LED on). |
| V2 | **Speech transcription** | Activate mic → speak | Text appears in focused session's terminal input. |
| V3 | **Voice commands** | Say "abschicken" | Sends Enter to terminal. |
| V4 | **Bugreport voice** | Open bugreport dialog → activate voice toggle | Speech transcribed into description field. |

### Test Suite: StatusBar (Phase C4 + General)

| # | Test | Steps | Expected |
|---|------|-------|----------|
| S1 | **Orchestrator button** | Click orchestrator | Session starts. Button shows active state with orange dot. |
| S2 | **MPO button** | Click mpo | MPO session starts. Button shows active state with green dot. |
| S3 | **Grid controls** | Click +/- for cols/rows | Grid resizes live. |
| S4 | **Theme display** | Theme name shown in statusbar | Clicking opens settings on themes tab. |

### Test Suite: Automated (npm run test)

| # | Test | Expected |
|---|------|----------|
| T1 | **All unit tests pass** | `npm run test` → 470+ tests, 0 failures |
| T2 | **Build clean** | `npm run build` → no TS errors, no warnings |
| T3 | **Lint clean** | `npm run lint` → 0 errors |

---

## Version Bump Schedule

| After Phase | Version |
|-------------|---------|
| C4 complete | v0.9.0-beta |
| D complete  | v0.10.0-beta |
| E complete  | v0.11.0-beta |
| F complete  | v0.12.0-beta |
| G1-G3       | v1.0.0-rc1 |

---

Plan complete and saved to `docs/superpowers/plans/2026-04-23-moreismore-all-phases.md`.
