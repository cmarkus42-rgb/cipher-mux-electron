import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateMpoClaudeMd, MpoTemplateOpts } from '../../src/main/session/mpo-template'

describe('generateMpoClaudeMd', () => {
  const defaultOpts: MpoTemplateOpts = {
    mcpHost: '127.0.0.1',
    mcpPort: 3100,
    mcpApiKey: 'test-api-key-mpo',
    maxRetries: 2,
  }

  it('starts with MPO heading', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.startsWith('# MPO — Multi-Project Orchestrator'))
  })

  it('contains MCP URL with host and port', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('http://127.0.0.1:3100/mcp'))
  })

  it('contains Bearer token with API key', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Bearer test-api-key-mpo'))
  })

  it('contains all cipher-mux MCP tools', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    const tools = [
      'mux_sessions', 'mux_create_session', 'mux_kill_session',
      'mux_send', 'mux_read', 'mux_status', 'mux_context_usage',
      'mux_task_create', 'mux_task_update', 'mux_task_list', 'mux_task_get',
      'mux_input_request_create',
    ]
    for (const tool of tools) {
      assert.ok(md.includes(tool), `Missing tool: ${tool}`)
    }
  })

  it('contains persona section with Wayne Szalinski', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Wayne Szalinski'))
    assert.ok(md.includes('## Persona'))
  })

  it('contains 10-phase lifecycle', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('### Phase 1:'))
    assert.ok(md.includes('### Phase 10:'))
    assert.ok(md.includes('## Lifecycle'))
  })

  it('contains 5-level escalation hierarchy', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Eskalations-Hierarchie'))
    assert.ok(md.includes('| 1 |'))
    assert.ok(md.includes('| 5 |'))
  })

  it('contains decomposition rules', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Zerlegungsregeln'))
    assert.ok(md.includes('Feature-basiert'))
    assert.ok(md.includes('Granularitaets-Heuristik'))
  })

  it('contains monitoring rules with stuck signals', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Monitoring-Regeln'))
    assert.ok(md.includes('Sackgassen-Signale'))
    assert.ok(md.includes('Kein Output >20 Min'))
  })

  it('contains input request rules for bubble and pendelordner', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Input-Request-Regeln'))
    assert.ok(md.includes('Bubble'))
    assert.ok(md.includes('Pendelordner'))
  })

  it('contains retry limit from opts', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Maximal 2 Retry-Versuche'))
    assert.ok(md.includes(`Nach 2 Fehlschlaegen`))
  })

  it('uses custom retry limit', () => {
    const md = generateMpoClaudeMd({ ...defaultOpts, maxRetries: 3 })
    assert.ok(md.includes('Maximal 3 Retry-Versuche'))
  })

  it('uses custom port', () => {
    const md = generateMpoClaudeMd({ ...defaultOpts, mcpPort: 4200 })
    assert.ok(md.includes('http://127.0.0.1:4200/mcp'))
  })

  it('contains session prefix rule', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('cmux-mpo-'))
  })

  it('includes adapter fragment when provided', () => {
    const md = generateMpoClaudeMd({
      ...defaultOpts,
      adapterFragment: 'Start workers with: `claude --dangerously-skip-permissions`',
    })
    assert.ok(md.includes('claude --dangerously-skip-permissions'))
    assert.ok(md.includes('Agent-spezifische Hinweise'))
  })

  it('omits adapter section when no fragment provided', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(!md.includes('## Agent-spezifische Hinweise'))
  })

  it('contains 90% autonomy rule', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('90% Autonomie'))
  })

  it('contains no-push rule', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Niemals git push'))
  })
})
