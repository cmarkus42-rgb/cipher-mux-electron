# Hands-Free Scroll Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable hands-free scrolling of terminal cells via voice commands and MCP tool.

**Architecture:** Three layers — (1) VAD tuning for better short-command recognition, (2) scroll commands in VoiceInputRouter emitting IPC events, (3) renderer-side terminal registry + scroll handler + MCP tool. All scroll actions flow through a single IPC channel `CELL_SCROLL`.

**Tech Stack:** TypeScript, Preact, xterm.js, Electron IPC, Silero VAD, MCP SDK (zod)

---

### Task 1: VAD Tuning — Lower Speech Detection Thresholds

**Files:**
- Modify: `src/renderer/hooks/useVoiceSession.ts:82-93`

- [ ] **Step 1: Pass explicit VAD config in useVoiceSession**

In `src/renderer/hooks/useVoiceSession.ts`, change the `initVAD` callback. Find the `loadVAD` call (line 83) and add the 4th argument:

```typescript
    vadRef.current = await loadVAD(stream, audioCtx, {
      onSpeechStart: () => {
        api.voice.vadSpeechStart()
      },
      onSpeechEnd: (audio: Float32Array) => {
        api.voice.vadSpeechEnd(Array.from(audio))
      },
      onVADMisfire: () => {
        api.voice.vadMisfire()
      },
    }, {
      positiveSpeechThreshold: 0.5,
      negativeSpeechThreshold: 0.25,
      minSpeechFrames: 3,
      preSpeechPadFrames: 5,
    })
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npx tsc --noEmit -p tsconfig.renderer.json 2>&1 | head -20`
Expected: No errors (VADConfig already accepts these optional fields)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/hooks/useVoiceSession.ts
git commit -m "$(cat <<'EOF'
feat(voice): lower VAD thresholds for short commands

positiveSpeechThreshold 0.7→0.5, minSpeechFrames 5→3,
preSpeechPadFrames 3→5. Short words like "hoch" are now
recognized at normal speaking volume.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Terminal Registry — Expose xterm.js Instances by SessionId

**Files:**
- Create: `src/renderer/terminal-registry.ts`
- Test: `test/main/terminal-registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/main/terminal-registry.test.ts`:

```typescript
import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  registerTerminal, unregisterTerminal, getTerminal,
  setMarker, getMarker, clearMarker,
} from '../../src/renderer/terminal-registry'

// Minimal Terminal stub — only the fields the registry cares about
function makeTermStub() {
  return { buffer: { active: { baseY: 0, cursorY: 0 } } } as any
}

describe('terminal-registry', () => {
  beforeEach(() => {
    // Clean up any leftover state between tests
    unregisterTerminal('s1')
    unregisterTerminal('s2')
    clearMarker('s1')
    clearMarker('s2')
  })

  it('registers and retrieves a terminal', () => {
    const term = makeTermStub()
    registerTerminal('s1', term)
    assert.equal(getTerminal('s1'), term)
  })

  it('returns undefined for unregistered session', () => {
    assert.equal(getTerminal('unknown'), undefined)
  })

  it('unregisters a terminal', () => {
    const term = makeTermStub()
    registerTerminal('s1', term)
    unregisterTerminal('s1')
    assert.equal(getTerminal('s1'), undefined)
  })

  it('stores and retrieves a marker', () => {
    setMarker('s1', 42)
    assert.equal(getMarker('s1'), 42)
  })

  it('returns undefined for missing marker', () => {
    assert.equal(getMarker('s1'), undefined)
  })

  it('clears a marker', () => {
    setMarker('s1', 10)
    clearMarker('s1')
    assert.equal(getMarker('s1'), undefined)
  })

  it('overwrites marker on repeated set', () => {
    setMarker('s1', 10)
    setMarker('s1', 99)
    assert.equal(getMarker('s1'), 99)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && node --test --import tsx test/main/terminal-registry.test.ts 2>&1 | tail -10`
Expected: FAIL — module `../../src/renderer/terminal-registry` not found

- [ ] **Step 3: Write the implementation**

Create `src/renderer/terminal-registry.ts`:

```typescript
/**
 * Terminal Registry — global maps for xterm.js Terminal instances and scroll markers.
 *
 * Allows IPC scroll handlers and MCP tools to reach Terminal instances
 * that are created inside useTerminal hooks.
 */
import type { Terminal } from '@xterm/xterm'

const terminals = new Map<string, Terminal>()
const markers = new Map<string, number>()

export function registerTerminal(sessionId: string, term: Terminal): void {
  terminals.set(sessionId, term)
}

export function unregisterTerminal(sessionId: string): void {
  terminals.delete(sessionId)
}

export function getTerminal(sessionId: string): Terminal | undefined {
  return terminals.get(sessionId)
}

/** Store the scrollback line number at the moment of user submission. */
export function setMarker(sessionId: string, line: number): void {
  markers.set(sessionId, line)
}

export function getMarker(sessionId: string): number | undefined {
  return markers.get(sessionId)
}

export function clearMarker(sessionId: string): void {
  markers.delete(sessionId)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && node --test --import tsx test/main/terminal-registry.test.ts 2>&1 | tail -10`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/terminal-registry.ts test/main/terminal-registry.test.ts
git commit -m "$(cat <<'EOF'
feat(renderer): add terminal registry for scroll control

Simple Map-based registry exposing xterm.js Terminal instances
and scroll markers by sessionId. Foundation for hands-free
scroll commands.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire useTerminal to Terminal Registry + Marker Tracking

**Files:**
- Modify: `src/renderer/hooks/useTerminal.ts`

- [ ] **Step 1: Add imports at top of useTerminal.ts**

Add after the existing imports (line 7):

```typescript
import { registerTerminal, unregisterTerminal, setMarker } from '../terminal-registry'
```

- [ ] **Step 2: Register terminal after creation**

In the `useEffect` body, after `termRef.current = term` (line 156), add:

```typescript
    registerTerminal(sessionId, term)
```

- [ ] **Step 3: Track marker on Enter key**

In the `term.onData` handler (line 280), wrap the existing `api().terminal.write` call:

```typescript
    const inputDisposable = term.onData((data: string) => {
      // Track scroll marker on Enter — marks start of next response
      if (data === '\r') {
        setMarker(sessionId, term.buffer.active.baseY + term.buffer.active.cursorY)
      }
      api().terminal.write(sessionId, data)
    })
```

- [ ] **Step 4: Unregister in cleanup**

In the cleanup return function (around line 293), add before `term.dispose()`:

```typescript
      unregisterTerminal(sessionId)
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npx tsc --noEmit -p tsconfig.renderer.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/renderer/hooks/useTerminal.ts
git commit -m "$(cat <<'EOF'
feat(terminal): register terminals and track scroll markers

useTerminal now registers/unregisters with terminal-registry
and records scroll marker on every Enter keystroke.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: IPC Channel + Preload Bridge for CELL_SCROLL

**Files:**
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Add CELL_SCROLL to IPC channels**

In `src/shared/ipc-channels.ts`, add after the `SIDEBAR_TOGGLE` entry (line 168):

```typescript
  CELL_SCROLL: 'cipher-mux:cell:scroll',
```

- [ ] **Step 2: Add onCellScroll to preload bridge**

In `src/main/preload.ts`, inside the `terminal` section (after the `onData` entry, around line 64), add:

```typescript
    onCellScroll: (cb: (data: { sessionId?: string; cell?: string; action: string; lines?: number }) => void) => {
      const handler = (_e: unknown, data: { sessionId?: string; cell?: string; action: string; lines?: number }) => cb(data)
      ipcRenderer.on(IPC.CELL_SCROLL, handler)
      return () => ipcRenderer.removeListener(IPC.CELL_SCROLL, handler)
    },
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/shared/ipc-channels.ts src/main/preload.ts
git commit -m "$(cat <<'EOF'
feat(ipc): add CELL_SCROLL channel and preload bridge

New IPC channel cipher-mux:cell:scroll with onCellScroll
listener in the preload API for renderer-side scroll handling.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Renderer Scroll Handler

**Files:**
- Create: `src/renderer/hooks/useScrollHandler.ts`

- [ ] **Step 1: Create the scroll handler hook**

Create `src/renderer/hooks/useScrollHandler.ts`:

```typescript
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
```

- [ ] **Step 2: Wire into SessionGrid**

In `src/renderer/components/SessionGrid.tsx`, add import at the top (after existing imports):

```typescript
import { useScrollHandler } from '../hooks/useScrollHandler'
```

Then inside the `SessionGrid` component function, add the hook call (after any existing hooks, before the return):

```typescript
  useScrollHandler(grid)
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npx tsc --noEmit -p tsconfig.renderer.json 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/renderer/hooks/useScrollHandler.ts src/renderer/components/SessionGrid.tsx
git commit -m "$(cat <<'EOF'
feat(renderer): add scroll handler for CELL_SCROLL events

useScrollHandler hook listens for IPC scroll events, resolves
target terminal via registry, and executes scroll actions.
Smart scroll distance: ~1 page for single cells, 2/3 for expanded.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Voice Scroll Commands in VoiceInputRouter

**Files:**
- Modify: `src/main/voice/voice-input-router.ts`
- Modify: `test/main/voice-input-router.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `test/main/voice-input-router.test.ts` (inside the existing `describe` block, after the last `it`):

```typescript
  it('emits scroll event for "hoch" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('hoch')
    assert.ok(scrollEvent)
    assert.equal(scrollEvent.sessionId, 'sess-1')
    assert.equal(scrollEvent.action, 'up')
    assert.equal(sentKeys.length, 0, 'scroll commands must NOT send keys to tmux')
  })

  it('emits scroll event for "ganz runter" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('Ganz runter.')
    assert.ok(scrollEvent)
    assert.equal(scrollEvent.action, 'bottom')
    assert.equal(sentKeys.length, 0)
  })

  it('emits scroll event for "zum marker" command', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('zum Marker')
    assert.ok(scrollEvent)
    assert.equal(scrollEvent.action, 'to-marker')
    assert.equal(sentKeys.length, 0)
  })

  it('emits dispatched event with scroll label', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let dispatched: any = null
    router.on('dispatched', (data) => { dispatched = data })
    await router.routeTranscription('weiter')
    assert.ok(dispatched)
    assert.equal(dispatched.text, '[scroll-down]')
  })

  it('does not match scroll command in longer text', async () => {
    router.setMode('session')
    router.setFocusedSession('sess-1')
    let scrollEvent: any = null
    router.on('scroll', (data) => { scrollEvent = data })
    await router.routeTranscription('scroll mal hoch bitte')
    assert.equal(scrollEvent, null, 'partial match should not trigger scroll')
    assert.equal(sentKeys.length, 1, 'text should be sent normally')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && node --test --import tsx test/main/voice-input-router.test.ts 2>&1 | tail -20`
Expected: 5 new tests FAIL (scroll event never emitted)

- [ ] **Step 3: Add SCROLL_COMMANDS to voice-input-router.ts**

In `src/main/voice/voice-input-router.ts`, add after the `VOICE_COMMANDS` array (after line 29):

```typescript
// Scroll navigation commands — matched before VOICE_COMMANDS.
// On match, a 'scroll' event is emitted instead of sending keys to tmux.
const SCROLL_COMMANDS: Array<{
  patterns: string[]
  action: 'up' | 'down' | 'top' | 'bottom' | 'to-marker'
  label: string
}> = [
  { patterns: ['hoch', 'scroll hoch', 'rauf'],           action: 'up',        label: 'scroll-up' },
  { patterns: ['runter', 'scroll runter', 'weiter'],      action: 'down',      label: 'scroll-down' },
  { patterns: ['ganz hoch', 'anfang'],                    action: 'top',       label: 'scroll-top' },
  { patterns: ['ganz runter', 'ende'],                    action: 'bottom',    label: 'scroll-bottom' },
  { patterns: ['zum marker', 'lese start', 'lesestart'],  action: 'to-marker', label: 'scroll-marker' },
]
```

- [ ] **Step 4: Add scroll command matching in routeToSession**

In the `routeToSession` method, add scroll command check **before** the existing `VOICE_COMMANDS` check (before the line `const command = VOICE_COMMANDS.find(...)`):

```typescript
    // Check for scroll navigation commands first
    const scrollCmd = SCROLL_COMMANDS.find(cmd => cmd.patterns.includes(normalized))
    if (scrollCmd) {
      console.log('[VoiceRouter] scroll command:', scrollCmd.label)
      this.emit('scroll', { sessionId: targetId, action: scrollCmd.action })
      this.emit('dispatched', {
        sessionId: targetId,
        sessionName: session?.name ?? targetId,
        text: `[${scrollCmd.label}]`,
      })
      return
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && node --test --import tsx test/main/voice-input-router.test.ts 2>&1 | tail -20`
Expected: All tests PASS (existing + 5 new)

- [ ] **Step 6: Commit**

```bash
git add src/main/voice/voice-input-router.ts test/main/voice-input-router.test.ts
git commit -m "$(cat <<'EOF'
feat(voice): add scroll navigation commands to VoiceInputRouter

SCROLL_COMMANDS array with patterns for hoch/runter/anfang/ende/
zum-marker. Matched before text commands, emits 'scroll' event
instead of sending keys to tmux. Includes 5 new tests.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Wire Scroll Event in ipc-hub.ts

**Files:**
- Modify: `src/main/ipc-hub.ts`

- [ ] **Step 1: Add scroll event handler for VOICE_START_SESSION**

In `src/main/ipc-hub.ts`, find the `VOICE_START_SESSION` handler where `inputRouter` events are wired up (around line 1012-1029). After the `pinChanged` event listener, add:

```typescript
        inputRouter.on('scroll', (data: { sessionId: string; action: string }) => {
          console.log('[Voice] Scroll command:', data.action, 'session:', data.sessionId)
          this.windowManager.sendToMainWindow(IPC.CELL_SCROLL, {
            sessionId: data.sessionId,
            action: data.action,
          })
        })
```

- [ ] **Step 2: Add scroll event handler for VOICE_START_COM**

In the `VOICE_START_COM` handler (around line 1077-1084), after the existing `inputRouter.on('error', ...)` listener, add the same scroll handler:

```typescript
        inputRouter.on('scroll', (data: { sessionId: string; action: string }) => {
          this.windowManager.sendToMainWindow(IPC.CELL_SCROLL, {
            sessionId: data.sessionId,
            action: data.action,
          })
        })
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc-hub.ts
git commit -m "$(cat <<'EOF'
feat(ipc-hub): wire VoiceInputRouter scroll events to CELL_SCROLL

Forwards scroll events from voice input router to renderer via
IPC.CELL_SCROLL channel for both STT and COM voice modes.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: mux_cell_scroll MCP Tool

**Files:**
- Modify: `src/main/mcp/mcp-tools.ts`

- [ ] **Step 1: Register the mux_cell_scroll tool**

In `src/main/mcp/mcp-tools.ts`, find the last tool registration (currently `mux_tts_speak`, tool #35, around line 1337). After it, add:

```typescript
  // 36. mux_cell_scroll — Scroll a terminal cell
  ;(server.registerTool as any)(
    'mux_cell_scroll',
    {
      description:
        'Scroll a terminal cell. Actions: "up"/"down" scroll by ~1 page, '
        + '"top"/"bottom" jump to extremes, "to-marker" jumps to the start '
        + 'of the last response (set automatically on each user submission).',
      inputSchema: {
        sessionId: z.string().optional().describe('Target session ID. If omitted, uses the calling session.'),
        cell: z.string().optional().describe('Target cell by grid position (e.g. "cell-0-0"). Alternative to sessionId.'),
        action: z.enum(['up', 'down', 'top', 'bottom', 'to-marker']).describe('Scroll action to perform'),
        lines: z.number().optional().describe('Number of lines to scroll (only for up/down). Default: ~1 page.'),
      },
    },
    async (args: { sessionId?: string; cell?: string; action: string; lines?: number }) => {
      if (!ctx.windowManager) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'WindowManager not available' }) }], isError: true }
      }
      ctx.windowManager.sendToMainWindow(IPC.CELL_SCROLL, args)
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
      }
    }
  )
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/mcp/mcp-tools.ts
git commit -m "$(cat <<'EOF'
feat(mcp): add mux_cell_scroll tool for programmatic scroll control

Entities can scroll terminal cells via MCP: up/down/top/bottom/
to-marker. Supports sessionId or cell grid position targeting.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Run Full Test Suite

**Files:** None (verification only)

- [ ] **Step 1: Run all tests**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && node --test --import tsx $(find test -name '*.test.ts' | sort) 2>&1 | tail -30`
Expected: All tests pass, including the new terminal-registry and voice-input-router scroll tests.

- [ ] **Step 2: Run full TypeScript check**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npx tsc --noEmit 2>&1 | tail -10`
Expected: No errors

- [ ] **Step 3: Run lint**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron && npm run lint 2>&1 | tail -10`
Expected: No lint errors in changed files
