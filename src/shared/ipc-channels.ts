/** Typed IPC channel constants — all prefixed with cipher-mux: */

export const IPC = {
  // Sessions
  SESSIONS_LIST: 'cipher-mux:sessions:list',
  SESSIONS_START: 'cipher-mux:sessions:start',
  SESSIONS_STOP: 'cipher-mux:sessions:stop',
  SESSIONS_RECOVER: 'cipher-mux:sessions:recover',
  SESSIONS_RECOVERY_RESULT: 'cipher-mux:sessions:recovery-result',
  SESSIONS_RECOVERY_ACTION: 'cipher-mux:sessions:recovery-action',
  SESSIONS_RECOVERY_DECLINE: 'cipher-mux:sessions:recovery-decline',
  SESSION_CHANGED: 'cipher-mux:session-changed',
  SESSION_CLOSING: 'cipher-mux:session-closing',
  SESSION_STOPPED: 'cipher-mux:session-stopped',
  SESSION_VISIBLE_ADD: 'cipher-mux:session:visible-add',
  SESSION_FORK: 'cipher-mux:session:fork',
  SESSION_ORPHANS: 'cipher-mux:session:orphans',
  SESSION_ORPHANS_DETECTED: 'cipher-mux:session:orphans-detected',

  // Terminals
  TERMINAL_DATA: 'cipher-mux:terminal:data',
  TERMINAL_WRITE: 'cipher-mux:terminal:write',
  TERMINAL_RESIZE: 'cipher-mux:terminal:resize',
  TERMINAL_SPLIT: 'cipher-mux:terminal:split',
  TERMINAL_CAPTURE: 'cipher-mux:terminal:capture',
  TERMINAL_READY: 'cipher-mux:terminal:ready',

  // Message Bus
  MESSAGES_SEND: 'cipher-mux:messages:send',
  MESSAGES_LIST: 'cipher-mux:messages:list',
  MESSAGES_UNREAD: 'cipher-mux:messages:unread',
  MESSAGES_MARK_READ: 'cipher-mux:messages:mark-read',
  MESSAGE_RECEIVED: 'cipher-mux:message-received',

  // Projects
  PROJECTS_LIST: 'cipher-mux:projects:list',
  PROJECTS_SCAN: 'cipher-mux:projects:scan',
  PROJECTS_KICKOFF: 'cipher-mux:projects:kickoff',
  PROJECT_KICKOFF_COMPLETED: 'cipher-mux:projects:kickoff-completed',

  // Context Usage
  CONTEXT_GET: 'cipher-mux:context:get',
  CONTEXT_ALL: 'cipher-mux:context:all',
  CONTEXT_UPDATED: 'cipher-mux:context:updated',
  CONTEXT_WARNING: 'cipher-mux:context:warning',

  // Config
  CONFIG_GET: 'cipher-mux:config:get',
  CONFIG_SET: 'cipher-mux:config:set',
  CONFIG_SAVE_GRID: 'cipher-mux:config:save-grid',

  // Dialogs
  DIALOG_OPEN_FILE: 'cipher-mux:dialog:open-file',
  DIALOG_OPEN_DIR: 'cipher-mux:dialog:open-dir',

  // Orchestrator
  ORCHESTRATOR_START: 'cipher-mux:orchestrator:start',
  ORCHESTRATOR_STOP: 'cipher-mux:orchestrator:stop',
  ORCHESTRATOR_STATUS: 'cipher-mux:orchestrator:status',
  ORCHESTRATOR_STARTED: 'cipher-mux:orchestrator:started',

  // MPO (Multi-Project Orchestrator)
  MPO_START: 'cipher-mux:mpo:start',
  MPO_STOP: 'cipher-mux:mpo:stop',
  MPO_STATUS: 'cipher-mux:mpo:status',
  MPO_STARTED: 'cipher-mux:mpo:started',

  // Window
  WINDOW_FIT_GRID: 'cipher-mux:window:fit-grid',
  WINDOW_OPEN_WORKSPACES: 'cipher-mux:window:open-workspaces',

  // Bugreport
  BUGREPORT_COLLECT: 'cipher-mux:bugreport:collect',
  BUGREPORT_SUBMIT: 'cipher-mux:bugreport:submit',
  BUGREPORT_ENRICH: 'cipher-mux:bugreport:enrich',
  BUGREPORT_PICK_SCREENSHOT: 'cipher-mux:bugreport:pick-screenshot',

  // Voice
  VOICE_AVAILABLE: 'cipher-mux:voice:available',
  VOICE_START: 'cipher-mux:voice:start',
  VOICE_STOP: 'cipher-mux:voice:stop',
  VOICE_AUDIO_CHUNK: 'cipher-mux:voice:audio-chunk',
  VOICE_STATE: 'cipher-mux:voice:state',
  VOICE_TRANSCRIPTION: 'cipher-mux:voice:transcription',
  VOICE_AGENT_TEXT: 'cipher-mux:voice:agent-text',
  VOICE_AGENT_AUDIO: 'cipher-mux:voice:agent-audio',
  VOICE_INTERVIEW_DONE: 'cipher-mux:voice:interview-done',
  VOICE_PLAYBACK_DONE: 'cipher-mux:voice:playback-done',
  VOICE_ERROR: 'cipher-mux:voice:error',
  VOICE_VAD_SPEECH_START: 'cipher-mux:voice:vad-speech-start',
  VOICE_VAD_SPEECH_END: 'cipher-mux:voice:vad-speech-end',
  VOICE_VAD_MISFIRE: 'cipher-mux:voice:vad-misfire',
  VOICE_GENERATION_DONE: 'cipher-mux:voice:generation-done',
  VOICE_STOP_PLAYBACK: 'cipher-mux:voice:stop-playback',

  // Input Requests (MPO)
  MPO_INPUT_REQUESTS: 'cipher-mux:mpo:input-requests',
  MPO_REQUEST_ANSWERED: 'cipher-mux:mpo:request-answered',
  MPO_OPEN_REVIEW: 'cipher-mux:mpo:open-review',
  MPO_REQUEST_UPDATE: 'cipher-mux:mpo:request-update',

  // Voice Session Input
  VOICE_START_SESSION: 'cipher-mux:voice:start-session',
  VOICE_START_COM: 'cipher-mux:voice:start-com',
  VOICE_STOP_COM: 'cipher-mux:voice:stop-com',
  VOICE_SET_ROUTING_MODE: 'cipher-mux:voice:set-routing-mode',
  VOICE_SESSION_TARGET: 'cipher-mux:voice:session-target',
  VOICE_DISPATCHED: 'cipher-mux:voice:dispatched',
  VOICE_COM_STATE: 'cipher-mux:voice:com-state',
  VOICE_PIN: 'cipher-mux:voice:pin',
  VOICE_PIN_STATUS: 'cipher-mux:voice:pin-status',
  VOICE_ACTIVE_SESSION: 'cipher-mux:voice:active-session',
  VOICE_NOTES_FOCUS: 'cipher-mux:voice:notes-focus',
  VOICE_NOTES_INSERT: 'cipher-mux:voice:notes-insert',

  // Personas
  PERSONAS_LIST: 'cipher-mux:personas:list',
  PERSONAS_SAVE: 'cipher-mux:personas:save',
  PERSONAS_DELETE: 'cipher-mux:personas:delete',

  // Workspaces
  WORKSPACES_LIST: 'cipher-mux:workspaces:list',
  WORKSPACES_SAVE: 'cipher-mux:workspaces:save',
  WORKSPACES_DELETE: 'cipher-mux:workspaces:delete',
  WORKSPACES_APPLY: 'cipher-mux:workspaces:apply',
  WORKSPACES_ACTIVE: 'cipher-mux:workspaces:active',

  // Theme
  THEME_CHANGED: 'cipher-mux:theme:changed',

  // Sidebar
  SIDEBAR_DETACH: 'cipher-mux:sidebar:detach',
  SIDEBAR_REATTACH: 'cipher-mux:sidebar:reattach',
  SIDEBAR_REATTACHED: 'cipher-mux:sidebar:reattached',
  SIDEBAR_CLOSED: 'cipher-mux:sidebar:closed',
  SIDEBAR_DOCK: 'cipher-mux:sidebar:dock',
  SIDEBAR_TOGGLE_WINDOW: 'cipher-mux:sidebar:toggle-window',

  // Tasks
  TASKS_LIST: 'cipher-mux:tasks:list',
  TASKS_GET: 'cipher-mux:tasks:get',
  TASKS_RETRY: 'cipher-mux:tasks:retry',
  TASKS_CANCEL: 'cipher-mux:tasks:cancel',
  TASK_CREATED: 'cipher-mux:task:created',
  TASK_STATE_CHANGED: 'cipher-mux:task:state-changed',

  // Notes
  NOTES_LIST: 'cipher-mux:notes:list',
  NOTES_READ: 'cipher-mux:notes:read',
  NOTES_SAVE: 'cipher-mux:notes:save',
  NOTES_CREATE: 'cipher-mux:notes:create',
  NOTES_DELETE: 'cipher-mux:notes:delete',
  NOTES_TAGS: 'cipher-mux:notes:tags',
  NOTES_TAG_LIST: 'cipher-mux:notes:tag-list',
  NOTES_TAG_CREATE: 'cipher-mux:notes:tag-create',
  NOTES_TAG_RENAME: 'cipher-mux:notes:tag-rename',
  NOTES_TAG_UPDATE: 'cipher-mux:notes:tag-update',
  NOTES_TAG_DELETE: 'cipher-mux:notes:tag-delete',
  NOTES_SCREENSHOT: 'cipher-mux:notes:screenshot',
  NOTES_PARSE_TESTCASE: 'cipher-mux:notes:parse-testcase',
  NOTES_SERIALIZE_TESTCASE: 'cipher-mux:notes:serialize-testcase',
  NOTES_CHANGED: 'cipher-mux:notes:changed',

  // Grid Control (MCP App-Control)
  GRID_RESIZE: 'cipher-mux:grid:resize',
  GRID_PLACE: 'cipher-mux:grid:place',
  SESSION_FOCUS: 'cipher-mux:session:focus',
  SESSION_EJECT: 'cipher-mux:session:eject',
  SIDEBAR_TOGGLE: 'cipher-mux:sidebar:toggle',
  CELL_SCROLL: 'cipher-mux:cell:scroll',
  GRID_NAV: 'cipher-mux:grid:nav',
  KEEP_WORKING_RESTORE: 'cipher-mux:keep-working:restore',
  KEEP_WORKING_PULL: 'cipher-mux:keep-working:pull',

  // Companion Memory
  COMPANION_RECALL: 'cipher-mux:companion:recall',
  COMPANION_LIST_MEMORIES: 'cipher-mux:companion:list-memories',
  COMPANION_DELETE_MEMORY: 'cipher-mux:companion:delete-memory',
  COMPANION_SEARCH: 'cipher-mux:companion:search',

  // Characters (Companion Persona)
  CHARACTERS_LIST: 'cipher-mux:characters:list',
  CHARACTERS_SAVE: 'cipher-mux:characters:save',
  CHARACTERS_DELETE: 'cipher-mux:characters:delete',
  CHARACTERS_SWITCH: 'cipher-mux:characters:switch',
  CHARACTERS_ACTIVE: 'cipher-mux:characters:active',
  CHARACTERS_GLOBAL_PERSONA_GET: 'cipher-mux:characters:global-persona:get',
  CHARACTERS_GLOBAL_PERSONA_SET: 'cipher-mux:characters:global-persona:set',
  ENTITY_PERSONA_OVERRIDE_GET: 'cipher-mux:entity:persona-override:get',
  ENTITY_PERSONA_OVERRIDE_SET: 'cipher-mux:entity:persona-override:set',

  // LLM Provider
  LLM_TEST_CONNECTION: 'cipher-mux:llm:test-connection',
  LLM_LIST_MODELS: 'cipher-mux:llm:list-models',

  // UI Control (Companion Demo Mode)
  UI_HIGHLIGHT: 'cipher-mux:ui:highlight',
  UI_OPEN: 'cipher-mux:ui:open',
  THEME_SET: 'cipher-mux:theme:set',

  // BT Shutter Remote
  BT_SHUTTER_EVENT: 'cipher-mux:bt-shutter:event',
  BT_SHUTTER_STATUS: 'cipher-mux:bt-shutter:status',

  // Entity Framework
  ENTITY_START: 'cipher-mux:entity:start',
  ENTITY_RESUME: 'cipher-mux:entity:resume',
  ENTITY_STOP: 'cipher-mux:entity:stop',
  ENTITY_STATUS: 'cipher-mux:entity:status',
  ENTITY_LIST: 'cipher-mux:entity:list',
  ENTITY_STARTED: 'cipher-mux:entity:started',

  // Presets (Entity CLAUDE.md Editor)
  PRESETS_LIST: 'cipher-mux:presets:list',
  PRESETS_READ: 'cipher-mux:presets:read',
  PRESETS_SAVE: 'cipher-mux:presets:save',
  PRESETS_CREATE: 'cipher-mux:presets:create',
  PRESETS_DELETE: 'cipher-mux:presets:delete',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
