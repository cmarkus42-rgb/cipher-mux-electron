import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  parseFindingItem,
  parseFindingBody,
  parseFinding,
  summarizeFindings,
  serializeFindingItem,
} from '../../src/main/notes/finding-parser'

// ─── Findings as a note type ────────────────────────────────
//
// Strategy paper 7.1 asked where review findings, parked minors and knowingly
// open gaps should live, and recorded that there was no good answer: as plain
// notes they flood the list, in a separate table they are invisible, which
// contradicts the goal of visible artefacts.
//
// The answer is the same mechanism testcases already use — a note type with
// its own view. Findings stay notes, so they are readable, taggable and can be
// handed on; the type keeps them out of the general list and gives them a
// surface that shows severity and status at a glance.
//
// Format, deliberately close to the testcase one so the mechanics are familiar:
//
//   - [ ] **F-1** (high) Beschreibung — `src/main/x.ts:42` // Notiz
//   - [ ] **F-2** (low) Kleinigkeit {parked}
//   - [x] **F-3** Behoben
//   - [-] **F-4** (medium) Bewusst offen gelassen

describe('parseFindingItem', () => {
  it('reads id, severity, description and file reference', () => {
    const item = parseFindingItem(
      '- [ ] **F-1** (high) Anker ungeprueft an git — `src/main/notes/handoff-delta.ts:42` // aus dem Audit',
      7,
    )
    assert.ok(item)
    assert.equal(item.id, 'F-1')
    assert.equal(item.severity, 'high')
    assert.equal(item.status, 'open')
    assert.equal(item.description, 'Anker ungeprueft an git')
    assert.equal(item.file, 'src/main/notes/handoff-delta.ts')
    assert.equal(item.line, 42)
    assert.equal(item.comment, 'aus dem Audit')
    assert.equal(item.lineIndex, 7)
  })

  it('accepts a file reference without a line number', () => {
    const item = parseFindingItem('- [ ] **F-2** (low) Etwas — `src/a.ts`', 0)
    assert.equal(item?.file, 'src/a.ts')
    assert.equal(item?.line, null)
  })

  it('leaves severity unspecified rather than inventing one', () => {
    const item = parseFindingItem('- [ ] **F-3** Ohne Schweregrad', 0)
    assert.equal(item?.severity, null)
    assert.equal(item?.description, 'Ohne Schweregrad')
  })

  it('reads the three checkbox states', () => {
    assert.equal(parseFindingItem('- [ ] **F-1** offen', 0)?.status, 'open')
    assert.equal(parseFindingItem('- [x] **F-2** behoben', 0)?.status, 'resolved')
    assert.equal(parseFindingItem('- [-] **F-3** nicht behoben', 0)?.status, 'wont_fix')
  })

  it('recognises a parked finding', () => {
    const item = parseFindingItem('- [ ] **F-4** (low) Kleinigkeit {parked}', 0)
    assert.equal(item?.status, 'parked')
    assert.equal(item?.description, 'Kleinigkeit', 'the marker must not end up in the text')
  })

  // Found by real content, not by this test file: the parked marker sits
  // before the comment, so checking for it at end-of-line only worked as long
  // as nobody wrote a comment. Order matters — comment off first, then marker.
  it('recognises a parked finding that also carries a comment', () => {
    const item = parseFindingItem('- [ ] **F-4** (low) Kleinigkeit {parked} // spaeter', 0)
    assert.equal(item?.status, 'parked')
    assert.equal(item?.description, 'Kleinigkeit')
    assert.equal(item?.comment, 'spaeter')
  })

  it('round-trips a parked finding with a comment', () => {
    const line = '- [ ] **F-4** (low) Kleinigkeit {parked} // spaeter'
    assert.equal(serializeFindingItem(parseFindingItem(line, 0)!), line)
  })

  it('only parks something that is still open', () => {
    // A resolved finding carrying a stale {parked} marker is resolved.
    assert.equal(parseFindingItem('- [x] **F-5** erledigt {parked}', 0)?.status, 'resolved')
  })

  it('accepts every severity level and rejects nonsense', () => {
    for (const s of ['critical', 'high', 'medium', 'low']) {
      assert.equal(parseFindingItem(`- [ ] **F-1** (${s}) X`, 0)?.severity, s)
    }
    const odd = parseFindingItem('- [ ] **F-1** (schlimm) X', 0)
    assert.equal(odd?.severity, null, 'an unknown level is no level')
    assert.equal(odd?.description, '(schlimm) X', 'and stays part of the text rather than vanishing')
  })

  it('ignores lines that are not findings', () => {
    assert.equal(parseFindingItem('## Abschnitt', 0), null)
    assert.equal(parseFindingItem('Freitext', 0), null)
    assert.equal(parseFindingItem('- [ ] **', 0), null)
  })
})

describe('parseFindingBody', () => {
  it('groups findings under their section headings', () => {
    const body = [
      '# Befunde',
      '',
      '## Audit 2026-09-30',
      '- [ ] **F-1** (high) Eins',
      '- [x] **F-2** (low) Zwei',
      '',
      '## Geparkt',
      '- [ ] **F-3** Drei {parked}',
    ].join('\n')

    const sections = parseFindingBody(body)
    assert.equal(sections.length, 2)
    assert.equal(sections[0].title, 'Audit 2026-09-30')
    assert.equal(sections[0].items.length, 2)
    assert.equal(sections[1].title, 'Geparkt')
    assert.equal(sections[1].items[0].status, 'parked')
  })

  it('keeps findings written before any heading', () => {
    const sections = parseFindingBody('- [ ] **F-1** Ohne Abschnitt')
    assert.equal(sections.length, 1)
    assert.equal(sections[0].items.length, 1)
  })

  it('returns nothing for a note without findings', () => {
    assert.deepEqual(parseFindingBody('# Titel\n\nNur Prosa.'), [])
  })
})

describe('parseFinding', () => {
  it('parses frontmatter and body together', () => {
    const raw = [
      '---',
      'title: Befunde aus dem Audit',
      'tags:',
      '  - kind:finding',
      'type: finding',
      '---',
      '',
      '# Befunde aus dem Audit',
      '',
      '- [ ] **F-1** (critical) Etwas Schlimmes',
    ].join('\n')

    const parsed = parseFinding(raw)
    assert.ok(parsed)
    assert.equal(parsed.frontmatter.title, 'Befunde aus dem Audit')
    assert.equal(parsed.sections[0].items[0].severity, 'critical')
  })

  it('returns null for something that is not a finding note', () => {
    assert.equal(parseFinding('---\ntitle: X\n---\n\nProsa.'), null)
  })
})

describe('summarizeFindings', () => {
  const sections = parseFindingBody([
    '- [ ] **F-1** (critical) A',
    '- [ ] **F-2** (high) B',
    '- [ ] **F-3** (low) C {parked}',
    '- [x] **F-4** (high) D',
    '- [-] **F-5** E',
  ].join('\n'))

  it('counts by status', () => {
    const s = summarizeFindings(sections)
    assert.equal(s.total, 5)
    assert.equal(s.open, 2)
    assert.equal(s.parked, 1)
    assert.equal(s.resolved, 1)
    assert.equal(s.wontFix, 1)
  })

  it('counts open findings by severity, ignoring closed ones', () => {
    const s = summarizeFindings(sections)
    // F-4 is high but resolved; it must not raise the open-high count.
    assert.equal(s.openBySeverity.critical, 1)
    assert.equal(s.openBySeverity.high, 1)
    assert.equal(s.openBySeverity.low, 0, 'a parked finding is not open')
  })

  it('handles an empty note', () => {
    const s = summarizeFindings([])
    assert.equal(s.total, 0)
    assert.equal(s.open, 0)
  })
})

describe('serializeFindingItem', () => {
  it('round-trips a full finding', () => {
    const line = '- [ ] **F-1** (high) Beschreibung — `src/a.ts:42` // Notiz'
    const item = parseFindingItem(line, 0)
    assert.ok(item)
    assert.equal(serializeFindingItem(item), line)
  })

  it('round-trips a parked finding', () => {
    const line = '- [ ] **F-2** (low) Kleinigkeit {parked}'
    const item = parseFindingItem(line, 0)
    assert.equal(serializeFindingItem(item!), line)
  })

  it('round-trips a bare finding', () => {
    const line = '- [x] **F-3** Behoben'
    const item = parseFindingItem(line, 0)
    assert.equal(serializeFindingItem(item!), line)
  })
})
