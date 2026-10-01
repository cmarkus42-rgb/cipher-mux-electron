import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { SEED_TAGS, TAG_CLASSES } from '../../src/main/notes/note-tagging'
import { AXIS_VALUES } from '../../src/shared/tag-axes'
import { DISSOLVED_CLASSES } from '../../src/main/notes/tag-migration'

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
    assert.ok(SEED_TAGS['kind:testcase'], 'kind:testcase tag must exist')
  })

  // Vorher standen hier `domain`, `tech` und `project`. Der Umzug am 2026-10-01
  // hat diese Klassen aufgeloest -- sie weiter als Seed zu fuehren haette sie bei
  // jedem Speichern in .tags.json zurueckgeschrieben.
  it('has tags for every axis', () => {
    for (const cls of Object.keys(AXIS_VALUES)) {
      const hasTags = Object.keys(SEED_TAGS).some(t => t.startsWith(`${cls}:`))
      assert.ok(hasTags, `SEED_TAGS must have at least one tag with class "${cls}"`)
    }
  })

  it('has no tag of a dissolved class', () => {
    for (const cls of DISSOLVED_CLASSES) {
      const stale = Object.keys(SEED_TAGS).filter(t => t.startsWith(`${cls}:`))
      assert.deepEqual(stale, [], `${cls} ist aufgeloest und darf kein Seed sein`)
    }
  })

  // Die Liste war selbst eine Fehlerquelle: sie enthielt `category:*`, obwohl es
  // die Klasse nie gab, und die Testing-Vorlage wies ihre Rolle darauf hin --
  // deren Notes waeren an der Tag-Pruefung gescheitert.
  it('leitet jeden Wert aus einer Achse ab', () => {
    for (const tag of Object.keys(SEED_TAGS)) {
      if (!tag.includes(':')) continue
      const [cls, value] = [tag.slice(0, tag.indexOf(':')), tag.slice(tag.indexOf(':') + 1)]
      const allowed = AXIS_VALUES[cls as keyof typeof AXIS_VALUES]
      assert.ok(allowed?.includes(value), `${tag} steht in keiner Achse`)
    }
  })
})

describe('TAG_CLASSES (REQ-NOTES-013)', () => {
  it('documents all required tag classes', () => {
    const required = ['kind', 'phase', 'status', 'entity', 'workspace', 'severity', 'component']
    for (const cls of required) {
      assert.ok(TAG_CLASSES[cls], `TAG_CLASSES must document class "${cls}"`)
      assert.ok(TAG_CLASSES[cls].length > 0, `TAG_CLASSES["${cls}"] must have a description`)
    }
  })
})
