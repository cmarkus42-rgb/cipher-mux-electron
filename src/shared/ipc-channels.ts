/** Typed IPC channel constants — all prefixed with cipher-mux: */

export const IPC = {
  // Sessions
  SESSIONS_LIST: 'cipher-mux:sessions:list',
  SESSIONS_START: 'cipher-mux:sessions:start',
  SESSIONS_STOP: 'cipher-mux:sessions:stop',
  SESSIONS_RECOVER: 'cipher-mux:sessions:recover',
  SESSIONS_RECOVERY_RESULT: 'cipher-mux:sessions:recovery-result',
  SESSIONS_RECOVERY_ACTION: 'cipher-mux:sessions:recovery-action',
  SESSION_CHANGED: 'cipher-mux:session-changed',
  SESSION_STOPPED: 'cipher-mux:session-stopped',

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

  // Window
  WINDOW_FIT_GRID: 'cipher-mux:window:fit-grid',

  // Bugreport
  BUGREPORT_COLLECT: 'cipher-mux:bugreport:collect',
  BUGREPORT_SUBMIT: 'cipher-mux:bugreport:submit',
  BUGREPORT_ENRICH: 'cipher-mux:bugreport:enrich',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
