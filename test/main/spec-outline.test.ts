import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { buildSpecOutline } from '../../src/main/notes/spec-outline'

// ─── Outline of a spec ──────────────────────────────────────
//
// The requirement was two words: readable and easy to comment on. A spec note
// stays an editor — that is how corrections get written, and the round trip
// through a handoff depends on it. What long documents lack is not rendering
// but orientation: the bestandsaufnahme has seven sections and nobody can see
// them at once in a scrolling text field.
//
// So the outline is navigation, not a second representation. It derives from
// the headings, which means it cannot drift from the text the way a
// maintained table of contents would.

describe('buildSpecOutline', () => {
  const body = [
    '# Titel',
    '',
    'Absatz.',
    '',
    '## 1. Erster Abschnitt',
    'Text',
    '',
    '### 1.1 Unterpunkt',
    'Text',
    '',
    '## 2. Zweiter Abschnitt',
  ].join('\n')

  it('lists headings with their level and line', () => {
    const outline = buildSpecOutline(body)
    assert.deepEqual(outline.map(e => [e.level, e.title]), [
      [1, 'Titel'],
      [2, '1. Erster Abschnitt'],
      [3, '1.1 Unterpunkt'],
      [2, '2. Zweiter Abschnitt'],
    ])
  })

  it('reports the line each heading sits on, zero-based', () => {
    const outline = buildSpecOutline(body)
    assert.equal(outline[0].line, 0)
    assert.equal(outline[1].line, 4)
  })

  it('returns nothing for a text without headings', () => {
    assert.deepEqual(buildSpecOutline('nur prosa\nund noch eine zeile'), [])
  })

  // A '#' inside a fenced block is code, not a heading. Without this the
  // outline of any spec containing a shell snippet fills up with comments.
  it('ignores headings inside fenced code blocks', () => {
    const withCode = [
      '# Echt',
      '',
      '```bash',
      '# nur ein Kommentar',
      '## auch keiner',
      '```',
      '',
      '## Auch echt',
    ].join('\n')
    assert.deepEqual(buildSpecOutline(withCode).map(e => e.title), ['Echt', 'Auch echt'])
  })

  it('handles an unclosed fence without swallowing the rest', () => {
    const unclosed = ['# Eins', '```', '# drinnen'].join('\n')
    assert.deepEqual(buildSpecOutline(unclosed).map(e => e.title), ['Eins'])
  })

  it('ignores a hash that is not a heading', () => {
    assert.deepEqual(buildSpecOutline('#kein Leerzeichen\ntext #mitte').map(e => e.title), [])
  })

  it('trims trailing hashes of the closed-atx form', () => {
    assert.deepEqual(buildSpecOutline('## Titel ##').map(e => e.title), ['Titel'])
  })

  it('caps the depth at six, as markdown does', () => {
    const deep = buildSpecOutline('####### sieben')
    assert.deepEqual(deep, [], 'seven hashes is not a heading')
  })
})
