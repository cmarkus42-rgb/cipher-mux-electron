/** Shared type definitions for cipher-mux-electron */

import type { GridState, ThemeName } from './grid-types'

// ─── Agent Adapter ────────────────────────────────────────

export type AdapterFeature =
  | 'mcp-injection'
  | 'status-line'
  | 'skip-permissions'
  | 'sub-agents'
  | 'project-instructions'
  | 'message-bus-participant'
  | 'companion-mcp'

export type AdapterCapabilities = Record<AdapterFeature, boolean>

// ─── Entity Framework ─────────────────────────────────────

/** Well-known entity identifiers. Extensible via string for dynamic/scanned entities. */
export type BuiltinEntityId = 'orchestrator' | 'mpo' | 'launcher' | 'companion' | 'refinement' | 'voice-relay' | 'audit'
export type EntityId = BuiltinEntityId | (string & {})

/**
 * Configuration for a functional entity (Orchestrator, MPO, Companion, etc.).
 * Entities are special sessions with predefined behavior, assets, and UI styling.
 */
export interface EntityConfig {
  /** Unique entity identifier. */
  id: EntityId
  /** Human-readable display name for UI. */
  displayName: string
  /** Emoji or icon key for StatusBar/Sidebar. */
  icon?: string
  /** CSS color for PaneHeader highlighting + badge. */
  color: string
  /** Working directory for this entity. */
  projectPath: string
  /** Path to CLAUDE.md + asset directory (source for deployment). */
  templatePath?: string
  /** Pre-filled greeting message sent after session start. */
  startupGreeting?: string
  /** Enabled feature flags: 'mcp', 'memory', etc. */
  features: string[]
  /** Whether this entity is visible in the grid (default true, false = background). */
  visible?: boolean
  /** Sort order for display in menus (lower = first, default 100). */
  sortOrder?: number
  /** If true, only one session of this entity can run at a time. Default: false (multi-instance). */
  singleInstance?: boolean
}

// ─── Session ───────────────────────────────────────────────

export type SessionStatus = 'active' | 'closing' | 'stopped' | 'orphaned'

export interface SessionInfo {
  id: string
  name: string
  projectPath: string | null
  tmuxSession: string
  tmuxPane: string | null
  status: SessionStatus
  createdAt: number
  updatedAt: number
  /** Agent adapter ID for this session, e.g. 'claude-code' */
  adapterId?: string
  /** Capability flags from the agent adapter */
  capabilities?: AdapterCapabilities
  /** Claude Code session ID (tracked from statusline), used for fork. */
  claudeSessionId?: string
  /** Entity ID if this session belongs to a registered entity. */
  entityId?: EntityId
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
  /** Fork from an existing Claude Code session ID (--fork-session <id>). */
  forkFromClaudeSessionId?: string
}

export interface RecoveryResult {
  recovered: SessionInfo[]
  orphaned: SessionInfo[]
  killed: SessionInfo[]
  /** Grid state from sessions.json — used to restore sessions to their slots. */
  gridState?: {
    config: { cols: number; rows: number }
    slots: Array<{ sessionId: string | null; rowSpan: number; type: 'session' | 'notes' }>
  } | null
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
  /** Estimated current context window tokens used (for UI display). */
  used?: number
  /** Context window capacity in tokens (alias for contextWindowSize). */
  total?: number
  modelId: string
  updatedAt: number
}

// ─── Grid ──────────────────────────────────────────────────

// Re-export grid types for backward compat
export type { GridConfig, GridSlot, GridState, ThemeName } from './grid-types'

export interface AppState {
  activeSessionId: string | null
  chatroomVisible: boolean
}

// ─── Config ────────────────────────────────────────────────

export interface AppConfig {
  personas: import('./persona-types').Persona[]
  workspaces: import('./persona-types').Workspace[]
  activeWorkspaceId: string | null
  /** Workspace ID to auto-load on fresh app start (set via star toggle in WorkspacePopup). */
  defaultWorkspaceId: string | null
  /** Active companion character ID. */
  activeCharacterId: string
  /** Global persona override — when set, this persona applies to ALL presets. */
  globalActivePersonaId: string | null
  /** Available companion characters. */
  characters: Character[]
  /** Global base rules injected into every entity session. */
  globalRules: string
  app: {
    scanPaths: string[]
    /** Directory levels below each scanPath that are inspected (1 = children only). */
    scanDepth: number
    defaultProjectDir: string
    maxSessions: number
    messageRetentionDays: number
    /** Path to the projectlauncher working directory. */
    projectlauncherPath: string
    /** Minutes to wait for a kickoff completion signal before warning. */
    kickoffTimeoutMinutes: number
  }
  mcp: {
    port: number
    host: string
    apiKey: string
  }
  orchestrator: {
    dir: string
    maxRetries: number
    stallTimeout: number
    watchInterval: number
    defaultHooks: {
      beforeRun?: string
      afterRun?: string
      timeout?: number
    }
    taskSources: {
      bugreport: {
        enabled: boolean
        path: string
      }
    }
  }
  ui: {
    chatroomVisible: boolean
    theme: ThemeName
    grid: GridState
    /** UI language — 'en' (default) or 'de'. */
    language: 'en' | 'de'
  }
  agent: {
    /** When true, launches Claude Code with --dangerously-skip-permissions. Default: false. */
    skipPermissions: boolean
  }
  /** LLM provider configuration (Ollama, external APIs). */
  llm: {
    /** Ollama host (default 127.0.0.1). */
    ollamaHost: string
    /** Ollama port (default 11434). */
    ollamaPort: number
    /** Ollama model for enrichment/tagging (default gemma4:26b). */
    ollamaModel: string
  }
  windows: {
    main: { x: number; y: number; width: number; height: number }
  }
  /** BT Shutter Remote configuration. */
  btShutter: {
    enabled: boolean
    binaryPath?: string
    deviceFilter?: { vendorId: number; productId: number }
  }
  /** Keep Working mode: save grid state on quit, resume all sessions on next start. */
  keepWorking?: boolean
  /** Snapshot of sessions saved on keepWorking quit — consumed on next start. */
  keepWorkingSnapshot?: {
    sessions: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string }>
    gridConfig?: { cols: number; rows: number }
  }
  /** Persisted sort order overrides for entity presets (entityId → sortOrder). */
  entitySortOrders?: Record<string, number>
  /** Hidden entity presets — hidden entities are not shown in the launcher (entityId → true). */
  entityHidden?: Record<string, boolean>
  /** Voice submit mode: 'auto' sends Enter after STT, 'manual' waits for BT clicker. */
  voiceSubmitMode?: 'auto' | 'manual'
  /** TTS enabled — if false, mux_tts_speak is silently ignored. Default: true. */
  ttsEnabled?: boolean
  /** TTS voice preference: 'local' = Piper, 'macos' = macOS say. Default: 'local'. */
  ttsVoice?: 'local' | 'macos'
  /** Voice commands (scroll, grid nav) enabled. Default: true. */
  voiceCommandsEnabled?: boolean
  /** Whether the sidebar is detached into its own window. Persisted across restarts. */
  sidebarDetached?: boolean
  /** Saved sidebar window bounds for size/position persistence. */
  sidebarWindowBounds?: { x: number; y: number; width: number; height: number } | null
  /** Persisted collapse states for sidebar sections. */
  sidebarCollapsed?: Record<string, boolean>
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

/**
 * Grund, warum die Kickoff-Arbeit als abgeschlossen behandelt wurde.
 *
 * - `normal`  — /launch hat das MCP-Tool `kickoff_complete` aufgerufen.
 * - `marker`  — /launch hat die `.kickoff-complete`-Datei geschrieben (Bonus-Pfad
 *               aus Skill-Sicht, aber der Primary-Pfad in der neuen Skill-Version).
 * - `implicit`— Timeout ist abgelaufen, aber CLAUDE.md existiert im Zielverzeichnis.
 *               Wir interpretieren das als „Scaffold fertig, nur Exit-Gate verpasst".
 */
export type KickoffCompleteReason = 'normal' | 'marker' | 'implicit'

export interface KickoffCompletedEvent {
  handle: KickoffHandle
  payload: KickoffCompletionPayload
  /** ID der neu gestarteten Folge-Session (im Projekt-Verzeichnis). */
  followupSessionId: string
  /** Welcher Pfad hat den Complete ausgelöst. */
  reason: KickoffCompleteReason
}

// ─── Input Requests (MPO) ──────────────────────────────

export interface InputRequestOption {
  key: string
  label: string
  description?: string
}

export interface InputRequestBubble {
  id: string
  type: 'bubble'
  projectId: string
  question: string
  context?: string
  options?: InputRequestOption[]
  recommendation?: string
  status: 'open' | 'answered'
  answer: string | null
  createdAt: string
  answeredAt: string | null
}

export interface InputRequestReviewLink {
  id: string
  type: 'review-link'
  projectId: string
  title: string
  filePath: string
  status: 'open' | 'answered'
  createdAt: string
  answeredAt: string | null
}

export type InputRequest = InputRequestBubble | InputRequestReviewLink

export interface InputRequestsFile {
  requests: InputRequest[]
  lastUpdated: string
}

export interface InputRequestUpdate {
  action: 'added' | 'updated' | 'removed'
  request: InputRequest
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

export interface BugreportSubmission {
  description: string
  project?: string
}

// ─── Tasks ──────────────────────────────────────────────

export type TaskState =
  | 'queued'
  | 'dispatched'
  | 'running'
  | 'validating'
  | 'completed'
  | 'failed'
  | 'stalled'

export interface TaskPolicy {
  stallTimeout?: number
  maxRetries?: number
  hooks?: {
    beforeRun?: string
    afterRun?: string
    timeout?: number
  }
}

export interface TaskResult {
  summary?: string
  branch?: string
  exitCode?: number
  error?: string
}

export interface Task {
  id: string
  parentId: string | null
  sessionId: string | null
  source: string
  title: string
  description: string | null
  state: TaskState
  policy: TaskPolicy | null
  retryCount: number
  maxRetries: number
  result: TaskResult | null
  createdAt: number
  updatedAt: number
  completedAt: number | null
}

export interface CreateTaskOpts {
  title: string
  description?: string
  source: string
  parentId?: string
  policy?: TaskPolicy
}

export interface TaskPatch {
  state?: TaskState
  sessionId?: string
  description?: string
  policy?: TaskPolicy
  result?: TaskResult
}

export interface TaskFilter {
  state?: TaskState | TaskState[]
  source?: string
  parentId?: string | null
  sessionId?: string
}

// ─── Notes ──────────────────────────────────────────────────

export type HandoffStatus = 'pending' | 'consumed'

export interface NoteInfo {
  id: string
  title: string
  tags: string[]
  /** @deprecated Scope is always 'global' — notes use tags for categorization. Kept for API compat. */
  scope: string
  relativePath: string
  createdAt: string
  modifiedAt: string
  /** Note type from frontmatter (e.g. 'testcase'). Undefined for regular notes. */
  noteType?: string
  /** Session name that created this handoff note */
  fromSession?: string
  /** Target entity ID or "any" */
  toEntity?: string
  /** Handoff lifecycle status */
  handoffStatus?: HandoffStatus
}

export interface NoteContent {
  info: NoteInfo
  body: string
}

export interface TagEntry {
  count: number
  description: string
}

export interface TagRepository {
  tags: Record<string, TagEntry>
}

// ─── Companion Memory ─────────────────────────────────────

export type MemoryKind = 'fact' | 'preference' | 'interaction' | 'event'

export interface Memory {
  id: string
  ts: number
  sessionId: string | null
  persona: string | null
  kind: MemoryKind
  text: string
  salience: number
  ttlDays: number | null
  sourceExcerpt: string | null
  /** FTS5 rank score — only present in search results */
  score?: number
}

export interface ProfileField {
  field: string
  value: string
  updatedAt: number
  evidence: string | null
}

export interface PersonaStateEntry {
  key: string
  value: string
  updatedAt: number
  isFrozen: boolean
}

export type PendingUpdateStatus = 'pending' | 'accepted' | 'rejected'

export interface PendingUpdate {
  id: string
  ts: number
  target: string
  proposedValue: string
  currentValue: string | null
  reasoning: string | null
  evidenceMemoryIds: string[] | null
  status: PendingUpdateStatus
}

// ─── Character (Companion Persona) ───────────────────────

export interface Character {
  id: string           // e.g. 'relay', 'wayne'
  name: string         // Display name
  prompt: string       // Full persona prompt text
  isDefault: boolean   // Relay = true
  createdAt: string
  updatedAt: string
}

// ─── Personas & Workspaces ────────────────────────────────

export type {
  Persona,
  WorkspaceCell,
  Workspace,
  PromptSource,
  ResolvedPrompt,
} from './persona-types'
