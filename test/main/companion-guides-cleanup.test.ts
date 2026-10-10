/**
 * Der Companion bekommt seine Guides bei jedem Start neu. Was frueher
 * ausgeliefert und inzwischen gestrichen wurde, blieb bis 2026-10-10 liegen:
 * die Guides 01–03 vom Mai, die allein in 03 39-mal von „Orchestrator" und
 * „MPO" sprachen — Rollen, die es nicht mehr gibt. Der Companion las sie weiter.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { deployCompanionGuides, RETIRED_COMPANION_GUIDES } from '../../src/main/entity-content/companion-guides'

describe('deployCompanionGuides: gestrichene Guides verschwinden', () => {
  it('entfernt die zurueckgezogenen Dateien, laesst eigene liegen', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'companion-guides-'))
    fs.mkdirSync(path.join(dir, 'guides'))
    for (const f of RETIRED_COMPANION_GUIDES) fs.writeFileSync(path.join(dir, 'guides', f), 'alt')
    fs.writeFileSync(path.join(dir, 'guides', 'mein-eigener.md'), 'meins')
    deployCompanionGuides(dir)
    for (const f of RETIRED_COMPANION_GUIDES) assert.ok(!fs.existsSync(path.join(dir, 'guides', f)), f)
    assert.ok(fs.existsSync(path.join(dir, 'guides', 'mein-eigener.md')))
    assert.ok(fs.existsSync(path.join(dir, 'guides', 'clis.md')))
  })

  it('nennt genau die drei Mai-Guides', () => {
    assert.deepEqual([...RETIRED_COMPANION_GUIDES].sort(),
      ['01-first-steps.md', '02-daily-workflow.md', '03-power-moves.md'])
  })
})
