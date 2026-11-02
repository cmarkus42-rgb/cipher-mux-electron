import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { buildClaudeCodeMcpEntry } from '../../src/main/agent/adapters/claude-code'
import { BRIDGE_HEADERS_ENV, BRIDGE_URL_ENV } from '../../src/main/mcp/stdio-bridge'

const scriptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-entry-'))
type Ctx = Parameters<typeof buildClaudeCodeMcpEntry>[0]
function headersOf(ctx: Ctx): Record<string, string> {
  const e = buildClaudeCodeMcpEntry(ctx, scriptDir)
  assert.equal(e.type, 'stdio')
  return JSON.parse((e as { env: Record<string, string> }).env[BRIDGE_HEADERS_ENV])
}

// Der lokale MCP-Eintrag (settings.local.json, `claude mcp add-json -s local`)
// schlägt die .mcp.json des Run-Verzeichnisses. Fehlt ihm X-Mux-Entity, sieht
// der Server keine Rolle — gemessen am 2026-10-09: die Local Cyber Factory bekam
// mux_local_worker_dispatch nicht, obwohl .mcp.json den Kopf trug.
describe('buildClaudeCodeMcpEntry', () => {
  it('trägt die Rolle als X-Mux-Entity', () => {
    const h = headersOf({ mcpUrl: 'http://h/mcp', mcpApiKey: 'k', workspaceId: null, entityId: 'local-factory' })
    assert.equal(h['X-Mux-Entity'], 'local-factory')
  })
  it('trägt Workspace und Rolle zusammen', () => {
    const h = headersOf({ mcpUrl: 'http://h/mcp', mcpApiKey: 'k', workspaceId: 'ws-1', entityId: 'debugger' })
    assert.equal(h['X-Mux-Workspace'], 'ws-1')
    assert.equal(h['X-Mux-Entity'], 'debugger')
  })
  it('startet die Brücke mit dem echten Skript und der URL', () => {
    const e = buildClaudeCodeMcpEntry({ mcpUrl: 'http://h/mcp', mcpApiKey: 'k', workspaceId: null, entityId: null }, scriptDir) as { args: string[]; env: Record<string, string> }
    assert.ok(fs.existsSync(e.args[0]))
    assert.equal(e.env[BRIDGE_URL_ENV], 'http://h/mcp')
  })
  it('ohne Rolle kein Rollenkopf', () => {
    const h = headersOf({ mcpUrl: 'http://h/mcp', mcpApiKey: 'k', workspaceId: null, entityId: null })
    assert.equal(h['X-Mux-Entity'], undefined)
  })
})
