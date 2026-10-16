import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildCreateSessionOpts } from '../../../src/main/mcp/create-session-opts'

const base = { name: 'w1', projectPath: '/tmp/wt' }

describe('buildCreateSessionOpts — CLI', () => {
  it('startet ohne Angabe Claude Code über den Adapter, nicht über eine feste Zeile', () => {
    const opts = buildCreateSessionOpts(base, null)
    assert.equal(opts.adapterId, 'claude-code')
    assert.ok(opts.folderLaunch, 'folderLaunch fehlt — dann baut niemand die Startzeile')
    assert.equal(opts.autoLaunch, undefined)
  })

  it('reicht opencode samt freiem Modell an den Adapter-Pfad', () => {
    const opts = buildCreateSessionOpts(
      { ...base, adapter: 'opencode', model: 'anthropic/claude-opus-5-5' },
      null,
    )
    assert.equal(opts.adapterId, 'opencode')
    assert.equal(opts.model, 'anthropic/claude-opus-5-5')
    assert.ok(opts.folderLaunch)
  })

  it('trägt resume in den Ordner-Start', () => {
    const opts = buildCreateSessionOpts({ ...base, resume: true }, null)
    assert.equal(opts.folderLaunch?.resume, true)
  })

  it('shellOnly startet keine CLI', () => {
    const opts = buildCreateSessionOpts({ ...base, shellOnly: true }, null)
    assert.equal(opts.folderLaunch, undefined)
    assert.equal(opts.autoLaunch, undefined)
    assert.equal(opts.adapterId, undefined)
  })

  it('ein eigenes command ersetzt den Start, der genannte Adapter bleibt eingetragen', () => {
    const opts = buildCreateSessionOpts(
      { ...base, command: 'opencode --auto', adapter: 'opencode' },
      null,
    )
    assert.equal(opts.command, 'opencode --auto')
    assert.equal(opts.folderLaunch, undefined)
    assert.equal(opts.adapterId, 'opencode')
  })
})

describe('buildCreateSessionOpts — Workspace', () => {
  it('ohne Angabe: der Workspace der aufrufenden Session', () => {
    assert.equal(buildCreateSessionOpts(base, 'ws-a').workspaceId, 'ws-a')
  })

  it('ohne Angabe und ungebundener Aufrufer: ungebunden', () => {
    assert.equal(buildCreateSessionOpts(base, null).workspaceId, null)
  })

  it('ausdrücklich null bleibt ungebunden, auch aus einem Workspace heraus', () => {
    assert.equal(buildCreateSessionOpts({ ...base, workspaceId: null }, 'ws-a').workspaceId, null)
  })

  it('ein genannter Workspace schlägt den des Aufrufers', () => {
    assert.equal(buildCreateSessionOpts({ ...base, workspaceId: 'ws-b' }, 'ws-a').workspaceId, 'ws-b')
  })
})
