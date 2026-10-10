/**
 * Die Werkzeug-Referenz des Companion ist docs/mcp-tools.md — als Modul
 * eingebaut, weil docs/ nicht in der App liegt. Bis 2026-10-10 war sie eine
 * eigene Abschrift, und in der fehlten 33 von 68 Werkzeugen; sechs trugen
 * falsche Parameternamen, mit denen ein Aufruf fehlschlaegt.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import { REF_MCP_TOOLS } from '../../src/main/entity-content/companion-mcp-ref.generated'
import { registerTools } from '../../src/main/mcp/mcp-tools'
import type { ToolContext } from '../../src/main/mcp/mcp-tools'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

const DOC = fs.readFileSync(path.join(__dirname, '../../docs/mcp-tools.md'), 'utf-8')

/** Die Namen, die eine Verbindung mit dieser Rolle angeboten bekommt. */
function registeredFor(entityId: string | null): string[] {
  const names: string[] = []
  const fake = { registerTool: (name: string) => { names.push(name) } } as unknown as McpServer
  const ctx = {
    sessionManager: {}, messageBus: null, statusLineMonitor: null,
    kickoffOrchestrator: null, taskManager: null, inputRequestWatcher: null, entityId,
  } as unknown as ToolContext
  registerTools(fake, ctx)
  return names
}

describe('Companion: Werkzeug-Referenz', () => {
  it('ist docs/mcp-tools.md — sonst `npm run gen:companion-ref`', () => {
    assert.equal(REF_MCP_TOOLS, DOC)
  })

  it('nennt jedes Werkzeug, das der Server registriert', () => {
    const all = [...new Set([...registeredFor(null), ...registeredFor('local-factory')])]
    assert.ok(all.length >= 68, `nur ${all.length} registriert — Fake-Server greift nicht`)
    const missing = all.filter(n => !DOC.includes(`\`${n}\``))
    assert.deepEqual(missing, [], `fehlen in docs/mcp-tools.md: ${missing.join(', ')}`)
  })
})
