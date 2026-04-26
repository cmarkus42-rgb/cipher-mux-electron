"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipc_channels_1 = require("../shared/ipc-channels");
/**
 * Preload script — exposes window.cipherMux API via contextBridge.
 * All renderer access to the main process goes through this API.
 */
const api = {
    // ─── Sessions ──────────────────────────────────────────
    sessions: {
        list: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.SESSIONS_LIST),
        start: (opts) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.SESSIONS_START, opts),
        stop: (sessionId) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.SESSIONS_STOP, { sessionId }),
        recover: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.SESSIONS_RECOVER),
        onChanged: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.SESSION_CHANGED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.SESSION_CHANGED, handler);
        },
        onStopped: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.SESSION_STOPPED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.SESSION_STOPPED, handler);
        },
        onRecoveryResult: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.SESSIONS_RECOVERY_RESULT, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.SESSIONS_RECOVERY_RESULT, handler);
        },
        recoveryAction: (action, tmuxSession, displayName) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.SESSIONS_RECOVERY_ACTION, { action, tmuxSession, displayName }),
        onVisibleAdd: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.SESSION_VISIBLE_ADD, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.SESSION_VISIBLE_ADD, handler);
        },
        capture: (sessionId) => electron_1.ipcRenderer.invoke('cipher-mux:sessions:capture', sessionId),
    },
    // ─── Terminal ──────────────────────────────────────────
    terminal: {
        write: (paneId, data) => electron_1.ipcRenderer.send(ipc_channels_1.IPC.TERMINAL_WRITE, { paneId, data }),
        resize: (paneId, cols, rows) => electron_1.ipcRenderer.send(ipc_channels_1.IPC.TERMINAL_RESIZE, { paneId, cols, rows }),
        split: (paneId, direction) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.TERMINAL_SPLIT, { paneId, direction }),
        capture: (paneId, lines) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.TERMINAL_CAPTURE, { paneId, lines }),
        ready: (paneId, cols, rows) => electron_1.ipcRenderer.send(ipc_channels_1.IPC.TERMINAL_READY, { paneId, cols, rows }),
        onData: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.TERMINAL_DATA, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.TERMINAL_DATA, handler);
        },
    },
    // ─── Messages ──────────────────────────────────────────
    messages: {
        send: (msg) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MESSAGES_SEND, msg),
        list: (opts) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MESSAGES_LIST, opts),
        unread: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MESSAGES_UNREAD),
        markRead: (messageIds) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MESSAGES_MARK_READ, { messageIds }),
        onReceived: (cb) => {
            const handler = (_e, msg) => cb(msg);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.MESSAGE_RECEIVED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.MESSAGE_RECEIVED, handler);
        },
    },
    // ─── Projects ──────────────────────────────────────────
    projects: {
        list: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.PROJECTS_LIST),
        scan: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.PROJECTS_SCAN),
        kickoff: (opts) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.PROJECTS_KICKOFF, opts),
        onCompleted: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.PROJECT_KICKOFF_COMPLETED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.PROJECT_KICKOFF_COMPLETED, handler);
        },
    },
    // ─── Context Usage ─────────────────────────────────────
    context: {
        get: (sessionId) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.CONTEXT_GET, { sessionId }),
        all: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.CONTEXT_ALL),
        onUpdated: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.CONTEXT_UPDATED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.CONTEXT_UPDATED, handler);
        },
        onWarning: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.CONTEXT_WARNING, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.CONTEXT_WARNING, handler);
        },
    },
    // ─── Config ────────────────────────────────────────────
    config: {
        get: (key) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.CONFIG_GET, { key }),
        set: (key, value) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.CONFIG_SET, { key, value }),
        saveGrid: (grid) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.CONFIG_SAVE_GRID, grid),
        getSkipPermissions: () => electron_1.ipcRenderer.invoke('cipher-mux:config:get-skip-permissions'),
        setSkipPermissions: (v) => electron_1.ipcRenderer.invoke('cipher-mux:config:set-skip-permissions', v),
    },
    // ─── Dialogs ──────────────────────────────────────────────
    dialog: {
        openFile: (opts) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.DIALOG_OPEN_FILE, opts),
        openDir: (opts) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.DIALOG_OPEN_DIR, opts),
    },
    // ─── Orchestrator ────────────────────────────────────────
    orchestrator: {
        start: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.ORCHESTRATOR_START),
        stop: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.ORCHESTRATOR_STOP),
        status: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.ORCHESTRATOR_STATUS),
        onStarted: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.ORCHESTRATOR_STARTED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.ORCHESTRATOR_STARTED, handler);
        },
    },
    // ─── MPO ─────────────────────────────────────────────────
    mpo: {
        start: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MPO_START),
        stop: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MPO_STOP),
        status: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MPO_STATUS),
        onStarted: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.MPO_STARTED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.MPO_STARTED, handler);
        },
    },
    // ─── Window ──────────────────────────────────────────────
    window: {
        fitGrid: (cols, rows, panelWidth) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.WINDOW_FIT_GRID, { cols, rows, panelWidth }),
        openWorkspaces: (initialTab) => electron_1.ipcRenderer.invoke('cipher-mux:window:open-workspaces', initialTab),
    },
    // ─── Sidebar ──────────────────────────────────────────────
    sidebar: {
        detach: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.SIDEBAR_DETACH),
        reattach: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.SIDEBAR_REATTACH),
        isDetached: () => electron_1.ipcRenderer.invoke('cipher-mux:sidebar:is-detached'),
        onReattached: (cb) => {
            const handler = () => cb();
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.SIDEBAR_REATTACHED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.SIDEBAR_REATTACHED, handler);
        },
    },
    // ─── Bugreport ─────────────────────────────────────────
    bugreport: {
        collect: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.BUGREPORT_COLLECT),
        submit: (description, project, screenshots) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.BUGREPORT_SUBMIT, { description, project, screenshots }),
        enrich: (description) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.BUGREPORT_ENRICH, { description }),
        pickScreenshot: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.BUGREPORT_PICK_SCREENSHOT),
    },
    // ─── Tasks ──────────────────────────────────────────────
    tasks: {
        list: (filter) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.TASKS_LIST, filter),
        get: (id) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.TASKS_GET, { id }),
        retry: (id) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.TASKS_RETRY, { id }),
        cancel: (id) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.TASKS_CANCEL, { id }),
        onCreated: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.TASK_CREATED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.TASK_CREATED, handler);
        },
        onStateChanged: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.TASK_STATE_CHANGED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.TASK_STATE_CHANGED, handler);
        },
    },
    // ─── Notes ──────────────────────────────────────────────
    notes: {
        list: (scope) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.NOTES_LIST, { scope }),
        read: (id, scope) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.NOTES_READ, { id, scope }),
        save: (id, scope, body, tags, skipTagging) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.NOTES_SAVE, { id, scope, body, tags, skipTagging }),
        create: (scope, title, body) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.NOTES_CREATE, { scope, title, body }),
        delete: (id, scope) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.NOTES_DELETE, { id, scope }),
        tags: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.NOTES_TAGS),
        onChanged: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.NOTES_CHANGED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.NOTES_CHANGED, handler);
        },
    },
    // ─── Input Requests (MPO) ──────────────────────────────
    inputRequests: {
        get: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MPO_INPUT_REQUESTS),
        answer: (id, answer) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MPO_REQUEST_ANSWERED, { id, answer }),
        openReview: (filePath) => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.MPO_OPEN_REVIEW, { filePath }),
        onChanged: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.MPO_INPUT_REQUESTS, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.MPO_INPUT_REQUESTS, handler);
        },
        onUpdate: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.MPO_REQUEST_UPDATE, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.MPO_REQUEST_UPDATE, handler);
        },
    },
    // ─── Personas ────────────────────────────────────────────
    personas: {
        list: () => electron_1.ipcRenderer.invoke('cipher-mux:personas:list'),
        save: (p) => electron_1.ipcRenderer.invoke('cipher-mux:personas:save', p),
        delete: (id) => electron_1.ipcRenderer.invoke('cipher-mux:personas:delete', id),
    },
    // ─── Workspaces ──────────────────────────────────────────
    workspaces: {
        list: () => electron_1.ipcRenderer.invoke('cipher-mux:workspaces:list'),
        save: (ws) => electron_1.ipcRenderer.invoke('cipher-mux:workspaces:save', ws),
        delete: (id) => electron_1.ipcRenderer.invoke('cipher-mux:workspaces:delete', id),
        apply: (id) => electron_1.ipcRenderer.invoke('cipher-mux:workspaces:apply', id),
        active: (id) => electron_1.ipcRenderer.invoke('cipher-mux:workspaces:active', id),
    },
    // ─── Voice ──────────────────────────────────────────────
    voice: {
        available: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.VOICE_AVAILABLE),
        start: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.VOICE_START),
        stop: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.VOICE_STOP),
        sendAudioChunk: (chunk) => electron_1.ipcRenderer.send(ipc_channels_1.IPC.VOICE_AUDIO_CHUNK, chunk),
        playbackDone: () => electron_1.ipcRenderer.send(ipc_channels_1.IPC.VOICE_PLAYBACK_DONE),
        onState: (cb) => {
            const handler = (_e, state) => cb(state);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_STATE, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_STATE, handler);
        },
        onTranscription: (cb) => {
            const handler = (_e, text) => cb(text);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_TRANSCRIPTION, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_TRANSCRIPTION, handler);
        },
        onAgentText: (cb) => {
            const handler = (_e, text) => cb(text);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_AGENT_TEXT, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_AGENT_TEXT, handler);
        },
        onAgentAudio: (cb) => {
            const handler = (_e, b64) => cb(b64);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_AGENT_AUDIO, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_AGENT_AUDIO, handler);
        },
        onInterviewDone: (cb) => {
            const handler = (_e, report) => cb(report);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_INTERVIEW_DONE, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_INTERVIEW_DONE, handler);
        },
        onError: (cb) => {
            const handler = (_e, msg) => cb(msg);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_ERROR, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_ERROR, handler);
        },
        vadSpeechStart: () => electron_1.ipcRenderer.send(ipc_channels_1.IPC.VOICE_VAD_SPEECH_START),
        vadSpeechEnd: (audioData) => electron_1.ipcRenderer.send(ipc_channels_1.IPC.VOICE_VAD_SPEECH_END, audioData),
        vadMisfire: () => electron_1.ipcRenderer.send(ipc_channels_1.IPC.VOICE_VAD_MISFIRE),
        onGenerationDone: (cb) => {
            const handler = () => cb();
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_GENERATION_DONE, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_GENERATION_DONE, handler);
        },
        onStopPlayback: (cb) => {
            const handler = () => cb();
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_STOP_PLAYBACK, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_STOP_PLAYBACK, handler);
        },
        // Session voice input
        startSession: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC.VOICE_START_SESSION),
        setRoutingMode: (mode) => electron_1.ipcRenderer.send(ipc_channels_1.IPC.VOICE_SET_ROUTING_MODE, { mode }),
        setSessionTarget: (sessionId) => electron_1.ipcRenderer.send(ipc_channels_1.IPC.VOICE_SESSION_TARGET, { sessionId }),
        onDispatched: (cb) => {
            const handler = (_e, data) => cb(data);
            electron_1.ipcRenderer.on(ipc_channels_1.IPC.VOICE_DISPATCHED, handler);
            return () => electron_1.ipcRenderer.removeListener(ipc_channels_1.IPC.VOICE_DISPATCHED, handler);
        },
    },
};
electron_1.contextBridge.exposeInMainWorld('cipherMux', api);
//# sourceMappingURL=preload.js.map