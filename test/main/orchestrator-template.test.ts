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

  it('contains MCP URL with host and port', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('http://127.0.0.1:3100/mcp'))
  })

  it('contains Bearer token with API key', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('Bearer test-api-key-abc123'))
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
    assert.ok(md.includes('Maximal 2 Retry-Versuche'))
    assert.ok(md.includes('Nach 2 Fehlschlägen'))
  })

  it('uses custom retry limit', () => {
    const md = generateOrchestratorClaudeMd({ ...defaultOpts, maxRetries: 3 })
    assert.ok(md.includes('Maximal 3 Retry-Versuche'))
    assert.ok(md.includes('Nach 3 Fehlschlägen'))
  })

  it('uses custom port', () => {
    const md = generateOrchestratorClaudeMd({ ...defaultOpts, mcpPort: 4200 })
    assert.ok(md.includes('http://127.0.0.1:4200/mcp'))
  })

  it('contains delegation rules', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('Delegation-Regeln'))
    assert.ok(md.includes('60-80%'))
  })

  it('contains reporting section', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('Reporting'))
    assert.ok(md.includes('topic "status"'))
    assert.ok(md.includes('topic "system"'))
  })

  it('starts with orchestrator heading', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.startsWith('# Orchestrator — cipher-mux'))
  })

  it('contains bugreport consumption section', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('## Bugreport-Verarbeitung'))
    assert.ok(md.includes('mux_bugreport_resolve'))
  })

  it('contains bugreport outbox path', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(md.includes('.config/cipher-mux/bugreports/outbox'))
  })

  it('lists mux_bugreport_resolve in MCP tools section', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    // Should be in the MCP-Tools list at the top
    const toolsSection = md.split('## Delegation-Regeln')[0]
    assert.ok(toolsSection.includes('mux_bugreport_resolve'))
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
    // The heading "## Agent-spezifische Hinweise" should not appear as a section
    assert.ok(!md.includes('## Agent-spezifische Hinweise'))
  })

  it('bugreport section does not contain hardcoded claude command', () => {
    const md = generateOrchestratorClaudeMd(defaultOpts)
    assert.ok(!md.includes('command: "claude --dangerously-skip-permissions"'))
    assert.ok(md.includes('Agent-spezifische Hinweise'))
  })

  it('should include task management tools in the template', () => {
    const md = generateOrchestratorClaudeMd({
      mcpHost: '127.0.0.1', mcpPort: 3100, mcpApiKey: 'key', maxRetries: 2,
    })
    assert.ok(md.includes('mux_task_create'))
    assert.ok(md.includes('mux_task_update'))
    assert.ok(md.includes('mux_task_list'))
    assert.ok(md.includes('mux_task_get'))
    assert.ok(md.includes('Task Management'))
    assert.ok(md.includes('Stall Detection'))
  })
})
