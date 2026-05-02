# Power Moves — Orchestrator, MPO, Launcher, and Workspaces

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
2. Creates worker sessions for each sub-task (`mux_create_session`)
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
2. The report lands in the bugreport outbox (`~/.config/cipher-mux/bugreports/outbox/`)
3. The Orchestrator detects the new report
4. It creates a worker session named `fix-{bugId}`
5. The worker diagnoses and fixes the bug
6. The Orchestrator calls `mux_bugreport_resolve` to mark it done
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
A dedicated launcher session starts in the global template directory (`~/.config/cipher-mux/projectlauncher/`). It reads your requirements, analyzes the project scope, and generates the project skeleton in your target directory. This takes 2-10 minutes depending on complexity.

The scaffold includes:
- `CLAUDE.md` — project instructions for Claude Code
- `docs/SPEC.md` — technical specification skeleton
- `.claude/` — settings and skills directory
- `.gitignore` — sensible defaults
- `docs/decisions/` — ADR (Architecture Decision Record) directory

**Stage 2 — Interview:**
Once scaffolding is complete (detected by a marker file or MCP call), a new session opens in the target project directory and starts the `/interview` skill — a structured requirements gathering process.

### Writing Good Requirements

The Launcher is only as good as the input you give it. A good requirements document includes:

- **Goal:** one sentence describing what this project does
- **Target audience:** who will use it
- **Functional requirements:** numbered list of what it must do
- **Constraints:** tech stack, design preferences, what it must NOT do
- **Non-functional requirements:** performance, security, accessibility needs

You do not need perfect prose. Bullet points work. The key is completeness — every missing piece is a gap the Launcher has to guess at.

**A good requirements file (example):**
```
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
```

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

When you save a persona, cipher-mux automatically generates a skill file at `.claude/skills/personas/<persona-name>/SKILL.md`. This means persona prompts are available as Claude Code skills in any project that has the cipher-mux skill directory linked.

---

## What You Learned

- **Orchestrator:** air traffic controller for task delegation and bug processing
- **MPO:** film director for multi-project decomposition with autonomous decision-making
- **Launcher:** site foreman who scaffolds projects before development begins
- **Workspaces:** saved grid layouts with persona and project assignments
- **Personas:** named roles with colors and prompts that shape Claude's behavior

**Next step:** Guide 05 (Prompting in cipher-mux) teaches you how to write effective instructions for these systems — the Orchestrator expects a different prompt style than a regular session.
