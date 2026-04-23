# AgentAdapter Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Break the direct Claude Code coupling in SessionManager by introducing an AgentAdapter interface, a full Claude Code implementation, a reference stub for community contributors, and capability-based UI degradation.

**Architecture:** A new `src/main/agent/` directory contains the `AgentAdapter` interface, a registry, and adapter implementations. SessionManager holds a Map of session-ID to adapter. All hardcoded `claude` CLI calls move into the Claude Code adapter. Orchestrator/launcher templates consume agent-specific prompt fragments from the adapter instead of hardcoding Claude idioms. UI components receive a `capabilities` prop for graceful degradation when features are unsupported.

**Tech Stack:** TypeScript strict, Node.js `node:test` runner, `node:assert/strict`, Preact JSX, existing BRAND system

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/main/agent/agent-adapter.ts` | Interface + types (`AgentAdapter`, `LaunchCommand`, `AdapterFeature`, `AdapterContext`, `LaunchOpts`, `ProjectInstructions`, `SendOpts`) |
| `src/main/agent/adapters/claude-code.ts` | Tier-1 adapter — all 6 capabilities, launch command, MCP injection, statusline hook, prompt fragments |
| `src/main/agent/adapters/_reference-stub.ts` | Documented skeleton with TODOs for community contributors |
| `src/main/agent/registry.ts` | Adapter registry — config-based lookup, default to claude-code |
| `test/main/agent-adapter.test.ts` | Tests for Claude Code adapter, reference stub, registry |
| `docs/contributing/adapter-test-protocol.md` | Weekend-adapter acceptance test documentation |

### Modified Files
| File | Change |
|------|--------|
| `src/shared/types.ts` | Add `AdapterCapabilities` to `SessionInfo`, export adapter feature type |
| `src/main/session/session-manager.ts` | Use adapter for launch, MCP injection, statusline hook; hold session-to-adapter map |
| `src/main/session/orchestrator-template.ts` | Accept adapter prompt fragment, remove hardcoded claude command |
| `src/main/project/launcher-prompt.ts` | Accept adapter prompt fragment, remove hardcoded `/launch` |
| `src/main/project/kickoff-orchestrator.ts` | Use adapter for launch command instead of `AUTOLAUNCH_CLAUDE` |
| `src/main/monitoring/statusline-monitor.ts` | No changes needed (already agent-agnostic) |
| `src/main/project/project-scanner.ts` | Accept markers from adapter for multi-agent detection |
| `src/main/mcp/mcp-tools.ts` | Include capabilities in `mux_sessions` response |
| `test/main/orchestrator-template.test.ts` | Update for new function signature |
| `test/main/kickoff-orchestrator.test.ts` | Update for adapter usage |
| `test/main/launcher-prompt.test.ts` | Update for new function signature |

---

## Task 1: AgentAdapter Interface & Types

**Files:**
- Create: `src/main/agent/agent-adapter.ts`
- Modify: `src/shared/types.ts`
- Test: `test/main/agent-adapter.test.ts`

- [ ] **Step 1: Create the interface file**

```typescript
// src/main/agent/agent-adapter.ts

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
 * features. Inspired by VS Code's Extension Host capability model
 * and Warp's shell-agnostic adapter layer.
 */

export type AdapterFeature =
  | 'mcp-injection'
  | 'status-line'
  | 'skip-permissions'
  | 'sub-agents'
  | 'project-instructions'
  | 'message-bus-participant'

export type AdapterCapabilities = Record<AdapterFeature, boolean>

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
}

export interface AdapterContext {
  /** Absolute path to the project directory */
  projectPath: string
  /** MCP server URL */
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
  buildLaunchCommand(opts: LaunchOpts): LaunchCommand
  postLaunchInjection?(ctx: AdapterContext): Promise<void>

  // --- project awareness ---
  getProjectMarkers(): string[]
  readProjectInstructions(projectPath: string): Promise<ProjectInstructions | null>

  // --- runtime signals (capability-gated) ---
  supports(feature: AdapterFeature): boolean
  getCapabilities(): AdapterCapabilities
  getContextUsage?(sessionId: string): Promise<import('../shared/types').ContextUsage | null>
  attachStatusHook?(projectPath: string): Promise<void>

  // --- prompt delivery ---
  sendPrompt(tmuxTarget: string, prompt: string, opts?: SendOpts): Promise<void>

  // --- prompt fragments for orchestrator and launcher ---
  buildOrchestratorPromptFragment(lang: 'de' | 'en'): string
  buildLauncherPromptFragment(lang: 'de' | 'en'): string
}
```

- [ ] **Step 2: Add AdapterCapabilities to SessionInfo in types.ts**

Add import and extend `SessionInfo`:

```typescript
// In src/shared/types.ts, after the existing imports, add:
import type { AdapterCapabilities } from '../main/agent/agent-adapter'

// Extend SessionInfo:
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
}
```

Note: The import path from `shared/types.ts` to `main/agent/` crosses the shared→main boundary. To keep `shared/` free of main-process imports, define `AdapterCapabilities` directly in `shared/types.ts` and re-export from `agent-adapter.ts`:

```typescript
// In src/shared/types.ts, add BEFORE SessionInfo:
export type AdapterFeature =
  | 'mcp-injection'
  | 'status-line'
  | 'skip-permissions'
  | 'sub-agents'
  | 'project-instructions'
  | 'message-bus-participant'

export type AdapterCapabilities = Record<AdapterFeature, boolean>
```

Then in `agent-adapter.ts`, import from shared:
```typescript
import type { AdapterFeature, AdapterCapabilities, ContextUsage } from '../../shared/types'
```

- [ ] **Step 3: Verify the types compile**

Run: `npx tsc --noEmit`
Expected: No errors related to new types (other pre-existing errors are OK)

- [ ] **Step 4: Commit**

```bash
git add src/main/agent/agent-adapter.ts src/shared/types.ts
git commit -m "feat(agent): add AgentAdapter interface and AdapterCapabilities types"
```

---

## Task 2: Claude Code Adapter (Tier-1)

**Files:**
- Create: `src/main/agent/adapters/claude-code.ts`
- Test: `test/main/agent-adapter.test.ts`

- [ ] **Step 1: Write tests for Claude Code adapter**

```typescript
// test/main/agent-adapter.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter()

  it('has correct id and displayName', () => {
    assert.equal(adapter.id, 'claude-code')
    assert.equal(adapter.displayName, 'Claude Code')
    assert.equal(adapter.tier, 'tier-1')
  })

  it('supports all 6 capabilities', () => {
    assert.equal(adapter.supports('mcp-injection'), true)
    assert.equal(adapter.supports('status-line'), true)
    assert.equal(adapter.supports('skip-permissions'), true)
    assert.equal(adapter.supports('sub-agents'), true)
    assert.equal(adapter.supports('project-instructions'), true)
    assert.equal(adapter.supports('message-bus-participant'), true)
  })

  it('getCapabilities returns all true', () => {
    const caps = adapter.getCapabilities()
    for (const val of Object.values(caps)) {
      assert.equal(val, true)
    }
  })

  describe('buildLaunchCommand', () => {
    it('returns structured command, not a string', () => {
      const cmd = adapter.buildLaunchCommand({
        projectPath: '/tmp/project',
        sessionName: 'Worker-1',
      })
      assert.equal(cmd.cmd, 'claude')
      assert.ok(Array.isArray(cmd.args))
      assert.ok(cmd.args.includes('--dangerously-skip-permissions'))
    })

    it('does not include shell metacharacters', () => {
      const cmd = adapter.buildLaunchCommand({
        projectPath: '/tmp/project',
        sessionName: 'Worker-1',
      })
      const fullStr = [cmd.cmd, ...cmd.args].join(' ')
      assert.ok(!fullStr.includes(';'))
      assert.ok(!fullStr.includes('&&'))
      assert.ok(!fullStr.includes('|'))
    })
  })

  it('getProjectMarkers returns CLAUDE.md variants', () => {
    const markers = adapter.getProjectMarkers()
    assert.ok(markers.includes('CLAUDE.md'))
    assert.ok(markers.includes('.claude'))
  })

  it('buildOrchestratorPromptFragment returns non-empty for de and en', () => {
    const de = adapter.buildOrchestratorPromptFragment('de')
    const en = adapter.buildOrchestratorPromptFragment('en')
    assert.ok(de.length > 0)
    assert.ok(en.length > 0)
    assert.ok(de.includes('claude'))
    assert.ok(en.includes('claude'))
  })

  it('buildLauncherPromptFragment returns non-empty for de and en', () => {
    const de = adapter.buildLauncherPromptFragment('de')
    const en = adapter.buildLauncherPromptFragment('en')
    assert.ok(de.length > 0)
    assert.ok(en.length > 0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import tsx test/main/agent-adapter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ClaudeCodeAdapter**

```typescript
// src/main/agent/adapters/claude-code.ts
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
import type { AdapterFeature, AdapterCapabilities, ContextUsage } from '../../../shared/types'
import { STATUSLINE_DIR } from '../../../shared/constants'
import { runCommand } from '../../util/exec-util'

/**
 * Claude Code adapter — Tier-1, full capability support.
 *
 * This adapter encapsulates all Claude Code CLI specifics:
 * - Launch via `claude --dangerously-skip-permissions`
 * - MCP injection via `claude mcp add-json` AND direct settings.json manipulation
 * - StatusLine hook for context usage reporting
 * - CLAUDE.md as project marker
 */
export class ClaudeCodeAdapter implements AgentAdapter {
  readonly id = 'claude-code'
  readonly displayName = 'Claude Code'
  readonly tier = 'tier-1' as const

  buildLaunchCommand(opts: LaunchOpts): LaunchCommand {
    return {
      cmd: 'claude',
      args: ['--dangerously-skip-permissions'],
    }
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
      console.warn(`[ClaudeCodeAdapter] CLI MCP registration failed:`, err)
    }

    // Path 2: Direct settings.json manipulation (BUG-mcp-tools-not-loaded fix)
    try {
      const projectHash = ctx.projectPath.replace(/\//g, '-')
      const settingsDir = path.join(os.homedir(), '.claude', 'projects', projectHash)
      const settingsPath = path.join(settingsDir, 'settings.json')

      fs.mkdirSync(settingsDir, { recursive: true })

      let settings: Record<string, any> = {}
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      } catch {
        // File doesn't exist or invalid JSON — start fresh
      }

      if (!settings.mcpServers) {
        settings.mcpServers = {}
      }
      settings.mcpServers['cipher-mux'] = {
        type: 'http',
        url: ctx.mcpUrl,
        headers: { Authorization: `Bearer ${ctx.mcpApiKey}` },
      }

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
    } catch (err) {
      console.warn(`[ClaudeCodeAdapter] Direct settings.json write failed:`, err)
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

  supports(feature: AdapterFeature): boolean {
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
    // Delegate to existing statusline-hook module
    const { injectStatusLineHook } = await import('../../monitoring/statusline-hook')
    injectStatusLineHook(projectPath)
  }

  async sendPrompt(tmuxTarget: string, prompt: string, opts?: SendOpts): Promise<void> {
    // Prompt sending is handled by SessionManager via TmuxManager.
    // This method exists for adapters that need custom prompt formatting.
    // Claude Code uses plain text + newline.
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

  buildLauncherPromptFragment(lang: 'de' | 'en'): string {
    if (lang === 'de') {
      return `/launch`
    }
    return `/launch`
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import tsx test/main/agent-adapter.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/adapters/claude-code.ts test/main/agent-adapter.test.ts
git commit -m "feat(agent): implement ClaudeCodeAdapter with all 6 capabilities"
```

---

## Task 3: Reference Stub Adapter

**Files:**
- Create: `src/main/agent/adapters/_reference-stub.ts`
- Modify: `test/main/agent-adapter.test.ts`

- [ ] **Step 1: Add reference stub tests**

Append to `test/main/agent-adapter.test.ts`:

```typescript
import { ReferenceStubAdapter } from '../../src/main/agent/adapters/_reference-stub'

describe('ReferenceStubAdapter', () => {
  const stub = new ReferenceStubAdapter()

  it('has correct id and tier', () => {
    assert.equal(stub.id, 'reference-stub')
    assert.equal(stub.tier, 'tier-2')
  })

  it('supports no capabilities', () => {
    assert.equal(stub.supports('mcp-injection'), false)
    assert.equal(stub.supports('status-line'), false)
    assert.equal(stub.supports('skip-permissions'), false)
    assert.equal(stub.supports('sub-agents'), false)
    assert.equal(stub.supports('project-instructions'), false)
    assert.equal(stub.supports('message-bus-participant'), false)
  })

  it('buildLaunchCommand throws Not implemented', () => {
    assert.throws(
      () => stub.buildLaunchCommand({ projectPath: '/tmp', sessionName: 'test' }),
      /Not implemented/,
    )
  })

  it('sendPrompt throws Not implemented', async () => {
    await assert.rejects(
      () => stub.sendPrompt('target', 'hello'),
      /Not implemented/,
    )
  })

  it('getProjectMarkers returns empty array', () => {
    assert.deepEqual(stub.getProjectMarkers(), [])
  })

  it('readProjectInstructions returns null', async () => {
    const result = await stub.readProjectInstructions('/tmp')
    assert.equal(result, null)
  })

  it('prompt fragments return empty strings', () => {
    assert.equal(stub.buildOrchestratorPromptFragment('de'), '')
    assert.equal(stub.buildLauncherPromptFragment('en'), '')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import tsx test/main/agent-adapter.test.ts`
Expected: FAIL — module not found for reference stub

- [ ] **Step 3: Create the reference stub**

```typescript
// src/main/agent/adapters/_reference-stub.ts

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
  AdapterContext,
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
    throw new Error('Not implemented — copy this file and fill in your agent CLI. See claude-code.ts for example.')
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
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import tsx test/main/agent-adapter.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/adapters/_reference-stub.ts test/main/agent-adapter.test.ts
git commit -m "feat(agent): add reference stub adapter with documented TODOs"
```

---

## Task 4: Adapter Registry

**Files:**
- Create: `src/main/agent/registry.ts`
- Modify: `test/main/agent-adapter.test.ts`

- [ ] **Step 1: Add registry tests**

Append to `test/main/agent-adapter.test.ts`:

```typescript
import { AdapterRegistry } from '../../src/main/agent/registry'

describe('AdapterRegistry', () => {
  it('returns claude-code adapter by default', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.get('claude-code')
    assert.ok(adapter)
    assert.equal(adapter.id, 'claude-code')
  })

  it('returns default adapter when id is unknown', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.getDefault()
    assert.equal(adapter.id, 'claude-code')
  })

  it('lists all registered adapters', () => {
    const registry = new AdapterRegistry()
    const ids = registry.listIds()
    assert.ok(ids.includes('claude-code'))
  })

  it('get returns undefined for unknown id', () => {
    const registry = new AdapterRegistry()
    assert.equal(registry.get('nonexistent'), undefined)
  })

  it('allows registering a custom adapter', () => {
    const registry = new AdapterRegistry()
    const stub = new ReferenceStubAdapter()
    registry.register(stub)
    const found = registry.get('reference-stub')
    assert.ok(found)
    assert.equal(found.id, 'reference-stub')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --import tsx test/main/agent-adapter.test.ts`
Expected: FAIL — AdapterRegistry not found

- [ ] **Step 3: Implement the registry**

```typescript
// src/main/agent/registry.ts
import type { AgentAdapter } from './agent-adapter'
import { ClaudeCodeAdapter } from './adapters/claude-code'

/**
 * AdapterRegistry — config-based adapter lookup.
 *
 * Holds all known adapters. Default is claude-code.
 * Community adapters register themselves via register().
 */
export class AdapterRegistry {
  private adapters: Map<string, AgentAdapter> = new Map()
  private defaultId = 'claude-code'

  constructor() {
    // Built-in: Claude Code (Tier-1)
    const claude = new ClaudeCodeAdapter()
    this.adapters.set(claude.id, claude)
  }

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter)
  }

  get(id: string): AgentAdapter | undefined {
    return this.adapters.get(id)
  }

  getDefault(): AgentAdapter {
    const adapter = this.adapters.get(this.defaultId)
    if (!adapter) throw new Error(`Default adapter '${this.defaultId}' not registered`)
    return adapter
  }

  listIds(): string[] {
    return Array.from(this.adapters.keys())
  }

  setDefault(id: string): void {
    if (!this.adapters.has(id)) throw new Error(`Adapter '${id}' not registered`)
    this.defaultId = id
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --import tsx test/main/agent-adapter.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/registry.ts test/main/agent-adapter.test.ts
git commit -m "feat(agent): add AdapterRegistry with config-based lookup"
```

---

## Task 5: Refactor SessionManager to Use Adapter

**Files:**
- Modify: `src/main/session/session-manager.ts`

This is the core refactor. SessionManager gets an `AdapterRegistry` dependency and holds a map of session-ID to adapter.

- [ ] **Step 1: Update SessionManager constructor and imports**

In `src/main/session/session-manager.ts`, add imports and modify the class:

```typescript
// Add to imports:
import type { AgentAdapter } from '../agent/agent-adapter'
import type { AdapterRegistry } from '../agent/registry'

// Add to class fields:
private adapterRegistry: AdapterRegistry
private sessionAdapters: Map<string, AgentAdapter> = new Map()

// Update constructor:
constructor(tmux: TmuxManager, adapterRegistry: AdapterRegistry) {
  super()
  this.tmux = tmux
  this.adapterRegistry = adapterRegistry
}
```

- [ ] **Step 2: Refactor start() to use adapter for MCP injection and statusline hook**

Replace the direct `registerMcpForProject` call and `injectStatusLineHook` call with adapter methods:

```typescript
// In start(), replace lines 79-93 (MCP + statusline injection) with:

    // Resolve adapter for this session (default for now; future: config-based)
    const adapter = this.adapterRegistry.getDefault()

    // Inject MCP config via adapter
    if (this.mcpConfig && opts.projectPath && adapter.postLaunchInjection) {
      const mcpUrl = `http://${this.mcpConfig.mcpHost}:${this.mcpConfig.mcpPort}/mcp`
      try {
        await adapter.postLaunchInjection({
          projectPath: opts.projectPath,
          mcpUrl,
          mcpApiKey: this.mcpConfig.mcpApiKey,
          sessionId: id,
        })
      } catch (err) {
        console.warn('[SessionManager] Adapter MCP injection failed:', err)
      }
    }

    // Inject status hook via adapter
    if (opts.projectPath && adapter.attachStatusHook) {
      try {
        await adapter.attachStatusHook(opts.projectPath)
      } catch (err) {
        console.warn('[SessionManager] Adapter statusline hook injection failed:', err)
      }
    }
```

After creating the session, store the adapter mapping:

```typescript
    // After this.sessions.set(id, session):
    this.sessionAdapters.set(id, adapter)

    // Also set adapterId and capabilities on SessionInfo:
    session.adapterId = adapter.id
    session.capabilities = adapter.getCapabilities()
```

- [ ] **Step 3: Refactor queueOrchestratorClaude() to use adapter**

Replace the hardcoded command:

```typescript
  queueOrchestratorClaude(): void {
    if (!this.orchestratorSessionId) {
      throw new Error('Orchestrator is not running')
    }
    const adapter = this.adapterRegistry.getDefault()
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: this.resolveOrchestratorDir(),
      sessionName: 'Orchestrator',
      isOrchestrator: true,
    })
    // Assemble command from structured LaunchCommand — no shell injection risk
    const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
    this.setPendingLaunch(
      this.orchestratorSessionId,
      `clear; ${cmdStr}\n`,
    )
  }
```

- [ ] **Step 4: Refactor startOrchestrator() to use adapter for .mcp.json**

The `.mcp.json` write in `startOrchestrator()` stays (it's a fallback), but the `generateOrchestratorClaudeMd` call should pass adapter info. This will be completed in Task 7 when we refactor the template.

- [ ] **Step 5: Remove registerMcpForProject private method**

Delete the `registerMcpForProject` method (lines 367-388) — this logic now lives in `ClaudeCodeAdapter.postLaunchInjection`.

Also remove the now-unused `injectStatusLineHook` import.

- [ ] **Step 6: Add getAdapterForSession helper**

```typescript
  /**
   * Get the adapter associated with a session.
   */
  getAdapterForSession(sessionId: string): AgentAdapter | undefined {
    return this.sessionAdapters.get(sessionId)
  }
```

- [ ] **Step 7: Clean up on stop()**

In the `stop()` method, after `this.sessions.delete(sessionId)`:

```typescript
    this.sessionAdapters.delete(sessionId)
```

- [ ] **Step 8: Verify compilation**

Run: `npx tsc --noEmit`
Expected: Compilation passes (may have unrelated warnings)

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: All existing tests pass. Some tests may need constructor updates (Task 8).

- [ ] **Step 10: Commit**

```bash
git add src/main/session/session-manager.ts
git commit -m "refactor(session): use AgentAdapter for MCP injection, statusline hook, and launch command"
```

---

## Task 6: Refactor KickoffOrchestrator to Use Adapter

**Files:**
- Modify: `src/main/project/kickoff-orchestrator.ts`
- Modify: `test/main/kickoff-orchestrator.test.ts`

- [ ] **Step 1: Update KickoffOrchestrator to accept AdapterRegistry**

```typescript
// In kickoff-orchestrator.ts, add to imports:
import type { AdapterRegistry } from '../agent/registry'

// Add to KickoffOrchestratorDeps:
export interface KickoffOrchestratorDeps {
  sessionManager: SessionManager
  adapterRegistry: AdapterRegistry
  projectlauncherPath: string
  timeoutMs: number
  pollIntervalMs?: number
  promptSendDelayMs?: number
  interviewSendDelayMs?: number
}
```

- [ ] **Step 2: Replace AUTOLAUNCH_CLAUDE with adapter**

Remove the `AUTOLAUNCH_CLAUDE` constant. In `start()`, replace:

```typescript
    // Replace line 90 (autoLaunch: AUTOLAUNCH_CLAUDE) with:
    const adapter = this.deps.adapterRegistry.getDefault()
    const launchCmd = adapter.buildLaunchCommand({
      projectPath: this.deps.projectlauncherPath,
      sessionName: `Launcher: ${projectName}`,
    })
    const autoLaunchStr = `clear; ${[launchCmd.cmd, ...launchCmd.args].join(' ')}\n`

    const session = await this.deps.sessionManager.start({
      name: `Launcher: ${projectName}`,
      projectPath: this.deps.projectlauncherPath,
      autoLaunch: autoLaunchStr,
    })
```

Do the same in `handleCompletion()` for the follow-up session (line 156):

```typescript
    const adapter = this.deps.adapterRegistry.getDefault()
    const followLaunchCmd = adapter.buildLaunchCommand({
      projectPath: active.handle.projectDir,
      sessionName: active.handle.projectName,
    })
    const followAutoLaunch = `clear; ${[followLaunchCmd.cmd, ...followLaunchCmd.args].join(' ')}\n`

    this.deps.sessionManager.start({
      name: active.handle.projectName,
      projectPath: active.handle.projectDir,
      autoLaunch: followAutoLaunch,
    }).then((followup) => {
```

- [ ] **Step 3: Replace hardcoded /interview with adapter fragment**

Replace the hardcoded `/interview\n` with the adapter's launcher fragment:

```typescript
      // In the setTimeout callback inside handleCompletion:
      const launcherFragment = adapter.buildLauncherPromptFragment('de')
      const interviewCmd = launcherFragment || '/interview'
      setTimeout(() => {
        this.deps.sessionManager
          .sendKeys(followup.id, interviewCmd + '\n')
          .catch((err) => {
            console.error('[KickoffOrchestrator] follow-up sendKeys failed:', err)
          })
      }, interviewDelay)
```

- [ ] **Step 4: Update tests**

In `test/main/kickoff-orchestrator.test.ts`, add a mock registry to `beforeEach`:

```typescript
import { AdapterRegistry } from '../../src/main/agent/registry'

// In beforeEach, after mockSm creation:
    const registry = new AdapterRegistry()
    orchestrator = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      adapterRegistry: registry,
      projectlauncherPath: launcherDir,
      timeoutMs: 60_000,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/project/kickoff-orchestrator.ts test/main/kickoff-orchestrator.test.ts
git commit -m "refactor(kickoff): use AgentAdapter instead of hardcoded AUTOLAUNCH_CLAUDE"
```

---

## Task 7: Refactor Orchestrator Template for Adapter Fragments

**Files:**
- Modify: `src/main/session/orchestrator-template.ts`
- Modify: `test/main/orchestrator-template.test.ts`

- [ ] **Step 1: Add adapterFragment parameter to template opts**

```typescript
// In orchestrator-template.ts, extend OrchestratorTemplateOpts:
export interface OrchestratorTemplateOpts {
  mcpHost: string
  mcpPort: number
  mcpApiKey: string
  maxRetries: number
  /** Agent-specific orchestrator instructions from adapter */
  adapterFragment?: string
}
```

- [ ] **Step 2: Replace hardcoded claude command in bugreport section**

In the template string, replace the hardcoded `claude --dangerously-skip-permissions` at line 71 with the adapter fragment:

```typescript
  // After the "## Bugreport-Verarbeitung" section, replace the hardcoded
  // bugreport workflow step 3 (command: "claude --dangerously-skip-permissions")
  // with a generic placeholder. The adapter-specific details come from the fragment.
```

At the end of the template, append the adapter fragment:

```typescript
  const fragment = opts.adapterFragment ?? ''
  const fragmentSection = fragment ? `\n## Agent-spezifische Hinweise\n\n${fragment}\n` : ''

  return `# Orchestrator — ${BRAND.appName}
... (existing template content) ...
${fragmentSection}`
```

And in the bugreport section, change line 71 from:
```
   - command: "claude --dangerously-skip-permissions"
```
to:
```
   - command: (siehe "Agent-spezifische Hinweise" unten)
```

- [ ] **Step 3: Update SessionManager.startOrchestrator() to pass fragment**

In `session-manager.ts`, update the `generateOrchestratorClaudeMd` call:

```typescript
    const adapter = this.adapterRegistry.getDefault()
    const claudeMd = generateOrchestratorClaudeMd({
      mcpHost: config.mcpHost,
      mcpPort: config.mcpPort,
      mcpApiKey: config.mcpApiKey,
      maxRetries: ORCHESTRATOR_MAX_RETRIES,
      adapterFragment: adapter.buildOrchestratorPromptFragment('de'),
    })
```

- [ ] **Step 4: Update orchestrator template tests**

In `test/main/orchestrator-template.test.ts`, update tests that check for the hardcoded claude command:

```typescript
  it('includes adapter fragment when provided', () => {
    const md = generateOrchestratorClaudeMd({
      ...defaultOpts,
      adapterFragment: 'Start workers with: `claude --dangerously-skip-permissions`',
    })
    assert.ok(md.includes('claude --dangerously-skip-permissions'))
    assert.ok(md.includes('Agent-spezifische Hinweise'))
  })

  it('omits adapter section when no fragment', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(!md.includes('Agent-spezifische Hinweise'))
  })
```

Update existing tests that assert on the now-removed hardcoded command string.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/session/orchestrator-template.ts src/main/session/session-manager.ts test/main/orchestrator-template.test.ts
git commit -m "refactor(orchestrator): use adapter prompt fragment instead of hardcoded claude command"
```

---

## Task 8: Refactor Launcher Prompt for Adapter Fragments

**Files:**
- Modify: `src/main/project/launcher-prompt.ts`
- Modify: `test/main/launcher-prompt.test.ts`

- [ ] **Step 1: Add launcherSkillCmd to LauncherPromptInput**

```typescript
export interface LauncherPromptInput {
  projectDir: string
  requirementsRelPath?: string
  extraContext?: string
  /** Agent-specific launcher suffix, e.g. '/launch' for Claude Code */
  launcherSkillCmd?: string
}
```

- [ ] **Step 2: Use the parameter instead of hardcoded /launch**

At line 46, replace the hardcoded `/launch`:

```typescript
  const skillCmd = input.launcherSkillCmd ?? '/launch'

  return `Hey, ein neues Projekt...
...
${extra}Wenn du fertig bist, ruf das MCP-Tool \`kickoff_complete\` auf...

${skillCmd}`
```

- [ ] **Step 3: Update KickoffOrchestrator to pass adapter's launcher fragment**

In `kickoff-orchestrator.ts`, update the `buildLauncherPrompt` call:

```typescript
    const adapter = this.deps.adapterRegistry.getDefault()
    const prompt = buildLauncherPrompt({
      projectDir,
      requirementsRelPath,
      extraContext: req.extraContext,
      launcherSkillCmd: adapter.buildLauncherPromptFragment('de'),
    })
```

- [ ] **Step 4: Update launcher prompt tests**

In `test/main/launcher-prompt.test.ts`, add:

```typescript
  it('uses custom launcher skill command when provided', () => {
    const prompt = buildLauncherPrompt({
      projectDir: '/tmp/test',
      launcherSkillCmd: '/codex-start',
    })
    assert.ok(prompt.includes('/codex-start'))
    assert.ok(!prompt.includes('/launch'))
  })

  it('defaults to /launch when no skill command provided', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/tmp/test' })
    assert.ok(prompt.includes('/launch'))
  })
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/main/project/launcher-prompt.ts src/main/project/kickoff-orchestrator.ts test/main/launcher-prompt.test.ts
git commit -m "refactor(launcher): use adapter launcher fragment instead of hardcoded /launch"
```

---

## Task 9: Expose Capabilities in MCP mux_sessions

**Files:**
- Modify: `src/main/mcp/mcp-tools.ts`

- [ ] **Step 1: Update mux_sessions response to include capabilities**

The `mux_sessions` tool already returns `ctx.sessionManager.list()`. Since we added `adapterId` and `capabilities` to `SessionInfo` in Task 1, the capabilities will be automatically included in the JSON response. Verify this by reading the MCP tools code.

If `SessionInfo` serialization works correctly (it should, since `capabilities` is a plain object), no code change is needed — the new fields propagate automatically.

- [ ] **Step 2: Verify by checking the serialization**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Commit (if changes needed)**

```bash
git add src/main/mcp/mcp-tools.ts
git commit -m "feat(mcp): expose adapter capabilities in mux_sessions response"
```

---

## Task 10: Update Constructor Call Sites

**Files:**
- Modify: `src/main/main.ts` (or wherever SessionManager is instantiated)

- [ ] **Step 1: Find where SessionManager is constructed**

Search for `new SessionManager` in the codebase.

- [ ] **Step 2: Pass AdapterRegistry**

```typescript
import { AdapterRegistry } from './agent/registry'

// Where SessionManager is constructed:
const adapterRegistry = new AdapterRegistry()
const sessionManager = new SessionManager(tmux, adapterRegistry)
```

- [ ] **Step 3: Find where KickoffOrchestrator is constructed and pass registry**

```typescript
const kickoffOrchestrator = new KickoffOrchestrator({
  sessionManager,
  adapterRegistry,
  projectlauncherPath,
  timeoutMs,
  ...
})
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests PASS (some test files may need registry added to mocks)

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/main/main.ts
git commit -m "refactor(main): wire AdapterRegistry into SessionManager and KickoffOrchestrator"
```

---

## Task 11: Fix Dependent Tests

**Files:**
- Modify: Various test files that construct SessionManager or KickoffOrchestrator

- [ ] **Step 1: Find all test files that instantiate SessionManager**

Search for `new SessionManager` in test files. Update each to pass an `AdapterRegistry`:

```typescript
import { AdapterRegistry } from '../../src/main/agent/registry'

// In test setup:
const registry = new AdapterRegistry()
const sessionManager = new SessionManager(mockTmux as any, registry)
```

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All 164+ tests PASS

- [ ] **Step 3: Commit**

```bash
git add test/
git commit -m "test: update all test files to pass AdapterRegistry to SessionManager"
```

---

## Task 12: ProjectScanner Multi-Marker Support

**Files:**
- Modify: `src/main/project/project-scanner.ts`

- [ ] **Step 1: Add configurable markers to ProjectScanner**

This is a lightweight change — ProjectScanner already checks for `CLAUDE.md`, `.claude`, and `docs`. We add an optional `extraMarkers` parameter:

```typescript
  /**
   * Inspect a single directory and return ProjectInfo if it's a recognized project.
   * @param extraMarkers  Additional filenames to check beyond the defaults (CLAUDE.md, .claude, docs).
   */
  async inspectProject(projectPath: string, extraMarkers: string[] = []): Promise<ProjectInfo | null> {
    const hasClaudeMd = fs.existsSync(path.join(projectPath, 'CLAUDE.md'))
    const hasClaudeDir = fs.existsSync(path.join(projectPath, '.claude'))
    const hasDocs = fs.existsSync(path.join(projectPath, 'docs'))
    const hasExtraMarker = extraMarkers.some(m => fs.existsSync(path.join(projectPath, m)))

    if (!hasClaudeMd && !hasClaudeDir && !hasDocs && !hasExtraMarker) {
      return null
    }
    // ... rest unchanged
  }
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All tests PASS (signature is backward-compatible)

- [ ] **Step 3: Commit**

```bash
git add src/main/project/project-scanner.ts
git commit -m "feat(scanner): add extraMarkers parameter for multi-agent project detection"
```

---

## Task 13: UI Capability Props (Lightweight)

**Files:**
- Modify: `src/renderer/components/PaneHeader.tsx`

The spec asks for `capabilities` props on UI components. Since all current sessions use Claude Code (all caps true), and the UI is Preact (not testable with node:test), we add the prop type and a single visible degradation: PaneHeader shows `—` for context usage when `status-line` capability is false.

- [ ] **Step 1: Add capabilities prop to PaneHeader**

```typescript
import type { AdapterCapabilities } from '../../shared/types'

interface PaneHeaderProps {
  sessionName: string
  contextUsage?: number
  capabilities?: AdapterCapabilities
}

// In the render, wrap the context usage display:
const showContextUsage = props.capabilities?.['status-line'] !== false
// Use showContextUsage to conditionally render the percentage or '—'
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/PaneHeader.tsx
git commit -m "feat(ui): add capabilities prop to PaneHeader with status-line degradation"
```

---

## Task 14: Documentation

**Files:**
- Create: `docs/contributing/adapter-test-protocol.md`

- [ ] **Step 1: Write adapter test protocol**

```markdown
# Adapter Test Protocol

## Overview

This document describes the acceptance test for building a new AgentAdapter.
The goal: verify that the adapter interface is practical enough to implement
in a weekend by a developer with coding-agent experience.

## Prerequisites

- Cloned aerie repo, `npm install` passes
- A coding agent CLI installed on the test machine
- Familiarity with tmux

## Steps

### 1. Copy the Reference Stub
```bash
cp src/main/agent/adapters/_reference-stub.ts src/main/agent/adapters/<your-agent>.ts
```

### 2. Implement Required Methods

At minimum:
- `buildLaunchCommand` — return `{cmd, args}` for your CLI
- `getProjectMarkers` — which files mark a project for your agent
- `supports` — set capabilities honestly (false is fine)
- `sendPrompt` — usually just tmux send-keys

### 3. Register in Registry

```typescript
// src/main/agent/registry.ts
import { YourAdapter } from './adapters/your-agent'
// In constructor:
const yours = new YourAdapter()
this.adapters.set(yours.id, yours)
```

### 4. Test

```bash
npm test  # All existing tests must stay green
npm run build  # Must compile
npm run dev  # Start the app, create a session with your adapter
```

### 5. Verify

- [ ] Session starts and streams terminal output
- [ ] Pane header shows correct degradation badges for unsupported capabilities
- [ ] No crash in Cockpit, ActivityRail, or Chatroom
- [ ] Claude Code sessions continue to work unchanged
- [ ] `mux_sessions` MCP tool shows your adapter's capabilities

## Capability Degradation

You don't need to support all capabilities. Set `supports()` to return `false`
for features your agent doesn't have. The UI will degrade gracefully:

| Capability | When false |
|------------|-----------|
| `status-line` | Context % shows `—` |
| `mcp-injection` | Badge: "MCP not active" |
| `skip-permissions` | Launch dialog shows permission hint |
| `sub-agents` | Orchestrator uses session spawn instead |
| `project-instructions` | Cockpit card skips instructions display |
| `message-bus-participant` | Badge: "Read-only Bus" |
```

- [ ] **Step 2: Commit**

```bash
git add docs/contributing/adapter-test-protocol.md
git commit -m "docs: add adapter test protocol for community contributors"
```

---

## Task 15: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: No new lint errors

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev`
Verify:
- Orchestrator session starts and Claude launches
- MCP tools are available (check via Orchestrator)
- Context usage displays correctly
- Creating a new session works

- [ ] **Step 5: Final commit (if any fixups)**

```bash
git add -A
git commit -m "fix: final fixups from integration testing"
```

---

## Acceptance Criteria Checklist

- [ ] Claude-Code-Sessions funktionieren identisch wie vorher (Regression)
- [ ] `mux_sessions` enthaelt Adapter-Capabilities pro Session
- [ ] Reference-Stub kompiliert, wirft `Not implemented`
- [ ] UI zeigt Degradation-Badge bei `status-line: false` im PaneHeader
- [ ] BUG-mcp-tools-not-loaded gefixt (dual-path in ClaudeCodeAdapter.postLaunchInjection)
- [ ] Alle bestehenden Tests gruen
- [ ] Prompt-Fragmente statt hardkodierte Claude-Idiome in Templates
