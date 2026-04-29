/**
 * AgentAdapter — abstraction over Coding-Agent CLIs.
 *
 * Every agent is represented by an adapter that knows:
 *   - how to spawn a session in a tmux pane
 *   - whether and how it supports MCP configuration injection
 *   - whether and how it reports context/token usage
 *   - which project-marker file it recognizes
 *
 * Adapters declare their capabilities via `supports(...)`. The UI and
 * orchestration layers MUST check capabilities before using optional
 * features; see the capability matrix in ARCHITECTURE.md §"Adapter Contract".
 *
 * Design references:
 *   - VS Code Extension Host: capability-gated feature surface
 *   - Warp shell abstraction: structured command output, no raw strings
 */

import type { AdapterFeature, AdapterCapabilities, ContextUsage } from '../../shared/types'

export type { AdapterFeature, AdapterCapabilities }

export interface LaunchCommand {
  /** Executable name, e.g. 'claude' */
  cmd: string
  /** Arguments array — NOT a shell string. Prevents shell injection. */
  args: string[]
  /** Extra env vars to set for this session */
  envOverrides?: Record<string, string>
}

export interface LaunchOpts {
  /** Absolute path to the project directory */
  projectPath: string
  /** Session display name */
  sessionName: string
  /** Whether this is an orchestrator session */
  isOrchestrator?: boolean
  /** Whether this is an MPO session */
  isMpo?: boolean
  /** Fork from an existing Claude session (--fork-session <id>) */
  forkFromClaudeSessionId?: string
  /** Resume the most recent conversation (--resume) */
  resume?: boolean
}

export interface AdapterContext {
  /** Absolute path to the project directory */
  projectPath: string
  /** MCP server URL (full, including /mcp path) */
  mcpUrl: string
  /** MCP auth key */
  mcpApiKey: string
  /** Session ULID */
  sessionId: string
}

export interface ProjectInstructions {
  /** Raw content of the project instructions file */
  content: string
  /** Absolute path to the file */
  filePath: string
}

export interface SendOpts {
  /** Whether to append a newline */
  newline?: boolean
}

export interface AgentAdapter {
  readonly id: string
  readonly displayName: string
  readonly tier: 'tier-1' | 'tier-2'

  // --- lifecycle ---
  /** Build a structured launch command. Never returns a raw shell string. */
  buildLaunchCommand(opts: LaunchOpts): LaunchCommand
  /** Optional post-launch setup (e.g. MCP server registration). */
  postLaunchInjection?(ctx: AdapterContext): Promise<void>

  // --- project awareness ---
  /** Filenames/dirs this agent recognizes as project markers. */
  getProjectMarkers(): string[]
  /** Read the agent's project instructions file (e.g. CLAUDE.md). */
  readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null>

  // --- runtime signals (capability-gated) ---
  /** Check if the adapter supports a specific feature. */
  supports(feature: AdapterFeature): boolean
  /** Get all capabilities as a record. */
  getCapabilities(): AdapterCapabilities
  /** Read context usage for a session. Only call if supports('status-line'). */
  getContextUsage?(sessionId: string): Promise<ContextUsage | null>
  /** Inject status reporting hook into project. Only call if supports('status-line'). */
  attachStatusHook?(projectPath: string): Promise<void>

  // --- prompt delivery ---
  /** Send a prompt into the agent's tmux pane. */
  sendPrompt(tmuxTarget: string, prompt: string, opts?: SendOpts): Promise<void>

  // --- prompt fragments for orchestrator and launcher (antifragility) ---
  /** Agent-specific instructions injected into the orchestrator template. */
  buildOrchestratorPromptFragment(lang: 'de' | 'en'): string
  /** Agent-specific launcher suffix (e.g. '/launch' for Claude Code). */
  buildLauncherPromptFragment(lang: 'de' | 'en'): string
  /** Agent-specific instructions injected into the MPO template. */
  buildMpoPromptFragment(lang: 'de' | 'en'): string
}
