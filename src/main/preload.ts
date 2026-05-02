import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'

/**
 * Preload script — exposes window.cipherMux API via contextBridge.
 * All renderer access to the main process goes through this API.
 */
const api = {
  // ─── Sessions ──────────────────────────────────────────
  sessions: {
    list: () => ipcRenderer.invoke(IPC.SESSIONS_LIST),
    start: (opts: unknown) => ipcRenderer.invoke(IPC.SESSIONS_START, opts),
    stop: (sessionId: string) => ipcRenderer.invoke(IPC.SESSIONS_STOP, { sessionId }),
    recover: () => ipcRenderer.invoke(IPC.SESSIONS_RECOVER),
    onChanged: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.SESSION_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.SESSION_CHANGED, handler)
    },
    onClosing: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.SESSION_CLOSING, handler)
      return () => ipcRenderer.removeListener(IPC.SESSION_CLOSING, handler)
    },
    onStopped: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.SESSION_STOPPED, handler)
      return () => ipcRenderer.removeListener(IPC.SESSION_STOPPED, handler)
    },
    onRecoveryResult: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.SESSIONS_RECOVERY_RESULT, handler)
      return () => ipcRenderer.removeListener(IPC.SESSIONS_RECOVERY_RESULT, handler)
    },
    recoveryAction: (action: string, tmuxSession: string, displayName?: string) =>
      ipcRenderer.invoke(IPC.SESSIONS_RECOVERY_ACTION, { action, tmuxSession, displayName }),
    recoveryDecline: () => ipcRenderer.invoke(IPC.SESSIONS_RECOVERY_DECLINE),
    onVisibleAdd: (cb: (data: { sessionId: string }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string }) => cb(data)
      ipcRenderer.on(IPC.SESSION_VISIBLE_ADD, handler)
      return () => ipcRenderer.removeListener(IPC.SESSION_VISIBLE_ADD, handler)
    },
    capture: (sessionId: string): Promise<string | null> => ipcRenderer.invoke('cipher-mux:sessions:capture', sessionId),
    fork: (sessionId: string) => ipcRenderer.invoke(IPC.SESSION_FORK, { sessionId }),
    detectOrphans: () => ipcRenderer.invoke(IPC.SESSION_ORPHANS),
    onOrphansDetected: (cb: (data: unknown[]) => void) => {
      const handler = (_e: unknown, data: unknown[]) => cb(data)
      ipcRenderer.on(IPC.SESSION_ORPHANS_DETECTED, handler)
      return () => ipcRenderer.removeListener(IPC.SESSION_ORPHANS_DETECTED, handler)
    },
  },

  // ─── Terminal ──────────────────────────────────────────
  terminal: {
    write: (paneId: string, data: string) =>
      ipcRenderer.send(IPC.TERMINAL_WRITE, { paneId, data }),
    resize: (paneId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.TERMINAL_RESIZE, { paneId, cols, rows }),
    split: (paneId: string, direction: string) =>
      ipcRenderer.invoke(IPC.TERMINAL_SPLIT, { paneId, direction }),
    capture: (paneId: string, lines?: number) =>
      ipcRenderer.invoke(IPC.TERMINAL_CAPTURE, { paneId, lines }),
    ready: (paneId: string, cols: number, rows: number) =>
      ipcRenderer.send(IPC.TERMINAL_READY, { paneId, cols, rows }),
    onData: (cb: (data: { paneId: string; data: string }) => void) => {
      const handler = (_e: unknown, data: { paneId: string; data: string }) => cb(data)
      ipcRenderer.on(IPC.TERMINAL_DATA, handler)
      return () => ipcRenderer.removeListener(IPC.TERMINAL_DATA, handler)
    },
    onCellScroll: (cb: (data: { sessionId?: string; cell?: string; action: string; lines?: number }) => void) => {
      const handler = (_e: unknown, data: { sessionId?: string; cell?: string; action: string; lines?: number }) => cb(data)
      ipcRenderer.on(IPC.CELL_SCROLL, handler)
      return () => ipcRenderer.removeListener(IPC.CELL_SCROLL, handler)
    },
    onGridNav: (cb: (data: { direction: string }) => void) => {
      const handler = (_e: unknown, data: { direction: string }) => cb(data)
      ipcRenderer.on(IPC.GRID_NAV, handler)
      return () => ipcRenderer.removeListener(IPC.GRID_NAV, handler)
    },
  },

  // ─── Messages ──────────────────────────────────────────
  messages: {
    send: (msg: unknown) => ipcRenderer.invoke(IPC.MESSAGES_SEND, msg),
    list: (opts?: unknown) => ipcRenderer.invoke(IPC.MESSAGES_LIST, opts),
    unread: () => ipcRenderer.invoke(IPC.MESSAGES_UNREAD),
    markRead: (messageIds: string[]) =>
      ipcRenderer.invoke(IPC.MESSAGES_MARK_READ, { messageIds }),
    onReceived: (cb: (msg: unknown) => void) => {
      const handler = (_e: unknown, msg: unknown) => cb(msg)
      ipcRenderer.on(IPC.MESSAGE_RECEIVED, handler)
      return () => ipcRenderer.removeListener(IPC.MESSAGE_RECEIVED, handler)
    },
  },

  // ─── Projects ──────────────────────────────────────────
  projects: {
    list: () => ipcRenderer.invoke(IPC.PROJECTS_LIST),
    scan: () => ipcRenderer.invoke(IPC.PROJECTS_SCAN),
    kickoff: (opts: unknown) => ipcRenderer.invoke(IPC.PROJECTS_KICKOFF, opts),
    onCompleted: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.PROJECT_KICKOFF_COMPLETED, handler)
      return () => ipcRenderer.removeListener(IPC.PROJECT_KICKOFF_COMPLETED, handler)
    },
  },

  // ─── Context Usage ─────────────────────────────────────
  context: {
    get: (sessionId: string) => ipcRenderer.invoke(IPC.CONTEXT_GET, { sessionId }),
    all: () => ipcRenderer.invoke(IPC.CONTEXT_ALL),
    onUpdated: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.CONTEXT_UPDATED, handler)
      return () => ipcRenderer.removeListener(IPC.CONTEXT_UPDATED, handler)
    },
    onWarning: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.CONTEXT_WARNING, handler)
      return () => ipcRenderer.removeListener(IPC.CONTEXT_WARNING, handler)
    },
  },

  // ─── Config ────────────────────────────────────────────
  config: {
    get: (key: string) => ipcRenderer.invoke(IPC.CONFIG_GET, { key }),
    set: (key: string, value: unknown) => ipcRenderer.invoke(IPC.CONFIG_SET, { key, value }),
    saveGrid: (grid: unknown) => ipcRenderer.invoke(IPC.CONFIG_SAVE_GRID, grid),
    getSkipPermissions: (): Promise<boolean> => ipcRenderer.invoke('cipher-mux:config:get-skip-permissions'),
    setSkipPermissions: (v: boolean): Promise<{ ok: boolean }> => ipcRenderer.invoke('cipher-mux:config:set-skip-permissions', v),
    onThemeChanged: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.THEME_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
    },
  },

  // ─── Dialogs ──────────────────────────────────────────────
  dialog: {
    openFile: (opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, opts),
    openDir: (opts?: { title?: string; defaultPath?: string }) =>
      ipcRenderer.invoke(IPC.DIALOG_OPEN_DIR, opts),
  },

  // ─── Orchestrator ────────────────────────────────────────
  orchestrator: {
    start: () => ipcRenderer.invoke(IPC.ORCHESTRATOR_START),
    stop: () => ipcRenderer.invoke(IPC.ORCHESTRATOR_STOP),
    status: () => ipcRenderer.invoke(IPC.ORCHESTRATOR_STATUS),
    onStarted: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.ORCHESTRATOR_STARTED, handler)
      return () => ipcRenderer.removeListener(IPC.ORCHESTRATOR_STARTED, handler)
    },
  },

  // ─── Cyber Factory ─────────────────────────────────────────
  cyberFactory: {
    start: () => ipcRenderer.invoke(IPC.CYBER_FACTORY_START),
    stop: () => ipcRenderer.invoke(IPC.CYBER_FACTORY_STOP),
    status: () => ipcRenderer.invoke(IPC.CYBER_FACTORY_STATUS),
    onStarted: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.CYBER_FACTORY_STARTED, handler)
      return () => ipcRenderer.removeListener(IPC.CYBER_FACTORY_STARTED, handler)
    },
  },

  // ─── Window ──────────────────────────────────────────────
  window: {
    fitGrid: (cols: number, rows: number, panelWidth?: number) => ipcRenderer.invoke(IPC.WINDOW_FIT_GRID, { cols, rows, panelWidth }),
    openWorkspaces: (initialTab?: string) => ipcRenderer.invoke('cipher-mux:window:open-workspaces', initialTab),
  },

  // ─── Sidebar ──────────────────────────────────────────────
  sidebar: {
    detach: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.SIDEBAR_DETACH),
    reattach: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.SIDEBAR_REATTACH),
    dock: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.SIDEBAR_DOCK),
    isDetached: (): Promise<boolean> => ipcRenderer.invoke('cipher-mux:sidebar:is-detached'),
    toggleWindow: (): Promise<{ visible: boolean }> => ipcRenderer.invoke(IPC.SIDEBAR_TOGGLE_WINDOW),
    onReattached: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.SIDEBAR_REATTACHED, handler)
      return () => ipcRenderer.removeListener(IPC.SIDEBAR_REATTACHED, handler)
    },
    onClosed: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.SIDEBAR_CLOSED, handler)
      return () => ipcRenderer.removeListener(IPC.SIDEBAR_CLOSED, handler)
    },
  },

  // ─── Bugreport ─────────────────────────────────────────
  bugreport: {
    collect: () => ipcRenderer.invoke(IPC.BUGREPORT_COLLECT),
    submit: (description: string, project?: string, screenshots?: string[], reportType?: string) =>
      ipcRenderer.invoke(IPC.BUGREPORT_SUBMIT, { description, project, screenshots, reportType }),
    enrich: (description: string) =>
      ipcRenderer.invoke(IPC.BUGREPORT_ENRICH, { description }),
    pickScreenshot: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC.BUGREPORT_PICK_SCREENSHOT),
  },

  // ─── LLM Provider ─────────────────────────────────────────
  llm: {
    testConnection: (host?: string, port?: number): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.LLM_TEST_CONNECTION, { host, port }),
    listModels: (host?: string, port?: number): Promise<string[]> =>
      ipcRenderer.invoke(IPC.LLM_LIST_MODELS, { host, port }),
  },

  // ─── Tasks ──────────────────────────────────────────────
  tasks: {
    list: (filter?: unknown) => ipcRenderer.invoke(IPC.TASKS_LIST, filter),
    get: (id: string) => ipcRenderer.invoke(IPC.TASKS_GET, { id }),
    retry: (id: string) => ipcRenderer.invoke(IPC.TASKS_RETRY, { id }),
    cancel: (id: string) => ipcRenderer.invoke(IPC.TASKS_CANCEL, { id }),
    onCreated: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.TASK_CREATED, handler)
      return () => ipcRenderer.removeListener(IPC.TASK_CREATED, handler)
    },
    onStateChanged: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.TASK_STATE_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.TASK_STATE_CHANGED, handler)
    },
  },

  // ─── Notes ──────────────────────────────────────────────
  notes: {
    list: () => ipcRenderer.invoke(IPC.NOTES_LIST),
    read: (id: string) => ipcRenderer.invoke(IPC.NOTES_READ, { id }),
    save: (id: string, body: string, tags?: string[], skipTagging?: boolean) =>
      ipcRenderer.invoke(IPC.NOTES_SAVE, { id, body, tags, skipTagging }),
    create: (title: string, body: string, tags?: string[]) =>
      ipcRenderer.invoke(IPC.NOTES_CREATE, { title, body, tags }),
    delete: (id: string) =>
      ipcRenderer.invoke(IPC.NOTES_DELETE, { id }),
    screenshot: (noteId: string, itemId: string): Promise<{ path: string } | null> =>
      ipcRenderer.invoke(IPC.NOTES_SCREENSHOT, { noteId, itemId }),
    parseTestcase: (id: string) =>
      ipcRenderer.invoke(IPC.NOTES_PARSE_TESTCASE, { id }),
    serializeTestcaseBody: (sections: any[]) =>
      ipcRenderer.invoke(IPC.NOTES_SERIALIZE_TESTCASE, { sections }),
    tags: () => ipcRenderer.invoke(IPC.NOTES_TAGS),
    tagList: (): Promise<Array<{ name: string; count: number; description: string; isSeed: boolean }>> =>
      ipcRenderer.invoke(IPC.NOTES_TAG_LIST),
    tagCreate: (name: string, description: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.NOTES_TAG_CREATE, { name, description }),
    tagRename: (oldName: string, newName: string): Promise<{ ok: boolean; affected: number }> =>
      ipcRenderer.invoke(IPC.NOTES_TAG_RENAME, { oldName, newName }),
    tagUpdate: (name: string, description: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.NOTES_TAG_UPDATE, { name, description }),
    tagDelete: (name: string): Promise<{ ok: boolean; affected: number }> =>
      ipcRenderer.invoke(IPC.NOTES_TAG_DELETE, { name }),
    onChanged: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.NOTES_CHANGED, handler)
      return () => ipcRenderer.removeListener(IPC.NOTES_CHANGED, handler)
    },
  },

  // ─── Grid Control ───────────────────────────────────────
  gridControl: {
    pullKeepWorkingRestore: (): Promise<{
      gridConfig: { cols: number; rows: number }
      slots: Array<{ sessionId: string | null; slotIndex: number }>
    } | null> => ipcRenderer.invoke(IPC.KEEP_WORKING_PULL),
    resize: (cols: number, rows: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.GRID_RESIZE, { cols, rows }),
    place: (sessionId: string, col: number, row: number): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.GRID_PLACE, { sessionId, col, row }),
    focus: (sessionId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.SESSION_FOCUS, { sessionId }),
    eject: (sessionId: string): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.SESSION_EJECT, { sessionId }),
    sidebarToggle: (visible?: boolean): Promise<{ ok: boolean }> =>
      ipcRenderer.invoke(IPC.SIDEBAR_TOGGLE, { visible }),
    onGridResize: (cb: (data: { cols: number; rows: number }) => void) => {
      const handler = (_e: unknown, data: { cols: number; rows: number }) => cb(data)
      ipcRenderer.on(IPC.GRID_RESIZE, handler)
      return () => ipcRenderer.removeListener(IPC.GRID_RESIZE, handler)
    },
    onGridPlace: (cb: (data: { sessionId: string; col: number; row: number }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string; col: number; row: number }) => cb(data)
      ipcRenderer.on(IPC.GRID_PLACE, handler)
      return () => ipcRenderer.removeListener(IPC.GRID_PLACE, handler)
    },
    onSessionFocus: (cb: (data: { sessionId: string }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string }) => cb(data)
      ipcRenderer.on(IPC.SESSION_FOCUS, handler)
      return () => ipcRenderer.removeListener(IPC.SESSION_FOCUS, handler)
    },
    onSessionEject: (cb: (data: { sessionId: string }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string }) => cb(data)
      ipcRenderer.on(IPC.SESSION_EJECT, handler)
      return () => ipcRenderer.removeListener(IPC.SESSION_EJECT, handler)
    },
    onSidebarToggle: (cb: (data: { visible?: boolean }) => void) => {
      const handler = (_e: unknown, data: { visible?: boolean }) => cb(data)
      ipcRenderer.on(IPC.SIDEBAR_TOGGLE, handler)
      return () => ipcRenderer.removeListener(IPC.SIDEBAR_TOGGLE, handler)
    },
    onKeepWorkingRestore: (cb: (data: {
      gridConfig: { cols: number; rows: number }
      slots: Array<{ sessionId: string | null; slotIndex: number }>
    }) => void) => {
      const handler = (_e: unknown, data: any) => cb(data)
      ipcRenderer.on(IPC.KEEP_WORKING_RESTORE, handler)
      return () => ipcRenderer.removeListener(IPC.KEEP_WORKING_RESTORE, handler)
    },
  },

  // ─── Input Requests (Cyber Factory) ──────────────────────
  inputRequests: {
    get: () => ipcRenderer.invoke(IPC.CF_INPUT_REQUESTS),
    answer: (id: string, answer: string) =>
      ipcRenderer.invoke(IPC.CF_REQUEST_ANSWERED, { id, answer }),
    openReview: (filePath: string) =>
      ipcRenderer.invoke(IPC.CF_OPEN_REVIEW, { filePath }),
    onChanged: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.CF_INPUT_REQUESTS, handler)
      return () => ipcRenderer.removeListener(IPC.CF_INPUT_REQUESTS, handler)
    },
    onUpdate: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.CF_REQUEST_UPDATE, handler)
      return () => ipcRenderer.removeListener(IPC.CF_REQUEST_UPDATE, handler)
    },
  },

  // ─── Personas (legacy) ──────────────────────────────────
  personas: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('cipher-mux:personas:list'),
    save: (p: unknown): Promise<{ ok: boolean }> => ipcRenderer.invoke('cipher-mux:personas:save', p),
    delete: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('cipher-mux:personas:delete', id),
  },

  // ─── Characters (Companion Persona) ─────────────────────
  characters: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke(IPC.CHARACTERS_LIST),
    active: (): Promise<unknown> => ipcRenderer.invoke(IPC.CHARACTERS_ACTIVE),
    save: (c: unknown): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.CHARACTERS_SAVE, c),
    delete: (id: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(IPC.CHARACTERS_DELETE, id),
    switch: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.CHARACTERS_SWITCH, id),
    getGlobalPersona: (): Promise<string | null> => ipcRenderer.invoke(IPC.CHARACTERS_GLOBAL_PERSONA_GET),
    setGlobalPersona: (id: string | null): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.CHARACTERS_GLOBAL_PERSONA_SET, id),
    getEntityPersonaOverride: (entityId: string): Promise<string | null> => ipcRenderer.invoke(IPC.ENTITY_PERSONA_OVERRIDE_GET, entityId),
    setEntityPersonaOverride: (entityId: string, characterId: string | null): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.ENTITY_PERSONA_OVERRIDE_SET, entityId, characterId),
  },

  // ─── Workspaces ──────────────────────────────────────────
  workspaces: {
    list: (): Promise<unknown[]> => ipcRenderer.invoke('cipher-mux:workspaces:list'),
    save: (ws: unknown): Promise<{ ok: boolean }> => ipcRenderer.invoke('cipher-mux:workspaces:save', ws),
    delete: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('cipher-mux:workspaces:delete', id),
    apply: (id: string): Promise<{ applied: boolean; sessionsStarted?: number; warnings?: string[]; sessions?: Array<{ cellIndex: number; sessionId: string }> }> => ipcRenderer.invoke('cipher-mux:workspaces:apply', id),
    active: (id?: string): Promise<string | null> => ipcRenderer.invoke('cipher-mux:workspaces:active', id),
  },

  // ─── Entities ──────────────────────────────────────────
  entity: {
    start: (entityId: string) => ipcRenderer.invoke(IPC.ENTITY_START, { entityId }),
    resume: (entityId: string) => ipcRenderer.invoke(IPC.ENTITY_RESUME, { entityId }),
    stop: (entityId: string) => ipcRenderer.invoke(IPC.ENTITY_STOP, { entityId }),
    status: (entityId: string) => ipcRenderer.invoke(IPC.ENTITY_STATUS, { entityId }),
    list: () => ipcRenderer.invoke(IPC.ENTITY_LIST),
    onStarted: (cb: (data: { entityId: string; session: unknown }) => void) => {
      const handler = (_e: unknown, data: { entityId: string; session: unknown }) => cb(data)
      ipcRenderer.on(IPC.ENTITY_STARTED, handler)
      return () => ipcRenderer.removeListener(IPC.ENTITY_STARTED, handler)
    },
  },

  // ─── Presets ──────────────────────────────────────────────
  presets: {
    list: () => ipcRenderer.invoke(IPC.PRESETS_LIST),
    read: (entityId: string) => ipcRenderer.invoke(IPC.PRESETS_READ, { entityId }),
    save: (entityId: string, content: string) => ipcRenderer.invoke(IPC.PRESETS_SAVE, { entityId, content }),
    create: (entityId: string, displayName: string) => ipcRenderer.invoke(IPC.PRESETS_CREATE, { entityId, displayName }),
    delete: (entityId: string) => ipcRenderer.invoke(IPC.PRESETS_DELETE, { entityId }),
  },

  // ─── Voice ──────────────────────────────────────────────
  voice: {
    available: () => ipcRenderer.invoke(IPC.VOICE_AVAILABLE),
    start: () => ipcRenderer.invoke(IPC.VOICE_START),
    stop: () => ipcRenderer.invoke(IPC.VOICE_STOP),
    sendAudioChunk: (chunk: ArrayBuffer) =>
      ipcRenderer.send(IPC.VOICE_AUDIO_CHUNK, chunk),
    playbackDone: () => ipcRenderer.send(IPC.VOICE_PLAYBACK_DONE),
    onState: (cb: (state: string) => void) => {
      const handler = (_e: unknown, state: string) => cb(state)
      ipcRenderer.on(IPC.VOICE_STATE, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_STATE, handler)
    },
    onTranscription: (cb: (text: string) => void) => {
      const handler = (_e: unknown, text: string) => cb(text)
      ipcRenderer.on(IPC.VOICE_TRANSCRIPTION, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_TRANSCRIPTION, handler)
    },
    onAgentText: (cb: (text: string) => void) => {
      const handler = (_e: unknown, text: string) => cb(text)
      ipcRenderer.on(IPC.VOICE_AGENT_TEXT, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_AGENT_TEXT, handler)
    },
    onAgentAudio: (cb: (base64Wav: string) => void) => {
      const handler = (_e: unknown, b64: string) => cb(b64)
      ipcRenderer.on(IPC.VOICE_AGENT_AUDIO, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_AGENT_AUDIO, handler)
    },
    onInterviewDone: (cb: (report: string) => void) => {
      const handler = (_e: unknown, report: string) => cb(report)
      ipcRenderer.on(IPC.VOICE_INTERVIEW_DONE, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_INTERVIEW_DONE, handler)
    },
    onError: (cb: (msg: string) => void) => {
      const handler = (_e: unknown, msg: string) => cb(msg)
      ipcRenderer.on(IPC.VOICE_ERROR, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_ERROR, handler)
    },
    vadSpeechStart: () => ipcRenderer.send(IPC.VOICE_VAD_SPEECH_START),
    vadSpeechEnd: (audioData: number[]) => ipcRenderer.send(IPC.VOICE_VAD_SPEECH_END, audioData),
    vadMisfire: () => ipcRenderer.send(IPC.VOICE_VAD_MISFIRE),
    onGenerationDone: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.VOICE_GENERATION_DONE, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_GENERATION_DONE, handler)
    },
    onStopPlayback: (cb: () => void) => {
      const handler = () => cb()
      ipcRenderer.on(IPC.VOICE_STOP_PLAYBACK, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_STOP_PLAYBACK, handler)
    },
    // Session voice input
    startSession: () => ipcRenderer.invoke(IPC.VOICE_START_SESSION),
    startCom: () => ipcRenderer.invoke(IPC.VOICE_START_COM),
    stopCom: () => ipcRenderer.invoke(IPC.VOICE_STOP_COM),
    setRoutingMode: (mode: 'session' | 'off') =>
      ipcRenderer.send(IPC.VOICE_SET_ROUTING_MODE, { mode }),
    setSessionTarget: (sessionId: string | null) =>
      ipcRenderer.send(IPC.VOICE_SESSION_TARGET, { sessionId }),
    onDispatched: (cb: (data: { sessionId: string; sessionName: string; text: string }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string; sessionName: string; text: string }) => cb(data)
      ipcRenderer.on(IPC.VOICE_DISPATCHED, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_DISPATCHED, handler)
    },
    onComState: (cb: (state: string) => void) => {
      const handler = (_e: unknown, state: string) => cb(state)
      ipcRenderer.on(IPC.VOICE_COM_STATE, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_COM_STATE, handler)
    },
    pinSession: (sessionId: string | null) =>
      ipcRenderer.send(IPC.VOICE_PIN, { sessionId }),
    onPinStatus: (cb: (data: { pinned: boolean; sessionId: string | null }) => void) => {
      const handler = (_e: unknown, data: { pinned: boolean; sessionId: string | null }) => cb(data)
      ipcRenderer.on(IPC.VOICE_PIN_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_PIN_STATUS, handler)
    },
    onActiveSession: (cb: (data: { sessionId: string | null }) => void) => {
      const handler = (_e: unknown, data: { sessionId: string | null }) => cb(data)
      ipcRenderer.on(IPC.VOICE_ACTIVE_SESSION, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_ACTIVE_SESSION, handler)
    },
    setNotesFocus: (focused: boolean) =>
      ipcRenderer.send(IPC.VOICE_NOTES_FOCUS, { focused }),
    onNotesInsert: (cb: (data: { text: string }) => void) => {
      const handler = (_e: unknown, data: { text: string }) => cb(data)
      ipcRenderer.on(IPC.VOICE_NOTES_INSERT, handler)
      return () => ipcRenderer.removeListener(IPC.VOICE_NOTES_INSERT, handler)
    },
    speak: (text: string) => ipcRenderer.invoke('cipher-mux:tts:speak', { text }),
    stopSpeech: () => ipcRenderer.invoke('cipher-mux:tts:stop'),
  },

  // ─── BT Shutter Remote ─────────────────────────────────
  btShutter: {
    onEvent: (cb: (data: { button: string; action: string }) => void) => {
      const handler = (_e: unknown, data: { button: string; action: string }) => cb(data)
      ipcRenderer.on(IPC.BT_SHUTTER_EVENT, handler)
      return () => ipcRenderer.removeListener(IPC.BT_SHUTTER_EVENT, handler)
    },
    onStatus: (cb: (data: { status: string; error?: string }) => void) => {
      const handler = (_e: unknown, data: { status: string; error?: string }) => cb(data)
      ipcRenderer.on(IPC.BT_SHUTTER_STATUS, handler)
      return () => ipcRenderer.removeListener(IPC.BT_SHUTTER_STATUS, handler)
    },
  },

  // ─── UI Control (Companion Demo Mode) ────────────────────
  ui: {
    onHighlight: (cb: (data: { target?: string; duration?: number; style?: string; clear?: boolean }) => void) => {
      const handler = (_e: unknown, data: { target?: string; duration?: number; style?: string; clear?: boolean }) => cb(data)
      ipcRenderer.on(IPC.UI_HIGHLIGHT, handler)
      return () => ipcRenderer.removeListener(IPC.UI_HIGHLIGHT, handler)
    },
    onOpen: (cb: (data: { target: string; context?: Record<string, unknown> }) => void) => {
      const handler = (_e: unknown, data: { target: string; context?: Record<string, unknown> }) => cb(data)
      ipcRenderer.on(IPC.UI_OPEN, handler)
      return () => ipcRenderer.removeListener(IPC.UI_OPEN, handler)
    },
    onThemeSet: (cb: (data: { theme: string }) => void) => {
      const handler = (_e: unknown, data: { theme: string }) => cb(data)
      ipcRenderer.on(IPC.THEME_SET, handler)
      return () => ipcRenderer.removeListener(IPC.THEME_SET, handler)
    },
  },

  // ─── Companion Memory ────────────────────────────────────
  companion: {
    recall: (limit?: number) => ipcRenderer.invoke(IPC.COMPANION_RECALL, { limit }),
    listMemories: (opts?: { limit?: number; kind?: string; since?: number }) =>
      ipcRenderer.invoke(IPC.COMPANION_LIST_MEMORIES, opts),
    search: (query: string, limit?: number) =>
      ipcRenderer.invoke(IPC.COMPANION_SEARCH, { query, limit }),
    deleteMemory: (id: string) =>
      ipcRenderer.invoke(IPC.COMPANION_DELETE_MEMORY, { id }),
  },
}

contextBridge.exposeInMainWorld('cipherMux', api)

// Type declaration for renderer
export type CipherMuxApi = typeof api
