import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  OpenCodeAdapter,
  OPENCODE_PLUGIN_SUBDIR,
} from '../../../src/main/agent/adapters/opencode'
import { OPENCODE_BOUNDARY_PLUGIN_FILENAME, PROJECT_CONFIG_RELPATH } from '../../../src/main/session/entity-boundaries'

// L20e: Getestet wird das Plugin, das der Entity-Start tatsaechlich ablegt —
// nicht ein von Hand gebautes. Erzeugt ueber postLaunchInjection wie beim Start
// der Rolle `local-factory`, aus der Datei geladen, Hook `execute.before`
// aufgerufen. Die Form (V2-Definition `{ id, setup }`, `ctx.tool.hook`) ist die
// gemessene von opencode 2.0.29, siehe entity-boundaries.ts.

type Hook = (event: unknown) => Promise<void> | void

describe('L20e: das beim Entity-Start erzeugte opencode-Plugin der local-factory', () => {
  let tmp: string
  let run: string
  let repo: string
  let hook: Hook

  before(async () => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lf-l20e-')))
    run = path.join(tmp, 'run')
    repo = path.join(tmp, 'repo')
    fs.mkdirSync(run)
    fs.mkdirSync(path.join(repo, '.git'), { recursive: true })

    await new OpenCodeAdapter({ getSkipPermissions: () => false }).postLaunchInjection({
      projectPath: run,
      mcpUrl: 'http://127.0.0.1:3100/mcp',
      mcpApiKey: 'deadbeef',
      sessionId: '01KQ-l20e',
      workspaceId: 'ws-x',
      entityId: 'local-factory',
    })

    const pluginFile = path.join(run, OPENCODE_PLUGIN_SUBDIR, OPENCODE_BOUNDARY_PLUGIN_FILENAME)
    assert.ok(fs.existsSync(pluginFile), 'Entity-Start hat kein Grenzen-Plugin abgelegt')
    const mod = await import(`file://${pluginFile}`)
    await mod.default.setup({
      location: { directory: repo },
      tool: { hook: async (name: string, cb: Hook) => { if (name === 'execute.before') hook = cb } },
    })
    assert.equal(typeof hook, 'function', 'execute.before nicht registriert')
  })
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }) })

  const ev = (tool: string, input: Record<string, unknown>) => ({
    tool, sessionID: 'ses_x', agent: 'build', messageID: 'msg_1', id: 'call_1', input,
  })

  it('Schreibzugriff auf <repo>/src/x.ts wird abgelehnt — write, edit und patch', async () => {
    await assert.rejects(async () => hook(ev('write', { path: `${repo}/src/x.ts`, content: 'x' })))
    await assert.rejects(async () => hook(ev('edit', { path: `${repo}/src/x.ts`, oldString: 'a', newString: 'b' })))
    await assert.rejects(async () => hook(ev('patch', {
      patchText: `*** Begin Patch\n*** Update File: ${repo}/src/x.ts\n@@\n-a\n+b\n*** End Patch`,
    })))
  })

  it('<repo>/src/x.test.ts ist erlaubt', async () => {
    await hook(ev('write', { path: `${repo}/src/x.test.ts`, content: 'x' }))
    await hook(ev('edit', { path: `${repo}/src/x.test.ts`, oldString: 'a', newString: 'b' }))
  })

  it('<repo>/.cipher-mux/local-factory.json wird abgelehnt', async () => {
    await assert.rejects(async () => hook(ev('write', { path: `${repo}/${PROJECT_CONFIG_RELPATH}`, content: '{}' })))
  })

  it('shell mit "git -C . stash" wird abgelehnt, ebenso unter dem Namen bash', async () => {
    await assert.rejects(async () => hook(ev('shell', { command: 'git -C . stash', workdir: repo })))
    await assert.rejects(async () => hook(ev('bash', { command: 'git -C . stash' })))
  })

  it('shell mit einem erlaubten git-Befehl laeuft durch', async () => {
    await hook(ev('shell', { command: 'git -C . worktree add ../w -b b' }))
    await hook(ev('shell', { command: 'git log --oneline' }))
  })
})
