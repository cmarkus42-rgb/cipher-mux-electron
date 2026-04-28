# MCP Tools Reference

cipher-mux exposes 35 MCP tools via its Streamable HTTP server. All tools are available to any session with MCP access (entities with `features: ['mcp']`).

**Server:** `http://localhost:{port}/mcp` (port auto-assigned, see `.mcp-connection.md`)
**Auth:** Bearer token (auto-injected into `.mcp.json` per entity)

---

## Session Management

### `mux_sessions`
List all cipher-mux sessions.

**Parameters:** none

**Returns:** Array of `SessionInfo` objects (id, name, projectPath, status, entityId, etc.)

### `mux_create_session`
Create a new cipher-mux session (tmux session).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Session display name |
| `projectPath` | string | yes | Working directory |
| `command` | string | no | Initial command to run in the session |
| `visible` | boolean | no | If true, place session in the grid with focus |

**Example:**
```json
{ "name": "fix-auth", "projectPath": "/path/to/project", "visible": true }
```

### `mux_kill_session`
Kill a session by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session ID (ULID) |

### `mux_status`
Get cipher-mux system status (session count, service availability).

**Parameters:** none

### `mux_context_usage`
Get context window usage for sessions (from StatusLine monitor).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | no | Session ID. Omit to get all sessions. |

**Returns:** `{ usedPercentage, remainingPercentage, totalInputTokens, modelId, ... }`

---

## Messaging

### `mux_send`
Send a message to the message bus. Optionally push-deliver to a target session via tmux send-keys.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `topic` | string | yes | `status`, `bug`, `review`, `chat`, or `system` |
| `sender` | string | yes | Sender identifier (e.g. "Orchestrator") |
| `text` | string | yes | Message text |
| `sessionId` | string | no | Target session ID for push delivery |
| `sessionName` | string | no | Target session name for push delivery |
| `noEnter` | boolean | no | If true, don't send Enter after push-delivered text |

**Example:**
```json
{ "topic": "chat", "sender": "MPO", "text": "Worker 1 ist fertig." }
```

### `mux_read`
Read messages from the message bus.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `topic` | string | no | Filter by topic |
| `limit` | number | no | Max messages (default 20) |

---

## Task Management

### `mux_task_create`
Create a task in the persistent task queue.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Task title |
| `description` | string | no | Task description |
| `source` | string | no | Source identifier (e.g. "bugreport", "mpo") |
| `parent_id` | string | no | Parent task ID for subtasks |
| `policy` | string | no | Execution policy |

### `mux_task_update`
Update task state or progress.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | yes | Task ID |
| `state` | string | no | `queued`, `dispatched`, `running`, `done`, `failed` |
| `result` | string | no | Result summary |
| `session_id` | string | no | Assigned session ID |

### `mux_task_list`
List tasks with optional filters.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `state` | string | no | Filter by state |
| `source` | string | no | Filter by source |
| `parent_id` | string | no | Filter by parent task |
| `session_id` | string | no | Filter by assigned session |

### `mux_task_get`
Get a task by ID, including its children.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | yes | Task ID |

---

## Notes

### `mux_notes_create`
Create a new note.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Note title |
| `body` | string | no | Markdown body |
| `tags` | string[] | no | Tags (e.g. `["bugreport", "open"]`) |

**Example:**
```json
{ "title": "BUG: Grid flicker on resize", "body": "## Steps\n1. Resize grid...", "tags": ["bugreport", "open"] }
```

### `mux_notes_list`
List all notes with optional tag filter.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tag` | string | no | Filter by tag |

### `mux_notes_read`
Read a note by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Note ID |

### `mux_notes_update`
Partial update of a note (title, body, tags).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Note ID |
| `title` | string | no | New title |
| `body` | string | no | New body |
| `tags` | string[] | no | New tags (replaces existing) |

### `mux_notes_search`
Full-text search over notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query |
| `tag` | string | no | Filter by tag |

### `mux_notes_delete`
Delete a note by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Note ID |

### `mux_notes_handoff_create`
Create a handoff note for inter-session communication.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Note title |
| `body` | string | yes | Content |
| `from_session` | string | yes | Sending session name |
| `to_entity` | string | no | Target entity ID or "any" |
| `tags` | string[] | no | Additional tags |

### `mux_notes_handoff_search`
Search for handoff notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to_entity` | string | no | Filter by target entity |
| `status` | string | no | Filter by handoff status (`pending`, `read`, `acted`) |

---

## Companion Memory

### `companion_memory_write`
Write a memory to the companion memory store.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Memory content |
| `kind` | enum | yes | `fact`, `preference`, `interaction`, or `event` |
| `session_id` | string | no | Session that created this memory |
| `context_tags` | string[] | no | Context tags |
| `salience` | number | no | Importance 0..1 (default 0.5) |

### `companion_memory_recall`
Recall recent memories (newest first).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `limit` | number | no | Max results (default 20) |
| `entity_filter` | string | no | Filter by memory kind |
| `since_hours` | number | no | Only memories from the last N hours |

### `companion_memory_search`
Full-text search over memories.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query |
| `limit` | number | no | Max results (default 10) |

### `companion_memory_forget`
Delete a memory by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `memory_id` | string | yes | Memory ID to delete |

---

## Grid & UI Control

### `mux_grid_resize`
Resize the session grid layout.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `cols` | number | yes | Number of columns (1-7) |
| `rows` | number | yes | Number of rows (1-3) |

### `mux_grid_place`
Place a session in a specific grid cell.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session ID |
| `col` | number | yes | Column index (0-based) |
| `row` | number | yes | Row index (0-based) |

### `mux_session_focus`
Focus a session in the grid (scroll to it, highlight).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session ID |

### `mux_session_eject`
Eject a session from the grid to background.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session ID |

### `mux_sidebar_toggle`
Toggle sidebar visibility.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `visible` | boolean | no | Explicit state. Omit to toggle. |

---

## Demo & Presentation

### `mux_ui_highlight`
Highlight a UI element with a visual effect.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | yes | Value of `data-highlight` attribute |
| `duration` | number | no | Milliseconds (default 3000, `0` = permanent) |
| `style` | enum | no | `"glow"` (default, border box-shadow) or `"outline"` |
| `clear` | boolean | no | `true` = remove all highlights |

**Known targets:** `sb-voice`, `sb-grid-cols`, `sb-workspaces`, `sb-sidebar`, `sb-theme`, `sb-info`, `cell-{col}-{row}`, `cell-head-{col}-{row}`, `side-messages`, `side-background`, `side-notes`, `side-requests`, `side-memory`, `side-note-{id}`, `popup-workspace`, `popup-launcher`, `popup-info`

### `mux_ui_open`
Open, close, or toggle a popup/dialog.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | yes | Dialog name |
| `action` | enum | no | `"open"` (default), `"close"`, or `"toggle"` |
| `context` | object | no | Additional context (e.g. `{ cell: "1-0", tab: "voice" }`) |

**Known targets:** `workspace-popup`, `info-dialog`, `launcher-popup`, `bugreport-dialog`

### `mux_theme_set`
Set the active UI theme.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme` | string | yes | Theme ID |

**Valid IDs:** `cipher-ivory`, `cipher-dark`, `blueprint`, `warm-paper`, `gruvbox-dark`, `nord`, `synthwave`, `matrix`, `brutalist`, `high-contrast`

---

## Voice / TTS

### `mux_tts_speak`
Speak text aloud via TTS. Use this to read responses to the user. Only speak key messages — skip code, tool output, and debug info.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Text to speak aloud |
| `priority` | enum | no | `"normal"` (queue after current) or `"interrupt"` (stop current, play immediately) |

**Requires:** Voice mode must be active (user enables via StatusBar).

**Example:**
```json
{ "text": "Drei Sessions laufen. Alles im gruenen Bereich.", "priority": "normal" }
```

---

## Other

### `kickoff_complete`
Signal that a project launcher has completed scaffolding.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | yes | Path to the scaffolded project |
| `summary` | string | no | Summary of what was created |

### `mux_bugreport_resolve`
Resolve a bugreport (move from outbox to inbox).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bugId` | string | yes | Bug ID |
| `status` | string | yes | `fixed` or `failed` |
| `summary` | string | yes | What was done |
| `branchName` | string | no | Git branch with the fix |
| `filesChanged` | string[] | no | List of changed files |

### `mux_input_request_create`
Create an input request for the MPO sidebar (bubble question).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `question` | string | yes | The question to ask |
| `context` | string | no | Background context |
| `options` | array | yes | Array of `{ key, label, description }` |
| `recommendation` | string | no | Recommended option key |
