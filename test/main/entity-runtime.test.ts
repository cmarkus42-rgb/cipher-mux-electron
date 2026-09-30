import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { resolveEntityRuntime } from '../../src/main/session/entity-runtime'
import type { EntityConfig } from '../../src/shared/types'

// ─── Role → model / adapter ─────────────────────────────────
//
// Roadmap item: a role should be able to say which model and which agent it
// runs on. The adapter side already existed — buildLaunchCommand turns
// `model` into `--model <id>` and the registry can look an adapter up by id —
// but nothing on the role side ever filled either in, so every role ran on
// whatever the CLI defaulted to.
//
// Three layers, same shape as prompt resolution elsewhere in the project
// (cell > workspace override > persona default):
//
//   user override (config) > role default (registry) > CLI default (nothing)
//
// No role carries a default model here. Which model a role deserves is a cost
// and quality judgement that belongs to the person paying for it, not to a
// guess baked into the registry. The mechanism is what was missing.

function entity(over: Partial<EntityConfig> = {}): EntityConfig {
  return {
    id: 'refinement' as EntityConfig['id'],
    displayName: 'Refinement',
    color: '#fff',
    projectPath: '/tmp/e',
    features: ['mcp'],
    ...over,
  }
}

describe('resolveEntityRuntime — model', () => {
  it('returns no model when nothing is configured', () => {
    const rt = resolveEntityRuntime(entity(), {})
    assert.equal(rt.model, undefined, 'absent means "let the CLI decide"')
  })

  it('takes the role default from the registry', () => {
    const rt = resolveEntityRuntime(entity({ model: 'haiku' }), {})
    assert.equal(rt.model, 'haiku')
  })

  it('lets the user override the role default', () => {
    const rt = resolveEntityRuntime(entity({ model: 'haiku' }), { entityModels: { refinement: 'opus' } })
    assert.equal(rt.model, 'opus')
  })

  it('an override for a different role does not leak', () => {
    const rt = resolveEntityRuntime(entity({ model: 'haiku' }), { entityModels: { debugger: 'opus' } })
    assert.equal(rt.model, 'haiku')
  })

  // An empty string in config is how a UI clears a field. It must mean "no
  // preference", not "run a model called empty string".
  it('treats an empty override as no preference', () => {
    const rt = resolveEntityRuntime(entity({ model: 'haiku' }), { entityModels: { refinement: '  ' } })
    assert.equal(rt.model, 'haiku')
  })

  it('trims a configured model', () => {
    const rt = resolveEntityRuntime(entity(), { entityModels: { refinement: ' sonnet ' } })
    assert.equal(rt.model, 'sonnet')
  })
})

describe('resolveEntityRuntime — adapter', () => {
  it('returns no adapter id when nothing is configured', () => {
    assert.equal(resolveEntityRuntime(entity(), {}).adapterId, undefined)
  })

  it('takes the role default and lets config win', () => {
    assert.equal(resolveEntityRuntime(entity({ adapterId: 'claude-code' }), {}).adapterId, 'claude-code')
    assert.equal(
      resolveEntityRuntime(entity({ adapterId: 'claude-code' }), { entityAdapters: { refinement: 'other' } }).adapterId,
      'other',
    )
  })
})

describe('resolveEntityRuntime — robustness', () => {
  it('survives a config object of the wrong shape', () => {
    // configStore is JSON on disk; a hand-edited file can hold anything.
    const bad = { entityModels: 'nope' } as unknown as Parameters<typeof resolveEntityRuntime>[1]
    assert.doesNotThrow(() => resolveEntityRuntime(entity({ model: 'haiku' }), bad))
    assert.equal(resolveEntityRuntime(entity({ model: 'haiku' }), bad).model, 'haiku')
  })

  it('ignores a non-string entry', () => {
    const bad = { entityModels: { refinement: 42 } } as unknown as Parameters<typeof resolveEntityRuntime>[1]
    assert.equal(resolveEntityRuntime(entity({ model: 'haiku' }), bad).model, 'haiku')
  })
})
