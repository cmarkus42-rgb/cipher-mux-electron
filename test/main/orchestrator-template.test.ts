import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateOrchestratorClaudeMd, OrchestratorTemplateOpts } from '../../src/main/session/orchestrator-template'

describe('generateOrchestratorClaudeMd', () => {
  const defaultOpts: OrchestratorTemplateOpts = {
    mcpHost: '127.0.0.1',
    mcpPort: 3100,
    mcpApiKey: 'test-api-key-abc123',
    maxRetries: 2,
  }

  it('references .mcp-connection.md for MCP details', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('.mcp-connection.md'))
  })

  it('contains all 7 MCP tools', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    const tools = [
      'mux_sessions',
      'mux_create_session',
      'mux_kill_session',
      'mux_send',
      'mux_read',
      'mux_status',
      'mux_context_usage',
    ]
    for (const tool of tools) {
      assert.ok(md.includes(tool), `Missing tool: ${tool}`)
    }
  })

  it('contains retry limit from opts', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes(`${defaultOpts.maxRetries} Retry`), 'Should mention retry limit')
  })

  it('uses custom retry limit', () => {
    const md = generateOrchestratorClaudeMd({ ...defaultOpts, maxRetries: 3 })
    assert.ok(md.includes('3 Retry'), 'Should use custom retry limit')
  })

  it('does not hardcode MCP URL or auth (moved to .mcp-connection.md)', () => {
    const md = generateOrchestratorClaudeMd({ ...defaultOpts, mcpPort: 4200 })
    assert.ok(!md.includes('http://127.0.0.1:4200/mcp'))
    assert.ok(!md.includes('Bearer test-api-key'))
  })

  it('contains delegation rules', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('Delegation'), 'Should contain delegation section')
    assert.ok(md.includes('60-80%'))
  })

  it('contains status reporting via mux_send', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('topic "status"') || md.includes("topic 'status'"), 'Should reference status topic')
    assert.ok(md.includes('topic "system"') || md.includes("topic 'system'"), 'Should reference system topic')
  })

  it('starts with orchestrator heading', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.startsWith('# Orchestrator'))
  })

  it('contains bugreport consumption section', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('Bugreport'))
    assert.ok(md.includes('mux_bugreport_resolve'))
  })

  it('lists mux_bugreport_resolve in MCP tools section', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('mux_bugreport_resolve'))
  })

  it('includes adapter fragment when provided', () => {
    const md = generateOrchestratorClaudeMd({
      ...defaultOpts,
      adapterFragment: 'Start workers with: `claude --dangerously-skip-permissions`',
    })
    assert.ok(md.includes('claude --dangerously-skip-permissions'))
    assert.ok(md.includes('Agent-spezifische Hinweise'))
  })

  it('omits adapter section heading when no fragment provided', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(!md.includes('## Agent-spezifische Hinweise'))
  })

  it('should include task management tools in the template', () => {
    const md = generateOrchestratorClaudeMd({
      mcpHost: '127.0.0.1', mcpPort: 3100, mcpApiKey: 'key', maxRetries: 2,
    })
    assert.ok(md.includes('mux_task_create'))
    assert.ok(md.includes('mux_task_update'))
    assert.ok(md.includes('mux_task_list'))
    assert.ok(md.includes('mux_task_get'))
    assert.ok(md.includes('Task'), 'Should mention task management')
  })
})
