/** Typed IPC channel constants — all prefixed with cipher-mux: */

export const IPC = {
  // Sessions
  SESSIONS_LIST: 'cipher-mux:sessions:list',
  SESSIONS_START: 'cipher-mux:sessions:start',
  SESSIONS_STOP: 'cipher-mux:sessions:stop',
  SESSIONS_RECOVER: 'cipher-mux:sessions:recover',
  SESSION_CHANGED: 'cipher-mux:session-changed',
  SESSION_STOPPED: 'cipher-mux:session-stopped',

  // Terminals
  TERMINAL_DATA: 'cipher-mux:terminal:data',
  TERMINAL_WRITE: 'cipher-mux:terminal:write',
  TERMINAL_RESIZE: 'cipher-mux:terminal:resize',
  TERMINAL_SPLIT: 'cipher-mux:terminal:split',
  TERMINAL_CAPTURE: 'cipher-mux:terminal:capture',

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

  // Context Usage
  CONTEXT_GET: 'cipher-mux:context:get',
  CONTEXT_ALL: 'cipher-mux:context:all',
  CONTEXT_UPDATED: 'cipher-mux:context:updated',
  CONTEXT_WARNING: 'cipher-mux:context:warning',

  // Config
  CONFIG_GET: 'cipher-mux:config:get',
  CONFIG_SET: 'cipher-mux:config:set',
  CONFIG_SAVE_LAYOUT: 'cipher-mux:config:save-layout',

  // Orchestrator
  ORCHESTRATOR_START: 'cipher-mux:orchestrator:start',
  ORCHESTRATOR_STOP: 'cipher-mux:orchestrator:stop',
  ORCHESTRATOR_STATUS: 'cipher-mux:orchestrator:status',

  // Bugreport
  BUGREPORT_COLLECT: 'cipher-mux:bugreport:collect',
  BUGREPORT_EXPORT: 'cipher-mux:bugreport:export',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
