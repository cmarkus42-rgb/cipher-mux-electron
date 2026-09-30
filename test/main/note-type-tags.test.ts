import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  TAG_DERIVED_NOTE_TYPES,
  isTypeCarryingTag,
  preserveTypeTags,
} from '../../src/main/notes/note-type-tags'

// ─── Type-carrying tags survive auto-tagging ────────────────
//
// A typed note is recognised by its `kind:` tag — TestcaseView and FindingView
// both key on it. Auto-tagging replaces a note's tags wholesale, and the
// preserve-list named exactly one type: `kind:testcase`. So a finding note
// that got auto-tagged stopped being a finding, and a mirrored spec came back
// as `kind:journal` while its frontmatter still said `type: spec`.
//
// Observed on the bestandsaufnahme note, 2026-09-30: tags `kind:spec` and
// `bestandsaufnahme` were gone, replaced by five auto-tags including
// `kind:journal`.
//
// The fix is the same shape as the type derivation in NoteManager: one list,
// not one special case per type.

describe('isTypeCarryingTag', () => {
  it('recognises every tag that sets a note type', () => {
    for (const type of TAG_DERIVED_NOTE_TYPES) {
      assert.equal(isTypeCarryingTag(`kind:${type}`), true, `kind:${type}`)
    }
  })

  it('does not claim an unknown kind tag', () => {
    assert.equal(isTypeCarryingTag('kind:journal'), false)
    assert.equal(isTypeCarryingTag('kind:irgendwas'), false)
  })

  it('ignores tags that are not kind tags', () => {
    assert.equal(isTypeCarryingTag('project:cipher-mux'), false)
    assert.equal(isTypeCarryingTag('handoff'), false)
    assert.equal(isTypeCarryingTag(''), false)
  })
})

describe('preserveTypeTags', () => {
  it('keeps a type tag that auto-tagging would have dropped', () => {
    const result = preserveTypeTags(
      ['kind:finding', 'audit'],
      ['project:cipher-mux', 'kind:journal'],
    )
    assert.ok(result.includes('kind:finding'), 'the type must survive')
  })

  it('drops an auto kind tag that contradicts the existing type', () => {
    const result = preserveTypeTags(['kind:spec'], ['kind:journal', 'domain:ai-ml'])
    assert.ok(!result.includes('kind:journal'), 'two kind tags would make the type ambiguous')
    assert.ok(result.includes('domain:ai-ml'), 'everything else is kept')
  })

  it('leaves auto kind tags alone when the note carries no type', () => {
    const result = preserveTypeTags(['notiz'], ['kind:journal'])
    assert.ok(result.includes('kind:journal'))
  })

  it('keeps workspace binding and the handoff marker', () => {
    const result = preserveTypeTags(
      ['workspace:ws-1', 'handoff', 'alt'],
      ['project:x'],
    )
    assert.ok(result.includes('workspace:ws-1'))
    assert.ok(result.includes('handoff'))
    assert.ok(!result.includes('alt'), 'an ordinary tag may be replaced')
  })

  it('does not duplicate a tag that is in both lists', () => {
    const result = preserveTypeTags(['kind:finding'], ['kind:finding', 'x'])
    assert.equal(result.filter(t => t === 'kind:finding').length, 1)
  })

  it('puts preserved tags first so a tag limit cannot cut them off', () => {
    const result = preserveTypeTags(['kind:finding', 'workspace:ws-1'], ['a', 'b', 'c', 'd', 'e'])
    assert.deepEqual(result.slice(0, 2), ['kind:finding', 'workspace:ws-1'])
  })
})
