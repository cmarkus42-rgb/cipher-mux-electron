import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { SEED_TAGS, TAG_CLASSES } from '../../src/main/notes/note-tagging'

// ─── REQ-NOTES-013: Tag defaults follow klasse:wert schema ──

describe('SEED_TAGS (REQ-NOTES-013)', () => {
  it('all seed tags follow klasse:wert or are functional markers', () => {
    const functionalTags = new Set(['handoff', 'testcase'])

    for (const tag of Object.keys(SEED_TAGS)) {
      if (functionalTags.has(tag)) continue
      assert.ok(
        tag.includes(':'),
        `Seed tag "${tag}" must follow klasse:wert format (e.g., "domain:trading") or be a known functional marker`
      )
    }
  })

  it('all classified tags use a known class prefix', () => {
    const knownClasses = new Set(Object.keys(TAG_CLASSES))
    const functionalTags = new Set(['handoff', 'testcase'])

    for (const tag of Object.keys(SEED_TAGS)) {
      if (functionalTags.has(tag)) continue
      const [klasse] = tag.split(':')
      assert.ok(
        knownClasses.has(klasse),
        `Tag "${tag}" uses unknown class "${klasse}". Known: ${[...knownClasses].join(', ')}`
      )
    }
  })

  it('preserves entity-specific functional tags', () => {
    assert.ok(SEED_TAGS.handoff, 'handoff tag must exist')
    assert.ok(SEED_TAGS.testcase, 'testcase tag must exist')
  })

  it('has tags for all required classes', () => {
    const requiredClasses = ['kind', 'domain', 'tech', 'project', 'phase']
    for (const cls of requiredClasses) {
      const hasTags = Object.keys(SEED_TAGS).some(t => t.startsWith(`${cls}:`))
      assert.ok(hasTags, `SEED_TAGS must have at least one tag with class "${cls}"`)
    }
  })
})

describe('TAG_CLASSES (REQ-NOTES-013)', () => {
  it('documents all required tag classes', () => {
    const required = ['kind', 'domain', 'tech', 'project', 'phase', 'scope']
    for (const cls of required) {
      assert.ok(TAG_CLASSES[cls], `TAG_CLASSES must document class "${cls}"`)
      assert.ok(TAG_CLASSES[cls].length > 0, `TAG_CLASSES["${cls}"] must have a description`)
    }
  })
})
