# Hands-Free Scroll Control — Design Spec

**Date:** 2026-05-01
**Status:** Approved

## Problem

cipher-mux is almost entirely hands-free (STT + Bluetooth button). The last break: scrolling terminal cells requires the mouse. Long Claude answers force the user to scroll back manually.

Additional: xterm.js auto-scrolls to bottom on any input + Enter, so a voice command like "scroll hoch" would sabotage itself if sent as text to the terminal.

## Solution Overview

Three changes, cleanly separated:

1. **VAD Tuning** — lower speech detection thresholds so short commands are recognized at normal volume
2. **Voice Navigation Commands** — new entries in `VoiceInputRouter` that fire IPC events instead of tmux keys
3. **`mux_cell_scroll` MCP Tool + Renderer Scroll Handler** — programmatic scroll control via MCP and IPC

## Architecture

### Data Flow: Voice Scroll

```
STT -> VoiceInputRouter.routeTranscription("hoch")
  -> match in SCROLL_COMMANDS
  -> emit('scroll', { sessionId, action: 'up' })
  -> ipc-hub catches event, sends IPC.CELL_SCROLL to renderer
  -> Renderer finds Terminal instance via registry, calls term.scrollLines(-N)
```

### Data Flow: MCP Scroll

```
Claude -> mux_cell_scroll({ sessionId, action: "to-marker" })
  -> MCP tool sends IPC.CELL_SCROLL to renderer
  -> Renderer scrolls to stored marker position
```

## Part 1: VAD Tuning

**File:** `src/renderer/hooks/useVoiceSession.ts`

Currently `initVAD()` is called without `vadConfig` — all defaults. Short quiet words like "hoch" don't pass the threshold.

**Change:** Pass explicit config with more sensitive values:

```typescript
vadRef.current = await loadVAD(stream, audioCtx, callbacks, {
  positiveSpeechThreshold: 0.5,  // was 0.7
  negativeSpeechThreshold: 0.25, // was 0.3
  minSpeechFrames: 3,            // was 5 (~160ms -> ~96ms)
  preSpeechPadFrames: 5,         // was 3 (more audio context before trigger)
})
```

No config UI — developer knobs only. Can be moved to `config.json` later if needed.

## Part 2: Voice Navigation Commands

**File:** `src/main/voice/voice-input-router.ts`

New command array alongside existing `VOICE_COMMANDS`:

```typescript
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

**Matching:** In `routeToSession()`, scroll commands are checked *before* existing `VOICE_COMMANDS`. On match: no `sendKeys` to tmux, instead emit a `scroll` event:

```typescript
const scrollCmd = SCROLL_COMMANDS.find(cmd => cmd.patterns.includes(normalized))
if (scrollCmd) {
  this.emit('scroll', { sessionId: targetId, action: scrollCmd.action })
  this.emit('dispatched', { sessionId: targetId, sessionName, text: `[${scrollCmd.label}]` })
  return
}
```

The `scroll` event is caught in `ipc-hub.ts` and forwarded as `IPC.CELL_SCROLL` to the renderer. VoiceInputRouter stays UI-agnostic.

## Part 3: Terminal Registry + Scroll Handler

### Terminal Registry

**New file:** `src/renderer/terminal-registry.ts`

Simple Map exposing terminals by sessionId:

```typescript
const terminals = new Map<string, Terminal>()

export function registerTerminal(sessionId: string, term: Terminal): void {
  terminals.set(sessionId, term)
}
export function unregisterTerminal(sessionId: string): void {
  terminals.delete(sessionId)
}
export function getTerminal(sessionId: string): Terminal | undefined {
  return terminals.get(sessionId)
}
```

`useTerminal` calls `registerTerminal()` after creating the terminal and `unregisterTerminal()` in cleanup.

### Marker Tracking

Second Map in the same file: `markers: Map<string, number>`.

Updated when user sends Enter (in `term.onData` handler inside `useTerminal`):

```typescript
if (data === '\r') {
  setMarker(sessionId, term.buffer.active.baseY + term.buffer.active.cursorY)
}
```

This captures the scrollback position at the moment of submission — the start of the next response.

### Scroll Handler

IPC listener in the renderer (new hook `useScrollHandler` or inline in `SessionGrid`):

```typescript
api().onCellScroll(({ sessionId, cell, action, lines }) => {
  // Resolve cell identifier to sessionId if needed
  const resolvedId = sessionId ?? resolveCell(cell)
  const term = getTerminal(resolvedId)
  if (!term) return

  const scrollAmount = term.rows > 40
    ? Math.floor(term.rows * 2 / 3)  // expanded cell: 2/3, keep 1/3 visible
    : term.rows - 2                    // single cell: ~1 page with 2-line overlap

  switch (action) {
    case 'up':        term.scrollLines(-1 * (lines ?? scrollAmount)); break
    case 'down':      term.scrollLines(lines ?? scrollAmount); break
    case 'top':       term.scrollToTop(); break
    case 'bottom':    term.scrollToBottom(); break
    case 'to-marker': {
      const marker = getMarker(resolvedId)
      if (marker != null) {
        term.scrollToLine(marker)
      } else {
        term.scrollToTop()  // fallback
      }
      break
    }
  }
})
```

### Scroll Distance Logic

- **Single-height cell** (`term.rows <= 40`): `term.rows - 2` — nearly a full page, 2-line overlap
- **Expanded cell** (`term.rows > 40`): `Math.floor(term.rows * 2/3)` — scroll 2/3, keep 1/3 visible

The `term.rows > 40` heuristic works because single cells are typically 20-35 rows, expanded cells 50+. No prop-drilling of `rowSpan` needed.

## Part 4: `mux_cell_scroll` MCP Tool

**File:** `src/main/mcp/mcp-tools.ts`

Follows existing pattern (like `mux_session_focus`):

```typescript
;(server.registerTool as any)(
  'mux_cell_scroll',
  {
    description: 'Scroll a terminal cell. Use "to-marker" to jump to the start of the last response.',
    inputSchema: {
      sessionId: z.string().optional().describe('Target session ID. Defaults to calling session.'),
      cell: z.string().optional().describe('Target cell (e.g. "cell-0-0"). Alternative to sessionId.'),
      action: z.enum(['up', 'down', 'top', 'bottom', 'to-marker']).describe('Scroll action'),
      lines: z.number().optional().describe('Lines to scroll (only for up/down). Default: ~1 page.'),
    },
  },
  async (args) => {
    if (!ctx.windowManager) return errorResponse('WindowManager not available')
    ctx.windowManager.sendToMainWindow(IPC.CELL_SCROLL, args)
    return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }] }
  }
)
```

### IPC Additions

**`src/shared/ipc-channels.ts`:**
```typescript
CELL_SCROLL: 'cipher-mux:cell:scroll',
```

**`src/main/preload.ts`** (under `terminal` section):
```typescript
onCellScroll: (cb: (data: { sessionId?: string; cell?: string; action: string; lines?: number }) => void) => {
  const handler = (_e: unknown, data: any) => cb(data)
  ipcRenderer.on(IPC.CELL_SCROLL, handler)
  return () => ipcRenderer.removeListener(IPC.CELL_SCROLL, handler)
},
```

## Implementation Order

1. VAD tuning (smallest change, immediate UX improvement for all voice commands)
2. Terminal registry + marker tracking in `useTerminal`
3. IPC channel + preload bridge + scroll handler in renderer
4. Scroll commands in `VoiceInputRouter` + ipc-hub wiring
5. `mux_cell_scroll` MCP tool registration

## Files Changed

| File | Change |
|---|---|
| `src/renderer/voice/vad-loader.ts` | No change (config already accepted) |
| `src/renderer/hooks/useVoiceSession.ts` | Pass explicit VAD config |
| `src/renderer/terminal-registry.ts` | **New file** — terminal + marker maps |
| `src/renderer/hooks/useTerminal.ts` | Register/unregister terminal, track markers on Enter |
| `src/shared/ipc-channels.ts` | Add `CELL_SCROLL` channel |
| `src/main/preload.ts` | Add `onCellScroll` listener bridge |
| `src/main/voice/voice-input-router.ts` | Add `SCROLL_COMMANDS`, emit scroll event |
| `src/main/ipc-hub.ts` | Wire VoiceInputRouter scroll event to IPC.CELL_SCROLL |
| `src/main/mcp/mcp-tools.ts` | Register `mux_cell_scroll` tool |
| `src/renderer/components/SessionGrid.tsx` or new hook | `useScrollHandler` — IPC listener for scroll actions |

## Decisions Made

- **No Claude-side markers.** Marker = scrollback position at last Enter, tracked by cipher-mux. Robust, no Claude cooperation needed.
- **No visual feedback on scroll.** Content movement is sufficient feedback.
- **No config UI for VAD.** Developer knobs only for now.
- **VoiceInputRouter stays UI-agnostic.** Emits events, doesn't know about terminals.
- **`term.rows > 40` heuristic** for expanded cell detection instead of prop-drilling rowSpan.
