# v0.9.1 Design Spec — Unified Sidebar, Bugfixes, Workspace Apply

> Validated design for the next iteration of cipher-mux-electron.
> Produced 2026-04-24 via brainstorming session with cipher.

---

## 1. Unified Sidebar Panel

### Motivation

The current Chatroom panel serves as a passive message viewer — no session actively reads from the message bus for its workflow. Communication happens via direct tmux injection (send-keys / capture-pane) and MCP tool responses. The chat input field is unused. The separate Input Requests panel adds UI complexity with its own toggle button.

### Design

Replace the Chatroom panel + Input Requests panel with a single **Unified Sidebar Panel** containing three auto-visible sections:

```
+----------------------------------+
| MESSAGES          (collapsible)  |  <- only when Orchestrator active
|  [timestamp] Orch -> Worker-1    |
|  "implement the auth module"     |
|  [timestamp] Worker-1 -> status  |
|  "auth module complete"          |
+----------------------------------+
| BACKGROUND SESSIONS              |  <- only when sessions exist outside grid
|  +------------------------------+|
|  | Worker-1          [proj-path] ||
|  | Tokens: 42k/128k  [====--]   ||
|  | "I've finished implementing   ||
|  |  the auth module and all tes  ||
|  |  ts pass. The changes inclu..." ||
|  +------------------------------+|
|  | Worker-2          [proj-path] ||
|  | Tokens: 18k/128k  [==----]   ||
|  | "Currently working on the..." ||
|  +------------------------------+|
+----------------------------------+
| REQUESTS                         |  <- only when MPO active
|  [input-request card]            |
|  [input-request card]            |
+----------------------------------+
```

### Behavior

| Section | Visible when | Content |
|---------|-------------|---------|
| Messages | Orchestrator session active | Bus messages (audit log), newest at bottom, no input field |
| Background Sessions | Any active session not in grid | Cards: name, project, context/tokens bar, last response (3 lines + ellipsis) |
| Requests | MPO session active | Input Request cards (migrated from standalone panel) |

- **No toolbar buttons** — sections appear/disappear automatically based on state
- **No chat input field** — panel is purely passive/display
- **Panel itself** only renders when activated (keep 'SIDEBAR' Link in footer where now 'chatroom'-button i s placed - it activates or deactivates the sidebar all together - with activity LED -- AND  at least one section has content. No section relevant = no panel.

### Background Session Card Detail

Each card shows:
- Session name (bold)
- Project path (muted, truncated)
- Context window bar: `used/total` + visual bar (like in project cards)
- Last response: 3 lines of the most recent terminal output, then `...`
- Click behavior:
  - Free grid slot exists -> session placed directly
  - No free slot -> Popup with visual grid representation (like workspace editor), user clicks target slot to swap/place

### Detachable Window

The Unified Sidebar can be detached as a standalone, resizable BrowserWindow:
- Detach button (icon) in the panel header
- Once detached, the sidebar area in the main window is freed (grid gets full width)
- Detached window auto-closes when no section has content
- Detach/attach preference is persisted in ConfigStore
- Future: Setting to override auto-close behavior ("keep open even when empty")

### Migration from Current Components

| Current | Becomes |
|---------|---------|
| `ChatroomPanel.tsx` | Refactored into `SidebarPanel.tsx` with Messages section |
| `ChatToggleButton.tsx` | Removed |
| `InputRequestsPanel.tsx` | Integrated as Requests section in SidebarPanel |
| Input Requests toolbar button | Removed |
| Chat input field | Removed |
| `chatroom-bg-sessions` section | Promoted to primary Background Sessions section |

---

## 2. Workspace Apply — End-to-End Fix

### Problem

Workspace "Load" currently only resizes the grid dimensions (cols/rows). It does NOT:
- Apply merges (rowSpans)
- Spawn sessions for non-empty cells
- Inject persona prompts

The code exists in `workspace-manager.ts` and `app.tsx` but the IPC chain is broken end-to-end.

### Fix Scope

1. **IPC wiring audit**: Trace `WORKSPACES_APPLY` from renderer through preload to main and back. Fix any broken links.
2. **Grid resize**: Must happen before session spawning (already coded, verify it works).
3. **Merge application**: `applyMerges()` in `useGrid.ts` must receive and apply the workspace merge map. Verify the data flows from main -> renderer.
4. **Session spawning**: `applyWorkspace()` in `workspace-manager.ts` calls `sessionStarter.start()` per non-empty cell. Verify SessionManager is correctly passed and `start()` succeeds.
5. **Prompt injection**: `resolvePrompt()` (3-level: cell > workspace override > persona default) feeds into `autoLaunch`. Verify the resolved prompt reaches the tmux session.

### Acceptance Criteria

- Load a workspace with 3x2 grid, 2 merged cells, 3 non-empty cells with projects -> Grid resizes, merges visible, 3 sessions spawn with correct prompts.

---

## 3. Bugfixes

### E2: mux_send Push-Delivery

**Symptom:** `mux_send` with `sessionName` returns `delivered:false`, tmux send-keys injection doesn't happen.

**Root Cause (suspected):** Session lookup or readiness check in `mcp-tools.ts` fails silently. The `capture()` + readiness check + `sendKeys()` chain needs debugging.

**Fix:** Trace the delivery path, add logging, fix the lookup/injection. Push delivery must return `delivered:true` when target session is active and text is injected.

### E4: mux_create_session visible:true

**Symptom:** Session creates correctly but doesn't appear in the grid.

**Root Cause (suspected):** IPC chain (mcp-tools -> windowManager -> preload -> app.tsx) has a race condition or `addSession()` silently fails when no free slot exists.

**Fix:** Verify IPC delivery. When no free slot: use same logic as Background Session Card click (find free slot or popup). Add grid auto-expand as last resort is NOT allowed — grid dimensions are user-controlled.

### S1: Orchestrator Button State-Sync

**Symptom:** After orchestrator session dies (externally or via close), button stops working. Next click tries `stop()` instead of `start()`.

**Root Cause:** `orchestratorSessionId` in app.tsx renderer state is never cleared when session dies externally. Only the explicit stop-button path clears it.

**Fix:** Listen for session-stopped/session-removed events. If the stopped session ID matches `orchestratorSessionId`, clear the state and update the button.

### S5: Version Display

**Symptom:** StatusBar shows `v0.8.4` instead of current version.

**Fix:**
1. Bump `package.json` version to `0.9.1-beta`
2. Verify `git-version.sh` reads from `package.json` correctly
3. Version display in StatusBar should reflect the bumped version after build

---

## 4. Personas Cleanup

### Remove Worker Built-in

Worker is a blank Claude session with no special template or behavior. The orchestrator gives its subagents context-specific prompts directly via tmux injection. Worker as a built-in persona serves no purpose.

**Change:**
- Remove `worker` from `BUILTIN_PERSONAS` in `persona-types.ts`
- Remaining built-ins: `orchestrator`, `mpo`, `empty`
- Existing workspaces referencing `worker` persona: gracefully handle (treat as `empty` or show warning)

### Built-in Persona Prompts — Informational Only

Orchestrator and MPO persona prompts are cosmetic — the real behavior comes from their respective templates (`orchestrator-template.ts`, `mpo-template.ts`). The persona prompt only affects how they communicate style-wise.

**Change:**
- Keep prompts editable for built-ins (as-is)
- Add a subtle note in the Persona editor: "Orchestrator/MPO use their own system template. This prompt influences communication style only."

---

## 5. Settings: --dangerously-skip-permissions Toggle

### Current State

`agent.skipPermissions` exists in ConfigStore but has no UI toggle.

### Design

Add a toggle in the Settings tab (Info/Settings popup, "einstellungen" tab):
- Label: "Skip Permission Prompts"
- Subtitle/warning: "Sessions starten mit --dangerously-skip-permissions. Alle Tool-Aufrufe werden automatisch genehmigt."
- Visual: Warning-colored toggle (orange/red when active)
- Persisted via ConfigStore `agent.skipPermissions`

---

## 6. Workspace-Prompts UI Fix (W6)

### Problems (from test feedback)

- Layout falls apart (screenshot reference 12:15)
- Orange text hard to read
- No way to load persona defaults for editing
- Override textarea starts empty instead of pre-filled

### Fixes

1. **Layout**: Fix container/flex issues in workspace prompt override area. All inputs stay within bounds.
2. **Readability**: Replace orange highlight text with theme-appropriate muted color + icon/badge.
3. **"Load Default" button**: Small button next to each override textarea that fills it with the persona's `defaultPrompt`, so users can edit from the default rather than starting blank.
4. **Pre-fill on new override**: When adding a new override via "+ add override", textarea starts with the full persona default prompt (not empty).

---

## 7. Non-Scope (Deferred)

- Phase F (Voice ABI rebuild) — separate effort
- G2-G7 backlog items — after v0.9.1
- Auto-close setting for detached sidebar — noted for future, v0.9.1 ships with auto-close only
- Voice state in bugreport dialog — minor, defer unless quick fix

---

## Manual Test Checklist (v0.9.1)

### Pre-Test Setup

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
npm run build && npm start
```

---

### 1. Unified Sidebar Panel

- [x] **SP1 — Auto-show Messages.** Start orchestrator -> Messages section appears in sidebar. No orchestrator -> section hidden.
- [x] **SP2 — Auto-show Background Sessions.** Create session via MCP that isn't in grid -> Background Sessions section appears. All sessions in grid -> section hidden. ---
- [ ] 
- [ ] deutlicher grafische trennung wzischen den rbereich - jetzt ist alles nur schrazuauf weiß...
 [ja ] **SP3 — Auto-show Requests.** Start MPO -> Requests section appears (if requests exist). No MPO -> section hidden. --- mpo geht nur ihintegrund auf - backgroun d sessions fuktioniert
- [x] **SP4 — No toolbar buttons.** Chat toggle button and Input Requests button removed from toolbar/statusbar.
- [x] **SP5 — No input field.** Sidebar has no message input/textarea. Pure display.
- [x] **SP6 — Panel hidden when empty.** No orchestrator, no background sessions, no MPO -> sidebar not rendered, grid gets full width.

### 2. Background Session Cards

- [x] **BG1 — Card content.** Background session card shows: name (bold), project path, context bar (used/total), last 3 lines of output + "...".
- [ ] ok, aber darstellung nicht so doll screenshot 21:39/40
- [x] **BG2 — Click free slot.** Grid has empty slot -> click card -> session placed in free slot.
- [x] **BG3 — Click grid full.** Grid full -> click card -> popup with visual grid, user picks target slot.
- [ ] bakground too transparent - ein klassisches popop up wäre mir hier n lieben als immer gekilech ein overlay...
- [x] **BG4 — Card updates.** Session produces output -> card's "last response" updates live (or on reasonable interval).
- [x] **BG5 — Card disappears.** Background session placed in grid -> card removed from list.

### 3. Sidebar Detach

erbst theme nicht wen ausgeklinkgt -- -wenn, dassnn gestralte es doch ausgeklappt als holo-fenster- ähnlich dem info-fenster beim desktop....

- [x] **DT1 — Detach button.** Panel header has detach icon. Click -> sidebar becomes standalone window.
- [x] **DT2 — Main window reclaims space.** After detach, grid expands to full width.
- [x] **DT3 — Auto-close.** Detached window: all sections lose content -> window closes automatically.
- [ ] **DT4 — Persistence.** Detach -> restart app -> sidebar opens as detached window again.
- [x] **DT5 — Reattach.** Close detached window manually -> sidebar reattaches in main window.

### 4. Workspace Apply (End-to-End)

- [x] **WA1 — Grid resize.** Load workspace with 4x2 -> grid resizes to 4 cols, 2 rows.
- [x] **WA2 — Merges applied.** Workspace has merged cells -> grid shows rowSpans.
- [x] **WA3 — Sessions spawn.** Non-empty cells with projects -> sessions start in correct slots.
- [x] **WA4 — Prompts injected.** Session started by workspace apply has the resolved prompt (check via tmux capture-pane).
- [x] **WA5 — Empty cells stay empty.** Cells with persona=empty -> no session spawned.
- [ ] **WA6 — Missing project warning.** Cell with persona but no project -> warning shown, cell skipped.

### 5. Bugfixes

- [x] **E2-fix — Push delivery.** `mux_send(sessionName:"Worker-1", text:"hello")` -> `delivered:true`, text visible in tmux pane.
- [x] **E4-fix — Visible session.** `mux_create_session(name:"test", visible:true)` -> session appears in grid.
- [x] **S1-fix — Orchestrator toggle.** Start orchestrator -> close session (X button) -> button resets to inactive -> click again -> new orchestrator starts.
- [x] **S5-fix — Version.** StatusBar shows `v0.9.1-beta` (or current package.json version).

### 6. Personas

- [ ] **P-fix1 — No Worker built-in.** Personas tab: only Orchestrator, MPO, empty as built-ins. No Worker. - noch da
- [x] **P-fix2 — Built-in hint.** Orchestrator/MPO editor shows note: "uses own system template, prompt affects style only".
- [x] **P-fix3 — Legacy workspaces.** Workspace referencing deleted Worker persona -> handled gracefully (empty cell or warning).

### 7. Settings

- [x] **SET1 — Skip-permissions toggle.** Settings tab has "Skip Permission Prompts" toggle with warning text.
- [x] **SET2 — Toggle persists.** Enable -> restart -> still enabled.
- [x] **SET3 — Visual warning.** Toggle active -> orange/red visual indicator.

### 8. Workspace-Prompts UI

- [x] **WP-fix1 — Layout intact.** Workspace prompt override area: all elements within container bounds.
- [x] **WP-fix2 — Readable text.** No orange-on-light-background issues. Theme-appropriate colors.
- [x] **WP-fix3 — Load Default button.** Override textarea has "load default" that fills with persona's defaultPrompt.
- [x] **WP-fix4 — Pre-fill new override.** "+ add override" -> textarea starts with persona default, not empty.
### 9. Workspace Editor — Cell Split

- [x] **CS1 — Split handle visible.** Merged cell spanning full height -> orange split handle visible at bottom edge.
- [x] **CS2 — Split action.** Click split handle -> cell loses one row of span, bottom cell reappears.
- [x] **CS3 — Merge+split cycle.** Merge down -> split -> merge again -> split again. No stuck state.

### 10. Terminal Width with Sidebar

- [x] **TW1 — Full width when sidebar closed.** Sidebar hidden -> terminal fills entire window width.
- [x] **TW2 — Correct width with sidebar.** Sidebar open -> terminal content not clipped, window auto-sizes to fit both grid + sidebar.
- [x] **TW3 — Width after detach.** Detach sidebar -> grid reclaims full width, terminal columns match window.
- [x] **TW4 — Width on session add/remove.** With sidebar open: add session -> window resizes correctly including sidebar width. Remove session -> same.
- [x] **TW5 — Width on grid resize.** With sidebar open: change cols/rows -> window accounts for sidebar width.

### 11. Fix-Round Retests

- [x] **P-fix1r — No Worker.** Personas tab: Worker built-in no longer visible (config migration removes it).
- [x] **DT4r — Detach persistence.** Detach sidebar -> restart app -> sidebar auto-opens as detached window.

### 12. Automated machste selbe rne

- [ ] **T1 — Unit tests.** `npm run test` -> all pass.
- [ ] **T2 — Build clean.** `npm run build` -> no TS errors.
- [ ] **T3 — Lint clean.** `npm run lint` -> 0 errors.
