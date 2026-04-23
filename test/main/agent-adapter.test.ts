import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ClaudeCodeAdapter } from '../../src/main/agent/adapters/claude-code'
import type { AgentConfigReader } from '../../src/main/agent/adapters/claude-code'
import { ReferenceStubAdapter } from '../../src/main/agent/adapters/_reference-stub'
import { AdapterRegistry } from '../../src/main/agent/registry'

/** Test helper: creates a config reader with a fixed skipPermissions value. */
function mockConfigReader(skipPermissions: boolean): AgentConfigReader {
  return { getSkipPermissions: () => skipPermissions }
}

// ─── ClaudeCodeAdapter ──────────────────────────────────────

describe('ClaudeCodeAdapter', () => {
  const adapter = new ClaudeCodeAdapter(mockConfigReader(false))

  it('has correct id, displayName, and tier', () => {
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
    assert.equal(Object.keys(caps).length, 6)
  })

  describe('buildLaunchCommand', () => {
    it('default (skipPermissions=false): no --dangerously-skip-permissions flag', () => {
      const a = new ClaudeCodeAdapter(mockConfigReader(false))
      const cmd = a.buildLaunchCommand({
        projectPath: '/tmp/project',
        sessionName: 'Worker-1',
      })
      assert.equal(cmd.cmd, 'claude')
      assert.ok(Array.isArray(cmd.args))
      assert.ok(!cmd.args.includes('--dangerously-skip-permissions'))
    })

    it('skipPermissions=true: includes --dangerously-skip-permissions flag', () => {
      const a = new ClaudeCodeAdapter(mockConfigReader(true))
      const cmd = a.buildLaunchCommand({
        projectPath: '/tmp/project',
        sessionName: 'Worker-1',
      })
      assert.equal(cmd.cmd, 'claude')
      assert.ok(cmd.args.includes('--dangerously-skip-permissions'))
    })

    it('skipPermissions=false: flag is absent', () => {
      const a = new ClaudeCodeAdapter(mockConfigReader(false))
      const cmd = a.buildLaunchCommand({
        projectPath: '/tmp/project',
        sessionName: 'Worker-1',
      })
      assert.ok(!cmd.args.includes('--dangerously-skip-permissions'))
    })

    it('does not include shell metacharacters', () => {
      const a = new ClaudeCodeAdapter(mockConfigReader(true))
      const cmd = a.buildLaunchCommand({
        projectPath: '/tmp/project',
        sessionName: 'Worker-1',
      })
      const fullStr = [cmd.cmd, ...cmd.args].join(' ')
      assert.ok(!fullStr.includes(';'))
      assert.ok(!fullStr.includes('&&'))
      assert.ok(!fullStr.includes('|'))
    })
  })

  it('getProjectMarkers returns CLAUDE.md and .claude', () => {
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

  it('buildLauncherPromptFragment returns /launch', () => {
    assert.equal(adapter.buildLauncherPromptFragment('de'), '/launch')
    assert.equal(adapter.buildLauncherPromptFragment('en'), '/launch')
  })
})

// ─── ReferenceStubAdapter ───────────────────────────────────

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

  it('getCapabilities returns all false', () => {
    const caps = stub.getCapabilities()
    for (const val of Object.values(caps)) {
      assert.equal(val, false)
    }
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
    assert.equal(stub.buildOrchestratorPromptFragment('en'), '')
    assert.equal(stub.buildLauncherPromptFragment('de'), '')
    assert.equal(stub.buildLauncherPromptFragment('en'), '')
  })
})

// ─── AdapterRegistry ────────────────────────────────────────

describe('AdapterRegistry', () => {
  it('returns claude-code adapter by default', () => {
    const registry = new AdapterRegistry()
    const adapter = registry.get('claude-code')
    assert.ok(adapter)
    assert.equal(adapter.id, 'claude-code')
  })

  it('getDefault returns claude-code', () => {
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

  it('setDefault throws for unknown id', () => {
    const registry = new AdapterRegistry()
    assert.throws(
      () => registry.setDefault('nonexistent'),
      /not registered/,
    )
  })

  it('setDefault changes the default adapter', () => {
    const registry = new AdapterRegistry()
    const stub = new ReferenceStubAdapter()
    registry.register(stub)
    registry.setDefault('reference-stub')
    assert.equal(registry.getDefault().id, 'reference-stub')
  })
})
