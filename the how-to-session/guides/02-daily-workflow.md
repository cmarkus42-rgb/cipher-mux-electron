# Daily Workflow — The Features You Use Every Day

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

**Opening a shell:** The $ button in a cell header opens a plain terminal shell in that session's project directory. No Claude, just a regular shell — for running tests, checking git status, or anything you would do in a terminal.

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
Voice input uses a local Whisper model — no internet required, no data sent anywhere. The model file lives at `~/.config/cipher-mux/models/whisper/ggml-small.bin`. If the model is missing, voice features are disabled.

### How to Use
1. **Enable:** Click the Voice pill in the status bar. The LED turns green (ready).
2. **Talk:** Start speaking. The Silero VAD (voice activity detector) runs in the browser — it detects when you are speaking and starts recording automatically. The LED turns red (recording).
3. **Stop talking.** After a brief silence, recording stops. The LED turns yellow (processing) while Whisper transcribes your speech.
4. **Text appears** in the focused session — but it is NOT submitted yet. You can review it first.
5. **Submit:** Say "abschicken", "absenden", or "senden" — this presses Enter. Or say "neue Zeile" for a newline without submitting.

### Tips for Effective Voice Input
- Speak in complete thoughts. Pauses trigger end-of-speech detection.
- Voice is for natural language instructions, not code. Say "Erstell eine Funktion die Preise berechnet" — do not try to dictate `function calculatePrice(items) { ... }`.
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
```yaml
---
title: My Note Title
tags: [design, frontend, urgent]
---
```
The title shows in the sidebar Notes tab and the cell tab bar. Tags are used for filtering and are auto-suggested.

### Auto-Save and Tagging
- **Auto-save:** Your note is saved to disk automatically after 2 seconds of inactivity. No tagging happens on auto-save.
- **Manual save (Cmd+S):** Saves AND triggers Ollama auto-tagging. The local Ollama model (gemma3:4b) reads your note content and suggests up to 5 tags from a repository of predefined + learned tags. You can accept, modify, or ignore the suggestions.

### Note Storage
- **Global notes:** `~/.config/cipher-mux/notes/` — available in all workspaces
- **Workspace-scoped notes:** `~/.config/cipher-mux/notes/workspace-<id>/` — tied to a specific workspace

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

**Agent Settings:** "Skip Permissions" toggle — when enabled, Claude Code runs with `--dangerously-skip-permissions`, meaning it will not ask before editing files or running commands. Leave this off until you trust your setup. It is a power-user feature.

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
