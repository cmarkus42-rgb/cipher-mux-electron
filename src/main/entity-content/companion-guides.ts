/**
 * Companion guides deployer.
 *
 * Deploys all 6 guide files for the Companion entity.
 * Content sourced from ~/.config/cipher-mux/entities/companion/guides/
 */

import * as fs from 'fs';
import * as path from 'path';

export function deployCompanionGuides(projectPath: string): void {
  const guidesDir = path.join(projectPath, 'guides');

  const files: Array<{ name: string; content: string }> = [
    { name: '01-first-steps.md', content: GUIDE_01 },
    { name: '02-daily-workflow.md', content: GUIDE_02 },
    { name: '03-power-moves.md', content: GUIDE_03 },
    { name: '04-prompting-fundamentals.md', content: GUIDE_04 },
    { name: '05-prompting-in-mux.md', content: GUIDE_05 },
    { name: '06-token-craft.md', content: GUIDE_06 },
  ];

  for (const file of files) {
    const filePath = path.join(guidesDir, file.name);
    if (fs.existsSync(filePath)) continue;
    fs.mkdirSync(guidesDir, { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

const GUIDE_01 = `# First Steps — From Launch to First Result

This guide walks a complete beginner through their first cipher-mux session. By the end, you will have two Claude sessions running side by side and understand how the grid works.

**Type:** Tutorial (worked example)
**Prerequisites:** cipher-mux installed, app launches successfully
**Time:** 10-15 minutes

---

## What Is cipher-mux?

cipher-mux is a command center for AI-assisted development. Think of it as a desk with multiple monitors — each screen shows a separate Claude Code session working on its own task. You see everything at once. The sessions can communicate with each other through a shared message system, and a coordinator (the Orchestrator) can manage them automatically.

The key idea: instead of one Claude conversation doing everything, you run multiple specialized sessions in parallel. One works on the frontend, another on the backend, a third reviews code. cipher-mux keeps them organized.

## What You See When the App Starts

The main window has two areas:

**The Grid** — the large central area. This is where your sessions live. Right now it is probably empty, showing cells with action buttons. Each cell is a slot that can hold a terminal session, a notes editor, or remain empty as a launcher.

**The Status Bar** — the strip at the bottom. This is your control panel. From left to right:
- **Voice pill** — push-to-talk voice input (more on this in Guide 02)
- **spalten/zeilen +/−** — add or remove grid columns and rows
- **workspaces** — open the workspace and persona editor
- **orchestrator** — start/stop the Orchestrator (Guide 03)
- **mpo** — start/stop the Multi-Project Orchestrator (Guide 03)
- **bugreport** — submit a bug report
- **sidebar** — toggle the sidebar panel (messages, notes, background sessions)
- **Theme name** — click to cycle through visual themes
- **info** — open settings, shortcuts, feature list
- **Version** — app version (right side)

You do not need most of these yet. Focus on the grid and the sidebar button.

## Opening Your First Project

Let us get a session running.

**Step 1:** Look at the empty grid. Each empty cell shows three buttons: "projekt", "session", and "notes".

**Step 2:** Click **"projekt"** in any cell.

A popup appears — the **Project Popup**. It has three sections:
- **Scan results** — projects cipher-mux found automatically on your machine. They show up as cards with the project name, git branch, and a badge showing the project phase.
- **Custom path** — a text field where you can type or browse to any directory.
- **Kickoff** — for creating a brand-new project from scratch (covered in Guide 03).

**Step 3:** Pick a project — either click one from scan results, or enter a path manually and click "öffnen".

**Step 4:** A terminal appears in the cell. You see Claude Code starting up — the prompt indicator (❯) appears after a few seconds. The cell header shows the session name, and a small percentage indicator shows context usage (how much of Claude's memory is used).

That is it. You have a running Claude Code session inside cipher-mux.

## What Is a Session?

Think of a session as a separate phone call with Claude. Each session is an independent conversation. Claude in Session A does not know what Claude in Session B is doing — each one has its own context window (working memory), its own files open, its own task.

Behind the scenes, each session runs in tmux — a terminal multiplexer that keeps sessions alive even if the app window closes. This is why cipher-mux sessions survive crashes. Close the app, reopen it, and your sessions are still there.

## Adding a Second Session

**Step 1:** Find another empty cell in the grid. If you only have one column, click **spalten +** in the status bar to add a column. A new empty cell appears.

**Step 2:** Click **"session"** this time (not "projekt"). A dialog asks for a directory path. Enter any folder, or leave it empty to use your home directory. Click "öffnen".

**Step 3:** A second terminal appears. You now have two Claude sessions running side by side.

Click on a cell's header area to **focus** it — the focused session has a highlighted border. Keyboard input goes to the focused session. You can type in one, switch to the other, and both continue independently.

## Resizing the Grid

The status bar has four small buttons for grid control:
- **spalten +** / **spalten −** — add or remove columns (max 7)
- **zeilen +** / **zeilen −** — add or remove rows (max 3)

The grid can go up to 7 columns × 3 rows = 21 cells. Start small — 2×1 or 2×2 is typical for daily work.

The app window resizes automatically when you change the grid dimensions.

## Cell Controls

Each session cell has a header bar with controls:

| Button | What it does |
|---|---|
| **↥ / ↧** | Expand cell to full height or collapse back (only visible with 2+ rows) |
| **⇄** | Switch to a different project without closing the session |
| **\\\$** | Open a plain shell in the session's project directory |
| **✕** | Close the session and free the cell |

You can also **drag** a cell header to swap it with another cell. Click and hold the header, drag to another cell, release. The two cells swap positions.

## The Sidebar

Click **"sidebar"** in the status bar. A panel slides in from the right with up to four tabs:

- **Messages** — shows inter-session chat messages (visible when Orchestrator is running)
- **Background** — sessions running but not shown in the grid (click to add them)
- **Input Requests** — questions from the MPO that need your answer
- **Notes** — your saved notes with search and tag filtering

For now, the Notes tab is the most relevant. The others become important when you use the Orchestrator (Guide 03).

The sidebar has a **detach button** (⧉) that opens it as a separate window — useful on multi-monitor setups.

## Closing Sessions and Cleaning Up

To close a session: click **✕** in the cell header. The Claude process stops, the tmux session is killed, and the cell becomes empty again.

To close all sessions: there is no bulk button — close them individually. This is intentional; accidental bulk-close would lose work.

If the app crashes or you force-quit, sessions survive in tmux. On next launch, a **Recovery Dialog** appears offering to adopt orphaned sessions back into the grid or kill them.

## What You Learned

- [x] cipher-mux is a multi-session command center for Claude Code
- [x] The grid holds sessions, notes, and launcher cells
- [x] The status bar is the control panel for everything
- [x] "projekt" opens a project in a session, "session" opens a raw terminal
- [x] Sessions are independent — separate conversations, separate context
- [x] Grid resizes with spalten/zeilen +/−, cells can be dragged, expanded, closed
- [x] The sidebar shows messages, background sessions, and notes
- [x] Sessions survive crashes thanks to tmux

**Next step:** Guide 02 (Daily Workflow) covers voice input, notes, themes, and the features you will use every day.
`;

const GUIDE_02 = `# Daily Workflow — The Features You Use Every Day

This guide covers the cipher-mux features that make up your daily routine: managing sessions, using voice input, taking notes, customizing your environment, and handling common situations.

**Type:** How-To Guide (task-oriented)
**Prerequisites:** Guide 01 (First Steps)
**Time:** 15-20 minutes

---

## Managing Multiple Sessions

You already know how to create sessions (Guide 01). Here is how to work with several at once.

**Focusing:** Click any cell header to focus that session. The focused cell gets a highlighted border. All keyboard input goes there. Only one session can be focused at a time.

**Swapping positions:** Drag a cell header and drop it on another cell. The two swap places. Useful when you want your main session in the top-left corner.

**Expanding a cell:** If your grid has more than one row, each cell has a height toggle button (↥ or ↧). Click ↥ to expand a cell to full grid height — good for reading long output. Click ↧ to collapse back to normal.

**Opening a shell:** The \\\$ button in a cell header opens a plain terminal shell in that session's project directory. No Claude, just a regular shell — for running tests, checking git status, or anything you would do in a terminal.

**Switching projects:** The ⇄ button opens the Project Popup inside an existing session, letting you switch to a different project without closing and reopening.

---

## The Sidebar

The sidebar is your information panel — it lives on the right edge and has up to four tabs depending on what is active.

**Toggle:** Click "sidebar" in the status bar. Click again to hide it.

**Detach:** Click the ⧉ button at the top of the sidebar to pop it out as a separate window. Great for multi-monitor setups — put the sidebar on your second screen while the grid fills your main display. It reattaches automatically when you close the separate window.

### Messages Tab
Visible when the Orchestrator is running. Shows inter-session chat messages (topic: "chat") in real time. This is where the Orchestrator reports progress, workers post status updates, and system warnings appear. Think of it as a project Slack channel.

### Background Sessions Tab
Visible when sessions exist that are not shown in the grid. Each card shows: session name, project path, context usage bar, and a live terminal preview that refreshes every few seconds. Click a card to pull the session into the next free grid slot.

### Input Requests Tab
Visible when the MPO is running. Shows questions from the Multi-Project Orchestrator that need your decision. Each request has: the question, 2-4 options (one marked as recommended), and a text field for custom answers. Submit with Cmd+Enter. Speed matters — MPO workers are waiting for your answer.

### Notes Tab
Always visible. Shows all your saved notes with search and tag filtering. Type in the search field to filter by title or tags. Click tag chips below the search to filter by specific tags (AND logic — clicking two tags shows notes that have both). Double-click a note to open it in a NotesCell in the grid. Hover over a note to reveal the delete button (🗑).

---

## Voice Input

cipher-mux has built-in speech-to-text. You talk, it types into the focused session.

### Setup
Voice input uses a local Whisper model — no internet required, no data sent anywhere. The model file lives at \\\`~/.config/cipher-mux/models/whisper/ggml-small.bin\\\`. If the model is missing, voice features are disabled.

### How to Use
1. **Enable:** Click the Voice pill in the status bar. The LED turns green (ready).
2. **Talk:** Start speaking. The Silero VAD (voice activity detector) runs in the browser — it detects when you are speaking and starts recording automatically. The LED turns red (recording).
3. **Stop talking.** After a brief silence, recording stops. The LED turns yellow (processing) while Whisper transcribes your speech.
4. **Text appears** in the focused session — but it is NOT submitted yet. You can review it first.
5. **Submit:** Say "abschicken", "absenden", or "senden" — this presses Enter. Or say "neue Zeile" for a newline without submitting.

### Tips for Effective Voice Input
- Speak in complete thoughts. Pauses trigger end-of-speech detection.
- Voice is for natural language instructions, not code. Say "Erstell eine Funktion die Preise berechnet" — do not try to dictate \\\`function calculatePrice(items) { ... }\\\`.
- Review the transcription before submitting. Whisper is good but not perfect, especially with technical terms.
- You can mix voice and keyboard: dictate a paragraph, then type a correction, then voice-submit.
- Ctrl+Shift+Space is the keyboard shortcut for voice toggle (when enabled).

---

## Notes

Notes are cipher-mux's built-in markdown editor — a third type of grid cell alongside sessions and launchers.

### Creating a Note
Click "notes" in any empty cell. A NotesCell appears with a blank editor. Start typing. The editor uses CodeMirror 6 with live markdown rendering — headings, bold, italic, links, code blocks, and quotes render as you type.

### Frontmatter
Every note has YAML frontmatter at the top:
\\\`\\\`\\\`yaml
---
title: My Note Title
tags: [design, frontend, urgent]
---
\\\`\\\`\\\`
The title shows in the sidebar Notes tab and the cell tab bar. Tags are used for filtering and are auto-suggested.

### Auto-Save and Tagging
- **Auto-save:** Your note is saved to disk automatically after 2 seconds of inactivity. No tagging happens on auto-save.
- **Manual save (Cmd+S):** Saves AND triggers Ollama auto-tagging. The local Ollama model (gemma3:4b) reads your note content and suggests up to 5 tags from a repository of predefined + learned tags. You can accept, modify, or ignore the suggestions.

### Note Storage
- **Global notes:** \\\`~/.config/cipher-mux/notes/\\\` — available in all workspaces
- **Workspace-scoped notes:** \\\`~/.config/cipher-mux/notes/workspace-<id>/\\\` — tied to a specific workspace

### Working with Notes
- **Multiple tabs:** Open several notes in one NotesCell using the tab bar. Click + to create a new note. Click × to close a tab.
- **Delete:** Click the 🗑 icon in the tab bar, or hover over a note in the sidebar and click the delete button. Both show a confirmation dialog.
- **Search and filter:** Use the sidebar Notes tab to search by title/tags and filter by tag chips.

---

## Themes

cipher-mux ships with 10 visual themes. Click the theme name in the status bar to cycle through them.

| Theme | Character |
|---|---|
| cipher-ivory | Clean light theme, the default for light mode |
| cipher-dark | The default dark theme, warm and focused |
| blueprint | Engineer's draft — cyan and indigo on dark blue |
| warm-paper | Minimal, sepia tones, easy on the eyes |
| gruvbox-dark | Coder classic — warm retro palette |
| nord | Cool Scandinavian frost — blue-grey tones |
| synthwave | 80s sunset — magenta, violet, neon |
| matrix | Phosphor green on black, pure terminal aesthetic |
| brutalist | Black and white with signal red accents |
| high-contrast | WCAG AAA accessible — maximum readability |

Themes affect everything: the grid, terminals, sidebar, dialogs, status bar, and even the terminal's ANSI color palette. Your selection persists across sessions.

---

## Session Dialog vs. Project Popup

Two ways to create a session — here is when to use which:

**Project Popup** (click "projekt"):
- Shows auto-discovered projects from your scan paths
- Shows git branch, dirty status, SDD phase
- Has the Kickoff section for new projects
- Use this when you want to work on a project

**Session Dialog** (click "session"):
- Just a directory path input
- Creates a raw Claude Code session, no project scanning
- Use this for quick one-off tasks, exploring a directory, or when you do not need project scaffolding

---

## Recovery After a Crash

cipher-mux sessions run in tmux, which is independent of the Electron app. If the app crashes, closes unexpectedly, or your machine restarts while tmux is running:

1. Relaunch cipher-mux
2. The **Recovery Dialog** appears automatically, listing orphaned tmux sessions
3. For each session, choose:
   - **Übernehmen** — adopt it back into the grid (session continues where it left off)
   - **Beenden** — kill the tmux session (lost work in that session)
   - **Alle beenden** — kill all orphaned sessions at once

Adopt first, kill only if a session is stuck or corrupted.

---

## Settings

Click "info" in the status bar → "einstellungen" tab.

**Scan Paths:** Configure where cipher-mux looks for projects. Add directories with the + button, remove with ×. Adjust scan depth (1-5 levels deep). Click "rescan" to refresh.

**Agent Settings:** "Skip Permissions" toggle — when enabled, Claude Code runs with \\\`--dangerously-skip-permissions\\\`, meaning it will not ask before editing files or running commands. Leave this off until you trust your setup. It is a power-user feature.

**Theme:** Also configurable here, same as clicking the theme name in the status bar.

---

## What You Learned

- Managing multiple sessions: focus, swap, expand, shell, switch projects
- The sidebar: four tabs, detachable, your information hub
- Voice input: enable, talk, review, submit with "abschicken"
- Notes: markdown editor, frontmatter, auto-save, Ollama tagging
- 10 themes to match your mood and work style
- Session Dialog for quick tasks, Project Popup for project work
- Recovery: sessions survive crashes, adopt them back on restart
- Settings: scan paths, permissions, theme

**Next step:** Guide 04 (Prompting Fundamentals) teaches you how to get the best results from Claude — the skill that makes everything else work.
`;

const GUIDE_03 = `# Power Moves — Orchestrator, MPO, Launcher, and Workspaces

This guide covers the advanced systems that set cipher-mux apart from running Claude Code in a single terminal. These are the tools that turn multiple sessions into a coordinated team.

**Type:** Explanation + Tutorial (hybrid)
**Prerequisites:** Guide 01 (First Steps), Guide 02 (Daily Workflow)
**Time:** 25-30 minutes

---

## Part 1: The Orchestrator

### What It Is

The Orchestrator is your air traffic controller. It does not fly the planes — your worker sessions do that. The Orchestrator decides who works on what, monitors progress, handles failures, and reports back to you.

It is a Claude Code session with a special template that gives it access to MCP tools for creating sessions, sending messages, reading status updates, and managing tasks. When you start the Orchestrator, it occupies one cell in the grid and runs like any other session — except its job is to manage other sessions.

### When to Use It

- **Complex multi-step tasks** — You have a feature that requires changes across five files in three different modules. Instead of doing it all in one session (which risks context rot), the Orchestrator breaks it into sub-tasks and assigns each to a worker.
- **Automated bug fixing** — Submit a bugreport, and the Orchestrator picks it up, spawns a worker session to diagnose and fix it, then reports the result.
- **Parallel work** — You want three different things done simultaneously. The Orchestrator manages the coordination so you do not have to.

### When NOT to Use It

- Simple single-file changes. Just do it in a regular session.
- Quick questions or explorations. The Orchestrator adds overhead that is not worth it for small tasks.

### How to Start It

Click **"orchestrator"** in the status bar. A dot indicator appears when it is active. The Orchestrator session spawns in the next free grid slot.

### What Happens Behind the Scenes

The Orchestrator receives a generated CLAUDE.md template that includes:
- Access to all MCP tools (create sessions, send messages, read status, manage tasks)
- Rules for delegation (break tasks into independent sub-tasks, one per worker)
- Failure handling (retry up to N times, then escalate to you)
- Bug report processing (serial queue, one bug at a time)

When you give the Orchestrator a task, it:
1. Analyzes the task and breaks it into sub-tasks
2. Creates worker sessions for each sub-task (\\\`mux_create_session\\\`)
3. Waits for each worker to boot (8-10 seconds — tmux, shell, and Claude need to start)
4. Verifies the worker is ready (checks for the Claude prompt)
5. Sends the task instruction directly into the worker's terminal
6. Monitors progress every 2 minutes (context usage + output)
7. Reports results back to you in the sidebar Messages tab

### The Worker-Startup Protocol

This is a critical detail that explains why the Orchestrator waits before sending instructions. When a new session is created, three things need to start sequentially: tmux (the terminal multiplexer), zsh (the shell), and Claude Code (the AI). This takes 8-10 seconds. If the Orchestrator sends instructions before Claude is ready, they are lost — Claude is not listening yet.

The protocol: create → wait → verify → send → verify again → monitor. It looks slow but prevents a common failure mode.

### Bug Report Flow

1. You submit a bugreport (via the bugreport dialog in the status bar)
2. The report lands in the bugreport outbox (\\\`~/.config/cipher-mux/bugreports/outbox/\\\`)
3. The Orchestrator detects the new report
4. It creates a worker session named \\\`fix-{bugId}\\\`
5. The worker diagnoses and fixes the bug
6. The Orchestrator calls \\\`mux_bugreport_resolve\\\` to mark it done
7. You see the result in the sidebar

### Monitoring

Watch the sidebar Messages tab for:
- **Status updates** from workers ("Task 2/5 complete")
- **Context warnings** ("Worker X is at 85% context usage")
- **Escalations** ("Could not fix after 3 attempts — need your input")

The context usage indicator in each cell header also shows worker health at a glance: green is fine, orange means getting full, red means critical.

---

## Part 2: The MPO (Multi-Project Orchestrator)

### What It Is

If the Orchestrator is an air traffic controller handling individual flights, the MPO is a film director planning a multi-location shoot. It takes one big, complex requirement and breaks it into multiple independent sub-projects that run in parallel.

The MPO is for the big stuff: "Build me a platform with authentication, a dashboard, and an API" — where the Orchestrator would handle "refactor the auth module."

### The 10-Phase Lifecycle

The MPO works through a structured sequence:

**Phase 1-2: Understanding**
The MPO reads your requirements document, validates that all necessary information is present (goal, audience, features, constraints), identifies ambiguities, and decides what it can resolve on its own versus what it needs to ask you.

**Phase 3-4: Planning**
It chooses a decomposition strategy (feature-based, layer-based, module-based, or hybrid), builds a dependency graph between sub-projects, writes a detail spec for each one, and saves it in the sub-project's directory.

**Phase 5: Launch**
Sub-projects launch in waves. Wave 1: independent projects with no blockers. Wave 2: projects that depend on Wave 1 results. And so on. Per wave, the MPO creates sessions, waits for boot, sends the detail spec, and creates tasks in the task queue.

**Phase 6-8: Monitoring & Support**
Every 7 minutes, the MPO checks all running sessions. It detects stuck signals (no output for 20+ minutes, context above 90%, repeated errors, rapid-fire questions). When a worker has a question, the MPO decides whether to answer it autonomously or escalate to you.

**Phase 9-10: Completion**
The MPO tracks sub-project completion (commit + 10 min inactivity, or explicit "fertig"), compiles a final summary, and sends it to you via the sidebar.

### The 5 Escalation Levels

Not every question needs your attention. The MPO has clear rules for what it handles alone:

| Level | Source | What happens |
|---|---|---|
| 1 | Explicitly in requirements | MPO answers directly ("Requirements say REST-first, so using REST") |
| 2 | Derivable from constraints | MPO answers with justification ("Stack implies TypeScript, choosing that") |
| 3 | Another session's decision | MPO applies consistency ("Session B chose this pattern, applying to Session C") |
| 4 | Needs web research | MPO researches, documents sources, applies result |
| 5 | Taste, strategy, irreversible | MPO asks YOU via sidebar Input Request |

**Heuristic:** If an answer requires 3+ steps or more than one assumption, the MPO considers it "guessed" and escalates to Level 5.

### Input Requests

When the MPO needs your decision (Level 5), it creates a bubble in the sidebar Input Requests tab. Each bubble shows:
- The question
- 2-4 concrete options with context
- A recommended option (marked with a badge)
- A text field for custom answers

Answer by clicking an option or typing a custom response and pressing Cmd+Enter. The MPO distributes your answer to affected worker sessions and continues.

**Speed matters.** Worker sessions are paused waiting for your decision. A quick answer keeps the pipeline flowing. If you need time to think, that is fine — but the workers are idle.

### When MPO Is Overkill

- Single-module changes → use regular Orchestrator
- Anything that fits in one session → just do it directly
- Unclear requirements → sort out what you want first, then use MPO

### When MPO Shines

- Multi-component features (frontend + backend + database)
- New project scaffolding with clear requirements
- Anything where you would otherwise manually coordinate 3+ sessions

---

## Part 3: The Project Launcher

### What It Is

Think of it as a construction site foreman who prepares the site before workers arrive. The Launcher takes a project directory, scaffolds the development infrastructure (CLAUDE.md, SPEC.md skeleton, .claude/ directory, .gitignore), and hands off to a requirements interview.

### How to Use It

1. Click **"projekt"** in an empty cell
2. In the Project Popup, expand the **Kickoff** section
3. Fill in:
   - **Projekt-Verzeichnis:** where the project will live (must exist)
   - **Anforderungsdatei:** optional path to a requirements document (text, markdown, PDF)
   - **Extra context:** anything else the launcher should know
4. Click "starten"

### What Happens (Two Stages)

**Stage 1 — Scaffold:**
A dedicated launcher session starts in the global template directory (\\\`~/.config/cipher-mux/projectlauncher/\\\`). It reads your requirements, analyzes the project scope, and generates the project skeleton in your target directory. This takes 2-10 minutes depending on complexity.

The scaffold includes:
- \\\`CLAUDE.md\\\` — project instructions for Claude Code
- \\\`docs/SPEC.md\\\` — technical specification skeleton
- \\\`.claude/\\\` — settings and skills directory
- \\\`.gitignore\\\` — sensible defaults
- \\\`docs/decisions/\\\` — ADR (Architecture Decision Record) directory

**Stage 2 — Interview:**
Once scaffolding is complete (detected by a marker file or MCP call), a new session opens in the target project directory and starts the \\\`/interview\\\` skill — a structured requirements gathering process.

### Writing Good Requirements

The Launcher is only as good as the input you give it. A good requirements document includes:

- **Goal:** one sentence describing what this project does
- **Target audience:** who will use it
- **Functional requirements:** numbered list of what it must do
- **Constraints:** tech stack, design preferences, what it must NOT do
- **Non-functional requirements:** performance, security, accessibility needs

You do not need perfect prose. Bullet points work. The key is completeness — every missing piece is a gap the Launcher has to guess at.

**A good requirements file (example):**
\\\`\\\`\\\`
Goal: A CLI tool that converts markdown files to PDF with custom styling.

Audience: Technical writers who want consistent PDF output from markdown.

Features:
1. Accept one or more .md files as input
2. Apply a CSS stylesheet for PDF rendering
3. Support code blocks with syntax highlighting
4. Generate table of contents from headings
5. Output to specified directory or stdout

Constraints:
- Node.js, no native dependencies
- Must work on macOS and Linux
- No Electron or browser dependency
- Target: single binary via pkg or similar

Non-functional:
- Process a 100-page document in under 10 seconds
- Accessible PDF output (tagged PDF)
\\\`\\\`\\\`

---

## Part 4: Workspaces and Personas

### What Is a Persona?

A persona is a hat you put on Claude. "Today you are a frontend developer." "Today you are a code reviewer." "Today you are a security auditor." Each persona has:

- **Name** — displayed in the cell header and workspace editor
- **Color** — a swatch from the palette, for visual distinction in the grid
- **Default Prompt** — the instructions Claude receives when this persona is activated

cipher-mux ships with builtin personas: Orchestrator, MPO, Worker, and empty. These are locked (you can edit the prompt but not the name or color). You can create unlimited custom personas with your own names, colors, and prompts.

### What Is a Workspace?

A workspace is a pre-arranged conference room. You define the grid layout, assign a persona and project to each cell, and save it. Next time you need that setup, one click on "Apply" and cipher-mux:

1. Resizes the grid to the workspace dimensions
2. Applies row merges (cells that span multiple rows)
3. Spawns sessions for each non-empty cell with assigned projects
4. Sets the active workspace for scoped notes

Instead of manually creating five sessions and remembering which one does what, you build the layout once and reuse it.

### Creating a Workspace

1. Click **"workspaces"** in the status bar. A separate window opens.
2. Select the **"workspaces"** tab.
3. Click **"+"** to create a new workspace.
4. Use the **grid editor** to define dimensions and layout. Drag merge handles on cell borders to create vertically spanning cells (for example, a tall Orchestrator cell next to two smaller worker cells).
5. Click a cell to open the **cell inspector**. Assign: persona, project directory, custom prompt (optional).
6. Click **"save"**.

### Applying a Workspace

Two ways:
- In the WorkspacesWindow: select workspace → click "Apply"
- Via the **WorkspacePopup** (accessible from grid or status bar): click the workspace thumbnail

Applying replaces the current grid layout. Existing sessions are closed. New sessions spawn for all non-empty cells.

### Prompt Resolution

When a session starts from a workspace, its prompt comes from three possible sources, checked in order:

1. **Cell prompt** — specific to this cell in this workspace (highest priority)
2. **Workspace prompt override** — an override for this persona within this workspace
3. **Persona default prompt** — the persona's standard prompt (lowest priority)

This lets you use the same "Frontend Developer" persona across workspaces but give it project-specific instructions in each one.

### Persona Skill Sync

When you save a persona, cipher-mux automatically generates a skill file at \\\`.claude/skills/personas/<persona-name>/SKILL.md\\\`. This means persona prompts are available as Claude Code skills in any project that has the cipher-mux skill directory linked.

---

## What You Learned

- **Orchestrator:** air traffic controller for task delegation and bug processing
- **MPO:** film director for multi-project decomposition with autonomous decision-making
- **Launcher:** site foreman who scaffolds projects before development begins
- **Workspaces:** saved grid layouts with persona and project assignments
- **Personas:** named roles with colors and prompts that shape Claude's behavior

**Next step:** Guide 05 (Prompting in cipher-mux) teaches you how to write effective instructions for these systems — the Orchestrator expects a different prompt style than a regular session.
`;

const GUIDE_04 = `# Prompting Fundamentals — Getting Real Results from AI

This guide covers universal principles for working with large language models (LLMs) like Claude. These skills apply everywhere — in cipher-mux, in raw Claude Code, in the browser, in any AI tool. Master these and everything else gets easier.

**Type:** Explanation (understanding-oriented)
**Prerequisites:** None — this is foundational knowledge
**Time:** 20-30 minutes to read, a lifetime to practice

---

## The 5-Building-Block Prompt

Every effective prompt has five components. Not always in this order, not always all five — but the more you include, the better the result.

### 1. Role

Tell the AI who it is for this task.

> "Du bist Frontend-Entwickler für eine PHP-Website."

Why it matters: the role shapes depth, vocabulary, assumptions, and which knowledge the model draws on. A "security auditor" looks at code differently than a "performance engineer." Same code, different eyes.

### 2. Context

What does the AI need to know about your situation?

> "Die Website ist statisches PHP auf Strato-Hosting. Ich pflege sie allein, kein Team."

Without context, the AI guesses — sometimes accurately, sometimes not. Context is cheap to provide and expensive to lack. Include: tech stack, constraints, who will use the result, what has been tried already.

### 3. Task

What exactly should happen?

> "Ändere den Preis für 'Komplettumzug Standard' auf preise.php von 450 auf 490."

The more specific the task, the less room for interpretation. "Make the homepage better" is an invitation for the AI to do whatever it feels like. "Reduce homepage load time by optimizing images and deferring non-critical CSS" is a task.

### 4. Constraints

What should the AI NOT do?

> "Keine neuen Abhängigkeiten. Kein Tailwind. Erst Plan zeigen, dann Code."

Constraints prevent the AI's default behaviors from kicking in. Without them, Claude will happily add a new framework, refactor surrounding code, and create helper utilities you never asked for. Constraints are guardrails.

### 5. Format

How should the answer be structured?

> "Antworte mit: 1. Was geändert wurde, 2. Warum, 3. Wie ich es teste."

Format instructions save you from parsing walls of text. You know what you need — tell the AI, so it delivers in that shape.

### Bad vs. Good — Same Task

**Bad:** "Mach die Startseite besser."

**Good:** "Du bist Frontend-Entwickler für meine PHP-Website. Die Startseite lädt auf dem Handy langsam. Bitte: 1. Analysiere index.php und die verlinkten CSS/JS-Dateien. 2. Zeig mir die drei größten Performance-Hebel, sortiert nach Aufwand vs. Effekt. 3. Erst Plan zeigen, dann Code. Keine neuen Frameworks."

The difference is not length — it is precision. The good prompt takes 30 seconds longer to write and saves 15 minutes of back-and-forth.

---

## Your AI's Working Memory: The Token Window

Every AI model has a limit on how much text it can hold in "working memory" at once. This is the **context window**, measured in tokens (roughly: one token ≈ 0.75 English words, one long German word ≈ 3-5 tokens).

**Current specs (April 2026):**
- Claude Opus 4.6/4.7, Sonnet 4.6: 1,000,000 tokens (~750K English words, ~1,500 book pages)
- Claude Haiku 4.5: 200,000 tokens

Think of it as **RAM vs. ROM vs. Disk:**
- **Context window = RAM.** What the AI is actively thinking about right now. Limited, fast, everything here is "in focus."
- **Training data = ROM.** Background knowledge from training. Always accessible but not actively loaded — the AI draws on it implicitly.
- **Files on disk = external storage.** Vast but requires explicit loading. When Claude reads a file, it enters the context window (RAM).

For most daily work, you will never hit the raw capacity limit. A million tokens is enormous. But quality degrades long before you hit the wall — that is context rot.

---

## Context Rot: When Quality Degrades

Long sessions degrade even within the window limit. After hours of back-and-forth, corrections, tangents, and accumulated context, the AI's attention spreads thin. The "lost in the middle" problem is real: information buried in the middle of a long context gets up to 30% less attention than information at the start or end.

**Signs of context rot:**
- Claude forgets rules you established earlier in the session
- Answers contradict something it said 20 messages ago
- It starts hallucinating file names or function names that do not exist
- It references things you never said

**The fix is simple: start a new session.** This is not failure — it is craft. Experienced users start fresh every 1-2 hours as a habit, not because something went wrong. A new session with a clear prompt almost always outperforms a degraded long session.

**The handover technique:** Before closing a session, ask Claude to summarize the current state in half a page. Save it as a file. Start a new session. First message: "Lies diese Zusammenfassung und mach da weiter wo wir aufgehört haben." Clean context, full state.

---

## The 150-Instruction Budget

Claude Code's CLAUDE.md file — the project instructions that load automatically — has roughly 150 effective instruction slots. The system prompt already uses about 50 of them. Every instruction you add competes with the others for attention.

**The pruning test:** For every line in a CLAUDE.md, ask: "Would removing this cause Claude to make a mistake?" If Claude already does it correctly on its own, the instruction is noise. Remove it.

This applies beyond CLAUDE.md. Every prompt has an attention budget. Front-load the important parts. Put the critical instruction at the very beginning or very end — never bury it in the middle.

---

## Hallucinations: When AI Invents

LLMs do not "know" things the way a database knows things. They predict the most likely next words based on patterns. Sometimes the most likely continuation is wrong — confidently, fluently wrong. This is a hallucination.

**Common forms:**
- Inventing function names that do not exist in your codebase
- Citing libraries or APIs with incorrect parameter names
- Claiming a feature exists when it does not
- Generating plausible-looking code that fails silently

**How to handle it:**
- Always test locally. Never deploy code you have not run.
- When uncertain, ask explicitly: "Bist du sicher, dass diese Funktion existiert? Falls nicht, schlag einen verifizierten Weg vor."
- Give Claude verification tools — tests, linters, type checkers. An AI with feedback loops hallucinates less than one without.
- The anti-hallucination pattern: include in your prompt or CLAUDE.md: "Never speculate about code you have not opened. Read the file before answering."

---

## The Confirmation Trap

AI models are trained to be helpful. Helpfulness defaults to agreement. If you say "I think we should use a microservice architecture," Claude will likely agree and explain why that is a great idea — even if a monolith would be better for your case.

**How to break the trap:**
- Ask for counterarguments: "Nenn mir zwei Gründe warum das eine schlechte Idee sein könnte."
- Ask for alternatives: "Was wären die Nachteile gegenüber Ansatz X?"
- State your assumption and ask Claude to challenge it: "Ich gehe davon aus, dass Y. Stimmt das, oder übersehe ich was?"

The meta-rule: Claude is a tool, not a colleague. A tool does not push back. You have to create the conditions for honest feedback by explicitly requesting it.

---

## Focused Sessions

One session, one topic. This is the single highest-leverage habit.

When you are fixing a bug and suddenly ask "Oh, and can you also quickly refactor that other component?" — the session loses focus. Context fills with unrelated information. Quality drops for both tasks.

**Rules:**
- One topic per session. Theme switch = new session.
- Between unrelated tasks in the same session: use \\\`/clear\\\` to reset context.
- After two failed correction attempts on the same issue: start a fresh session with a better initial prompt. The clean context almost always outperforms accumulated corrections.
- Side questions that do not need to persist: use \\\`/btw\\\` — it answers in an overlay without entering conversation history.

---

## Forcing Research

LLMs overestimate their own knowledge. They will answer confidently from training data even when that data is outdated or incomplete. The fix: explicitly ask them to research before answering.

**Instead of:** "Schreib einen Blogartikel über DSGVO-Anforderungen für Kontaktformulare."

**Try:** "Bevor du schreibst — was weißt du aus dem aktuellen Stand zu DSGVO bei Kontaktformularen? Gibt es neue Richtlinien 2025/2026? Recherchier das kurz, dann machen wir die Gliederung."

This pattern — research first, then outline, then execute — reduces hallucinations, brings in current information, and often surfaces considerations you had not thought of.

---

## The Doom Loop

This is the central failure mode of vibe coding: the AI claims to fix a bug but does not actually fix it. You point out it is still broken. The AI apologizes and "fixes" it again — differently broken. You correct again. Context fills with failed approaches. Quality spirals downward.

**How to break it:**
- After two failed fix attempts: stop. Start a fresh session.
- In the new session, describe the problem clearly — including what was already tried and why it failed. "Ich habe X und Y probiert, beides hat nicht funktioniert weil Z. Was ist die eigentliche Ursache?"
- The doom loop usually means the initial diagnosis was wrong. A fresh session forces re-diagnosis.

**Prevention:**
- Plan in markdown, not code. Iterate on requirements in a separate conversation. Discarded ideas in markdown cost nothing. Discarded ideas in code become tech debt.
- Require a diagnosis before a fix: "Erklär mir erst was das Problem ist. Dann fixen wir es zusammen."

---

## The Two-Pass Pattern

Generate first, review second — in separate passes. This is more effective than trying to get it perfect in one shot.

**How it works:**
1. First pass: generate the code, text, or plan. Accept that it will have issues.
2. Second pass: review it critically. Use a fresh session, a different prompt, or even a different model. "Hier ist ein Code-Entwurf. Prüf ihn auf Fehler, Sicherheitslücken, und fehlende Edge Cases."

Research consistently shows: three focused agents working in sequence (generate → review → fix) outperform one generalist working three times as long. This principle is built into cipher-mux's architecture — the Orchestrator delegates to specialized workers rather than doing everything in one session.

---

## The Meta-Rule

Claude is a tool. You decide. You verify. You own the result.

A good tool-user knows what they want, checks the output, and takes responsibility for what goes live. Claude does the heavy lifting and contributes ideas — the judgment and quality assurance stay with the human.

A controlled study in 2025 found that experienced developers were 19% slower with AI tools — while believing they were 24% faster. The subjective experience of speed masks the cost of context-switching, debugging AI-generated code, and the trust-then-verify gap.

The antidote: discipline. Clear prompts, focused sessions, verification before shipping, new sessions when quality drops. Those who internalize this work genuinely faster. Those who trust blindly accumulate invisible debt.

---

## Quick Reference: Patterns That Work

| Pattern | When to use |
|---|---|
| 5-building-block prompt | Every non-trivial request |
| Handover technique | Before ending a long session |
| /clear between tasks | When switching topics in same session |
| Fresh session after 2 failed fixes | When stuck in the doom loop |
| "Recherchier das vorher" | Before any content that needs current facts |
| "Nenn mir Gegenargumente" | Before any decision |
| Two-pass (generate + review) | For anything that will be shipped |
| Anti-hallucination prompt | In CLAUDE.md for critical projects |
| One topic per session | Always |

**Next step:** Guide 05 (Prompting in cipher-mux) covers how to write effective instructions for the Orchestrator, MPO, and Launcher specifically.
`;

const GUIDE_05 = `# Prompting in cipher-mux — Getting the Systems to Work for You

This guide covers how to write effective input for cipher-mux's specialized systems: the Orchestrator, the MPO, the Launcher, voice input, bugreports, and inter-session communication.

**Type:** How-To Guide (task-oriented)
**Prerequisites:** Guide 03 (Power Moves), Guide 04 (Prompting Fundamentals)
**Time:** 15-20 minutes

---

## Writing Instructions for the Orchestrator

The Orchestrator breaks your request into sub-tasks and assigns them to workers. This means your instruction needs to be decomposable — it must be possible to split it into independent pieces.

### What the Orchestrator Expects

Clear scope, clear boundaries, clear success criteria. The Orchestrator thinks in terms of: "What sessions do I need to create? What does each one do? How do I know it is done?"

### Good vs. Bad Orchestrator Instructions

**Bad:** "Fix the auth stuff and make the frontend look better."

Two problems: "auth stuff" is vague (fix what?), and "look better" is subjective with no success criteria. The Orchestrator cannot decompose this into worker tasks.

**Good:** "Three tasks: 1. Extract the token validation logic from auth.ts into a new file token-validator.ts with unit tests. 2. Add rate limiting to the login endpoint — max 5 attempts per minute per IP. 3. Replace the inline styles in LoginForm.tsx with CSS modules. All tasks are independent."

The Orchestrator can immediately create three workers, each with a clear, self-contained task.

### Sizing Worker Tasks

Each worker gets its own context window. A task should use 60-80% of that window — enough room to work but not so large that the worker runs out of context mid-task.

Rules of thumb:
- One file change = one worker (usually)
- One feature across 2-3 tightly coupled files = one worker
- If a task would require reading more than 10 files to understand, it is too big — break it down further

### What to Watch For

In the sidebar Messages tab:
- **Progress updates** — workers report what they are doing
- **Questions** — sometimes a worker asks for clarification. The Orchestrator tries to answer, but may escalate to you
- **Warnings** — context usage above 80%, repeated errors, or stalled workers
- **Completion** — "All tasks complete. Summary: ..."

If a worker seems stuck (no progress for 10+ minutes), check the sidebar. The Orchestrator's monitoring catches most stalls, but you can also check manually by looking at cell context usage indicators.

---

## Writing Requirements for the Launcher

The Launcher scaffolds a project from a requirements document. The quality of the scaffold is directly proportional to the quality of the input.

### Structure of a Good Requirements Document

\\\`\\\`\\\`
Goal: [one sentence — what does this project do?]

Target Audience: [who will use it?]

Functional Requirements:
1. [What it must do — be specific]
2. [Each requirement gets a number]
3. [Testable: you can tell if it works or not]

Constraints:
- [Tech stack preferences]
- [What it must NOT do]
- [Design guidelines]

Non-Functional Requirements:
- [Performance targets]
- [Security needs]
- [Accessibility requirements]
\\\`\\\`\\\`

### Common Mistakes

**Too vague:** "Build an app for managing tasks." — What kind of tasks? For whom? Web, mobile, CLI? What does "managing" mean — create, assign, schedule, track?

**Too prescriptive:** "Use React 19.2 with Zustand for state, Tanstack Router for routing, Tailwind 4 with the oxide engine..." — You are making implementation decisions before understanding the problem. State what you need, not how to build it. Let the Launcher (and Claude) make the technical choices.

**Missing constraints:** No constraints means Claude will make its own choices — and they might not match your expectations. "No backend" or "must work offline" or "must run on Strato shared hosting" are constraints that shape the entire architecture.

**The sweet spot:** Enough detail that someone who knows nothing about your project could build the right thing. Enough freedom that the builder can make good technical decisions.

### The Quality Baseline

If cipher-mux has a quality baseline directory configured, the Launcher uses it as a reference for the depth and quality of the generated scaffold. This is like showing a new architect an example of work you consider excellent and saying "aim for this level."

---

## Writing for MPO Input Requests

When the MPO cannot make a decision autonomously, it sends a bubble to the sidebar. Your response drives the direction of multiple worker sessions.

### What a Bubble Looks Like

\\\`\\\`\\\`
Question: The authentication sub-project needs a session storage
strategy. Two workers will depend on this decision.

Options:
  A) JWT tokens (stateless, no server storage needed) [recommended]
  B) Server-side sessions with Redis
  C) Cookie-based sessions with encrypted payload

Context: The requirements mention "no external dependencies beyond
the database." Redis would add a dependency. JWT aligns better with
the stated constraints.

[Custom answer field]
\\\`\\\`\\\`

### How to Answer Effectively

- **Read the recommendation first.** The MPO has context you might not have — it knows what all workers are doing. The recommended option usually has the best reasoning.
- **If you agree:** click the recommended option. Done. Fast.
- **If you disagree:** click a different option, or write a custom answer with your reasoning: "Use B because we need session revocation, and JWT revocation is hard to get right."
- **If you need more info:** write "Explain the trade-offs in more detail" in the custom field. The MPO will elaborate and re-ask.
- **Speed matters.** Workers are paused. A 30-second decision keeps the pipeline moving. A 30-minute deliberation means 30 minutes of idle compute. If you genuinely need time, that is fine — but do not forget there are sessions waiting.

---

## Voice Input Patterns

Voice in cipher-mux is for natural language — instructions, descriptions, thinking out loud. Not for code.

### What Works Well

**Giving instructions:**
"Erstell eine neue React-Komponente die eine Tabelle rendert. Die Tabelle soll sortierbar sein nach jeder Spalte. Die Daten kommen als Array von Objekten rein."

**Describing bugs:**
"Der Save-Button in der NotesCell macht nichts wenn ich drauf klicke. In der Konsole steht irgendwas mit ENOENT. Das passiert nur bei neuen Notizen, nicht bei bestehenden."

**Thinking out loud:**
"Ich überlege ob wir die Authentifizierung als eigenes Modul auslagern oder im API-Gateway lassen. Absenden. Was meinst du?"

### What Does Not Work

**Dictating code:** "function open paren items close paren open curly brace return items dot map..." — Do not do this. Type code. Voice is for what you want, not how to write it.

**Rapid-fire short commands:** Voice needs a moment to detect end of speech. Single-word commands get lost. Use keyboard for quick interactions.

### The Review-Then-Submit Pattern

Text from voice input appears in the terminal but is NOT auto-submitted. This is intentional — it gives you a chance to review the transcription before sending.

1. Speak your instruction
2. Wait for transcription to appear
3. Read it. If correct: say "abschicken" (or "absenden" or "senden")
4. If wrong: use keyboard to correct, then say "abschicken"

This pattern catches Whisper's occasional mis-transcriptions before they become instructions.

---

## Writing Effective Bugreports

A bugreport feeds into the Orchestrator's bug queue. The better the report, the faster the fix.

### What the Orchestrator Needs

**Minimum:** What happened, what you expected, where it happened.

**Ideal:** Steps to reproduce, expected vs. actual behavior, error messages (exact text), affected component/file if known.

### Bad vs. Good

**Bad:** "The button doesn't work."

**Good:** "Steps: 1. Open NotesCell, 2. Create new note, 3. Click Save icon in tab bar. Expected: note saves, toast confirmation. Actual: nothing happens, console shows 'Error: ENOENT: no such file or directory'. Affects: NoteEditor component, save flow for new (unsaved) notes."

### Using Voice Interview Mode

The bugreport dialog has a voice interview option. Ollama asks you questions about the bug and enriches your answers into a structured report. This is great when you are frustrated and just want to vent — the AI turns your stream of consciousness into actionable information.

### Screenshot Capture

The bugreport dialog can capture a screenshot and attach it to the report. Use this for visual bugs — layout issues, missing elements, wrong colors. The screenshot is base64-encoded in the report's YAML frontmatter.

---

## Inter-Session Communication

Sessions in cipher-mux communicate through two channels:

### The Message Bus

A shared SQLite database where sessions post messages tagged with a topic. Anyone can read, anyone can write. The Orchestrator reads the bus regularly to monitor progress.

**Topics:**
- \\\`chat\\\` — user-facing messages, shown in sidebar Messages tab
- \\\`status\\\` — progress updates from workers
- \\\`bug\\\` — incoming bugreport notifications
- \\\`system\\\` — warnings (high context usage, errors)

The bus is asynchronous — you post a message, and other sessions pick it up when they check. There is no guarantee of immediate delivery.

### tmux send-keys (Direct Injection)

For immediate delivery, the Orchestrator uses tmux to type directly into a worker's terminal. This is how initial task instructions are sent — the message bus cannot deliver prompts to an idle Claude session (it is not reading the bus until it has a task).

**When to use which:**
- Status updates, reports, notifications → Message Bus
- Initial task instructions, urgent redirects → tmux send-keys (handled by Orchestrator automatically)

As a user, you rarely interact with either directly. The Orchestrator handles routing. But understanding the distinction helps when debugging communication issues: if a worker did not receive an instruction, it is usually a timing issue with tmux send-keys (the worker was not ready yet), not a bus problem.

---

## Quick Reference: Prompt Patterns for cipher-mux

| System | Key principle |
|---|---|
| Orchestrator | Decomposable tasks with clear boundaries and success criteria |
| MPO | Complete requirements doc with goal, audience, features, constraints |
| MPO Input Requests | Fast decisions, trust recommendations, ask for detail when unsure |
| Voice | Natural language only, review before submit, no code dictation |
| Bugreports | Steps to reproduce > vague descriptions. Use voice interview when frustrated |
| Workers | Standard prompting (Guide 04) — one topic, specific, constrained |

**Next step:** Guide 06 (Token Craft) covers how to work efficiently with context windows, choose the right model, and keep sessions productive.
`;

const GUIDE_06 = `# Token Craft — Working Efficiently with Context and Models

This guide covers the practical side of AI efficiency: choosing the right model, managing context windows, knowing when to start fresh, and making every token count.

**Type:** Explanation (understanding-oriented)
**Prerequisites:** Guide 04 (Prompting Fundamentals — especially the Token Window and Context Rot sections)
**Time:** 15-20 minutes

---

## Models: When to Use What

Claude comes in three tiers, each with different strengths. Knowing which to use when is the first efficiency lever.

### Claude Opus 4.6 / 4.7

The most capable model. Best at: complex multi-step reasoning, architectural decisions, creative work, ambiguous tasks that need judgment. Largest context window (1M tokens). Most expensive in terms of compute budget.

Use for: orchestration, planning, code review, complex debugging, anything where getting it right the first time matters more than speed.

### Claude Sonnet 4.6

The daily driver. Fast, capable, cost-effective. Same 1M context window. Handles most coding tasks, refactoring, feature implementation, and documentation without breaking a sweat.

Use for: implementation work, routine coding, file modifications, test writing. This is your default for worker sessions.

### Claude Haiku 4.5

The lightweight model. 200K context window (smaller but still substantial). Fastest response times. Lowest compute cost. Excellent at well-specified tasks where the instructions are clear and the scope is narrow.

Use for: simple changes, formatting, file operations, tasks with detailed specs, high-volume work. Also: Haiku excels when given frontloaded context — a well-written CLAUDE.md or spec makes Haiku surprisingly effective.

### Multi-Model in cipher-mux

cipher-mux's architecture naturally supports multi-model routing:
- **Orchestrator:** use the most capable model (Opus). It makes decisions, decomposes problems, and coordinates — reasoning quality matters most here.
- **Workers:** use Sonnet for implementation tasks. Good balance of quality and speed.
- **Simple tasks:** if a worker's task is well-specified (e.g., "rename all instances of X to Y in files A, B, C"), Haiku is sufficient and faster.

The MPO's escalation system is an implicit multi-model pattern: Level 1-4 decisions (autonomous) could run on Sonnet, while Level 5 escalations (to the user) naturally involve the most capable model.

---

## Context Window Management

Guide 04 introduced the context window as RAM. Here is how to manage it actively.

### The "Lost in the Middle" Problem

Transformer attention creates pairwise relationships between tokens. In very long contexts, information in the middle gets less attention than information at the start or end — up to 30% less. This is a fundamental property of the architecture, not a bug.

**Practical consequence:** Put the most important information at the very beginning or very end of your context. Your CLAUDE.md loads at the top (good — it gets strong attention). Your current question goes at the end (good — recency bias helps). The danger zone is the middle: hours of accumulated conversation history, old corrections, abandoned approaches.

### The todo.md Attention Hack

A technique from the Manus AI team: maintain a \\\`todo.md\\\` or \\\`progress.md\\\` file that gets updated as work progresses. At the end of each major step, the model updates this file — pushing the current state and remaining tasks into the recency zone of the context.

In cipher-mux terms: the Orchestrator does this naturally via the task system (\\\`mux_task_update\\\`). The tasks' current state is always queryable, always recent.

### When to /compact vs. Start Fresh

**\\\`/compact\\\`** compresses the conversation history, keeping key information and discarding noise. Good when: you want to continue in the same direction, just with more room. Tip: add focus instructions: \\\`/compact Focus on the auth module changes and ignore the earlier discussion about database schema.\\\`

**Starting fresh** clears the entire context and begins from scratch. Surprisingly, this often outperforms compaction. Why? Claude can rediscover the current state by reading the filesystem — git log, file contents, test results. A fresh session with "Read the project state and continue the auth work" is cleaner than a compacted session carrying forward noise.

**Rule of thumb:**
- Working on the same narrow task? \\\`/compact\\\`
- Switching focus or session feels degraded? Start fresh
- After two failed fix attempts? Always start fresh (doom loop escape)

---

## Token-Efficient Work Patterns

### /clear Between Tasks

If you switch topics in the same session, use \\\`/clear\\\` to reset the context. This is the single highest-impact habit for token efficiency. Without it, your database schema discussion pollutes your CSS debugging.

### Subagents for Exploration

When you need to investigate something (scan the codebase for patterns, read documentation, explore alternatives), use a subagent. The subagent works in its own context window and returns a summary. Your main session stays clean.

In cipher-mux, this happens naturally: the Orchestrator delegates exploration to workers, keeping its own context focused on coordination.

### /btw for Side Questions

Claude Code has \\\`/btw\\\` — it answers a question in an overlay without entering the conversation history. Perfect for quick lookups: "/btw what is the default port for PostgreSQL?" You get the answer. The context is untouched.

### Stable Prompt Prefixes

This is a technical detail that matters economically. The Anthropic API caches prompt prefixes. If your system prompt and CLAUDE.md are identical between calls (same text, same order), cached tokens cost 10x less than fresh ones. This means:

- Do not put timestamps in CLAUDE.md (they change every second, breaking the cache)
- Keep CLAUDE.md stable — edit it deliberately, not frequently
- Consistent session setup pays for itself through cache hits

### Prefer Pointers Over Inline Content

Instead of pasting 200 lines of code into your prompt, use \\\`@path/to/file.ts:42-80\\\`. Claude reads the file directly, and the reference is a few tokens instead of hundreds. Same result, fraction of the cost.

---

## Session Lifecycle

### Signs It Is Time for a New Session

- Claude repeats itself or contradicts earlier statements
- Rules you established are being ignored
- Hallucinated file names or function names appear
- The context usage indicator is orange or red (80%+)
- You have been in the same session for more than 2 hours

None of these are failures. They are signals. Acting on them promptly saves more tokens than pushing through.

### The Handover Pattern

Before ending a productive session:

1. Ask Claude: "Fass den aktuellen Stand zusammen. Was ist fertig, was ist offen, welche Entscheidungen wurden getroffen?"
2. Save the summary to a file: \\\`docs/handover-YYYY-MM-DD.md\\\`
3. Start a new session
4. First message: "Lies docs/handover-YYYY-MM-DD.md und mach da weiter."

The new session has a clean context loaded with exactly the state it needs. This is the session-level equivalent of rebooting a computer — same work, fresh resources.

### The 2-Hour Heuristic

Experienced Claude Code users often start fresh every 1-2 hours as a habit, not because something went wrong. The cost is one handover (2 minutes). The benefit is consistently high-quality responses for the next session. It is like regularly saving your game — a small investment that prevents large losses.

---

## CLAUDE.md as Token Investment

Your CLAUDE.md is loaded into every session automatically. This means:

- A good CLAUDE.md saves tokens in every single interaction (Claude does not need to be told things it already knows)
- A bad CLAUDE.md wastes tokens in every single interaction (Claude processes irrelevant instructions, or worse, follows wrong ones)

### The Pruning Test (Revisited)

For every line: "Would removing this cause Claude to make a mistake?"

- If yes → keep it
- If Claude does it correctly without the instruction → remove it
- If it is aspirational but Claude ignores it → either rewrite it more forcefully or remove it

### What Belongs in CLAUDE.md

- Commands Claude cannot guess (custom build scripts, test runners)
- Code style rules that differ from language defaults
- Architectural decisions specific to your project
- Common gotchas and non-obvious behaviors

### What Does NOT Belong in CLAUDE.md

- Standard language conventions (Claude already knows these)
- File-by-file descriptions of the codebase (Claude can read the files)
- Information that changes frequently (it becomes stale)
- Long code examples (they become stale; use \\\`@file:line\\\` pointers)

---

## cipher-mux's Built-in Efficiency

cipher-mux has several features that support token-efficient work without you thinking about it:

**StatusLine Monitor:** Real-time context usage per session, visible in each cell header. Green = healthy, orange = 80%+ (getting full), red = 90%+ (critical). This is your dashboard for session health.

**Orchestrator Context Monitoring:** The Orchestrator checks worker context usage every 2 minutes. If a worker hits 90%, the Orchestrator can take action — finish the current sub-task, summarize, and start a fresh worker.

**Message Bus:** Lightweight asynchronous messaging. A status update on the bus is a few dozen tokens. The alternative — having two sessions share a full conversation — would cost thousands of tokens. The bus architecture is inherently token-efficient.

**Session Survival:** tmux sessions survive app crashes. This means no token loss from unexpected restarts. Recovery adopts sessions without re-creating context.

**Workspace Apply:** Spawning five sessions with one click is not just convenient — it avoids the token cost of manually setting up each session with its persona and project instructions. The workspace does that frontloading for you.

---

## Quick Reference: Efficiency Patterns

| Pattern | Token impact |
|---|---|
| /clear between tasks | High — prevents context pollution |
| Start fresh after 2 hours | High — prevents context rot |
| Handover technique | Medium — clean state transfer |
| /compact with focus | Medium — preserves context, reduces noise |
| /btw for side questions | Low per use, high over time |
| Stable CLAUDE.md (no timestamps) | High — 10x cheaper cached tokens |
| @file:line instead of pasting | Medium — saves hundreds of tokens per reference |
| Subagents for exploration | High — protects main context |
| Multi-model routing | High — right model for right task |

**This is the final guide in the learning path.** You now have the foundations (Guides 01-02), the power features (Guide 03), the prompting skills (Guides 04-05), and the efficiency knowledge to use it all sustainably.
`;
