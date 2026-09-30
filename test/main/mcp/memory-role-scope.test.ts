import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { mayUseCompanionMemory } from '../../../src/main/mcp/entity-header'

// ─── Companion memory belongs to the Companion role ─────────
//
// Strategy paper 2.5: companion_memory_* is limited to Companion, because that
// is where role-bound personal memory belongs. Every other role accumulating
// memories is what made recall a barrel instead of an index.
//
// Removing the tool from an entity's permission list does not achieve this —
// a missing permission produces an approval prompt, not a withheld tool. The
// decision therefore lives where the role is known: at registration time, per
// connection.

describe('mayUseCompanionMemory', () => {
  it('allows the Companion role', () => {
    assert.equal(mayUseCompanionMemory('companion'), true)
  })

  it('withholds it from every other role', () => {
    for (const other of ['debugger', 'refinement', 'cyber-factory', 'audit', 'workshop']) {
      assert.equal(mayUseCompanionMemory(other), false, `${other} must not get memory tools`)
    }
  })

  // A connection without a role is the app's own tooling or a plain session,
  // not an entity. Withholding there would take the tools away from the user
  // rather than from a role, which is not what the rule is about.
  it('allows a connection that carries no role at all', () => {
    assert.equal(mayUseCompanionMemory(null), true)
    assert.equal(mayUseCompanionMemory(undefined), true)
  })
})
