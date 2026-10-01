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
    const script = buildBoundaryHookScript(['/src/'], 'Testgrund')
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
    const script = buildBoundaryHookScript(['/src/'], reason)

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

describe('buildOpenCodeBoundaryPlugin', () => {
  // The generated module is loaded and called here, not grepped. opencode
  // rejects a CommonJS plugin with "Plugin export is not a function" and says
  // so only under --print-logs: a module that contains the right words and
  // fails to load is exactly the silent failure this file exists to avoid.
  let dir: string
  before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-boundary-')) })
  after(() => { fs.rmSync(dir, { recursive: true, force: true }) })

  let seq = 0
  async function hook(
    patterns: readonly string[],
    reason: string,
  ): Promise<(input: unknown, output: unknown) => Promise<void>> {
    const file = path.join(dir, `b${seq++}.js`)
    fs.writeFileSync(file, buildOpenCodeBoundaryPlugin(patterns, reason), 'utf-8')
    const mod = await import(`file://${file}`)
    assert.equal(typeof mod.default, 'function', 'default export is not a function')
    const hooks = await mod.default({})
    const fn = hooks['tool.execute.before']
    assert.equal(typeof fn, 'function', 'tool.execute.before not registered')
    return fn
  }

  const call = (tool: string, filePath?: string): [unknown, unknown] => [
    { tool, sessionID: 'ses_x', callID: 'c1' },
    { args: filePath === undefined ? {} : { filePath } },
  ]

  it('throws for a denied path, and the message is the reason', async () => {
    // The throw is what stops the call; opencode surfaces the message as the
    // tool's error, which is how the reason reaches the model.
    const fn = await hook(['/src/'], 'Testgrund')
    await assert.rejects(() => fn(...call('write', '/p/src/x.ts')), /Testgrund/)
  })

  it('lets an allowed path through — selective, not a blanket lock', async () => {
    const fn = await hook(['/src/'], 'Testgrund')
    await fn(...call('write', '/p/docs/x.md'))
    await fn(...call('edit', '/p/test/x.test.ts'))
  })

  it('covers every file-editing tool opencode has', async () => {
    // Read off GET /experimental/tool/ids of a running opencode 1.18.34.
    // A boundary that misses apply_patch is not a boundary.
    const fn = await hook(['/src/'], 'Testgrund')
    for (const tool of OPENCODE_EDIT_TOOLS) {
      await assert.rejects(() => fn(...call(tool, '/p/src/x.ts')), /Testgrund/, `${tool} passed`)
    }
  })

  it('does not block reading — read carries a filePath too', async () => {
    // Claude Code's boundary does not blind the role, and neither does this one.
    const fn = await hook(['/src/'], 'Testgrund')
    for (const tool of ['read', 'grep', 'glob', 'bash']) {
      await fn(...call(tool, '/p/src/x.ts'))
    }
  })

  it('allows a call without a usable path instead of blocking on nothing', async () => {
    const fn = await hook(['/src/'], 'Testgrund')
    await fn(...call('write'))
    await fn({ tool: 'write' }, {})
    await fn({ tool: 'write' }, { args: { filePath: 42 } })
  })

  it('embeds rule and reason as JSON literals, not as raw text', async () => {
    const reason = 'Er sagte "nein" und \\ blieb dabei'
    const src = buildOpenCodeBoundaryPlugin(['/src/'], reason)
    assert.ok(src.includes(JSON.stringify(reason)))
    assert.ok(!src.includes(`'${reason}'`) && !src.includes(`"${reason}"`))
    // And it still loads and still carries the reason verbatim.
    const fn = await hook(['/src/'], reason)
    await assert.rejects(() => fn(...call('write', '/p/src/x.ts')), (err: Error) => {
      assert.equal(err.message, reason)
      return true
    })
  })

  it('is ESM, never CommonJS', () => {
    const src = buildOpenCodeBoundaryPlugin(['/src/'], 'x')
    assert.ok(src.includes('export default'))
    assert.ok(!src.includes('module.exports'))
    assert.ok(!src.includes('require('))
  })

  it('carries the real reason of every role that has a boundary', async () => {
    for (const [id, boundary] of Object.entries(ENTITY_BOUNDARIES)) {
      const fn = await hook(boundary.denyPathPatterns, boundary.reason)
      await assert.rejects(
        () => fn(...call('write', `/p${boundary.denyPathPatterns[0]}x.ts`)),
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
