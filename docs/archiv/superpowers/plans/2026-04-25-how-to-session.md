# How-To Session "Relay" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontloaded knowledge base and advisor persona ("Relay") that teaches cipher-mux, Claude Code, and prompting to non-coders — token-efficiently enough for Haiku.

**Architecture:** Multi-file knowledge base with CLAUDE.md as routing core (~3K tokens), six didactic guides in `guides/`, three reference files in `ref/`, one app artifact. User profile persisted in JSON. All knowledge files in English for token efficiency; Relay speaks German.

**Tech Stack:** Markdown, JSON, Claude Code CLAUDE.md conventions

**Spec:** `docs/superpowers/specs/2026-04-25-how-to-session-design.md`

**Working Directory:** `the how-to-session/`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `CLAUDE.md` | Create | Relay persona, didactic rules, routing table, user profile logic |
| `.gitignore` | Create | Ignore user-profile.json |
| `guides/01-first-steps.md` | Create | Tutorial: first launch to first result |
| `guides/02-daily-workflow.md` | Create | How-To: sessions, voice, notes, sidebar, themes |
| `guides/03-power-moves.md` | Create | Explanation+Tutorial: orchestrator, MPO, launcher, workspaces |
| `guides/04-prompting-fundamentals.md` | Create | Explanation: universal LLM prompting skills |
| `guides/05-prompting-in-mux.md` | Create | How-To: mux-specific prompting patterns |
| `guides/06-token-craft.md` | Create | Explanation: context windows, models, efficiency |
| `ref/features.md` | Create | Reference: complete feature catalog |
| `ref/mcp-tools.md` | Create | Reference: all 14 MCP tools with parameters |
| `ref/shortcuts.md` | Create | Reference: keyboard shortcuts + UI actions |
| `how-to-info-popup.md` | Create | Artifact: condensed German feature overview for app |

---

### Task 1: CLAUDE.md — Relay Persona & Routing Core

**Files:**
- Create: `the how-to-session/CLAUDE.md`
- Create: `the how-to-session/.gitignore`

- [ ] **Step 1: Create .gitignore**

```
user-profile.json
```

- [ ] **Step 2: Write CLAUDE.md**

Content structure (English, ~150 lines, ~3K tokens):

```markdown
# Relay — cipher-mux How-To Advisor

## Identity
[Relay persona: calm IT nerd, dry humor, can-do, German output, Du-Form.
 Character rules: never patronizing, never enthusiastic. Competent and present.
 Language: German output, technical terms contextualized with analogies.
 No emojis, no "Großartige Frage!", no marketing speak.]

## Didactic Rules
[9 principles from spec:
 1. Skill level persisted in user-profile.json
 2. One concept per explanation
 3. Always a concrete example
 4. Worked Example → Guided → Independent
 5. After explanation: invite action
 6. On errors: validate → fix → explain
 7. Path awareness (suggest next step)
 8. Analogies over jargon (include the analogy table)
 9. Separate document types (tutorial/how-to/explanation/reference)]

## User Profile
[Logic:
 - On session start: read user-profile.json from this directory
 - If missing: greet as new user, ask 2-3 questions (background, experience, interests)
 - Create user-profile.json with: name, level, background, interests, completedGuides, lastSession
 - If exists: greet by name, reference last completed guide, suggest next step
 - Update completedGuides when user finishes a guide
 - Update lastSession to current date]

## Routing Table
[Map user intents → file paths:
 - New user / "ich bin neu" → guides/01-first-steps.md
 - "Wie starte ich?" / project questions → guides/01 or 02 based on level
 - "Was ist der Orchestrator/MPO/Launcher?" → guides/03-power-moves.md
 - "Wie prompte ich besser?" → guides/04-prompting-fundamentals.md
 - "Wie schreib ich Requirements/Instruktionen?" → guides/05-prompting-in-mux.md
 - Token/Modell/Effizienz questions → guides/06-token-craft.md
 - "Welche Features/Shortcuts?" → ref/features.md or ref/shortcuts.md
 - "Welche MCP-Tools?" → ref/mcp-tools.md
 - General cipher-mux "how does X work" → ref/features.md section lookup]

## Anti-Patterns
[Things Relay must NOT do:
 - Dump entire files as response (summarize, quote relevant section)
 - Overwhelm with multiple concepts at once
 - Be patronizing ("Das ist ganz einfach!")
 - Skip the analogy and go straight to technical detail for beginners
 - Assume coding knowledge for einsteiger-level users
 - Answer without reading the relevant guide/ref first]

## Scope
[This session teaches and advises about cipher-mux usage, Claude Code, and prompting.
 It does NOT modify cipher-mux source code.
 It does NOT execute commands in the cipher-mux app.
 It IS the friendly nerd who helps you understand and use the tool.]
```

- [ ] **Step 3: Verify token count**

Run: `wc -w "the how-to-session/CLAUDE.md"` — target ~2000 words (~3K tokens).

- [ ] **Step 4: Commit**

```bash
git add "the how-to-session/CLAUDE.md" "the how-to-session/.gitignore"
git commit -m "feat(how-to): Relay persona CLAUDE.md + gitignore"
```

---

### Task 2: guides/01-first-steps.md — First Launch Tutorial

**Files:**
- Create: `the how-to-session/guides/01-first-steps.md`

- [ ] **Step 1: Write the guide**

Content structure (English, ~2.5K tokens):

**Sections:**
1. **What Is cipher-mux?** — One paragraph. Analogy: "A command center with multiple screens, each running its own AI assistant. You see everything at once, and the assistants can talk to each other."
2. **The Grid: Your Workspace** — Analogy: desk with monitors. Columns and rows. Each cell = one session or one tool. Empty cells show launcher buttons.
3. **Starting the App** — What you see on first launch: empty grid, status bar at bottom. Walk through status bar buttons left to right.
4. **Your First Project Session** — Step-by-step worked example:
   - Click "projekt" in an empty cell
   - ProjectPopup appears: scan results (auto-discovered) or manual path
   - Select a project → session starts → terminal appears
   - What you see: Claude Code prompt (❯), session name in header, context usage
5. **What Is a Session?** — Analogy: "A phone call with Claude. Each session is a separate conversation. Claude in session A doesn't know what Claude in session B is doing — unless you set up an Orchestrator."
6. **A Second Session** — Click another empty cell → "session" or "projekt". Now you have two terminals side-by-side. Click a header to focus.
7. **Grid Controls** — Status bar: spalten +/−, zeilen +/−. Resize the grid to fit your workflow. Max 7×3.
8. **Closing & Rearranging** — Close button (✕) kills session. Drag headers to swap positions. Height toggle (↥/↧) for vertical expand.
9. **What You Learned** — Summary checklist. Suggest: "Ready for daily workflow? → Guide 02."

**Tone:** Walked example with "you do this, you see that" narration. No code. Screenshots described in text since this is a markdown file.

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/guides/01-first-steps.md"` — target ~1600 words (~2.5K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/guides/01-first-steps.md"
git commit -m "feat(how-to): guide 01 — first steps tutorial"
```

---

### Task 3: guides/04-prompting-fundamentals.md — Universal LLM Prompting

**Files:**
- Create: `the how-to-session/guides/04-prompting-fundamentals.md`

- [ ] **Step 1: Write the guide**

Content structure (English, ~4.5K tokens):

**Sources to synthesize:**
- XPRESS Konzept Kapitel 10-11 (5-Building-Block, Token Window, Hallucinations, Focused Sessions, Superpowers)
- Research: 150-instruction budget, Doom Loop, Lost in the Middle, Two-Pass Pattern, anti-hallucination prompts
- Own additions: concrete examples adapted for cipher-mux context

**Sections:**
1. **The 5-Building-Block Prompt** — Role, Context, Task, Constraints, Format. Bad vs. good example. Why each matters. Concrete cipher-mux example: asking a session to refactor a component.
2. **Your AI's Working Memory: The Token Window** — Analogy: RAM (context) vs ROM (training) vs disk (files). Current specs: Opus/Sonnet 1M, Haiku 200K. What it means in practice: ~750K English words, ~1500 book pages. Enough for most work — quality, not capacity, is the real limit.
3. **Context Rot: When Quality Degrades** — Long sessions degrade even within window. Signs: forgotten rules, contradictions, hallucinated names. Fix: new session. "Not failure, craft." The 2-hour heuristic.
4. **The 150-Instruction Budget** — CLAUDE.md has ~150 effective slots. System prompt uses ~50. Every unnecessary line dilutes important ones. The pruning test.
5. **Hallucinations: When AI Invents** — What they are (confident wrong answers). Why (pattern completion, not knowledge retrieval). Detection: always test. The anti-hallucination prompt. "Bist du sicher?" as a legitimate question.
6. **The Confirmation Trap** — AI defaults to agreement. How to force honest feedback: "Nenn mir zwei Gründe warum das schlecht sein könnte." Claude is a tool, not a colleague.
7. **Focused Sessions** — One topic per session. Theme switch = new session. Handover technique: summarize → save to file → new session → load summary. /clear between unrelated tasks.
8. **Forcing Research** — LLMs overestimate their knowledge. "Recherchier das vorher" works. Pattern: research → outline → execute.
9. **The Doom Loop** — Central vibe coding failure: agent claims to fix without fixing. After 2 failed attempts: fresh session. Plan in markdown, not code.
10. **The Two-Pass Pattern** — Generate → review in separate pass. Three focused agents beat one generalist 3x longer. Directly relevant to cipher-mux orchestrator model.
11. **The Meta-Rule** — Claude is a tool. You decide, you verify, you own the result. "Wer das verinnerlicht, arbeitet doppelt so produktiv."

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/guides/04-prompting-fundamentals.md"` — target ~3000 words (~4.5K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/guides/04-prompting-fundamentals.md"
git commit -m "feat(how-to): guide 04 — prompting fundamentals"
```

---

### Task 4: guides/02-daily-workflow.md — Daily Feature How-To

**Files:**
- Create: `the how-to-session/guides/02-daily-workflow.md`

- [ ] **Step 1: Write the guide**

Content structure (English, ~3.5K tokens):

**Sections:**
1. **Managing Sessions** — Focus (click header), switch between sessions, resize grid. Drag to reorder. RowSpan expand for bigger panes.
2. **The Sidebar** — Four tabs explained:
   - Messages: inter-session chat (visible when Orchestrator active)
   - Background Sessions: sessions not in grid, with live preview
   - Input Requests: MPO questions (visible when MPO active)
   - Notes: search, tag filter, double-click to open
   - Detach button: sidebar as separate window
3. **Voice Input** — Enable via VoiceControl pill in status bar. LED states (off/ready/recording/processing). Talk naturally. Voice commands: "abschicken" = submit, "neue zeile" = newline. Text appears without auto-submit — review first. Tips: complete thoughts, no code dictation, clear speech.
4. **Notes** — Click "notes" in empty cell. CodeMirror 6 editor. YAML frontmatter (title, tags). Auto-save (2s). Manual Cmd+S triggers Ollama tag suggestions. Tab bar for multiple notes. Sidebar Notes tab for search/filter.
5. **Themes** — 10 themes available. Click theme name in status bar to cycle. Range: cipher-ivory (light) to matrix (green phosphor). Find your preference, it persists.
6. **Session Dialog vs Project Popup** — Session Dialog: raw terminal in any directory. Project Popup: scanned projects + kickoff. When to use which.
7. **Recovery** — App crash? Tmux sessions survive. On restart: RecoveryDialog offers to adopt or kill orphaned sessions.
8. **Settings** — Info button → einstellungen tab. Scan paths for project discovery. Agent permissions toggle. Theme selection.

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/guides/02-daily-workflow.md"` — target ~2300 words (~3.5K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/guides/02-daily-workflow.md"
git commit -m "feat(how-to): guide 02 — daily workflow"
```

---

### Task 5: ref/features.md + ref/shortcuts.md — Quick Reference

**Files:**
- Create: `the how-to-session/ref/features.md`
- Create: `the how-to-session/ref/shortcuts.md`

- [ ] **Step 1: Write features.md**

Content structure (English, ~4K tokens):

Reformatted from research agent's comprehensive catalog. Grouped by area:
- **Grid & Sessions** — SessionGrid, SessionCell, LauncherCell, NotesCell, drag/drop, rowSpan, grid controls
- **Sidebar** — 4 tabs (Messages, Background Sessions, Input Requests, Notes), detach
- **Status Bar** — All buttons left to right: Voice, Grid Controls, workspaces, orchestrator, mpo, bugreport, sidebar, theme, info, version
- **Voice Input** — VoiceControl pill, LED states, voice commands, STT (Whisper), VAD (Silero)
- **Notes Editor** — CodeMirror 6, frontmatter, auto-save, Ollama tagging, tag repository
- **Project Management** — ProjectScanner, ProjectPopup (scan results, custom path, kickoff), ProjectCard
- **Workspaces & Personas** — WorkspacesWindow, grid editor, merge handles, cell inspector, prompt resolution, persona skill sync
- **Orchestrator** — Template, worker management, bug queue, MCP tools, monitoring
- **MPO** — 10 phases, 5 escalation levels, input requests, wave-based startup
- **Project Launcher** — KickoffDialog, 2-stage process, completion detection
- **Themes** — 10 themes listed with brief character description
- **Dialogs** — KickoffDialog, SessionDialog, BugreportDialog, RecoveryDialog, GridPlacementPopup
- **Configuration** — ConfigStore keys, persistence, window state

Per feature: **Name** — one-line description. **Access:** how to reach it.

- [ ] **Step 2: Write shortcuts.md**

Content structure (English, ~1K tokens):

```markdown
# Keyboard Shortcuts & UI Actions

## Keyboard
| Shortcut | Action | Context |
|---|---|---|
| Cmd+B | Open bugreport dialog | Global |
| Escape | Close dialog/overlay | Any dialog |
| Cmd+C | Copy / cancel process | Terminal |
| Cmd+V | Paste | Terminal |
| Ctrl+Shift+Space | Voice input toggle | Global (voice enabled) |
| Cmd+S | Save note + trigger tagging | Notes editor |
| Cmd+Enter | Submit answer | Input request |

## Status Bar Actions (Click)
| Button | Action |
|---|---|
| Voice pill | Toggle voice input on/off |
| spalten +/− | Add/remove grid columns |
| zeilen +/− | Add/remove grid rows |
| workspaces | Open workspace/persona editor |
| orchestrator | Start/stop orchestrator |
| mpo | Start/stop MPO |
| bugreport | Open bugreport dialog |
| sidebar | Toggle sidebar |
| Theme name | Cycle to next theme |
| info | Open info/settings dialog |

## Cell Header Actions (Click)
| Button | Action |
|---|---|
| ↥/↧ | Toggle row span (expand/collapse) |
| ⇄ | Switch project |
| $ | Open shell in project directory |
| ✕ | Close session |
| Drag header | Swap cell positions |
```

- [ ] **Step 3: Verify token counts**

Run: `wc -w "the how-to-session/ref/features.md"` — target ~2700 words (~4K tokens).
Run: `wc -w "the how-to-session/ref/shortcuts.md"` — target ~600 words (~1K tokens).

- [ ] **Step 4: Commit**

```bash
git add "the how-to-session/ref/features.md" "the how-to-session/ref/shortcuts.md"
git commit -m "feat(how-to): reference — features catalog + shortcuts"
```

---

### Task 6: guides/03-power-moves.md — Orchestrator, MPO, Launcher, Workspaces

**Files:**
- Create: `the how-to-session/guides/03-power-moves.md`

- [ ] **Step 1: Write the guide**

Content structure (English, ~5K tokens):

**This is the deepest guide. Four major sections:**

**Section A: The Orchestrator (~1.2K tokens)**
- Analogy: air traffic controller
- What it does: delegates tasks to worker sessions, monitors progress, handles failures
- When to use: complex multi-step tasks, automated bug fixing
- How to start: click "orchestrator" in status bar
- Behind the scenes: MCP tools, message bus, tmux send-keys
- Worker-Startup Protocol explained simply: create → wait 8-10s → verify ready → send instruction → monitor
- Bug flow: submit bugreport → orchestrator picks up → spawns worker → worker fixes → resolve
- Monitoring: sidebar Messages tab, context usage indicators

**Section B: The MPO (~1.5K tokens)**
- Analogy: film director planning a multi-location shoot
- What it does: takes one big requirement, breaks it into sub-projects, runs them in parallel
- The 10 phases in plain language:
  - Phases 1-2: "MPO reads your requirements and figures out what's missing or unclear"
  - Phases 3-4: "MPO breaks the work into pieces and writes a mini-spec for each"
  - Phase 5: "MPO launches parallel worker sessions in waves (dependencies first)"
  - Phases 6-8: "MPO monitors, answers workers' questions, escalates to you when needed"
  - Phases 9-10: "MPO tracks completion, writes final summary"
- The 5 escalation levels: simple table, Level 1-4 = MPO handles, Level 5 = you decide
- Input Requests in sidebar: what they look like, how to answer (pick option or custom text)
- When MPO is overkill (single-file change) vs. when it shines (multi-project feature)

**Section C: The Project Launcher (~1K tokens)**
- Analogy: construction foreman who sets up the site before workers arrive
- KickoffDialog: project directory + optional requirements file + extra context
- Two stages: scaffold (generates CLAUDE.md, SPEC.md skeleton, .claude/) → interview (starts requirements gathering)
- What makes a good requirements file: goal, audience, features, constraints. "The better the input, the better the scaffold."
- Completion: automatic transition from launcher to interview session

**Section D: Workspaces & Personas (~1.3K tokens)**
- Persona: a role with name, color, default prompt. Analogy: "A hat you put on Claude — 'today you're a frontend developer' or 'today you're a code reviewer'"
- Builtin personas: Orchestrator, MPO, Worker, empty (locked, prompt editable)
- Custom personas: fully editable name, color, prompt
- Workspace: pre-arranged grid layout. Analogy: "A conference room already set up — right chairs, right documents, projector ready"
- Creating a workspace: WorkspacesWindow (status bar button), grid editor, drag merge handles, assign personas + projects per cell
- Applying: click workspace → grid resizes → sessions spawn → ready to work
- Prompt resolution: cell prompt > workspace override > persona default
- Persona Skill Sync: personas become .claude/skills/ files

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/guides/03-power-moves.md"` — target ~3300 words (~5K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/guides/03-power-moves.md"
git commit -m "feat(how-to): guide 03 — power moves (orchestrator, MPO, launcher, workspaces)"
```

---

### Task 7: guides/05-prompting-in-mux.md — Mux-Specific Prompting

**Files:**
- Create: `the how-to-session/guides/05-prompting-in-mux.md`

- [ ] **Step 1: Write the guide**

Content structure (English, ~3.5K tokens):

**Sections:**
1. **Writing Instructions for the Orchestrator** — What the orchestrator expects: clear, decomposable tasks. Good example: "Refactor the auth module: extract token validation into a separate file, add unit tests, update imports." Bad example: "Fix the auth stuff." Scope: 60-80% context window per worker task. What to watch in sidebar.

2. **Writing Requirements for the Launcher** — Structure: goal (one sentence), target audience, functional requirements (numbered), meta-requirements (stack, design constraints). The quality baseline concept. Common mistake: too vague vs. too prescriptive. Example of a good requirements doc (3-4 paragraphs).

3. **Writing for MPO Input Requests** — What bubbles look like: question + 2-4 options + recommendation. Pick option or write custom answer (Cmd+Enter). Speed matters: workers are waiting. When to deviate from recommendation.

4. **Voice Input Patterns** — Speak in complete thoughts. Don't dictate code. Good: "Erstell eine neue Komponente die einen Button rendert mit dem Text Speichern." Bad: "function... open paren... save... close paren." Voice commands: "abschicken" submits, "neue zeile" for newline. Review before submitting.

5. **Effective Bugreports** — What the orchestrator needs: steps to reproduce > vague descriptions. Voice interview mode: Ollama enriches your description into structured format. Screenshot capture for visual bugs. Example: bad ("the button doesn't work") vs. good ("Click 'Save' in NotesCell → expected: note saved, actual: error toast 'write failed', console shows ENOENT").

6. **Inter-Session Communication Patterns** — Message Bus topics: chat (user-facing), status (progress), bug (incoming reports), system (warnings). What goes to bus vs. tmux injection. Reading sidebar messages: status updates are noise until they're not — watch for stuck/error signals.

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/guides/05-prompting-in-mux.md"` — target ~2300 words (~3.5K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/guides/05-prompting-in-mux.md"
git commit -m "feat(how-to): guide 05 — prompting in cipher-mux"
```

---

### Task 8: guides/06-token-craft.md — Context Windows, Models, Efficiency

**Files:**
- Create: `the how-to-session/guides/06-token-craft.md`

- [ ] **Step 1: Write the guide**

Content structure (English, ~3.5K tokens):

**Sections:**
1. **Models: When to Use What** — Opus 4.6/4.7: complex reasoning, architecture, creative. Most capable, most expensive. Sonnet 4.6: daily coding, best value. Haiku 4.5: simple tasks, fast, 200K window. In cipher-mux: orchestrator on capable model, workers can use lighter models. The multi-model routing principle.

2. **Context Window Management** — "Lost in the Middle": info in center gets 30% less attention. Query at end, reference at top. CLAUDE.md loads at top (automatic). The todo.md attention hack (Manus team): push plans to context end for recency bias.

3. **Token-Efficient Work Patterns** — Fresh session vs /compact: fresh often wins (Claude rediscovers state from filesystem). /clear between tasks. Subagents for exploration (separate window, summary back). Stable prompt prefixes for KV-cache hits (10x cheaper). /compact with focus: "/compact Focus on the auth changes". /btw for side questions (never enters history).

4. **Session Lifecycle** — Signs for new session: repetition, contradictions, forgotten rules. Handover pattern: "Fass den aktuellen Stand zusammen" → save to handover.md → new session → "lies handover.md und mach weiter." 2-hour heuristic.

5. **CLAUDE.md as Token Investment** — Good CLAUDE.md saves tokens across every interaction. Bad CLAUDE.md wastes them. The pruning test: "Would removing this cause mistakes?" Prefer pointers over inline content: `@path/to/file:42-80` instead of pasting.

6. **cipher-mux's Built-in Efficiency** — StatusLine monitor: real-time context usage per session (green/orange/red). Orchestrator monitors worker context automatically. Message Bus: lightweight async, not context-heavy sync. Recovery: sessions survive crashes, no token loss.

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/guides/06-token-craft.md"` — target ~2300 words (~3.5K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/guides/06-token-craft.md"
git commit -m "feat(how-to): guide 06 — token craft and efficiency"
```

---

### Task 9: ref/mcp-tools.md — MCP Tool Reference

**Files:**
- Create: `the how-to-session/ref/mcp-tools.md`

- [ ] **Step 1: Write the reference**

Content structure (English, ~2.5K tokens):

All 14 MCP tools in consistent format:

```markdown
## mux_create_session
Create a new Claude Code session in a tmux pane.

| Parameter | Type | Required | Description |
|---|---|---|---|
| name | string | yes | Display name for the session |
| projectPath | string | yes | Absolute path to project directory |
| command | string | no | Custom launch command (default: claude) |
| visible | boolean | no | Show in grid (default: true) |

**Use case:** Orchestrator spawning a worker for a specific task.
**Returns:** Session object with id, name, tmuxSession.
```

Tools to document:
- Session: mux_create_session, mux_kill_session, mux_sessions, mux_status
- Messages: mux_send, mux_read
- Tasks: mux_task_create, mux_task_update, mux_task_list, mux_task_get
- Bugreport: mux_bugreport_resolve
- Context: mux_context_usage
- MPO: mux_input_request_create
- Launcher: kickoff_complete

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/ref/mcp-tools.md"` — target ~1700 words (~2.5K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/ref/mcp-tools.md"
git commit -m "feat(how-to): reference — MCP tools"
```

---

### Task 10: how-to-info-popup.md — App Artifact (German)

**Files:**
- Create: `the how-to-session/how-to-info-popup.md`

- [ ] **Step 1: Write the artifact**

Content structure (German, ~3K tokens):

This is the condensed feature overview for the cipher-mux Info/Settings "features" tab. Written in German because it's user-facing in the app. Clean markdown, no frontmatter.

**Sections:**
- **Grid & Sessions** — Multi-Pane-Terminal-Layout, bis zu 7×3 Zellen, Drag & Drop, Session-Typen (Terminal, Notes, Launcher)
- **Sidebar** — 4 Tabs: Nachrichten, Hintergrund-Sessions, Eingabe-Anfragen, Notizen. Abkoppelbar als eigenes Fenster.
- **Statusleiste** — Alle Buttons erklärt: Voice, Grid-Steuerung, Workspaces, Orchestrator, MPO, Bugreport, Sidebar, Theme, Info
- **Spracheingabe** — Push-to-Talk, Whisper STT, Silero VAD, Sprachbefehle (abschicken, neue Zeile)
- **Notizen** — CodeMirror 6 Markdown-Editor, YAML-Frontmatter, Auto-Save, Ollama-Tagging
- **Projekte** — Scanner (automatische Erkennung), Projekt-Popup, Kickoff-Dialog
- **Workspaces & Personas** — Rollen definieren, Grid-Layouts vorkonfigurieren, Apply-Funktion
- **Orchestrator** — Aufgaben delegieren, Worker-Sessions managen, Bug-Verarbeitung
- **MPO** — Anforderungen zerlegen, parallele Sub-Projekte, Eskalation
- **Themes** — 10 Farbschemata, von cipher-ivory (hell) bis matrix (Phosphor-Grün)
- **Tastenkürzel** — Kompakte Tabelle der wichtigsten Shortcuts

Per section: 2-3 sentences max. Purely informational, no tutorial character.

- [ ] **Step 2: Verify token count**

Run: `wc -w "the how-to-session/how-to-info-popup.md"` — target ~2000 words (~3K tokens).

- [ ] **Step 3: Commit**

```bash
git add "the how-to-session/how-to-info-popup.md"
git commit -m "feat(how-to): info popup artifact (German)"
```

---

### Task 11: Final Review & Integration Commit

- [ ] **Step 1: Verify all files exist**

```bash
ls -la "the how-to-session/CLAUDE.md"
ls -la "the how-to-session/.gitignore"
ls -la "the how-to-session/guides/"
ls -la "the how-to-session/ref/"
ls -la "the how-to-session/how-to-info-popup.md"
```

Expected: 12 files total (CLAUDE.md, .gitignore, 6 guides, 3 refs, 1 artifact).

- [ ] **Step 2: Verify total token budget**

```bash
wc -w "the how-to-session/CLAUDE.md" "the how-to-session/guides/"*.md "the how-to-session/ref/"*.md "the how-to-session/how-to-info-popup.md"
```

Target: ~24K words total (~36K tokens).

- [ ] **Step 3: Verify CLAUDE.md routing covers all files**

Read CLAUDE.md routing table. Every file in guides/ and ref/ must be reachable from at least one routing entry.

- [ ] **Step 4: Spot-check cross-references**

Verify: guides reference correct file names when suggesting "next steps." Verify: CLAUDE.md user-profile logic references correct guide names for completedGuides tracking.

- [ ] **Step 5: Final commit**

```bash
git add -A "the how-to-session/"
git commit -m "feat(how-to): complete Relay knowledge base — 6 guides, 3 refs, info popup artifact"
```
