import { describe, it, before, after } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  ENTITY_BOUNDARIES,
  getEntityBoundary,
  isPathDenied,
  buildBoundaryHookScript,
  buildBoundaryHookSettings,
  buildOpenCodeBoundaryPlugin,
  OPENCODE_EDIT_TOOLS,
  PROTECTED_PATHS_FILENAME,
} from '../../src/main/session/entity-boundaries'

// ─── Role boundaries as a constraint ────────────────────────
//
// The project states its role boundaries in prompt text — "Du bist kein Coder
// — du koordinierst", "Kein Code fixen. Du findest Fehler, andere fixen sie."
// A prompt can be ignored, which is the whole point of the roadmap item.
//
// Measured before building this, because the obvious route does not work:
//
//  - `permissions.deny` in settings.local.json IS honoured normally, and only
//    `Edit(glob)` rules match file edits — the CLI rejects `Write(glob)` rules
//    outright ("Edit rules cover all file-editing tools").
//  - But entity sessions launch with --dangerously-skip-permissions, and that
//    flag bypasses deny rules entirely. Writing them would have produced a
//    boundary that looks enforced and is not.
//  - A PreToolUse hook DOES still fire under that flag and can refuse the
//    call. That is what this module generates.

describe('ENTITY_BOUNDARIES', () => {
  it('every boundary states why it exists', () => {
    for (const [entityId, boundary] of Object.entries(ENTITY_BOUNDARIES)) {
      assert.ok(
        boundary.reason && boundary.reason.length > 20,
        `${entityId} needs a reason a human can check, not just a rule`,
      )
      assert.ok(boundary.denyPathPatterns.length > 0, `${entityId} has no rule`)
    }
  })

  it('constrains the roles the project describes as non-building', () => {
    for (const id of ['workshop', 'testing-assistant', 'refinement']) {
      assert.ok(getEntityBoundary(id), `${id} should carry a boundary`)
    }
  })

  it('leaves the building roles alone', () => {
    // Cyber Factory is the role that writes code. Constraining it would be
    // constraining the point of it.
    assert.equal(getEntityBoundary('cyber-factory'), null)
    assert.equal(getEntityBoundary('launcher'), null)
  })

  it('returns null for an unknown role rather than inventing a rule', () => {
    assert.equal(getEntityBoundary('does-not-exist'), null)
    assert.equal(getEntityBoundary(null), null)
  })
})

describe('isPathDenied', () => {
  const patterns = ['/src/']

  it('denies a source file', () => {
    assert.equal(isPathDenied('/Users/x/projekt/src/main/thing.ts', patterns), true)
  })

  it('denies regardless of how deep the source file sits', () => {
    assert.equal(isPathDenied('/p/src/a/b/c/d.ts', patterns), true)
  })

  it('allows documentation', () => {
    assert.equal(isPathDenied('/Users/x/projekt/docs/spec.md', patterns), false)
  })

  it('allows tests — writing a test is not fixing the code', () => {
    assert.equal(isPathDenied('/Users/x/projekt/test/main/a.test.ts', patterns), false)
  })

  it('is not fooled by a path that merely mentions src', () => {
    assert.equal(isPathDenied('/Users/x/projekt/docs/src-layout.md', patterns), false)
    assert.equal(isPathDenied('/Users/x/mysrc/file.ts', patterns), false)
  })

  it('treats a missing path as allowed rather than guessing', () => {
    assert.equal(isPathDenied('', patterns), false)
    assert.equal(isPathDenied(undefined, patterns), false)
  })

  it('allows everything when there are no patterns', () => {
    assert.equal(isPathDenied('/p/src/x.ts', []), false)
  })
})

describe('buildBoundaryHookScript', () => {
  it('produces a runnable node script carrying the rules', () => {
    const script = buildBoundaryHookScript({ denyPathPatterns: ['/src/'], reason: 'Testgrund' })
    assert.ok(script.startsWith('#!/usr/bin/env node'), 'needs a shebang to be executable')
    assert.ok(script.includes('/src/'), 'the rule must be baked in, not looked up at runtime')
    assert.ok(script.includes('Testgrund'), 'the refusal must say why')
    assert.ok(script.includes('permissionDecision'), 'must speak the PreToolUse protocol')
  })

  // Rules and reason are embedded with JSON.stringify rather than pasted into
  // a template. A quote or backslash in the reason would otherwise end the
  // string literal and turn generated text into generated code.
  it('embeds rule and reason as JSON literals, not as raw text', () => {
    const reason = 'Er sagte "nein" und \\ blieb dabei'
    const script = buildBoundaryHookScript({ denyPathPatterns: ['/src/'], reason })

    assert.ok(
      script.includes(JSON.stringify(reason)),
      'the reason must appear exactly as its JSON encoding',
    )
    assert.ok(
      !script.includes(`'${reason}'`) && !script.includes(`"${reason}"`),
      'the raw, unescaped reason must not appear in the script',
    )
    assert.ok(script.includes(JSON.stringify(['/src/'])), 'patterns likewise')
  })
})

/**
 * Das opencode-2-Plugin wird mit einem Fake-`ctx` GELADEN und AUSGEFUEHRT, nicht
 * nach Woertern abgesucht. opencode 2.0.29 weist ein V1-Plugin ab ("Plugin must
 * export a default definition with an id and an effect or setup function") und
 * sagt es nur im WARN-Log: ein Modul mit den richtigen Woertern, das nicht laedt,
 * ist genau der stille Fehlschlag, den diese Datei verhindern soll.
 *
 * Ereignisform gemessen an opencode 2.0.29 (2026-10-14), `ctx.tool.hook`:
 * `{ tool, sessionID, agent, messageID, id, input }`. Pfadfeld ist `path`
 * (nicht `filePath`); `patch` traegt `{ patchText }`.
 */
type BoundaryHook = (event: unknown) => Promise<void> | void

interface LoadedBoundary {
  id: unknown
  hook: BoundaryHook
  registered: string[]
}

describe('buildOpenCodeBoundaryPlugin', () => {
  let dir: string
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-boundary-')) })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  let seq = 0
  async function load(
    patterns: readonly string[],
    reason: string,
    opts: { denyListFile?: string; cwd?: string } = {},
  ): Promise<LoadedBoundary> {
    const file = path.join(dir, `b${seq++}.js`)
    fs.writeFileSync(file, buildOpenCodeBoundaryPlugin({ denyPathPatterns: [...patterns], reason }, opts.denyListFile), 'utf-8')
    const mod = await import(`file://${file}`)
    assert.equal(typeof mod.default, 'object', 'default export is not a plugin definition')
    assert.equal(typeof mod.default.setup, 'function', 'definition has no setup()')

    const hooks: Record<string, BoundaryHook> = {}
    const registered: string[] = []
    const ctx = {
      location: { directory: opts.cwd ?? '/p', project: { id: 'x', directory: '/p', canonical: '/p' } },
      tool: {
        hook: async (name: string, cb: BoundaryHook) => {
          registered.push(name)
          hooks[name] = cb
          return { dispose: async () => {} }
        },
      },
    }
    await mod.default.setup(ctx)
    assert.equal(typeof hooks['execute.before'], 'function', 'execute.before not registered')
    return { id: mod.default.id, hook: hooks['execute.before'], registered }
  }

  async function hook(
    patterns: readonly string[],
    reason: string,
    opts: { denyListFile?: string; cwd?: string } = {},
  ): Promise<BoundaryHook> {
    return (await load(patterns, reason, opts)).hook
  }

  const call = (tool: string, input?: Record<string, unknown>): unknown => ({
    tool, sessionID: 'ses_x', agent: 'build', messageID: 'msg_1', id: 'call_1', input,
  })
  const patch = (...lines: string[]): unknown =>
    call('patch', { patchText: ['*** Begin Patch', ...lines, '*** End Patch'].join('\n') })

  it('is a V2 definition with a stable id, never a V1 function', async () => {
    const { id, registered } = await load(['/src/'], 'Testgrund')
    assert.equal(id, 'cipher-mux.role-boundary')
    assert.deepEqual(registered, ['execute.before'])
  })

  it('throws for a denied path, and the message is the reason', async () => {
    // The throw is what stops the call (measured: executed:false, file never
    // created); the message reaches the model verbatim.
    const fn = await hook(['/src/'], 'Testgrund')
    await assert.rejects(async () => fn(call('write', { path: '/p/src/x.ts', content: 'x' })), /Testgrund/)
  })

  it('lets an allowed path through — selective, not a blanket lock', async () => {
    const fn = await hook(['/src/'], 'Testgrund')
    await fn(call('write', { path: '/p/docs/x.md', content: 'x' }))
    await fn(call('edit', { path: '/p/test/x.test.ts', oldString: 'a', newString: 'b' }))
  })

  it('resolves a RELATIVE path against the plugin location', async () => {
    // Measured: the model passes `path: "t.txt"` to edit. A substring rule on
    // "/src/" does not match "src/x.ts" — without resolving, that is a hole.
    const fn = await hook(['/src/'], 'Testgrund', { cwd: '/p' })
    await assert.rejects(async () => fn(call('write', { path: 'src/x.ts', content: 'x' })), /Testgrund/)
    await assert.rejects(async () => fn(call('edit', { path: './src/x.ts', oldString: 'a', newString: 'b' })), /Testgrund/)
    await fn(call('write', { path: 'docs/x.md', content: 'x' }))
  })

  it('normalises ".." so a traversal cannot walk around the rule', async () => {
    const fn = await hook(['/src/'], 'Testgrund', { cwd: '/p' })
    await assert.rejects(async () => fn(call('write', { path: '/p/docs/../src/x.ts', content: 'x' })), /Testgrund/)
    await assert.rejects(async () => fn(call('write', { path: '../p/src/x.ts', content: 'x' })), /Testgrund/)
  })

  it('still accepts the V1 field name filePath as a fallback', async () => {
    const fn = await hook(['/src/'], 'Testgrund')
    await assert.rejects(async () => fn(call('write', { filePath: '/p/src/x.ts' })), /Testgrund/)
  })

  it('covers every file-editing tool opencode 2 has', async () => {
    // Tool ids from ctx.tool.list() on 2.0.29: write, edit, patch (V1: apply_patch).
    // A boundary that misses one of them is not a boundary.
    const fn = await hook(['/src/'], 'Testgrund')
    for (const tool of OPENCODE_EDIT_TOOLS) {
      const ev = tool === 'patch' || tool === 'apply_patch'
        ? call(tool, { patchText: '*** Begin Patch\n*** Add File: /p/src/x.ts\n+x\n*** End Patch' })
        : call(tool, { path: '/p/src/x.ts' })
      await assert.rejects(async () => fn(ev), /Testgrund/, `${tool} passed`)
    }
    assert.ok(OPENCODE_EDIT_TOOLS.includes('patch'), 'patch missing from the list')
  })

  describe('patch', () => {
    it('blocks when ANY file of a multi-file patch is denied', async () => {
      const fn = await hook(['/src/'], 'Testgrund')
      await assert.rejects(async () => fn(patch(
        '*** Add File: /p/docs/ok.md', '+x',
        '*** Update File: /p/src/x.ts', '@@', '-a', '+b',
      )), /Testgrund/)
    })

    it('lets a patch through when none of its files is denied', async () => {
      const fn = await hook(['/src/'], 'Testgrund')
      await fn(patch('*** Add File: /p/docs/a.md', '+x', '*** Update File: /p/test/b.ts', '@@', '-a', '+b'))
    })

    it('checks Delete File', async () => {
      const fn = await hook(['/src/'], 'Testgrund')
      await assert.rejects(async () => fn(patch('*** Delete File: /p/src/x.ts')), /Testgrund/)
    })

    it('checks the destination of Move to — moving INTO a denied path is a write', async () => {
      const fn = await hook(['/src/'], 'Testgrund')
      await assert.rejects(async () => fn(patch(
        '*** Update File: /p/docs/a.md', '*** Move to: /p/src/a.md', '@@', '-a', '+b',
      )), /Testgrund/)
    })

    it('checks the source of a move as well', async () => {
      const fn = await hook(['/src/'], 'Testgrund')
      await assert.rejects(async () => fn(patch(
        '*** Update File: /p/src/a.md', '*** Move to: /p/docs/a.md', '@@', '-a', '+b',
      )), /Testgrund/)
    })

    it('resolves relative paths inside a patch', async () => {
      const fn = await hook(['/src/'], 'Testgrund', { cwd: '/p' })
      await assert.rejects(async () => fn(patch('*** Update File: src/x.ts', '@@', '-a', '+b')), /Testgrund/)
    })

    it('a patch body line that merely LOOKS like a header is not a path', async () => {
      // Added lines start with "+", so "+*** Add File: /p/src/x" is content.
      const fn = await hook(['/src/'], 'Testgrund')
      await fn(patch('*** Add File: /p/docs/a.md', '+*** Add File: /p/src/x.ts'))
    })

    it('fails closed on a patch it cannot read any path from', async () => {
      const fn = await hook(['/src/'], 'Testgrund')
      await assert.rejects(async () => fn(call('patch', { patchText: 'kein Patch' })), /nicht lesbar/)
      await assert.rejects(async () => fn(call('patch', {})), /nicht lesbar/)
    })
  })

  it('does not block reading, searching or the shell', async () => {
    // Claude Code's boundary does not blind the role, and neither does this one.
    const fn = await hook(['/src/'], 'Testgrund')
    for (const tool of ['read', 'grep', 'glob', 'shell', 'webfetch']) {
      await fn(call(tool, { path: '/p/src/x.ts', command: 'cat /p/src/x.ts' }))
    }
  })

  it('FAILS CLOSED: an edit tool without a readable path is refused', async () => {
    // The V1 boundary let this through — and a field rename (filePath → path)
    // would have turned the whole boundary into a silent hole. A boundary-role
    // edit that names no readable path is a finding, not a free pass.
    const fn = await hook(['/src/'], 'Testgrund')
    await assert.rejects(async () => fn(call('write')), /nicht lesbar/)
    await assert.rejects(async () => fn(call('write', {})), /nicht lesbar/)
    await assert.rejects(async () => fn(call('edit', { path: 42 })), /nicht lesbar/)
    await assert.rejects(async () => fn(call('write', { path: '' })), /nicht lesbar/)
  })

  it('ignores events that are not tool calls at all', async () => {
    const fn = await hook(['/src/'], 'Testgrund')
    await fn(undefined)
    await fn({})
    await fn({ tool: 42 })
  })

  it('embeds rule and reason as JSON literals, not as raw text', async () => {
    const reason = 'Er sagte "nein" und \\ blieb dabei'
    const src = buildOpenCodeBoundaryPlugin({ denyPathPatterns: ['/src/'], reason })
    assert.ok(src.includes(JSON.stringify(reason)))
    assert.ok(!src.includes(`'${reason}'`) && !src.includes(`"${reason}"`))
    // And it still loads and still carries the reason verbatim.
    const fn = await hook(['/src/'], reason)
    await assert.rejects(async () => fn(call('write', { path: '/p/src/x.ts' })), (err: Error) => {
      assert.equal(err.message, reason)
      return true
    })
  })

  it('is ESM, never CommonJS, and has no import of the plugin package', () => {
    const src = buildOpenCodeBoundaryPlugin({ denyPathPatterns: ['/src/'], reason: 'x' })
    assert.ok(src.includes('export default'))
    assert.ok(!src.includes('module.exports'))
    assert.ok(!src.includes('require('))
    // Dependency-free on purpose: measured to load as a plain object on 2.0.29.
    assert.ok(!src.includes('@opencode/plugin') && !src.includes('@opencode-ai/plugin'))
  })

  it('carries the real reason of every role that has a boundary', async () => {
    for (const [id, boundary] of Object.entries(ENTITY_BOUNDARIES)) {
      const fn = await hook(boundary.denyPathPatterns, boundary.reason)
      await assert.rejects(
        async () => fn(call('write', { path: `/p${boundary.denyPathPatterns[0]}x.ts` })),
        (err: Error) => {
          assert.equal(err.message, boundary.reason, `${id} reports a different reason`)
          return true
        },
      )
    }
  })
})

describe('buildBoundaryHookSettings', () => {
  it('registers the hook for every file-editing tool', () => {
    const settings = buildBoundaryHookSettings('/run/dir/.claude/boundary.js')
    const matchers = settings.PreToolUse.map(h => h.matcher)
    assert.ok(matchers.some(m => m.includes('Edit')))
    assert.ok(matchers.some(m => m.includes('Write')))
    assert.ok(matchers.some(m => m.includes('NotebookEdit')))
  })

  it('points at the generated script', () => {
    const settings = buildBoundaryHookSettings('/run/dir/.claude/boundary.js')
    const cmd = settings.PreToolUse[0].hooks[0].command
    assert.ok(cmd.includes('/run/dir/.claude/boundary.js'))
  })
})

describe('Local Cyber Factory boundaries', () => {
  it('local-factory darf keinen Produktionscode schreiben', () => {
    const b = getEntityBoundary('local-factory')!
    assert.ok(isPathDenied('/p/src/app.ts', b.denyPathPatterns))
    assert.ok(isPathDenied('/p/lib/main.dart', b.denyPathPatterns))
    assert.ok(!isPathDenied('/p/test/app.test.ts', b.denyPathPatterns))
  })

  it('local-worker hat eine dynamische Sperrliste und sperrt AUFTRAG.md', () => {
    const b = getEntityBoundary('local-worker')!
    assert.equal(b.denyListFile, PROTECTED_PATHS_FILENAME)
    assert.ok(isPathDenied('/run/AUFTRAG.md', b.denyPathPatterns))
  })

  it('das opencode-Plugin liest die Sperrliste zur Aufrufzeit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-boundary-'))
    const listFile = path.join(dir, PROTECTED_PATHS_FILENAME)
    const pluginPath = path.join(dir, 'p.mjs')
    fs.writeFileSync(pluginPath, buildOpenCodeBoundaryPlugin({ denyPathPatterns: ['/AUFTRAG.md'], reason: 'R' }, listFile))
    const mod = await import(pluginPath)
    let before: (e: unknown) => unknown = () => {}
    await mod.default.setup({
      location: { directory: '/p' },
      tool: { hook: async (_n: string, cb: (e: unknown) => unknown) => { before = cb } },
    })
    const call = async (filePath: string) => before({ tool: 'edit', input: { path: filePath } })

    // ohne Datei: nur die statische Regel
    await call('/p/test/accept.test.ts')
    fs.writeFileSync(listFile, JSON.stringify(['/p/test/accept.test.ts']))
    await assert.rejects(call('/p/test/accept.test.ts'), /R/)
    await call('/p/src/ok.ts')
    // kaputte Datei blockiert nicht pauschal
    fs.writeFileSync(listFile, '{kaputt')
    await call('/p/test/accept.test.ts')
  })
})
