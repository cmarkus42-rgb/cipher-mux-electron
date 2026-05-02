# Bugfix Iteration 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all known bugs from MPO run, prioritizing Voice (enables testing everything else), then Layout, then UI polish.

**Architecture:** Fix bugs in dependency order — Voice first (unblocks manual testing), then window sizing (unblocks grid testing), then visual polish. Each task is a self-contained bugfix with its own commit.

**Tech Stack:** Preact, Electron, xterm.js, CSS, TypeScript

---

## Bug Inventory (from `moreismore/`)

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| BH1ESP | **HIGH** | Voice | Voice toggle uses emoji instead of CSS switch; voice not working |
| DDEKTM | **HIGH** | UI/Theme | Terminal colors too bright, violates cipher CI |
| HEIGHT-REGRESSION | **HIGH** | Layout | Window height doesn't adapt to row count |
| A29FD6 | **HIGH** | MCP | MCP session sporadically unreachable |
| Q88ZHP + WVDTTM | **MED** | Layout | Sessions compress instead of fixed-width expand |
| TNDXR0 | **MED** | Layout | Lines break apart in MPO session |
| ZACT8J | **MED** | Session | Only 2 sessions shown at startup instead of expected |
| 8NG1QN + AA0R7N | **MED** | Feature | MPO button in footer |
| 26AH6N | **MED** | Feature | Voice mode dropped from bug-assistant |
| arch-outdated | **LOW** | Docs | ARCHITECTURE.md adapter section outdated |
| msg-bus-push | **MED** | Feature | Message bus push delivery (architectural) |

---

## Task 1: Voice Toggle — CSS Switch (BH1ESP)

Replace emoji-based voice toggle with CSS-only square cyberpunk switch matching cipher-desktop-electron design language. No rounded corners, neon green glow, square knob.

**Files:**
- Modify: `src/renderer/components/VoiceControl.tsx`
- Modify: `src/renderer/styles/components.css` (lines 992-1138, voice-pill section)

- [ ] **Step 1: Replace VoiceControl.tsx with CSS switch**

Replace the emoji button with a proper checkbox-based toggle switch + separate LED indicator:

```tsx
/**
 * VoiceControl — Floating Pill for voice-to-session input.
 *
 * Sits bottom-left of the app. Square cyberpunk toggle switch + LED dot.
 * Expanded (when active): LED + session name + PTT hint.
 * Shows toast overlays for transcription preview and dispatch feedback.
 */

import { useVoiceSession } from '../hooks/useVoiceSession'

interface VoiceControlProps {
  focusedSessionId: string | null
  focusedSessionName: string | null
}

export function VoiceControl({ focusedSessionId, focusedSessionName }: VoiceControlProps) {
  const {
    active,
    recording,
    processing,
    toast,
    error,
    toggle,
  } = useVoiceSession(focusedSessionId, focusedSessionName)

  const ledState = recording
    ? 'recording'
    : processing
      ? 'processing'
      : active
        ? 'ready'
        : 'off'

  return (
    <div class={`voice-pill${active ? ' voice-pill--active' : ''}`}>
      {/* Toast overlay */}
      {toast && (
        <div class={`voice-toast voice-toast--${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* Error display */}
      {error && !active && (
        <div class="voice-toast voice-toast--error">{error}</div>
      )}

      {/* Voice controls row */}
      <div class="voice-controls">
        {/* Toggle switch */}
        <label class="voice-switch" title={active ? 'Disable voice input' : 'Enable voice input'}>
          <input
            type="checkbox"
            checked={active}
            onChange={toggle}
          />
          <span class="voice-switch__track" />
        </label>

        {/* LED indicator */}
        <span class={`voice-led voice-led--${ledState}`} />
      </div>

      {/* Expanded info */}
      {active && (
        <div class="voice-pill__info">
          <span class="voice-pill__mode">
            {focusedSessionName
              ? `Session: ${focusedSessionName}`
              : 'No session focused'}
          </span>
          <span class="voice-pill__hint">Ctrl+Shift+Space</span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Replace voice CSS with cipher-desktop-electron design**

In `src/renderer/styles/components.css`, replace the entire voice section (from `/* ── Voice ──` to the end of voice styles) with:

```css
/* ── Voice Toggle Switch (Square Cyberpunk) ── */
.voice-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  -webkit-app-region: no-drag;
  user-select: none;
}

.voice-switch input { display: none; }

.voice-switch__track {
  position: relative;
  width: 32px;
  height: 18px;
  background: var(--color-border);
  border-radius: 0;
  transition: background 0.25s ease, box-shadow 0.25s ease;
}

.voice-switch__track::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: var(--color-bg-elevated);
  border-radius: 0;
  transition: transform 0.25s ease;
}

.voice-switch input:checked + .voice-switch__track {
  background: var(--color-neon-green);
  box-shadow: 0 0 8px rgba(45, 138, 78, 0.3);
}

.voice-switch input:checked + .voice-switch__track::after {
  transform: translateX(14px);
}

/* ── Voice Controls Row ── */
.voice-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* ── Status LED (Neon Square) ── */
.voice-led {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 0;
  background: var(--color-border);
  transition: background 0.3s ease, box-shadow 0.3s ease;
}

.voice-led--off {
  background: #444;
}

.voice-led--ready {
  background: var(--color-neon-green);
  box-shadow: 0 0 4px 1px rgba(45, 138, 78, 0.25);
  opacity: 0.6;
}

.voice-led--recording {
  background: var(--color-neon-red);
  box-shadow: 0 0 8px 3px rgba(204, 0, 48, 0.5);
  animation: voice-pulse 0.8s ease-in-out infinite;
}

.voice-led--processing {
  background: var(--color-neon-orange);
  box-shadow: 0 0 6px 2px rgba(192, 80, 0, 0.4);
  animation: voice-pulse 1.5s ease-in-out infinite;
}

/* ── Floating Pill Container ── */
.voice-pill {
  position: fixed;
  bottom: 36px;
  left: 12px;
  z-index: var(--z-dropdown);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  transition: all 0.2s ease;
}

.voice-pill--active {
  background: var(--color-bg-sunken);
  border: 1px solid var(--color-border);
  padding: 6px 10px;
}

.voice-pill__info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.voice-pill__mode {
  font-family: var(--font-sans);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.voice-pill__hint {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--color-text-dim);
}

/* ── Toast ── */
.voice-toast {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  padding: 4px 8px;
  white-space: nowrap;
  animation: voice-toast-in 0.15s ease-out;
}

.voice-toast--transcription {
  color: var(--color-text-accent);
  border-left: 2px solid var(--color-text-accent);
}

.voice-toast--dispatched {
  color: var(--color-neon-green);
  border-left: 2px solid var(--color-neon-green);
}

.voice-toast--error {
  color: var(--color-neon-red);
  border-left: 2px solid var(--color-neon-red);
}

@keyframes voice-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes voice-toast-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 3: Verify voice toggle renders correctly**

Run: `npm run dev`
Expected: Square toggle switch bottom-left, no emoji, neon green when active, LED dot changes state.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/VoiceControl.tsx src/renderer/styles/components.css
git commit -m "fix(voice): replace emoji toggle with CSS cyberpunk switch (BH1ESP)"
```

---

## Task 2: Voice Pipeline Debug — Ensure Voice Actually Works (BH1ESP functional)

The toggle is cosmetic; the real issue is voice not starting. Debug the initialization chain.

**Files:**
- Modify: `src/renderer/hooks/useVoiceSession.ts` (if initialization issues)
- Modify: `src/main/ipc-hub.ts` (if IPC handler issues)
- Check: `src/main/voice/voice-manager.ts` (native module loading)

- [ ] **Step 1: Add diagnostic logging to useVoiceSession.toggle()**

In `src/renderer/hooks/useVoiceSession.ts`, add console.log calls at each step of the `toggle()` function to trace where it fails:

```typescript
// Inside toggle(), before each step:
console.log('[VoiceSession] toggle called, active=', activeRef.current)
// Before available check:
console.log('[VoiceSession] checking availability...')
// After available check:
console.log('[VoiceSession] available result:', avail)
// Before startSession:
console.log('[VoiceSession] calling startSession...')
// After startSession:
console.log('[VoiceSession] startSession result:', result)
// Before VAD init:
console.log('[VoiceSession] initializing VAD...')
// After VAD init:
console.log('[VoiceSession] VAD initialized')
```

- [ ] **Step 2: Run `npm run dev`, click voice toggle, check DevTools console**

Run: `npm run dev` → open DevTools (Cmd+Alt+I) → click voice toggle → read console output.

Look for:
- "available result: {available: false, reason: ...}" → native module issue
- "startSession result: {ok: false, error: ...}" → VoiceManager init failed
- "initializing VAD..." then error → VAD/microphone permission issue
- No output at all → toggle handler not wired correctly

- [ ] **Step 3: Fix based on findings**

Common fixes:
- If Whisper model missing: check `~/.config/cipher-mux/models/whisper/ggml-small.bin` exists
- If native module ABI mismatch: `npm run rebuild` or `npx electron-rebuild`
- If VAD fails: check that `public/vad-assets/` contains `silero_vad_legacy.onnx`
- If microphone denied: check Electron permission handler in main.ts

- [ ] **Step 4: Verify end-to-end PTT flow**

1. Enable voice toggle
2. Focus a session (click a grid cell)
3. Hold Ctrl+Shift+Space
4. Speak "hello world"
5. Release keys
6. Verify text appears in focused tmux session

- [ ] **Step 5: Remove diagnostic logging, commit**

```bash
git add src/renderer/hooks/useVoiceSession.ts
git commit -m "fix(voice): debug and fix voice initialization pipeline (BH1ESP)"
```

---

## Task 3: Terminal Theme — Darker Colors (DDEKTM)

Terminal text too bright. User wants darker green base with blue accents, matching cipher CI.

**Files:**
- Modify: `src/shared/terminal-theme.ts`

- [ ] **Step 1: Update ivory theme terminal colors**

The current ivory theme has very dark foreground (`#1A1A1D` = near-black on light bg). But the bugreport says colors are too bright/light — this means the user is using **dark theme** where foreground is `#D8D8E0` (very light gray).

Update the dark theme in `src/shared/terminal-theme.ts`:

```typescript
if (theme === 'dark') {
  return {
    background: '#1a1e24',        // darker bg
    foreground: '#8aac8e',        // muted green base (not bright white)
    cursor: '#5C9A6E',
    selectionBackground: 'rgba(92, 154, 110, 0.40)',
    selectionForeground: '#c8d8cc',
    black: '#1a1e24', brightBlack: '#4a5a50',
    white: '#8aac8e', brightWhite: '#a8c8ae',     // muted, never bright white
    green: '#5C9A6E', brightGreen: '#7ab88a',
    red: '#a05060',   brightRed: '#c06070',
    yellow: '#987040', brightYellow: '#a88050',
    blue: '#5088a0',  brightBlue: '#6098b0',       // light blue accent, darker than current
    cyan: '#5088a0',  brightCyan: '#6098b0',
    magenta: '#806898', brightMagenta: '#907aa8',
  }
}
```

- [ ] **Step 2: Run existing theme tests**

Run: `npm test -- --test-name-pattern theme`
Expected: PASS (tests check structure, not exact colors)

- [ ] **Step 3: Visual verification**

Run: `npm run dev` → verify terminal text is muted green, not bright white. Blue accents visible but darker than before.

- [ ] **Step 4: Commit**

```bash
git add src/shared/terminal-theme.ts
git commit -m "fix(theme): darker terminal colors — green base, muted accents (DDEKTM)"
```

---

## Task 4: Window Height Adapts to Grid Rows (HEIGHT-REGRESSION)

Window height fixed at 900px, doesn't grow when rows increase. The `will-resize` prevention blocks user resize but `setSize()` should work programmatically. The issue: `WINDOW_FIT_GRID` is only called when the renderer requests it, but initial load uses hardcoded `DEFAULT_WINDOW_HEIGHT`.

**Files:**
- Modify: `src/main/window-manager.ts`
- Modify: `src/main/ipc-hub.ts` (registerWindowChannels)
- Modify: `src/shared/constants.ts` (potentially)

- [ ] **Step 1: Load saved grid config on window creation**

In `src/main/window-manager.ts`, accept optional grid config and compute height from rows:

```typescript
import {
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_GRID_COLS,
  DEFAULT_GRID_ROWS,
  CHATROOM_PANEL_WIDTH,
  SESSION_CELL_HEIGHT,
} from '../shared/constants'

export interface WindowGridHint {
  cols: number
  rows: number
}

export class WindowManager {
  private mainWindow: BrowserWindow | null = null

  createMainWindow(gridHint?: WindowGridHint): BrowserWindow {
    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize

    const cols = gridHint?.cols ?? DEFAULT_GRID_COLS
    const rows = gridHint?.rows ?? DEFAULT_GRID_ROWS

    const targetCellWidth = 664
    const gridPadding = 20
    const gridWidth = cols * targetCellWidth + CHATROOM_PANEL_WIDTH + gridPadding

    // Height from rows — same formula as WINDOW_FIT_GRID
    const chromeHeight = 38 + 28
    const gridPad = 12
    const gridControls = 22
    const gridGaps = (rows - 1) * 4
    const gridHeight = rows * SESSION_CELL_HEIGHT + chromeHeight + gridPad + gridControls + gridGaps

    const width = Math.min(gridWidth, screenWidth)
    const height = Math.min(gridHeight, screenHeight)

    // ... rest unchanged, but use computed width/height
```

- [ ] **Step 2: Pass saved grid config from IpcHub to WindowManager**

In `src/main/ipc-hub.ts` constructor or init, read saved grid and pass to createMainWindow:

```typescript
// In the app.whenReady() section of main.ts, or wherever WindowManager.createMainWindow is called:
const configStore = new ConfigStore()
const ui = configStore.get('ui')
const gridHint = ui?.grid
  ? { cols: ui.grid.cols ?? DEFAULT_GRID_COLS, rows: ui.grid.rows ?? DEFAULT_GRID_ROWS }
  : undefined
windowManager.createMainWindow(gridHint)
```

- [ ] **Step 3: Test with different grid configs**

1. Set grid to 1×1 → window should be small
2. Set grid to 2×2 → window grows
3. Set grid to 7×3 → window fills DQHD screen
4. Restart app → window opens at saved grid size

- [ ] **Step 4: Commit**

```bash
git add src/main/window-manager.ts src/main/main.ts
git commit -m "fix(layout): initial window height adapts to saved grid rows (HEIGHT-REGRESSION)"
```

---

## Task 5: Sessions Fixed-Width — Window Expands (Q88ZHP + WVDTTM)

Sessions compress when adding new ones. Fix: when grid cols change, call `WINDOW_FIT_GRID` to expand the window rather than squeezing cells.

**Files:**
- Modify: `src/renderer/app.tsx` (or wherever grid resize triggers)
- Check: `src/renderer/styles/grid.css` (minmax cell sizing)

- [ ] **Step 1: Find where grid columns change and ensure WINDOW_FIT_GRID is called**

Search for where `cols` or grid state changes in the renderer. The handler should call:

```typescript
api.window.fitGrid({ cols: newCols, rows: newRows })
```

after every grid resize — not just on manual resize controls but also when sessions are added/removed.

- [ ] **Step 2: Verify CSS uses fixed minmax**

In `grid.css`, ensure cells have `minmax(640px, 1fr)` — cells should never shrink below 640px. If the window is too narrow, horizontal scroll should appear instead of compression.

```css
.session-grid {
  display: grid;
  grid-template-columns: repeat(var(--grid-cols), minmax(640px, 1fr));
  overflow-x: auto;
}
```

- [ ] **Step 3: Test**

1. Start with 1 session → fits in window
2. Create 2nd session → window widens, both sessions same width
3. Create 3rd session → window widens again (or adds row), no compression
4. On small screen: horizontal scroll appears, cells maintain 640px

- [ ] **Step 4: Commit**

```bash
git commit -m "fix(layout): sessions maintain fixed width, window expands (Q88ZHP)"
```

---

## Task 6: ARCHITECTURE.md Update (arch-outdated)

**Files:**
- Modify: `ARCHITECTURE.md` (lines 116-148, Adapter Contract section)

- [ ] **Step 1: Update adapter section**

Replace outdated "being finalized in TP-2" text with current state. Include all 11 methods from `AgentAdapter` interface, all 6 capabilities, and note that `ClaudeCodeAdapter` is Tier-1 complete.

- [ ] **Step 2: Commit**

```bash
git add ARCHITECTURE.md
git commit -m "docs: update ARCHITECTURE.md adapter section to reflect TP-2 completion"
```

---

## Task 7: Startup Session Discovery (ZACT8J)

Only 2 sessions shown at startup instead of expected. Need to investigate session scanning/recovery logic.

**Files:**
- Check: `src/main/session/session-manager.ts` (recovery/scan)
- Check: `src/main/tmux/tmux-manager.ts` (list-sessions)

- [ ] **Step 1: Investigate tmux session listing at startup**

Add logging to session recovery to see what tmux reports vs what the app shows. Check if the filter criteria exclude valid sessions.

- [ ] **Step 2: Fix filter or timing issue**

Likely causes:
- Session name prefix filter too strict (only showing sessions matching `cmux-` prefix)
- Timing: sessions not yet started when scan runs
- Recovery dialog showing subset of actual sessions

- [ ] **Step 3: Commit**

```bash
git commit -m "fix(session): discover all existing sessions at startup (ZACT8J)"
```

---

## Task 8: MCP Session Resilience (A29FD6) — Plan Only

This is the most complex bug. Scope it for a separate iteration.

**Root causes identified:**
1. No session timeout → zombie sessions accumulate
2. No reconnect when Claude Code internally resets
3. Missing error handling for 404 "Session not found"
4. `.mcp.json` vs `settings.json` registration divergence

**Deferred to Iteration 2.** Needs:
- Session timeout (30min idle → cleanup)
- Health endpoint on MCP server
- Graceful re-initialize on 404
- Session limit enforcement

---

## Task 9: Feature Requests — Backlog (No Implementation)

These are tracked but not implemented in this iteration:

| ID | Feature | Priority |
|----|---------|----------|
| 8NG1QN + AA0R7N | MPO button in footer | Medium |
| 26AH6N | Voice mode in bug-assistant | Medium |
| TNDXR0 | Lines break in MPO session | Medium (needs repro) |
| msg-bus-push | Message bus push delivery | High (Iteration 2) |

---

## Execution Order

1. **Task 1** — Voice CSS (visual fix, quick win)
2. **Task 2** — Voice Pipeline (functional fix, enables all other testing)
3. **Task 3** — Terminal Theme (visual, no dependencies)
4. **Task 4** — Window Height (layout foundation)
5. **Task 5** — Fixed-Width Sessions (depends on Task 4)
6. **Task 6** — ARCHITECTURE.md (docs, parallel)
7. **Task 7** — Session Discovery (independent)
