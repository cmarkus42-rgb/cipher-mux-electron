/**
 * Companion reference files deployer.
 *
 * Deploys all 4 reference files for the Companion entity.
 * Content sourced from Wissensbase-Note (2026-05-11) and code verification.
 */

import * as fs from 'fs';
import * as path from 'path';
import { REF_MCP_TOOLS } from './companion-mcp-ref.generated';

export function deployCompanionRef(projectPath: string): void {
  const refDir = path.join(projectPath, 'ref');

  const files: Array<{ name: string; content: string }> = [
    { name: 'features.md', content: REF_FEATURES },
    { name: 'mcp-tools.md', content: REF_MCP_TOOLS },
    { name: 'shortcuts.md', content: REF_SHORTCUTS },
    { name: 'slash-commands.md', content: REF_SLASH_COMMANDS },
  ];

  for (const file of files) {
    const filePath = path.join(refDir, file.name);
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

const REF_FEATURES = `# Feature Reference — cipher-mux

Complete catalog of all user-facing features. For how to use them, see the guides. This is for quick lookup.

---

## Grid & Sessions

**SessionGrid** — Main window area. Up to 7 columns × 3 rows = 21 cells. Each cell holds a session, a notes editor, or a launcher. Drag cells to swap positions.

**Leere Zelle** — Shows a \`+\` button. Click opens the Launcher-Popup.

**SessionCell** — One terminal pane running an agent CLI (Claude Code, Codex or opencode) in tmux. A badge "ohne Workspace" marks a session bound to no workspace. Header shows session name, entity color dot, context usage bar, and 9 control buttons.

**Session Header Buttons** (left to right on the right side):

| Icon | Function |
|------|----------|
| Scan | Focus Mode (Cmd+Shift+F) |
| ↓/↑ | Expand cell to full grid height / collapse |
| GitBranch | Fork session (parallel copy) |
| Camera | Screenshot — snapshot, path copied to the clipboard |
| ⇄ | Switch project |
| ↑ | Send to background |
| Terminal | Open shell in project directory |
| ExternalLink | Pop Out — session as separate window |
| ✕ | Close session |

**Entity Color Coding:**

| Entity | Color |
|--------|-------|
| Workshop | Blue |
| Cyber Factory | Purple |
| Local Cyber Factory | Dark Purple |
| Local Worker | Brown |
| Coding Companion | Orange |
| Refinement | Red |
| Launcher | Green |
| Voice | Violet |
| Audit | Dark Red |
| Ideation Partner | Teal |
| Debugger | Coral |
| Testing Assistant | Light Green |

**Launcher-Popup** — Opens via \`+\` in empty cell or Cmd+N. Three tabs:

- **Presets** — Entity list with color dots. Running presets show dot + "running" status and the workspace they run in. Non-singletons show \`+\` for multiple instances. Click to start or focus; ⤳ starts a preset in another workspace.
- **Path** — Project folder picker. Recent paths as quick-select. Fields: **Workspace** (default: none — the session is bound to no workspace) and **CLI** (default: the global Standard-CLI). Options: Shell Only, Skip Permissions, Resume, Fork (continue the folder's last conversation as a new branch). The launch line is built by the chosen CLI's adapter.
- **Notes** — Open or create a note in this cell.

**NotesCell** — CodeMirror 6 markdown editor. Tab bar for multiple notes. Auto-save (2s) + manual save (Cmd+S) with Ollama tag suggestions.

**Grid Controls** — Status bar buttons: spalten +/− (columns), zeilen +/− (rows). Min 1×1, max 7×3.

**Drag & Drop** — Sessions: drag header to swap. Sidebar sessions onto grid cells. Notes from sidebar onto cells (empty = open note, occupied = send content to session). Files from Finder onto session: shell-escaped paths inserted into terminal.

---

## Status Bar

Left to right:

**Voice Control — 3-State Radio:**

Three buttons: \`OFF\` / \`STT\` / \`COM\`

- **OFF** — Voice off
- **STT** — Speech-to-Text: mic → text into focused session
- **COM** — Conversation mode via Voice Relay

**LED** (dot next to buttons): off / green (ready) / red (recording) / yellow (processing)

**Session-Target** (STT only): shows target session with ◉ pin button. COM shows "Voice Relay".

| Element | Function |
|---------|----------|
| OFF / STT / COM | Select voice mode |
| LED | Voice status |
| Session-Target + ◉ | Target session + pin toggle (STT only) |
| spalten −/+ | Grid columns (1–7) |
| zeilen −/+ | Grid rows (1–3) |
| workspaces | Open Workspaces window |
| sidebar | Toggle sidebar |
| Theme name | Open theme editor |
| einstellungen | Open settings dialog |
| Version (right, clickable) | Check for updates |

---

## Focus Mode

**Activate:** Scan icon in session header or Cmd+Shift+F.

Session expands to 2×2. Floating Focus-Bar:
- **Session-Name** — **CTX XX%** — **Aa** (font size 8–36px) — **ESC**

**Exit:** ESC key, ESC button, or Scan icon again.

**Notes cells:** No CTX display. Detach button (own window) available.

---

## Pop-Out & Detachable Windows

**Session Pop-Out (ExternalLink):** Session opens as separate Electron window. Terminal continues. 28px drag region + Dock button (back to grid).

**Sidebar Detach (⧉):** Sidebar as separate window. ⇤ docks back.

---

## Sidebar

Toggle via \`sidebar\` in status bar. LED indicates when content is available. 5 collapsible sections:

### 1. Notes
Note browser with search and tag filter. Workspace-active → auto-filtered to that workspace (the tag carries the workspace **ID**, \`workspace:ws-…\`; the filter accepts name or ID). Notes without a workspace tag are visible everywhere.
- Single-click → details/preview
- Double-click → open in grid cell
- Drag → onto grid cell
- Bulk: delete (15s undo) or edit tags

### 2. Background Sessions
Sessions not in grid. Card shows name + context bar.
- Single-click → expand (path, context bar, terminal preview refreshing every 5s)
- Double-click → pull into grid
- Drag → onto target cell

### 3. Orphaned Sessions *(conditional)*
tmux sessions cipher-mux doesn't recognize. Per session: Adopt or Kill.

### 4. Companion Memory
Stored memories from past sessions. Collapsed by default. Searchable.

### 5. Messages
Message Bus feed — sender, time, text. The Message Bus is **deprecated**: it still exists, but \`mux_send\` is not how you give a session a prompt.

---

## Workspaces & Characters

**Workspaces Window** — Separate BrowserWindow. Access: status bar \`workspaces\` button. 4 tabs:

### Tab: Workspaces
Grid layout editor. Visual editor with merge handles (vertical cell spanning). Cell inspector: assign preset + project + custom prompt per cell.

**Workspace-level settings:** Workspace Prompt, Context Directories, Default Tags (\`klasse:wert\`), Notes Global toggle.

**What a session in a workspace learns** — every session bound to a workspace (folder session, workspace cell, role) gets a section \`## Workspace Prompt\` naming the workspace ("Du arbeitest im Workspace **KEEL**"), listing its **projects** (the cells' project paths, role directories excluded) and pointing to \`## Context Directories\`, followed by the workspace prompt if there is one. A folder session started with workspace "none" has these sections **removed**. The file is the one the CLI reads (see *Agent-CLIs*).

**Multi-Workspace:** Each session carries its own workspace. Presets run in several workspaces in parallel; \`singleInstance\` applies per workspace. Unbound sessions are visible from every workspace.

**Default-Workspace:** Star button → auto-loaded on app start.

### Tab: Companion
**Characters** (Personas) — control tone and style for all entity sessions. The active character block is injected into every session.

**6 built-in Characters:**

| Name | Character |
|------|-----------|
| Relay (default) | Calm, precise, science-journalist. No praise without verification. |
| Cipher | Positive cyberpunk, pragmatically loyal. Dry, efficient, dark humor. |
| Wayne | Pragmatic enthusiast. "We'll get this done" attitude, light nerd humor. |
| Der Kyniker | Maximum compression. Facts, code, error analysis only. Yes/No when possible. |
| Theaitetos | Guides through questions, not answers. Exposes gaps and confirmation bias. |
| Der Glitch | Breaks thought patterns. Unconventional metaphors, questions the premise. |

**Global Override:** Checkbox — this character overrides all preset-specific assignments.

Custom characters: Name + color + prompt text.

### Tab: Presets
Preset editor. Global Rules (always first entry) + all entity presets. Builtin presets are read-only — "Copy as Custom" creates editable copy. New custom preset via "+ New".

Per role, a **CLI** field selects the agent CLI (see *Agent-CLIs*) and a **Modell** field the model (free text with suggestions; empty = the CLI decides). "Default" follows the global setting. The choice applies at the next session start of that role.

### Tab: Tags
Tag management. Tag classes and predefined tags configurable.

---

## Entities (12 roles, 11 in the launcher)

| Entity | Role |
|--------|------|
| **Coding Companion** | Entry point, teaching, advice. Reads user-profile.json, adapts to skill level. The only role with Companion Memory. |
| **Voice** (voice-relay) | Companion for pure voice interaction. Same persona, optimized for speech. |
| **Workshop** | Coordinates small jobs, maintenance, bugreport triage — hands work to the right session, writes no production code. |
| **Cyber Factory** | Large structured projects. Architect phase → wave plan → parallel workers → testing handoff. |
| **Local Cyber Factory** | Claude slices, a local model codes. Writes an acceptance test per work item and dispatches it (\`mux_local_worker_dispatch\`); writes no production code. |
| **Local Worker** | opencode against a local OpenAI-compatible model (\`agent.localWorker\`). Started by the runner, one fresh session per attempt. Default CLI: opencode. |
| **Refinement** | Requirements package → gap analysis → detail spec with REQ-IDs → CF handoff. |
| **Ideation Partner** | Raw ideas → research → focus → requirements package → Refinement handoff. |
| **Testing Assistant** | Execute testcases, adversarial probing, security checks, findings report → Debugger. |
| **Debugger** | Findings → root cause → fix plan → hands the fix to Cyber Factory (or back to Testing). Diagnoses, does not edit \`src/\`. |
| **Audit** | Code review, security, ADR consistency. Loop until clean. Release recommendation. |
| **Launcher** | Project kickoff workflow (internal, not in the preset list). |

**Lifecycle:** Ideation → Refinement → Cyber Factory → Testing → Debugger. Workshop coordinates, Audit runs parallel.

**Role boundaries** are enforced, not just written in the prompt: a hook (Claude Code, Codex) or plugin (opencode) refuses file edits the role must not make, and the model sees the reason. Workshop, Testing Assistant, Refinement, Ideation Partner, Audit and Debugger may not edit \`/src/\`; Local Cyber Factory not \`/src/\` or \`/lib/\`; Local Worker not its \`AUFTRAG.md\` or the protected tests. Cyber Factory, Companion and Voice are unrestricted. The shell is not covered — a boundary is a guardrail against mistakes, not a sandbox.

**Local Cyber Factory — what it needs:** \`agent.localWorker\` (base URL, model, context, output limit) and \`agent.skipPermissions\` on — otherwise the Mux refuses with exactly that reason. A runner without a model checks that the acceptance test is red, gates the result (test command, checksum and git diff of the protected tests), commits green or saves red as a patch and resets. At most two attempts per item, then it escalates to you.

---

## Agent-CLIs (3)

Which command-line AI runs in a cell. Independent of the entity: the entity is the role, the CLI is the executable.

| CLI | Id | Tier | Measured against |
|---|---|---|---|
| Claude Code | \`claude-code\` | Tier 1 | default |
| Codex CLI | \`codex\` | Tier 2 | codex-cli 0.155.1 (2026-10-01) |
| opencode | \`opencode\` | Tier 2 | opencode 1.18.34 (2026-10-01) |

**Tier 1** — every Mux capability measured. **Tier 2** — not every capability measured. \`false\` in an adapter means "unproven", not "absent".

**Capability gaps:**

| CLI | Not measured | Also missing |
|---|---|---|
| Claude Code | — | — |
| Codex CLI | Sub-Agents | — |
| opencode | Sub-Agents | needs a signed-in provider, otherwise it sits at its prompt and does nothing |

Codex and opencode have no status line of their own — a hook (Codex) or a plugin (opencode) writes the format the existing monitor reads. The context bar looks the same to the user. Role boundaries work under all three: PreToolUse hook for Claude Code and Codex, a plugin for opencode.

**Selecting a CLI:**

| Scope | Where |
|---|---|
| Per role | Workspaces window → Tab Presets → role → field **CLI**. |
| Per folder session | Launcher → Path → field **CLI**. |
| Global | \`einstellungen\` → general → **Standard-CLI**. Default for both of the above. |

**Resolution order:** \`app.entityAdapters\` (per role) > role default (only Local Worker has one: opencode) > \`agent.defaultAdapter\` (initial value: \`claude-code\`). Takes effect at the next session start of that role. \`mux_create_session\` always starts Claude Code.

**Project instructions per CLI:**

The Mux writes Global Rules and the workspace sections into the file the CLI actually reads:

| CLI | File |
|---|---|
| Claude Code | \`CLAUDE.md\` |
| Codex CLI | \`AGENTS.md\` — created if missing, with a pointer to an existing \`CLAUDE.md\` |
| opencode | \`AGENTS.md\` if the project has one, otherwise \`CLAUDE.md\`. Measured: with an \`AGENTS.md\` present, opencode does **not** read \`CLAUDE.md\` at all. |

**Codex directory trust:** Codex loads project-local config, hooks and exec policies only from a trusted directory, and otherwise asks in a blocking dialog — a later "Yes" does not load them. The Mux therefore registers the role's run directory in \`~/.codex/config.toml\`, and only that directory. Switch: \`agent.codexTrustRunDirs\` (initial value: on).

**Config file:** \`~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json\`. A second file \`~/.config/cipher-mux/config.json\` exists and is **not** read by the Mux.

---

## Themes (13)

CSS custom property-based. Applied via \`body[data-theme="id"]\`. Theme editor accessible via theme name in status bar.

*Cipher Defaults:*
| ID | Name | Character |
|---|---|---|
| cipher-ivory | Cipher Ivory | Clean light, default light mode |
| cipher-dark | Cipher Dark | Warm dark, default dark mode |

*Coder Classics:*
| ID | Name | Character |
|---|---|---|
| blueprint | Blueprint | Engineer draft, cyan + indigo |
| warm-paper | Warm Paper | Minimal sepia |
| gruvbox-dark | Gruvbox Dark | Warm retro coder classic |
| nord | Nord | Cool Scandinavian frost |
| synthwave | Synthwave | 80s magenta + violet |
| matrix | Matrix | Phosphor green on black |

*Style:*
| ID | Name | Character |
|---|---|---|
| brutalist | Brutalist | Black/white + signal red |

*Accessibility:*
| ID | Name | Character |
|---|---|---|
| high-contrast | High Contrast | WCAG AAA accessible |
| cvd-deuteranopia | CVD: Deuteranopia | Red-green, Okabe-Ito palette |
| cvd-tritanopia | CVD: Tritanopia | Blue-yellow, magenta/green |
| cvd-achromatopsia | CVD: Achromatopsia | Full color blindness, greyscale |

Theme editor: token groups, terminal font/size/line-height, preview/revert/save/save-as/reset/export.

---

## Voice / TTS

**3 Voice Modes:** OFF / STT / COM

**STT:** Whisper.cpp via \`@fugood/whisper.node\`. Model: \`~/.config/cipher-mux/models/whisper/ggml-small.bin\`. Runs locally, no network.

**VAD:** Silero ONNX in browser. Detects speech start/end automatically.

**Voice Commands:** "abschicken"/"absenden"/"senden" = Enter. "neue zeile" = newline. "hoch"/"runter" = scroll. "ganz hoch"/"ganz runter" = top/bottom. "zum marker" = last answer. "grid hoch/runter/links/rechts" = grid navigation. "kopieren" = copy selection. "einfügen" = paste clipboard.

**Voice Pin:** ◉ button pins voice to a specific session.

**COM Mode:** Connects to Voice Relay — full session optimized for speech. TTS as primary output channel.

**TTS Configuration** (einstellungen → Sprache):
- TTS on/off, Engine (Piper local / macOS), Verbosity (Minimal / All Relevant)
- Installed Voices: set active, preview, delete
- Voice Catalog: browse and download Piper voices, filter by language/quality

**Barge-In:** Speaking while TTS is active interrupts playback.

**BT Shutter:** Bluetooth remote control. Auto mode (= submit) or Manual mode (= start/stop recording).

---

## Notes Editor

**NoteManager** — Filesystem CRUD. Global: \`~/.config/cipher-mux/notes/\`. Workspace-scoped: \`~/.config/cipher-mux/notes/workspace-<id>/\`.

**Format** — Markdown with YAML frontmatter (gray-matter). Fields: title, tags.

**Editor** — CodeMirror 6 with live markdown rendering. Headings, bold, italic, links, code blocks, blockquotes.

**Auto-Save** — 2-second debounce. Writes file, no tagging.

**Manual Save (Cmd+S)** — Writes file AND triggers Ollama auto-tagging. Model: gemma4:26b. Suggests up to 5 tags.

**Tags** — Format: \`klasse:wert\`, an axis model, not free text. You choose \`kind\` (14 values), \`phase\` (7), \`status\` (6), \`severity\` (low/mid/hi/now, editable) and \`component\` (editable); the Mux sets \`workspace\` (the ID) and \`entity\` from the connection. Exclusive: kind, status, severity, entity. An unknown tag makes \`mux_notes_create\` fail.

**Delete** — Via tab bar trash icon or sidebar hover-reveal button. Both show confirmation dialog.

**Testcase Notes** — Special \`noteType: testcase\` with tri-state checkboxes (open/pass/fail), comments, screenshots. A testcase is the **manual** acceptance: entries are created open, and whoever creates them does not tick them. What a test run finds is a \`finding\`, not a testcase.

**Typed notes & mirroring** — Notes can carry a \`noteType\` (testcase, finding, spec, requirements, research) with their own views. \`mux_mirror_sync\` mirrors a file from git as a typed note and shows drift instead of pretending the copy is authoritative.

**Handoffs** — A handoff note carries an anchor commit; \`mux_notes_handoff_dispatch\` computes the world state (commits and diff since the anchor) at delivery and sends it with the note into the target session.

---

## Bugreport Dialog

Open: Cmd+B or button in einstellungen → General.

**Workflow:**
1. Type: Bug / Feature Request toggle
2. Description textarea — dictation (STT) is the intended input
3. Screenshot: optional; stored as a file next to the report
4. Submit. On the way, the dictation is cleaned up into a structured report (title, severity, tags, steps) by the LLM gateway — the original dictation stays verbatim underneath. If the gateway fails, the report goes out raw. No preview step.
5. Result: a report in the outbox with pane snapshot and anchor commit, a GitHub issue if configured, and a note mirroring it.

---

## Recovery Dialog

Appears on startup when sessions exist. **Two phases:**

**Phase 1 — Restore:** List of saved sessions. "Ja" restores previous grid layout. "Nein" discards.

**Phase 2 — Orphans:** Unknown tmux sessions (checkbox list). Actions: Confirm (adopt selected), Kill All, Ignore All.

---

## Settings (einstellungen)

7 tabs: General, Sprache, Themes, Shortcuts, Remote, A11y, About.

### General
- Skip Permissions — \`--dangerously-skip-permissions\` for all new sessions
- **Standard-CLI** — which CLI new sessions launch when the role names none. Tier-2 picks are marked "— Tier 2" in the dropdown.
- Keep Working — save sessions on quit (recovery on next start)
- Bugreport button

### Sprache
- Language: Deutsch / English
- Voice/TTS: TTS on/off, Engine, Verbosity, Voice Commands on/off, Submit Mode (auto/manual), BT Shutter on/off
- Installed Voices, Voice Catalog

### Themes
13 built-in + custom themes. Theme editor with token groups, terminal font/size/line-height.

### Shortcuts
Keyboard shortcuts by category.

### Remote
Bluetooth remotes: connected devices, device profiles, mapping of buttons to actions.

### A11y
Accessibility settings. Connects with CVD themes.

### About
Version, links (cipher-mux.dev, Docs, GitHub), credits.

---

## Limitations

- **macOS only** — tmux dependency (Homebrew)
- **Max 21 sessions** — 7×3 grid limit
- **Context warning** — orange at 80%+ usage, red at 90%+
- **Message retention** — 7 days, auto-cleanup every 6 hours
- **Whisper model** — must be at \`~/.config/cipher-mux/models/whisper/ggml-small.bin\`
- **better-sqlite3 ABI** — separate rebuilds for test (Node.js) vs app (Electron)
- **Preact, not React** — ~3KB, React-compatible API, some ecosystem libs need aliasing
`;

// ref/mcp-tools.md ist docs/mcp-tools.md — generiert, nicht abgeschrieben.
// Die eigene Abschrift hier kannte 35 von 68 Werkzeugen. Siehe
// scripts/gen-companion-mcp-ref.mjs und test/main/companion-mcp-ref.test.ts.

const REF_SHORTCUTS = `# Keyboard Shortcuts & UI Actions

Quick reference for all input methods in cipher-mux.

---

## Keyboard Shortcuts

Read off the registrations in \`app.tsx\` (2026-10-01). Two rows here were wrong before that:
\`Cmd+1–5\` for grid navigation does not exist, and \`Ctrl+Shift+Space\` does not toggle voice.

| Shortcut | Action | Context |
|---|---|---|
| Cmd+N | Launcher popup in the first empty cell | Global |
| Cmd+B | Open bugreport dialog | Global |
| Cmd+Shift+F | Focus Mode on / off | Global, needs a focused session |
| Cmd+Shift+W / A / S / D | Move focus up / left / down / right | Global |
| Cmd+Shift+? | Show the shortcut list | Global |
| Cmd+S | Save note + trigger auto-tagging | Notes editor |
| Cmd+C | Copy selected text / cancel running process | Terminal |
| Cmd+V | Paste from clipboard | Terminal |
| Escape | Exit Focus Mode, close active dialog | Global |
| Ctrl+Shift+Space | **Push-to-talk** — hold to speak | Only while voice is active (STT or COM) |
| Cmd+Alt+I | DevTools | Global |

**\`Ctrl+Shift+Space\` does not switch voice on.** The handler returns early when voice is
inactive (\`useVoiceSession.ts\`, \`if (!active) return\`). Voice is switched with the voice pill
in the status bar. If a user says "the hotkey does nothing", that is the first thing to check.

---

## Status Bar Actions (Click)

| Button | Action |
|---|---|
| OFF / STT / COM | Select voice mode |
| spalten + | Add grid column (max 7) |
| spalten − | Remove grid column (min 1) |
| zeilen + | Add grid row (max 3) |
| zeilen − | Remove grid row (min 1) |
| workspaces | Open Workspaces window |
| sidebar | Show or hide sidebar panel |
| Theme name | Open theme editor |
| einstellungen | Open settings dialog |

---

## Cell Header Actions (Click)

| Button | Action |
|---|---|
| Scan | Toggle Focus Mode |
| ↥ / ↧ | Expand / collapse cell height (2+ rows only) |
| GitBranch | Fork session |
| Camera | Screenshot |
| ⇄ | Open Project Popup to switch project |
| ↑ | Send session to background |
| \\\$ | Open plain shell in session's project directory |
| ExternalLink | Pop Out as separate window |
| ✕ | Close session and free the cell |
| Drag header | Swap cell position with another cell |

---

## Sidebar Actions

| Action | How |
|---|---|
| Detach sidebar | Click ⧉ at sidebar top |
| Open note in grid | Double-click note in Notes section |
| Delete note | Hover note → click 🗑 (or bulk select) |
| Filter by tag | Click tag chip in Notes section |
| Pull background session to grid | Double-click session card in Background section |
| Adopt orphaned session | Click "Adoptieren" in Orphaned section |

---

## Notes Editor Actions

| Action | How |
|---|---|
| Create note | Click + in tab bar |
| Close note tab | Click × on tab |
| Delete note | Click 🗑 in tab bar (with confirm) |
| Save + auto-tag | Cmd+S |
| Auto-save (no tags) | Automatic after 2s inactivity |

---

## Voice Commands (while recording)

| Say this | Does this |
|---|---|
| "abschicken" / "absenden" / "senden" | Press Enter (submit) |
| "neue zeile" | Insert newline |
| "hoch" / "runter" | Scroll one page up/down |
| "ganz hoch" / "ganz runter" | Scroll to top/bottom |
| "zum marker" | Scroll to last answer |
| "grid hoch/runter/links/rechts" | Move grid focus |
| "kopieren" | Copy current selection |
| "einfügen" | Paste clipboard into focused session |
| (any other speech) | Transcribed as text, inserted without Enter |
`;

const REF_SLASH_COMMANDS = `# Slash Commands — Claude Code

Schnellreferenz fuer alle \`/\`-Befehle in Claude Code. Diese funktionieren in jeder Claude-Code-Session (auch innerhalb von cipher-mux).

**Geltungsbereich:** Diese Liste gilt fuer **Claude Code**. Eine Zelle kann auch mit Codex CLI oder opencode laufen (siehe \`ref/features.md\`, Abschnitt *Agent-CLIs*) — welche Slash-Befehle dort existieren, ist nicht geprueft. Nicht aus dieser Liste auf die anderen CLIs schliessen.

---

## Session & Navigation

| Befehl | Was es tut |
|---|---|
| \`/help\` | Hilfe und Tastenkuerzel anzeigen |
| \`/status\` | Aktuellen Session-Status anzeigen (Modell, Kontext, Permissions) |
| \`/compact\` | Konversation komprimieren — reduziert Token-Verbrauch, behält Kernkontext. Optional mit Custom-Prompt: \`/compact focus on the API changes\` |
| \`/clear\` | Konversation komplett leeren (Neustart ohne Session zu beenden) |
| \`/resume\` | Letzte Konversation dieser Session fortsetzen |

---

## Konfiguration

| Befehl | Was es tut |
|---|---|
| \`/config\` | Einstellungen anzeigen und aendern (Theme, Modell, etc.) |
| \`/model\` | Aktives Modell wechseln (z.B. auf Sonnet, Haiku) |
| \`/permissions\` | Aktuelle Tool-Permissions anzeigen und verwalten |
| \`/allowed-tools\` | Liste aller aktuell erlaubten Tools |
| \`/fast\` | Zwischen Standard- und Fast-Modus umschalten (gleiches Modell, schnellerer Output) |

---

## Arbeiten mit Code

| Befehl | Was es tut |
|---|---|
| \`/commit\` | Aenderungen committen — Claude analysiert Diff und schlaegt Commit-Message vor |
| \`/pr\` | Pull Request erstellen — analysiert Branch-Diff, erstellt Titel + Beschreibung |
| \`/review\` | Code-Review des aktuellen Diffs oder einer PR |
| \`/init\` | CLAUDE.md im aktuellen Projekt initialisieren |

---

## Kontext & Memory

| Befehl | Was es tut |
|---|---|
| \`/memory\` | Projekt-Memory anzeigen und verwalten (CLAUDE.md-basiert) |
| \`/cost\` | Token-Verbrauch und Kosten der aktuellen Session anzeigen |
| \`/context\` | Kontextfenster-Auslastung anzeigen |

---

## Erweitert

| Befehl | Was es tut |
|---|---|
| \`/bug\` | Bug-Report an Anthropic senden |
| \`/doctor\` | Claude Code Installation pruefen (Abhaengigkeiten, Konfiguration) |
| \`/login\` | Authentifizierung erneuern |
| \`/logout\` | Session abmelden |

---

## Tipps

- **\`/compact\` ist dein bester Freund** bei langen Sessions. Wenn der Kontext voll wird, komprimiert es die Konversation und du kannst weiterarbeiten statt neu zu starten.
- **\`/cost\`** hilft beim Ueberblick — besonders wenn mehrere Sessions parallel laufen.
- **\`!\`-Prefix** ist kein Slash-Command, aber wichtig: \`! git status\` fuehrt den Befehl direkt in der Shell aus, ohne dass Claude ihn interpretiert.
- **Custom Slash Commands** kannst du in \`.claude/commands/\` als Markdown-Dateien anlegen. Der Dateiname wird zum Befehl: \`.claude/commands/deploy.md\` → \`/deploy\`.
`;
