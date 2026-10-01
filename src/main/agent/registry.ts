import type { AgentAdapter } from './agent-adapter'
import { ClaudeCodeAdapter } from './adapters/claude-code'
import { CodexAdapter } from './adapters/codex'

/**
 * AdapterRegistry — config-based adapter lookup.
 *
 * Holds all known adapters. Default is claude-code.
 * Community adapters register themselves via register().
 *
 * Der Default bleibt claude-code, und zwar nicht aus Gewohnheit: er ist der
 * einzige Tier-1-Adapter, und nur fuer ihn ist jede Capability gemessen. Ein
 * Wechsel ist eine Entscheidung des Nutzers, keine Vorgabe des Codes.
 */
export class AdapterRegistry {
  private adapters: Map<string, AgentAdapter> = new Map()
  private defaultId = 'claude-code'

  constructor() {
    const claude = new ClaudeCodeAdapter()
    this.adapters.set(claude.id, claude)
    const codex = new CodexAdapter()
    this.adapters.set(codex.id, codex)
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
