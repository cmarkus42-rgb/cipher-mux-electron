/** Shared type definitions for cipher-mux-electron */

// ─── Session ───────────────────────────────────────────────

export type SessionStatus = 'active' | 'stopped' | 'orphaned'

export interface SessionInfo {
  id: string
  name: string
  projectPath: string | null
  tmuxSession: string
  tmuxPane: string | null
  status: SessionStatus
  createdAt: number
  updatedAt: number
}

export interface StartSessionOpts {
  name: string
  projectPath: string
  command?: string
  env?: Record<string, string>
  /**
   * Command to run in the session once the renderer has reported its real
   * terminal size (TERMINAL_READY). Use this for TUIs like `claude` that
   * don't reflow after a late SIGWINCH.
   */
  autoLaunch?: string
}

export interface RecoveryResult {
  recovered: SessionInfo[]
  orphaned: SessionInfo[]
}

// ─── Messages ──────────────────────────────────────────────

export type Topic = 'status' | 'bug' | 'review' | 'chat' | 'system'

export interface Message {
  id: string
  topic: Topic
  sender: string
  payload: Record<string, unknown>
  createdAt: number
}

export interface SendMessage {
  topic: Topic
  sender: string
  payload: Record<string, unknown>
}

// ─── Projects ──────────────────────────────────────────────

export interface ProjectInfo {
  path: string
  name: string
  sddPhase: string | null
  gitBranch: string | null
  gitDirty: boolean
  hasClaudeMd: boolean
}

// ─── Context Usage ─────────────────────────────────────────

export interface ContextUsage {
  usedPercentage: number
  remainingPercentage: number
  totalInputTokens: number
  totalOutputTokens: number
  contextWindowSize: number
  modelId: string
  updatedAt: number
}

// ─── Layout ────────────────────────────────────────────────

export type SplitDirection = 'horizontal' | 'vertical'

export interface SplitNode {
  type: 'split'
  direction: SplitDirection
  ratio: number
  children: LayoutNode[]
}

export interface PaneNode {
  type: 'pane'
  sessionId: string
}

export type LayoutNode = SplitNode | PaneNode

export interface LayoutState {
  root: LayoutNode | null
  activePaneId: string | null
}

export type ActiveView = 'cockpit' | 'terminal' | 'info'

export interface AppState {
  activeView: ActiveView
  activeSessionId: string | null
  splitLayout: LayoutState
  chatroomVisible: boolean
}

// ─── Config ────────────────────────────────────────────────

export interface AppConfig {
  app: {
    scanPaths: string[]
    /** Directory levels below each scanPath that are inspected (1 = children only). */
    scanDepth: number
    defaultProjectDir: string
    maxSessions: number
    messageRetentionDays: number
  }
  mcp: {
    port: number
    host: string
    apiKey: string
  }
  orchestrator: {
    dir: string
    maxRetries: number
  }
  ui: {
    chatroomVisible: boolean
    activeView: ActiveView
    layout: LayoutState
  }
  windows: {
    main: { x: number; y: number; width: number; height: number }
  }
}

// ─── Kickoff ───────────────────────────────────────────────

export interface KickoffRequest {
  /** Absoluter Pfad zum existierenden Projekt-Verzeichnis (aus Obsidian). */
  projectDir: string
  /** Optional: absoluter Pfad zu einer externen Anforderungsdatei beliebigen Formats. */
  requirementsFile?: string
  /** Optional: zusätzlicher Freitext-Kontext für den Launcher-Prompt. */
  extraContext?: string
}

export interface KickoffHandle {
  /** ID der sichtbaren Launcher-tmux-Session. */
  launcherSessionId: string
  /** Normalisierter absoluter Pfad zum Projekt-Verzeichnis. */
  projectDir: string
  /** Aus Verzeichnisnamen abgeleiteter Projektname. */
  projectName: string
}

export interface KickoffCompletionPayload {
  /** Absoluter Pfad zum fertig aufgesetzten Projekt-Verzeichnis. */
  projectPath: string
  /** Projektname (aus Verzeichnisnamen). */
  projectName: string
  /** Vom /launch-Skill erkannter Tech-Stack — optional. */
  detectedStack?: string
}

export interface KickoffCompletedEvent {
  handle: KickoffHandle
  payload: KickoffCompletionPayload
  /** ID der neu gestarteten Folge-Session (im Projekt-Verzeichnis). */
  followupSessionId: string
}

// ─── Bugreport ─────────────────────────────────────────────

export interface BugreportData {
  appVersion: string
  osVersion: string
  electronVersion: string
  nodeVersion: string
  sessions: SessionInfo[]
  tmuxVersion: string | null
  config: Partial<AppConfig>
  logs: string[]
  timestamp: number
}
