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
  },

  // ─── Dialogs ──────────────────────────────────────────────
  dialog: {
    openFile: (opts?: { title?: string; filters?: Array<{ name: string; extensions: string[] }> }) =>
      ipcRenderer.invoke(IPC.DIALOG_OPEN_FILE, opts),
    openDir: (opts?: { title?: string }) =>
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

  // ─── Bugreport ─────────────────────────────────────────
  bugreport: {
    collect: () => ipcRenderer.invoke(IPC.BUGREPORT_COLLECT),
    submit: (description: string, project?: string) =>
      ipcRenderer.invoke(IPC.BUGREPORT_SUBMIT, { description, project }),
    enrich: (description: string) =>
      ipcRenderer.invoke(IPC.BUGREPORT_ENRICH, { description }),
  },
}

contextBridge.exposeInMainWorld('cipherMux', api)

// Type declaration for renderer
export type CipherMuxApi = typeof api
