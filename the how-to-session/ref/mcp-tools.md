# MCP Tools Reference — cipher-mux v0.9.6

All tools available via the cipher-mux MCP server. Used by the Orchestrator, MPO, and any session with MCP access.

---

## Session Management

### mux_create_session

Create a new Claude Code session in a tmux pane.

| Parameter | Type | Required | Description |
|---|---|---|---|
| name | string | yes | Display name for the session |
| projectPath | string | yes | Absolute path to project directory |
| command | string | no | Initial command to run in the session |
| visible | boolean | no | If true, session appears in the grid with focus |

**Use case:** Orchestrator spawning a worker for a specific task.
**Returns:** Session object with id, name, tmuxSession.
**Note:** After creation, wait 8-10 seconds before sending instructions (Worker-Startup Protocol).

### mux_kill_session

Terminate a session and its tmux pane.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

**Use case:** Cleaning up completed or stuck workers.

### mux_sessions

List all active sessions.

*No parameters.*

**Returns:** Array of session objects (id, name, projectPath, tmuxSession, contextUsage).
**Use case:** Checking what is running before creating new sessions.

### mux_status

Get cipher-mux system health.

*No parameters.*

**Returns:** Session count, message bus availability, MCP server state.
**Use case:** Verifying the system is healthy before starting orchestration.

---

## Message Bus

### mux_send

Send a message to the bus, optionally with direct tmux delivery.

| Parameter | Type | Required | Description |
|---|---|---|---|
| topic | string | yes | Message topic: status, bug, review, chat, system |
| sender | string | yes | Sender identifier (e.g., session name) |
| text | string | yes | Message content |
| sessionId | string | no | Target session ID for direct tmux push delivery |
| sessionName | string | no | Target session name for direct tmux push delivery |

**Use case (bus only):** Status updates, progress reports. Other sessions read when they check.
**Use case (with sessionId):** Sending task instructions directly into a worker's terminal via tmux send-keys. This is how the Orchestrator delivers initial prompts.
**Important:** Without sessionId/sessionName, the message only goes to the bus. Sessions do not auto-read the bus — they must call mux_read explicitly.

### mux_read

Read messages from the bus.

| Parameter | Type | Required | Description |
|---|---|---|---|
| topic | string | no | Filter by topic (status, bug, review, chat, system) |
| limit | number | no | Max messages to return (default: 20) |

**Returns:** Array of messages (id, topic, sender, text, timestamp).
**Use case:** Orchestrator monitoring worker progress, reading bug reports.

---

## Context Monitoring

### mux_context_usage

Get real-time token usage from the StatusLine monitor.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | no | Specific session ID. Omit to get all sessions. |

**Returns:** Context usage data: tokens used, tokens total, percentage, cost estimate.
**Use case:** Checking if a worker has room for more work, detecting context-full sessions.

---

## Task Queue

### mux_task_create

Create a task in the persistent queue.

| Parameter | Type | Required | Description |
|---|---|---|---|
| title | string | yes | Task title |
| description | string | no | Detailed task description |
| source | string | no | Task origin (default: "orchestrator") |
| parent_id | string | no | Parent task ID (for sub-tasks) |
| policy | object | no | Execution policy (stall_timeout, max_retries, hooks) |

**Policy object:**
- `stall_timeout` (number) — seconds before task is considered stalled
- `max_retries` (number) — maximum retry attempts
- `hooks.before_run` (string) — shell command to run before task
- `hooks.after_run` (string) — shell command to run after task
- `hooks.timeout` (number) — hook timeout in seconds

**Returns:** Created task with ID.
**Use case:** Orchestrator creating work items, MPO creating sub-project tasks.

### mux_task_update

Update a task's state or result.

| Parameter | Type | Required | Description |
|---|---|---|---|
| task_id | string | yes | Task ID |
| state | enum | no | New state: dispatched, running, done, failed |
| session_id | string | no | Assigned session (required for dispatched→running) |
| result | object | no | Task result: { summary: string, data: any } |

**State machine:** queued → dispatched → running → done/failed
**Use case:** Worker reporting completion, Orchestrator tracking progress.

### mux_task_list

Query tasks with filters.

| Parameter | Type | Required | Description |
|---|---|---|---|
| state | string | no | Filter by state |
| source | string | no | Filter by source |
| parent_id | string | no | Filter by parent task ID |
| session_id | string | no | Filter by assigned session |

**Returns:** Array of matching tasks.

### mux_task_get

Get a single task with its children.

| Parameter | Type | Required | Description |
|---|---|---|---|
| task_id | string | yes | Task ID |

**Returns:** Task object including child tasks (sub-tasks).

---

## Bug Reports

### mux_bugreport_resolve

Mark a bugreport as fixed or failed.

| Parameter | Type | Required | Description |
|---|---|---|---|
| bugId | string | yes | Bug ID (e.g., BUG-2026-04-19-abc123) |
| status | enum | yes | Resolution: "fixed" or "failed" |
| summary | string | yes | What was done — fix description or failure reason |
| branchName | string | no | Git branch containing the fix (fixed only) |
| filesChanged | string[] | no | List of changed files |

**Use case:** Worker completing a bug fix, Orchestrator closing the bug.

---

## MPO Input Requests

### mux_input_request_create

Create a user-facing decision request in the sidebar.

| Parameter | Type | Required | Description |
|---|---|---|---|
| projectId | string | yes | Project or sub-project identifier |
| question | string | yes | The question for the user |
| context | string | no | Additional context (2-3 sentences) |
| options | array | no | Answer options (max 4) |
| recommendation | string | no | Key of the recommended option |

**Option object:** `{ key: string, label: string, description?: string }`

**Use case:** MPO escalating a Level 5 decision to the user. The bubble appears in the sidebar Input Requests tab.

---

## Project Launcher

### kickoff_complete

Signal that project scaffolding is finished.

| Parameter | Type | Required | Description |
|---|---|---|---|
| projectPath | string | yes | Absolute path to the project directory |
| projectName | string | yes | Project name (kebab-case) |
| detectedStack | string | no | Detected tech stack (e.g., "electron-ts", "python") |

**Use case:** The /launch skill calling this after completing scaffold. Triggers the transition from launcher session to interview session.
**Fallback:** If this tool is unavailable, writing an empty `.kickoff-complete` file in the project directory achieves the same effect.

---

## App Control

These tools let sessions control the cipher-mux UI — grid layout, session placement, sidebar visibility. Useful for the Voice Relay ("Zeig mir drei Fenster") and Companion ("Ich raeume das Grid auf").

### mux_grid_resize

Change the grid dimensions.

| Parameter | Type | Required | Description |
|---|---|---|---|
| cols | number | yes | Number of columns (1-7) |
| rows | number | yes | Number of rows (1-3) |

**Use case:** "Mach das Grid 2x2" → `mux_grid_resize(cols: 2, rows: 2)`.
**Note:** Sessions that no longer fit in the resized grid move to background.

### mux_grid_place

Place a session in a specific grid cell.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |
| col | number | yes | Column index (0-based) |
| row | number | yes | Row index (0-based) |

**Use case:** "Pack die Auth-Session nach links oben" → `mux_grid_place(sessionId, col: 0, row: 0)`.

### mux_session_focus

Focus a session in the grid.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

**Use case:** "Zeig mir die Payment-Session" → brings session into grid if in background, then focuses.

### mux_session_eject

Eject a session to background.

| Parameter | Type | Required | Description |
|---|---|---|---|
| sessionId | string | yes | Session ID (ULID) |

**Use case:** "Schieb die Session in den Hintergrund" → session continues running, moves to sidebar.

### mux_sidebar_toggle

Toggle sidebar visibility.

| Parameter | Type | Required | Description |
|---|---|---|---|
| visible | boolean | no | Force visible (true) or hidden (false). Omit to toggle. |

**Use case:** "Sidebar weg" → `mux_sidebar_toggle(visible: false)`.
