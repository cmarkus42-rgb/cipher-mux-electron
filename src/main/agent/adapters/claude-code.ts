import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import type {
  AgentAdapter,
  LaunchCommand,
  LaunchOpts,
  AdapterContext,
  ProjectInstructions,
  SendOpts,
} from '../agent-adapter'
import type { AdapterFeature, AdapterCapabilities } from '../../../shared/types'
import { runCommand } from '../../util/exec-util'

/** Minimal interface for reading the agent config section. */
export interface AgentConfigReader {
  getSkipPermissions(): boolean
}

/** Default reader that lazily imports configStore (avoids top-level electron dep in tests). */
const defaultConfigReader: AgentConfigReader = {
  getSkipPermissions(): boolean {
    // Lazy require to avoid pulling in electron at module load time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    return configStore.get('agent').skipPermissions
  },
}

/**
 * Claude Code adapter — Tier-1, full capability support.
 *
 * Encapsulates all Claude Code CLI specifics:
 * - Launch via `claude --dangerously-skip-permissions` (configurable via agent.skipPermissions)
 * - MCP injection via `claude mcp add-json` AND direct settings.json
 *   manipulation (dual-path fix for BUG-mcp-tools-not-loaded)
 * - StatusLine hook for context usage reporting
 * - CLAUDE.md as project marker
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = 'claude-code'
  readonly displayName = 'Claude Code'
  readonly tier = 'tier-1' as const

  private readonly configReader: AgentConfigReader

  constructor(configReader?: AgentConfigReader) {
    this.configReader = configReader ?? defaultConfigReader
  }

  buildLaunchCommand(_opts: LaunchOpts): LaunchCommand {
    const args: string[] = []
    if (this.configReader.getSkipPermissions()) {
      args.push('--dangerously-skip-permissions')
    }
    return { cmd: 'claude', args }
  }

  /**
   * Post-launch injection: register MCP server in Claude Code's settings.
   *
   * Uses TWO paths to work around BUG-mcp-tools-not-loaded:
   * 1. `claude mcp add-json` CLI command (official API)
   * 2. Direct write to `~/.claude/projects/<hash>/settings.json` (caching bug workaround)
   */
  async postLaunchInjection(ctx: AdapterContext): Promise<void> {
    const serverJson = JSON.stringify({
      type: 'http',
      url: ctx.mcpUrl,
      headers: { Authorization: `Bearer ${ctx.mcpApiKey}` },
    })

    // Path 1: CLI command
    try {
      await runCommand('claude', [
        'mcp', 'remove', '-s', 'local', 'cipher-mux',
      ], { cwd: ctx.projectPath, timeout: 10_000 }).catch(() => {})

      await runCommand('claude', [
        'mcp', 'add-json', '-s', 'local', 'cipher-mux', serverJson,
      ], { cwd: ctx.projectPath, timeout: 15_000 })
    } catch (err) {
      console.warn('[ClaudeCodeAdapter] CLI MCP registration failed:', err)
    }

    // Path 2: Direct settings.json manipulation (BUG-mcp-tools-not-loaded fix)
    try {
      const projectHash = ctx.projectPath.replace(/\//g, '-')
      const settingsDir = path.join(os.homedir(), '.claude', 'projects', projectHash)
      const settingsPath = path.join(settingsDir, 'settings.json')

      fs.mkdirSync(settingsDir, { recursive: true })

      let settings: Record<string, unknown> = {}
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      } catch {
        // File doesn't exist or invalid JSON — start fresh
      }

      if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
        settings.mcpServers = {}
      }
      ;(settings.mcpServers as Record<string, unknown>)['cipher-mux'] = {
        type: 'http',
        url: ctx.mcpUrl,
        headers: { Authorization: `Bearer ${ctx.mcpApiKey}` },
      }

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[ClaudeCodeAdapter] Direct settings.json write failed:', err)
    }
  }

  getProjectMarkers(): string[] {
    return ['CLAUDE.md', '.claude']
  }

  async readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null> {
    const filePath = path.join(projectPath, 'CLAUDE.md')
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { content, filePath }
    } catch {
      return null
    }
  }

  supports(_feature: AdapterFeature): boolean {
    return true // Claude Code supports all 6 features
  }

  getCapabilities(): AdapterCapabilities {
    return {
      'mcp-injection': true,
      'status-line': true,
      'skip-permissions': true,
      'sub-agents': true,
      'project-instructions': true,
      'message-bus-participant': true,
    }
  }

  async attachStatusHook(projectPath: string): Promise<void> {
    const { injectStatusLineHook } = await import('../../monitoring/statusline-hook')
    injectStatusLineHook(projectPath)
  }

  async sendPrompt(_tmuxTarget: string, _prompt: string, _opts?: SendOpts): Promise<void> {
    // Claude Code accepts plain text via tmux send-keys.
    // SessionManager handles the actual send — this method exists for adapters
    // that need custom prompt framing (e.g. JSON-RPC).
    throw new Error('sendPrompt should be called via SessionManager.sendKeys')
  }

  buildOrchestratorPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (Claude Code)

Starte Worker mit: \`claude --dangerously-skip-permissions\`
MCP-Tools stehen automatisch zur Verfügung wenn die Session via mux_create_session erstellt wurde.
Instruktionen DIREKT via tmux send-keys in den Pane schicken — nicht via mux_send.
`
    }
    return `### Worker Session Startup (Claude Code)

Start workers with: \`claude --dangerously-skip-permissions\`
MCP tools are automatically available when sessions are created via mux_create_session.
Send instructions DIRECTLY via tmux send-keys into the pane — not via mux_send.
`
  }

  buildLauncherPromptFragment(_lang: 'de' | 'en'): string {
    return '/launch'
  }

  buildMpoPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (Claude Code)

Starte Worker mit: \`claude --dangerously-skip-permissions\`
MCP-Tools stehen automatisch zur Verfügung wenn die Session via mux_create_session erstellt wurde.
Instruktionen DIREKT via tmux send-keys in den Pane schicken — nicht via mux_send.
Session-Prefix fuer MPO-Worker: \`cmux-mpo-\`
`
    }
    return `### Worker Session Startup (Claude Code)

Start workers with: \`claude --dangerously-skip-permissions\`
MCP tools are automatically available when sessions are created via mux_create_session.
Send instructions DIRECTLY via tmux send-keys into the pane — not via mux_send.
Session prefix for MPO workers: \`cmux-mpo-\`
`
  }
}
