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

  buildLaunchCommand(opts: LaunchOpts): LaunchCommand {
    const args: string[] = []
    if (this.configReader.getSkipPermissions()) {
      args.push('--dangerously-skip-permissions')
    }
    if (opts.resume) {
      args.push('--resume')
    }
    if (opts.forkFromClaudeSessionId) {
      args.push('--fork-session', opts.forkFromClaudeSessionId)
    }
    if (opts.model) {
      args.push('--model', opts.model)
    }
    return { cmd: 'claude', args }
  }

  /**
   * Post-launch injection: register MCP server in Claude Code's settings.
   *
   * Uses THREE paths to ensure MCP tools are always available:
   * 1. Direct write to `<project>/.claude/settings.local.json` (most reliable — we control this file)
   * 2. `claude mcp add-json` CLI command (official API)
   * 3. Direct write to `~/.claude/projects/<hash>/settings.json` (project-scoped fallback)
   */
  async postLaunchInjection(ctx: AdapterContext): Promise<void> {
    const mcpServerConfig = {
      type: 'http',
      url: ctx.mcpUrl,
      headers: { Authorization: `Bearer ${ctx.mcpApiKey}` },
    }

    // Path 1: Direct write to local settings.local.json (most reliable)
    // This is the same file used by statusLine hook — Claude Code always reads it.
    try {
      const claudeDir = path.join(ctx.projectPath, '.claude')
      const localSettingsPath = path.join(claudeDir, 'settings.local.json')

      fs.mkdirSync(claudeDir, { recursive: true })

      let settings: Record<string, unknown> = {}
      try {
        settings = JSON.parse(fs.readFileSync(localSettingsPath, 'utf-8'))
      } catch {
        // File doesn't exist or invalid JSON — start fresh
      }

      if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
        settings.mcpServers = {}
      }
      ;(settings.mcpServers as Record<string, unknown>)['cipher-mux'] = mcpServerConfig

      fs.writeFileSync(localSettingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[ClaudeCodeAdapter] Local settings.local.json write failed:', err)
    }

    // Path 2: CLI command
    try {
      const serverJson = JSON.stringify(mcpServerConfig)

      await runCommand('claude', [
        'mcp', 'remove', '-s', 'local', 'cipher-mux',
      ], { cwd: ctx.projectPath, timeout: 10_000 }).catch(() => {})

      await runCommand('claude', [
        'mcp', 'add-json', '-s', 'local', 'cipher-mux', serverJson,
      ], { cwd: ctx.projectPath, timeout: 15_000 })
    } catch (err) {
      console.warn('[ClaudeCodeAdapter] CLI MCP registration failed:', err)
    }

    // Path 3: Direct settings.json in ~/.claude/projects/<hash>/
    // Claude Code hashes paths by replacing / with - AND stripping leading
    // dots from path components (e.g. /.config/ → --config- not -.config-).
    try {
      const projectHash = ctx.projectPath
        .split('/')
        .map(seg => seg.replace(/^\./g, ''))
        .join('-')
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
      ;(settings.mcpServers as Record<string, unknown>)['cipher-mux'] = mcpServerConfig

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
      'companion-mcp': true,
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

  buildWorkshopPromptFragment(lang: 'de' | 'en'): string {
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

  buildCyberFactoryPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `### Worker-Session-Startup (Claude Code)

Starte Worker mit: \`claude --dangerously-skip-permissions\`
MCP-Tools stehen automatisch zur Verfügung wenn die Session via mux_create_session erstellt wurde.
Instruktionen DIREKT via tmux send-keys in den Pane schicken — nicht via mux_send.
Session-Prefix fuer Cyber-Factory-Worker: \`cmux-cf-\`
`
    }
    return `### Worker Session Startup (Claude Code)

Start workers with: \`claude --dangerously-skip-permissions\`
MCP tools are automatically available when sessions are created via mux_create_session.
Send instructions DIRECTLY via tmux send-keys into the pane — not via mux_send.
Session prefix for Cyber Factory workers: \`cmux-cf-\`
`
  }
}
