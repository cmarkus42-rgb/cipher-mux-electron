# MCP Tools Reference

cipher-mux exposes 37 MCP tools via its Streamable HTTP server. All tools are available to any session with MCP access (entities with `features: ['mcp']`).

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
| `source` | string | no | Task source (default: "orchestrator") |
| `parent_id` | string | no | Parent task ID for subtasks |
| `policy` | object | no | Execution policy (see below) |

**Policy object:**
```json
{
  "stall_timeout": 60000,
  "max_retries": 2,
  "hooks": {
    "before_run": "echo start",
    "after_run": "echo done",
    "timeout": 5000
  }
}
```

### `mux_task_update`
Update task state or progress.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `task_id` | string | yes | Task ID |
| `state` | string | no | `dispatched`, `running`, `done`, or `failed` |
| `session_id` | string | no | Session ID (required for dispatched -> running) |
| `result` | object | no | Result object: `{ summary?: string, data?: any }` |

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
Create a new note. The title is prepended as a `# heading` to the body automatically.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Note title |
| `body` | string | yes | Markdown body (without the title heading) |
| `tags` | string[] | no | Tags for categorization (max 5, lowercase) |

**Example:**
```json
{ "title": "BUG: Grid flicker on resize", "body": "## Steps\n1. Resize grid...", "tags": ["bugreport", "open"] }
```

### `mux_notes_list`
List all notes with optional tag filter.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tags` | string[] | no | Filter by tags -- only notes with at least one matching tag |

### `mux_notes_read`
Read a note by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Note ID (ULID) |

### `mux_notes_update`
Partial update of a note (title, body, tags, handoff_status).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Note ID (ULID) |
| `title` | string | no | New title (updates the `# heading` in body) |
| `body` | string | no | New body (replaces entire body) |
| `tags` | string[] | no | New tags (max 5, replaces existing) |
| `handoff_status` | enum | no | `"pending"` or `"consumed"` (for handoff notes) |

### `mux_notes_search`
Full-text search over notes. Max 50 results, title matches ranked first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query (case-insensitive against title and body) |
| `tags` | string[] | no | Filter by tags -- only notes with at least one matching tag |

### `mux_notes_delete`
Delete a note by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Note ID (ULID) |

### `mux_notes_handoff_create`
Create a handoff note for inter-session communication. Always tagged `"handoff"` with global scope.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `title` | string | yes | Handoff title, e.g. "Handoff: Auth refactor context" |
| `body` | string | yes | Markdown body with context, findings, next steps |
| `from_session` | string | yes | Name of the session creating this handoff |
| `to_entity` | string | no | Target entity ID or `"any"` (default) |

### `mux_notes_handoff_search`
Search for handoff notes. Returns newest first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `to_entity` | string | no | Filter by target entity |
| `status` | enum | no | `"pending"` or `"consumed"` (default: `"pending"`) |

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
Full-text search over memories (FTS5 syntax supported).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | yes | Search query |
| `limit` | number | no | Max results (default 20) |

### `companion_memory_forget`
Delete a memory by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | yes | Memory ID (ULID) |

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
Focus a session in the grid (scroll to it, highlight). Background sessions are brought into the grid first.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session ID |

### `mux_session_eject`
Eject a session from the grid to background. The session continues running but is no longer visible.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | yes | Session ID |

### `mux_sidebar_toggle`
Toggle sidebar visibility.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `visible` | boolean | no | Explicit state. Omit to toggle. |

### `mux_cell_scroll`
Scroll a terminal cell in the grid.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `sessionId` | string | no | Target session ID. If omitted, uses the calling session. |
| `cell` | string | no | Target cell by grid position (e.g. `"cell-0-0"`). Alternative to sessionId. |
| `action` | enum | yes | `"up"`, `"down"`, `"top"`, `"bottom"`, or `"to-marker"` |
| `lines` | number | no | Lines to scroll (only for up/down). Default: ~1 page. |

**Actions:**
- `up` / `down` -- scroll by ~1 page (or `lines` if specified)
- `top` / `bottom` -- jump to extremes
- `to-marker` -- jump to the start of the last response (marker set automatically on each user submission)

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

**Known targets:** `sb-voice`, `sb-grid`, `sb-workspaces`, `sb-sidebar`, `sb-theme`, `sb-info`, `cell-{col}-{row}`, `cell-head-{col}-{row}`, `side-messages`, `side-background`, `side-notes`, `side-requests`, `side-memory`, `side-note-{id}`, `side-session-{id}`, `side-message-{id}`, `popup-workspace`, `popup-launcher`, `popup-info`

### `mux_ui_open`
Open, close, or toggle a popup/dialog.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `target` | string | yes | Dialog name (alias `"settings"` resolves to `"info-dialog"`) |
| `action` | enum | no | `"open"`, `"close"`, or `"toggle"` (default: `"toggle"`) |
| `context` | object | no | Additional context (e.g. `{ "cell": "1-0", "tab": "themes" }`) |

**Known targets:** `workspace-popup`, `info-dialog` (alias: `settings`), `launcher-popup`

### `mux_theme_set`
Set the active UI theme.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `theme` | string | yes | Theme ID |

**Valid IDs:** `cipher-ivory`, `cipher-dark`, `blueprint`, `warm-paper`, `gruvbox-dark`, `nord`, `synthwave`, `matrix`, `brutalist`, `high-contrast`

### `mux_ui_choreography`
Play a timeline of UI actions client-side with precise timing. One call replaces many sequential `mux_theme_set` / `mux_ui_highlight` calls. Actions execute in the renderer with no network roundtrip between steps. Max 100 steps, max 30s total duration.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `timeline` | array | yes | Array of timed UI actions (see below) |

**Timeline step object:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `at` | number | yes | Milliseconds from timeline start |
| `action` | enum | yes | `"theme"`, `"highlight"`, `"highlight_clear"`, `"open"`, `"close"`, `"grid_resize"`, or `"sidebar"` |
| `value` | string | no | Theme ID (for `action=theme`) |
| `target` | string | no | Element target (highlight: `data-highlight` attr; open/close: popup ID) |
| `duration` | number | no | Highlight duration in ms (default 3000) |
| `style` | enum | no | `"glow"` or `"outline"` (default: `"glow"`) |
| `cols` | number | no | Grid columns 1-7 (for `action=grid_resize`) |
| `rows` | number | no | Grid rows 1-3 (for `action=grid_resize`) |
| `visible` | boolean | no | Sidebar visibility (for `action=sidebar`; omit to toggle) |

**Example:**
```json
{
  "timeline": [
    { "at": 0, "action": "theme", "value": "synthwave" },
    { "at": 500, "action": "highlight", "target": "sb-theme", "duration": 2000 },
    { "at": 3000, "action": "theme", "value": "cipher-dark" },
    { "at": 3500, "action": "highlight_clear" }
  ]
}
```

---

## Voice / TTS

### `mux_tts_speak`
Speak text aloud via TTS. Use this to read responses to the user. Only speak key messages -- skip code, tool output, and debug info.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | yes | Text to speak aloud |
| `priority` | enum | no | `"normal"` (queue after current) or `"interrupt"` (stop current, play immediately) |

**Requires:** Voice mode must be active (user enables via StatusBar), or falls back to macOS `say`.

**Example:**
```json
{ "text": "Drei Sessions laufen. Alles im gruenen Bereich.", "priority": "normal" }
```

---

## Other

### `kickoff_complete`
Signal that a project launcher has completed scaffolding. cipher-mux reacts by opening a new Claude session in the project directory.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectPath` | string | yes | Absolute path to the project directory |
| `projectName` | string | yes | Project name (kebab-case, from directory name) |
| `detectedStack` | string | no | Detected tech stack (e.g. "kotlin-android", "electron-ts", "python") |

### `mux_bugreport_resolve`
Resolve a bugreport (move from outbox to inbox).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `bugId` | string | yes | Bug ID (e.g. BUG-2026-04-19-abc123) |
| `status` | enum | yes | `"fixed"` or `"failed"` |
| `summary` | string | yes | What was done |
| `branchName` | string | no | Git branch with the fix |
| `filesChanged` | string[] | no | List of changed files |

### `mux_input_request_create`
Create an input request for the MPO sidebar (bubble question).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | yes | Project identifier |
| `question` | string | yes | The question to ask |
| `context` | string | no | Background context (2-3 sentences) |
| `options` | array | no | Array of `{ key, label, description? }` (max 4) |
| `recommendation` | string | no | Recommended option key |
