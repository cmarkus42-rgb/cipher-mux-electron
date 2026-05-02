/**
 * REFERENCE STUB — Template for new agent adapters.
 *
 * To build a new adapter:
 *   1. Copy this file to adapters/<your-agent>.ts
 *   2. Fill in every TODO below
 *   3. Register your adapter in src/main/agent/registry.ts
 *   4. Run: npm test — all existing tests must stay green
 *
 * For a complete Tier-1 example, see adapters/claude-code.ts.
 * For the interface contract, see ARCHITECTURE.md §"Adapter Contract".
 *
 * Acceptance test: A new adapter should be buildable in a weekend by a
 * developer with coding-agent experience. See docs/contributing/adapter-test-protocol.md.
 */

import type {
  AgentAdapter,
  LaunchCommand,
  LaunchOpts,
  ProjectInstructions,
  SendOpts,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'

export class ReferenceStubAdapter implements AgentAdapter {
  readonly id = 'reference-stub'
  readonly displayName = 'Reference Stub (do not use in production)'
  readonly tier = 'tier-2' as const

  /**
   * TODO: Return {cmd, args} for your agent's CLI.
   *
   * Example for a hypothetical "codex" agent:
   *   return { cmd: 'codex', args: ['--quiet'] }
   *
   * IMPORTANT: Never return a shell string. The args array prevents
   * shell injection when SessionManager assembles the tmux send-keys command.
   */
  buildLaunchCommand(_opts: LaunchOpts): LaunchCommand {
    throw new Error(
      'Not implemented — copy this file and fill in your agent CLI. See claude-code.ts for example.',
    )
  }

  /**
   * TODO (optional): Inject MCP server config after the session starts.
   *
   * This runs after the agent CLI has booted inside the tmux pane.
   * Use it to register the cipher-mux MCP server with your agent.
   * If your agent auto-discovers MCP servers, you can omit this method.
   */
  // async postLaunchInjection(ctx: AdapterContext): Promise<void> {
  //   throw new Error('Not implemented')
  // }

  /**
   * TODO: Return the filenames your agent uses as project markers.
   *
   * These are used by ProjectScanner to detect projects on disk.
   * Example: ['CODEX.md', '.codex']
   */
  getProjectMarkers(): string[] {
    return []
  }

  /**
   * TODO: Read your agent's project instructions file.
   *
   * Return the file content and path, or null if not found.
   * For Claude Code this reads CLAUDE.md; for your agent, read
   * whatever file it uses for project-level instructions.
   */
  async readProjectInstructions(_projectPath: string): Promise<ProjectInstructions | null> {
    return null
  }

  /**
   * TODO: Declare which capabilities your adapter supports.
   *
   * Return false for features your agent doesn't support — the UI will
   * degrade gracefully (show placeholders instead of real data).
   * See the capability matrix in ARCHITECTURE.md §"Adapter Contract".
   */
  supports(_feature: AdapterFeature): boolean {
    return false
  }

  getCapabilities(): AdapterCapabilities {
    return {
      'mcp-injection': false,
      'status-line': false,
      'skip-permissions': false,
      'sub-agents': false,
      'project-instructions': false,
      'message-bus-participant': false,
      'companion-mcp': false,
    }
  }

  /**
   * TODO: Send a prompt string into the agent's tmux pane.
   *
   * Most CLI agents accept input via tmux send-keys + Enter.
   * If your agent needs special framing (e.g. JSON-RPC), implement it here.
   */
  async sendPrompt(_tmuxTarget: string, _prompt: string, _opts?: SendOpts): Promise<void> {
    throw new Error('Not implemented — implement prompt delivery for your agent CLI')
  }

  /**
   * TODO (optional): Return agent-specific instructions for the orchestrator prompt.
   *
   * This fragment is injected into the orchestrator's CLAUDE.md template.
   * Use it to tell the orchestrator how to interact with sessions running
   * your agent (e.g. different delegation semantics, different skill names).
   * Return empty string if your agent needs no special orchestrator guidance.
   */
  buildOrchestratorPromptFragment(_lang: 'de' | 'en'): string {
    return ''
  }

  /**
   * TODO (optional): Return agent-specific launcher prompt suffix.
   *
   * For Claude Code this returns '/launch' (a slash command).
   * Your agent may use a different trigger. Return empty string if N/A.
   */
  buildLauncherPromptFragment(_lang: 'de' | 'en'): string {
    return ''
  }

  /**
   * TODO (optional): Return agent-specific instructions for the Cyber Factory template.
   *
   * This fragment is injected into the Cyber Factory session's CLAUDE.md.
   * Use it to provide worker-startup instructions and delegation semantics.
   * Return empty string if your agent needs no special Cyber Factory guidance.
   */
  buildCyberFactoryPromptFragment(_lang: 'de' | 'en'): string {
    return ''
  }
}
