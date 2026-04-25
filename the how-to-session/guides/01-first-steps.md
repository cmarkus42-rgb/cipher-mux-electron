# First Steps — From Launch to First Result

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
| **$** | Open a plain shell in the session's project directory |
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
