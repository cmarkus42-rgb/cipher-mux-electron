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
export type BuiltinEntityId = 'workshop' | 'cyber-factory' | 'launcher' | 'companion' | 'refinement' | 'voice-relay' | 'audit' | 'ideation-partner' | 'debugger' | 'testing-assistant' | 'bugreport'
export type EntityId = BuiltinEntityId | (string & {})

/**
 * Configuration for a functional entity (Workshop, Cyber Factory, Companion, etc.).
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
  /** Number of sendKeys calls this session received. 0 = never used. */
  interactionCount?: number
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
  /** Resolved workspace prompt — injected as ## Workspace Prompt in project CLAUDE.md. */
  workspacePrompt?: string
  /** Context directory paths — injected as ## Context Directories in project CLAUDE.md. */
  contextPaths?: string[]
  /** Internal flag: global rules already injected by startEntity(). */
  _entityInjected?: boolean
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

// ─── Detached Windows ────────────────────────────────────────

export interface DetachedWindowEntry {
  type: 'session' | 'note'
  entityId: string
  bounds: { x: number; y: number; width: number; height: number }
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
  /** Absolute path to the cipher-mux hub root directory. Empty string = not configured. */
  hubPath: string
  /** Active companion character ID. */
  activeCharacterId: string
  /** Global persona override — when set, this persona applies to ALL presets. */
  globalActivePersonaId: string | null
  /** Available companion characters. */
  characters: Character[]
  /** Global base rules injected into every entity session. */
  globalRules: string
  app: {
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
  workshop: {
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
    sessions: Array<{ name: string; projectPath: string; gridSlot: number; entityId?: string; topic?: string }>
    gridConfig?: { cols: number; rows: number }
    notesSlots?: Array<{ slotIndex: number; notesId?: string; openNoteIds?: string[] }>
  }
  /** Persisted sort order overrides for entity presets (entityId → sortOrder). */
  entitySortOrders?: Record<string, number>
  /** Hidden entity presets — hidden entities are not shown in the launcher (entityId → true). */
  entityHidden?: Record<string, boolean>
  /** Persona override per entity preset (entityId → characterId). Overrides PRESET_PERSONA_DEFAULTS. */
  entityPersonaOverrides?: Record<string, string>
  /** Voice submit mode: 'auto' sends Enter after STT, 'manual' waits for BT clicker. */
  voiceSubmitMode?: 'auto' | 'manual'
  /** TTS enabled — if false, mux_tts_speak is silently ignored. Default: true. */
  ttsEnabled?: boolean
  /** TTS verbosity level: 1 = Minimal (default), 2 = Alles Relevante. */
  ttsLevel?: 1 | 2
  /** TTS voice preference: 'local' = Piper, 'macos' = macOS say. Default: 'local'. */
  ttsVoice?: 'local' | 'macos'
  /** Active Piper voice model name (e.g. 'de_DE-cipher_adult-medium'). */
  piperVoice?: string
  /** macOS say voice name (e.g. 'Anna', 'Daniel'). Empty = system default. */
  macosVoice?: string
  /** TTS sentence-pipelining pause configuration (milliseconds). */
  tts?: {
    /** Pause after period (default 300ms). */
    pauseAfterPeriod: number
    /** Pause after ? or ! (default 400ms). */
    pauseAfterQuestion: number
    /** Pause after , ; : (default 150ms). */
    pauseAfterComma: number
  }
  /** Voice commands (scroll, grid nav) enabled. Default: true. */
  voiceCommandsEnabled?: boolean
  /** Update checker configuration. */
  update?: {
    /** Update mode: 'notify' shows dialog, 'auto' downloads silently, 'disabled' skips. Default: 'notify'. */
    mode?: 'notify' | 'auto' | 'disabled'
    /** ISO date of last update check. */
    lastCheck?: string
    /** Version the user dismissed — won't be shown again. */
    dismissedVersion?: string
  }
  /** Refinement (RE) configuration — extended requirements engineering. */
  refinement?: {
    enabled: boolean
    /** Output format: 'cyber-factory' (hardwired REQ-IDs) or 'custom' (user-defined). */
    hardwiredOutputFormat: 'cyber-factory' | 'custom'
    /** RE audit depth: basic, standard, or deep. */
    reAuditDepth: 'basic' | 'standard' | 'deep'
    /** Whether to run OSS license sondierung in Phase 5. */
    ossLicenseSondierungEnabled: boolean
  }
  /** Ideation Partner configuration. */
  ideation_partner?: {
    enabled: boolean
    /** Base directory for ideation brain files. */
    brainBaseDir: string
    /** Directory for ideation skill markdown files. */
    skillsDir: string
    /** Require 3 uncertainty markers per sub-agent note. */
    subAgentUnsicherheitspflicht: boolean
  }
  /** Cyber Factory configuration — multi-session build orchestrator. */
  cyber_factory?: {
    enabled: boolean
    maxParallelWorkers: number
    defaultRetries: number
    monitoringIntervalMs: number
    budgetMultiplier: number
    budgetEscalationThreshold: number
    budgetAutoPauseThreshold: number
    modelRouting: Record<string, string>
    stuckDetection: { heartbeatTimeoutMs: number; outputPlateauMs: number; minOutputCharsInPlateau: number }
  }
  /** Debugger module configuration. */
  debugger?: import('../main/debugger/types').DebuggerConfig
  /** Testing Assistant module configuration. */
  testing_assistant?: import('../main/testing-assistant/types').TestingAssistantConfig
  /** Audit module configuration. */
  audit_config?: import('../main/audit/types').AuditConfig
  /** Bugreport preset configuration — guided interview via Claude Code. */
  bugreport_preset?: {
    /** LLM provider: 'haiku' (Claude Code session) or 'ollama' (local enrichment). */
    provider: 'haiku' | 'ollama'
  }
  /** Bugreport delivery configuration — where submitted bug reports go. */
  bugreportDelivery?: {
    /** Delivery mode: 'local' (outbox only) or 'github' (create GitHub Issue). */
    mode: 'local' | 'github'
    /** GitHub repo in owner/name format (e.g. 'cmarkus42-rgb/cipher-mux-electron'). */
    githubRepo?: string
  }
  /** Experimental feature flags. */
  experimental?: {
    /** Enable extended 7-phase Refinement (RE audit, REQ-IDs, structured handoffs). */
    refinement_v2?: boolean
    /** Enable Ideation Partner as builtin entity with brain management. */
    ideation_partner?: boolean
    /** Enable Cyber Factory multi-session build orchestrator. */
    cyber_factory?: boolean
    /** Enable Testing Assistant (replaces watchdog). */
    testing_assistant?: boolean
    /** Enable full Audit with release recommendation. */
    audit_full?: boolean
  }
  /** Saved bounds for detached session/note windows, keyed by entityId. */
  detachedWindowBounds?: Record<string, { x: number; y: number; width: number; height: number }>
  /** Snapshot of detached windows saved on quit — consumed on next start to re-open detached windows. */
  detachedWindows?: Array<{ type: 'session' | 'note'; entityId: string; bounds: { x: number; y: number; width: number; height: number } }>
  /** Whether the sidebar is detached into its own window. Persisted across restarts. */
  sidebarDetached?: boolean
  /** Saved sidebar window bounds for size/position persistence. */
  sidebarWindowBounds?: { x: number; y: number; width: number; height: number } | null
  /** Persisted collapse states for sidebar sections. */
  sidebarCollapsed?: Record<string, boolean>
  /** Workspace-scoped memory configuration. */
  memory?: MemoryConfig
  /** Accessibility settings (font overrides, system preference overrides). */
  a11y?: import('../main/a11y/a11y-config').A11yConfig
  /** Whether preset.md migration from CLAUDE.md has been completed. */
  presetMigrationDone?: boolean
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
  /** First non-empty, non-heading body line (truncated to 80 chars). */
  preview?: string
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

// ─── Tag Class:Value System (REQ-NOTES-010) ──────────────

/** A tag class (e.g. "kind", "status") with known values and optional color. */
export interface TagClass {
  values: string[]
  color?: string
}

/** Persisted .tags.json format: classes with values and colors. */
export interface TagClassRepository {
  classes: Record<string, TagClass>
  /** Synonym map: synonym tag → canonical tag. Resolved at write-time. */
  synonyms?: Record<string, string>
}

// ─── Tag Index (REQ-NOTES-012) ───────────────────────────

/** Runtime-only tag index: tag→noteIds and class→value→count. */
export interface TagIndexData {
  /** Map from full tag string (e.g. "kind:bugreport") to set of note IDs. */
  tagToNoteIds: Record<string, string[]>
  /** Map from class name to value→count. */
  classValueCounts: Record<string, Record<string, number>>
  /** Total notes indexed. */
  totalNotes: number
  /** Timestamp of last rebuild. */
  builtAt: string
}

// ─── Memory Config ────────────────────────────────────────

export interface MemoryConfig {
  enabled: boolean
  ftsEnabled: boolean
  retentionDays: number
  sessionScopeAutoDelete: boolean
  archiveOnWorkspaceDelete: boolean
}

// ─── Companion Memory ─────────────────────────────────────

export type MemoryKind =
  | 'fact'
  | 'preference'
  | 'interaction'
  | 'event'
  | 'decision'
  | 'architecture'
  | 'welle'
  | 'welle-plan'
  | 'finding'
  | 'risk-review'
  | 'pattern'
  | 'convention'
  | 'off_limit'

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
  scopeKind: 'user' | 'workspace' | 'session'
  scopeId: string | null
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
  color: string        // Hex color from CHARACTER_PALETTE, assigned at creation
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
