# Session Topic for Resume Display — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a thematic topic per session in the Keep Working snapshot, RecoveryDialog, PaneHeader tooltip, and Sidebar tooltip — so users can distinguish which session was doing what.

**Architecture:** A `resolveSessionTopic()` function derives a topic string at snapshot save-time (destroy + grid-change). The topic is stored in the snapshot's `sessions` array. Renderer components read it from the snapshot or session data. No live state, no new IPC events.

**Tech Stack:** TypeScript, Node.js test runner, Preact

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `src/main/session/resolve-session-topic.ts` | Pure function: derive topic from tasks + tmux capture |
| Create | `test/main/resolve-session-topic.test.ts` | Unit tests for topic resolution logic |
| Modify | `src/shared/types.ts:246` | Add `topic?: string` to snapshot type |
| Modify | `src/main/ipc-hub.ts:2697-2751` | Call `resolveSessionTopic()` in both snapshot writers |
| Modify | `src/renderer/components/RecoveryDialog.tsx:182-195` | Show topic line under session name |
| Modify | `src/renderer/components/SessionCell.tsx:212` | Add topic tooltip on session name span |
| Modify | `src/renderer/components/SidebarPanel.tsx:451` | Add topic to bg-card title tooltip |

---

### Task 1: Add `topic` to snapshot type

**Files:**
- Modify: `src/shared/types.ts:246`

- [ ] **Step 1: Add topic field to keepWorkingSnapshot type**

In `src/shared/types.ts` line 246, change:

```typescript
sessions: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string }>
```

to:

```typescript
sessions: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string; topic?: string }>
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors (topic is optional, no consumers yet)

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat: add topic field to keepWorkingSnapshot session type"
```

---

### Task 2: Create `resolveSessionTopic()` with tests

**Files:**
- Create: `src/main/session/resolve-session-topic.ts`
- Create: `test/main/resolve-session-topic.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
// test/main/resolve-session-topic.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { resolveSessionTopic, extractPromptFromCapture } from '../../src/main/session/resolve-session-topic'

describe('resolveSessionTopic', () => {
  const baseSession = { id: 's1', name: 'Worker-1', projectPath: '/home/user/my-project', entityId: undefined as string | undefined }

  it('returns running task title when available', () => {
    const tasks = [
      { title: 'Bugfix-Welle 2 — UI/Layout', state: 'running' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(baseSession, tasks, undefined)
    assert.equal(result, 'Bugfix-Welle 2 — UI/Layout')
  })

  it('prefers running over completed tasks', () => {
    const tasks = [
      { title: 'Old completed task', state: 'completed' as const, sessionId: 's1', updatedAt: 50 },
      { title: 'Active work', state: 'running' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(baseSession, tasks, undefined)
    assert.equal(result, 'Active work')
  })

  it('falls back to most recent completed task', () => {
    const tasks = [
      { title: 'Earlier task', state: 'completed' as const, sessionId: 's1', updatedAt: 50 },
      { title: 'Latest task', state: 'completed' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(baseSession, tasks, undefined)
    assert.equal(result, 'Latest task')
  })

  it('falls back to tmux capture when no tasks', () => {
    const capture = '\n\n> implement the grid resize handler\n\n$'
    const result = resolveSessionTopic(baseSession, [], capture)
    assert.equal(result, 'implement the grid resize handler')
  })

  it('falls back to project basename when no tasks and no capture', () => {
    const result = resolveSessionTopic(baseSession, [], undefined)
    assert.equal(result, 'my-project')
  })

  it('prefixes entity name when entityId is set', () => {
    const session = { ...baseSession, entityId: 'cyber-factory' }
    const tasks = [
      { title: 'Bugfix-Welle 2', state: 'running' as const, sessionId: 's1', updatedAt: 100 },
    ]
    const result = resolveSessionTopic(session, tasks, undefined)
    assert.equal(result, 'Cyber Factory — Bugfix-Welle 2')
  })

  it('uses separator dot for entity fallback without task', () => {
    const session = { ...baseSession, entityId: 'orchestrator' }
    const result = resolveSessionTopic(session, [], undefined)
    assert.equal(result, 'Orchestrator · my-project')
  })
})

describe('extractPromptFromCapture', () => {
  it('extracts substantive line from capture', () => {
    const capture = 'some output\n\nrefactor the useGrid hook to support dynamic columns\n> '
    assert.equal(extractPromptFromCapture(capture), 'refactor the useGrid hook to support dynamic columns')
  })

  it('skips short filler words', () => {
    const capture = 'output\nja\nok\nweiter\nimplement session topic feature\n> '
    assert.equal(extractPromptFromCapture(capture), 'implement session topic feature')
  })

  it('returns undefined when only filler', () => {
    const capture = '\nja\nok\n\n'
    assert.equal(extractPromptFromCapture(capture), undefined)
  })

  it('truncates long lines to 80 chars', () => {
    const long = 'a'.repeat(120)
    const capture = `${long}\n`
    const result = extractPromptFromCapture(capture)
    assert.ok(result)
    assert.equal(result.length, 80)
  })

  it('strips leading prompt markers', () => {
    const capture = '> implement the new feature\n'
    assert.equal(extractPromptFromCapture(capture), 'implement the new feature')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --test-name-pattern "resolveSessionTopic|extractPromptFromCapture" 2>&1 | tail -5`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/main/session/resolve-session-topic.ts

/** Minimal task shape needed for topic resolution (avoids importing full Task type). */
interface TaskSlice {
  title: string
  state: string
  sessionId: string | null
  updatedAt: number
}

/** Minimal session shape needed for topic resolution. */
interface SessionSlice {
  id: string
  name: string
  projectPath: string | null
  entityId?: string
}

/** Entity ID → human-readable display name. */
const ENTITY_DISPLAY_NAMES: Record<string, string> = {
  orchestrator: 'Orchestrator',
  'cyber-factory': 'Cyber Factory',
  companion: 'Companion',
  refinement: 'Refinement',
  launcher: 'Launcher',
  'voice-relay': 'Voice Relay',
  audit: 'Audit',
  'ideation-partner': 'Ideation Partner',
  debugger: 'Debugger',
  'testing-assistant': 'Testing Assistant',
  bugreport: 'Bugreport',
}

const FILLER_WORDS = new Set(['ja', 'ok', 'y', 'n', 'yes', 'no', 'weiter', 'nein', 'gut', 'passt', 'done', 'exit'])

/**
 * Extract a substantive prompt from tmux capture-pane output.
 * Walks lines bottom-to-top, skipping empty/filler/prompt-marker lines.
 * Returns undefined if nothing substantive found.
 */
export function extractPromptFromCapture(capture: string): string | undefined {
  const lines = capture.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let line = lines[i].trim()
    // Strip ANSI escape codes
    line = line.replace(/\x1b\[[0-9;]*m/g, '')
    // Strip leading prompt markers
    line = line.replace(/^[>$%❯●■▸]+\s*/, '')
    line = line.trim()
    if (line.length < 8) continue
    if (FILLER_WORDS.has(line.toLowerCase())) continue
    // Truncate to 80 chars
    return line.length > 80 ? line.slice(0, 80) : line
  }
  return undefined
}

/**
 * Derive a thematic topic string for a session at snapshot save-time.
 *
 * Priority: running task → completed task → tmux capture → project basename.
 * Entity name is prefixed when entityId is set.
 */
export function resolveSessionTopic(
  session: SessionSlice,
  tasks: TaskSlice[],
  tmuxCapture: string | undefined,
): string {
  const sessionTasks = tasks.filter(t => t.sessionId === session.id)

  // 1. Running/dispatched task
  const active = sessionTasks
    .filter(t => t.state === 'running' || t.state === 'dispatched')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (active.length > 0) {
    return withEntityPrefix(session.entityId, active[0].title, '—')
  }

  // 2. Most recent completed task
  const completed = sessionTasks
    .filter(t => t.state === 'completed')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (completed.length > 0) {
    return withEntityPrefix(session.entityId, completed[0].title, '—')
  }

  // 3. tmux capture
  if (tmuxCapture) {
    const prompt = extractPromptFromCapture(tmuxCapture)
    if (prompt) {
      return withEntityPrefix(session.entityId, prompt, '—')
    }
  }

  // 4. Fallback: project basename
  const basename = session.projectPath
    ? session.projectPath.replace(/\/+$/, '').split('/').pop() ?? 'session'
    : 'session'
  return withEntityPrefix(session.entityId, basename, '·')
}

function withEntityPrefix(entityId: string | undefined, text: string, separator: string): string {
  if (!entityId) return text
  const name = ENTITY_DISPLAY_NAMES[entityId] ?? entityId
  return `${name} ${separator} ${text}`
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern "resolveSessionTopic|extractPromptFromCapture" 2>&1 | tail -10`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/session/resolve-session-topic.ts test/main/resolve-session-topic.test.ts
git commit -m "feat: resolveSessionTopic — derive thematic topic from tasks/tmux capture"
```

---

### Task 3: Wire topic into snapshot writers in IpcHub

**Files:**
- Modify: `src/main/ipc-hub.ts:2696-2751`

- [ ] **Step 1: Add import at top of ipc-hub.ts**

Add to imports section:

```typescript
import { resolveSessionTopic } from './session/resolve-session-topic'
```

- [ ] **Step 2: Update `updateKeepWorkingSnapshot()` (line ~2700)**

Change the `sessions.map` block from:

```typescript
const snapshot = sessions.map(s => {
  const slotIdx = grid.slots.findIndex(slot => slot.sessionId === s.id)
  return {
    name: s.name ?? 'session',
    projectPath: s.projectPath ?? '',
    gridSlot: slotIdx >= 0 ? slotIdx : -1,
    entityId: s.entityId,
  }
}).filter(e => e.projectPath && e.gridSlot >= 0)
```

to:

```typescript
const allTasks = this.taskManager ? this.taskManager.list() : []
const snapshot = sessions.map(s => {
  const slotIdx = grid.slots.findIndex(slot => slot.sessionId === s.id)
  return {
    name: s.name ?? 'session',
    projectPath: s.projectPath ?? '',
    gridSlot: slotIdx >= 0 ? slotIdx : -1,
    entityId: s.entityId,
    topic: resolveSessionTopic(s, allTasks, undefined),
  }
}).filter(e => e.projectPath && e.gridSlot >= 0)
```

Note: `updateKeepWorkingSnapshot` is called on every grid change — tmux capture here would be too expensive. We pass `undefined` for capture and rely on tasks + fallback.

- [ ] **Step 3: Update `destroy()` (line ~2721)**

Change the `sessions.map` block to include tmux capture:

```typescript
const allTasks = this.taskManager ? this.taskManager.list() : []
const snapshot: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string; topic?: string }> = []
for (const s of sessions) {
  const slotIdx = gridState.slots.findIndex(slot => slot.sessionId === s.id)
  if (!s.projectPath || slotIdx < 0) continue
  let capture: string | undefined
  try {
    if (s.tmuxPane) capture = await this.tmux.capturePane(s.tmuxPane, 10)
  } catch { /* ignore — session may already be gone */ }
  snapshot.push({
    name: s.name ?? 'session',
    projectPath: s.projectPath ?? '',
    gridSlot: slotIdx,
    entityId: s.entityId,
    topic: resolveSessionTopic(s, allTasks, capture),
  })
}
```

Replace the existing `const snapshot = sessions.map(...)` block with the above. Keep the `configStore.set(...)` and `console.log(...)` lines unchanged.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Run full test suite**

Run: `npm test 2>&1 | tail -5`
Expected: All tests pass (no regressions)

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-hub.ts
git commit -m "feat: populate session topic in keepWorking snapshot (destroy + grid-change)"
```

---

### Task 4: Show topic in RecoveryDialog

**Files:**
- Modify: `src/renderer/components/RecoveryDialog.tsx:182-195`

- [ ] **Step 1: Update the restored-session list item**

In the recovery dialog's restore phase (line ~182-195), the `sessions.map` renders each session. The `s` object comes from `RecoveryResult.recovered` which is `SessionInfo[]` and does NOT have `topic`. However, in keepWorking mode the RecoveryDialog is bypassed entirely (line 414-424 in ipc-hub.ts sets empty recovery result).

For the **non-keepWorking** recovery flow, the RecoveryDialog shows `SessionInfo` objects which lack `topic`. Since topic is only computed at snapshot time, we need to show topic only when it's available from the keepWorking snapshot.

**Revised approach:** The RecoveryDialog already works without topic for the manual recovery flow. For the keepWorking flow, the dialog is never shown (auto-restored). So no change needed to RecoveryDialog for the snapshot topic.

Instead, let's show the topic when the session name is displayed in the **grid cell header** after restore, as a tooltip — which is Task 5.

Skip this task — RecoveryDialog doesn't need changes since keepWorking bypasses it.

---

### Task 5: Show topic tooltip on SessionCell header

**Files:**
- Modify: `src/renderer/components/SessionCell.tsx:212`

The session name span currently has no tooltip. We need to pass the topic through. But `SessionInfo` doesn't have a `topic` field — the topic lives only in the snapshot.

**Approach:** After keepWorking restore, the topic for each restored session is stored in the snapshot which is consumed once. To make topic available without adding state to SessionInfo, we store topics in a simple map on the renderer side and pass them through.

**Simpler approach:** Add `topic` to the keepWorking restore payload (which already goes to the renderer), store it in a `Map<sessionId, topic>` in the grid hook, and pass it to SessionCell.

- [ ] **Step 1: Extend KEEP_WORKING_RESTORE payload in IpcHub**

In `restoreKeepWorkingFromRecovery()` (line ~2685), the payload is:

```typescript
const payload = { gridConfig: effectiveGrid, slots: slotMap }
```

Change `slotMap` to carry topic. Update the slotMap type and population:

In the `for (const entry of snapshot)` loop, when building `slotMap.push(...)`, add topic:

```typescript
slotMap.push({ sessionId: match.id, slotIndex: entry.gridSlot, topic: entry.topic })
```

and for new sessions:

```typescript
slotMap.push({ sessionId: session.id, slotIndex: entry.gridSlot, topic: entry.topic })
```

Update the `slotMap` type:

```typescript
const slotMap: Array<{ sessionId: string | null; slotIndex: number; topic?: string }> = []
```

- [ ] **Step 2: Store topic map in useGrid hook**

In `src/renderer/hooks/useGrid.ts`, find where KEEP_WORKING_RESTORE is handled. Add a `topicMap` state:

```typescript
const [topicMap, setTopicMap] = useState<Record<string, string>>({})
```

When processing the restore payload, build the map:

```typescript
const newTopicMap: Record<string, string> = {}
for (const slot of payload.slots) {
  if (slot.sessionId && slot.topic) {
    newTopicMap[slot.sessionId] = slot.topic
  }
}
setTopicMap(newTopicMap)
```

Return `topicMap` from the hook.

- [ ] **Step 3: Pass topic to SessionCell**

In `src/renderer/components/SessionGrid.tsx`, where SessionCell is rendered, pass `topic={topicMap[session.id]}`.

Add `topic?: string` to SessionCellProps.

- [ ] **Step 4: Add tooltip to session name in SessionCell**

In `src/renderer/components/SessionCell.tsx` line 212, change:

```tsx
<span class="cell-name">{session.name}</span>
```

to:

```tsx
<span class="cell-name" title={topic || undefined}>{session.name}</span>
```

Add `topic` to the destructured props.

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/main/ipc-hub.ts src/renderer/hooks/useGrid.ts src/renderer/components/SessionGrid.tsx src/renderer/components/SessionCell.tsx
git commit -m "feat: show session topic as tooltip on grid cell header"
```

---

### Task 6: Show topic in Sidebar bg-card tooltip

**Files:**
- Modify: `src/renderer/components/SidebarPanel.tsx:451`

- [ ] **Step 1: Pass topicMap to SidebarPanel**

In the parent component that renders SidebarPanel, pass the `topicMap` from useGrid.

Find where SidebarPanel is used (in `app.tsx` or SessionGrid) and add `topicMap` prop.

- [ ] **Step 2: Update BackgroundSessionCard title**

In `src/renderer/components/SidebarPanel.tsx` line 451, the bg-card has:

```tsx
title={expanded ? t('sidebar.clickToPlace') : ''}
```

Change to:

```tsx
title={expanded ? t('sidebar.clickToPlace') : (topicMap?.[session.id] || '')}
```

Where `topicMap` is passed down through the component tree to `BackgroundSessionCard`.

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/SidebarPanel.tsx src/renderer/app.tsx
git commit -m "feat: show session topic as tooltip on sidebar bg-card"
```

---

### Task 7: Full test run and final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test 2>&1 | tail -20`
Expected: All tests pass (858+ tests, 0 failures)

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Lint**

Run: `npm run lint 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 4: Manual smoke test description**

To verify manually:
1. Start cipher-mux with Keep Working enabled
2. Open 2+ sessions, start tasks in each
3. Cmd+Q to quit gracefully
4. Relaunch — sessions should restore
5. Hover over session names in grid cells → tooltip shows topic
6. Send sessions to background → hover on sidebar cards → tooltip shows topic
