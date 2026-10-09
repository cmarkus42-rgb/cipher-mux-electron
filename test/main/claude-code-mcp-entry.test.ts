import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { buildClaudeCodeMcpEntry } from '../../src/main/agent/adapters/claude-code'

// Der lokale MCP-Eintrag (settings.local.json, `claude mcp add-json -s local`)
// schlägt die .mcp.json des Run-Verzeichnisses. Fehlt ihm X-Mux-Entity, sieht
// der Server keine Rolle — gemessen am 2026-10-09: die Local Cyber Factory bekam
// mux_local_worker_dispatch nicht, obwohl .mcp.json den Kopf trug.
describe('buildClaudeCodeMcpEntry', () => {
  it('trägt die Rolle als X-Mux-Entity', () => {
    const e = buildClaudeCodeMcpEntry({ mcpUrl: 'http://h/mcp', mcpApiKey: 'k', workspaceId: null, entityId: 'local-factory' })
    assert.equal(e.headers['X-Mux-Entity'], 'local-factory')
  })
  it('trägt Workspace und Rolle zusammen', () => {
    const e = buildClaudeCodeMcpEntry({ mcpUrl: 'http://h/mcp', mcpApiKey: 'k', workspaceId: 'ws-1', entityId: 'debugger' })
    assert.equal(e.headers['X-Mux-Workspace'], 'ws-1')
    assert.equal(e.headers['X-Mux-Entity'], 'debugger')
  })
  it('ohne Rolle kein Rollenkopf', () => {
    const e = buildClaudeCodeMcpEntry({ mcpUrl: 'http://h/mcp', mcpApiKey: 'k', workspaceId: null, entityId: null })
    assert.equal(e.headers['X-Mux-Entity'], undefined)
  })
})
