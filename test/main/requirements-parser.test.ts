import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  parseRequirementItem,
  parseRequirementsBody,
  summarizeRequirements,
  serializeRequirementItem,
} from '../../src/main/notes/requirements-parser'

// ─── Anforderungen ──────────────────────────────────────────
//
// Requirements sind das interne Dokument, aus dem die offiziellen Specs
// hervorgehen. Sie duerfen nach RE-Methoden mit Schema erfasst werden, unter
// zwei Bedingungen: gut lesbar und gut kommentierbar.
//
// Daraus folgt das Format. Kein YAML-Block pro Anforderung — der waere
// strukturiert und unlesbar. Eine Zeile pro Anforderung, in derselben
// Bauweise wie Testcases und Befunde, damit wer eines kennt alle kennt:
//
//   - [ ] **R-1** (muss) Der Mux zeigt an, wenn ein Spiegel veraltet ist // Notiz
//   - [x] **R-2** (soll) Die Historie einer Spec ist im Mux sichtbar
//   - [~] **R-3** (kann) Umbenennungen werden verfolgt {verworfen}
//
// Die Prioritaet ist die MoSCoW-Achse in deutschen Worten, weil das Dokument
// deutsch ist. Der Zustand steckt in der Checkbox, wo ein Mensch ihn sieht und
// aendert — dieselbe Entscheidung wie bei den Befunden, und aus demselben
// Grund: wer eine Anforderung erhebt, soll sie nicht selbst als erfuellt
// abhaken.

describe('parseRequirementItem', () => {
  it('liest Id, Prioritaet, Text und Notiz', () => {
    const item = parseRequirementItem(
      '- [ ] **R-1** (muss) Der Mux zeigt an, wenn ein Spiegel veraltet ist // aus der Bestandsaufnahme',
      3,
    )
    assert.ok(item)
    assert.equal(item.id, 'R-1')
    assert.equal(item.priority, 'muss')
    assert.equal(item.status, 'offen')
    assert.equal(item.text, 'Der Mux zeigt an, wenn ein Spiegel veraltet ist')
    assert.equal(item.comment, 'aus der Bestandsaufnahme')
    assert.equal(item.lineIndex, 3)
  })

  it('kennt die drei Prioritaeten und weist Unbekanntes zurueck', () => {
    for (const p of ['muss', 'soll', 'kann']) {
      assert.equal(parseRequirementItem(`- [ ] **R-1** (${p}) X`, 0)?.priority, p)
    }
    const odd = parseRequirementItem('- [ ] **R-1** (vielleicht) X', 0)
    assert.equal(odd?.priority, null, 'eine unbekannte Prioritaet ist keine')
    assert.equal(odd?.text, '(vielleicht) X', 'und bleibt im Text stehen')
  })

  it('laesst die Prioritaet offen, wenn keine dasteht', () => {
    const item = parseRequirementItem('- [ ] **R-9** Ohne Prioritaet', 0)
    assert.equal(item?.priority, null)
    assert.equal(item?.text, 'Ohne Prioritaet')
  })

  it('liest die vier Zustaende aus der Checkbox', () => {
    assert.equal(parseRequirementItem('- [ ] **R-1** a', 0)?.status, 'offen')
    assert.equal(parseRequirementItem('- [x] **R-2** a', 0)?.status, 'erfuellt')
    assert.equal(parseRequirementItem('- [~] **R-3** a', 0)?.status, 'teilweise')
    assert.equal(parseRequirementItem('- [-] **R-4** a', 0)?.status, 'verworfen')
  })

  it('erkennt eine Begruendung', () => {
    const item = parseRequirementItem('- [ ] **R-5** (muss) Etwas {weil: ohne das geht es nicht}', 0)
    assert.equal(item?.rationale, 'ohne das geht es nicht')
    assert.equal(item?.text, 'Etwas', 'die Begruendung gehoert nicht in den Text')
  })

  it('erkennt eine Quelle', () => {
    const item = parseRequirementItem('- [ ] **R-6** (soll) Etwas [Gespraech 2026-09-30]', 0)
    assert.equal(item?.source, 'Gespraech 2026-09-30')
    assert.equal(item?.text, 'Etwas')
  })

  it('vertraegt Begruendung, Quelle und Notiz zusammen', () => {
    const line = '- [ ] **R-7** (muss) Etwas [Bestandsaufnahme] {weil: sonst driftet es} // offen'
    const item = parseRequirementItem(line, 0)
    assert.equal(item?.text, 'Etwas')
    assert.equal(item?.source, 'Bestandsaufnahme')
    assert.equal(item?.rationale, 'sonst driftet es')
    assert.equal(item?.comment, 'offen')
  })

  it('ignoriert Zeilen, die keine Anforderung sind', () => {
    assert.equal(parseRequirementItem('## Abschnitt', 0), null)
    assert.equal(parseRequirementItem('Fliesstext', 0), null)
    assert.equal(parseRequirementItem('- [ ] **', 0), null)
  })
})

describe('parseRequirementsBody', () => {
  it('gruppiert nach Abschnitten', () => {
    const body = [
      '# Anforderungen',
      '',
      '## Spiegelung',
      '- [ ] **R-1** (muss) Eins',
      '- [x] **R-2** (soll) Zwei',
      '',
      '## Rollen',
      '- [~] **R-3** (kann) Drei',
    ].join('\n')
    const sections = parseRequirementsBody(body)
    assert.deepEqual(sections.map(s => [s.title, s.items.length]), [['Spiegelung', 2], ['Rollen', 1]])
  })

  it('liefert nichts fuer ein Dokument ohne Anforderungen', () => {
    assert.deepEqual(parseRequirementsBody('# Titel\n\nNur Prosa.'), [])
  })
})

describe('summarizeRequirements', () => {
  const sections = parseRequirementsBody([
    '- [ ] **R-1** (muss) A',
    '- [ ] **R-2** (muss) B',
    '- [x] **R-3** (soll) C',
    '- [~] **R-4** (kann) D',
    '- [-] **R-5** (soll) E',
  ].join('\n'))

  it('zaehlt nach Zustand', () => {
    const s = summarizeRequirements(sections)
    assert.equal(s.total, 5)
    assert.equal(s.offen, 2)
    assert.equal(s.erfuellt, 1)
    assert.equal(s.teilweise, 1)
    assert.equal(s.verworfen, 1)
  })

  it('zaehlt offene Muss-Anforderungen gesondert', () => {
    // Das ist die Zahl, die ueber Fertigsein entscheidet: eine offene
    // Muss-Anforderung heisst nicht fertig, eine offene Kann-Anforderung nicht.
    const s = summarizeRequirements(sections)
    assert.equal(s.offeneMuss, 2)
  })

  it('zaehlt eine verworfene Muss-Anforderung nicht als offen', () => {
    const s = summarizeRequirements(parseRequirementsBody('- [-] **R-1** (muss) X'))
    assert.equal(s.offeneMuss, 0)
  })
})

describe('serializeRequirementItem', () => {
  for (const line of [
    '- [ ] **R-1** (muss) Etwas',
    '- [x] **R-2** (soll) Etwas // Notiz',
    '- [~] **R-3** (kann) Etwas [Quelle] {weil: Grund}',
    '- [-] **R-4** Etwas ohne Prioritaet',
    '- [ ] **R-5** (muss) Etwas [Quelle] {weil: Grund} // Notiz',
  ]) {
    it(`schreibt unveraendert zurueck: ${line.slice(0, 34)}…`, () => {
      const item = parseRequirementItem(line, 0)
      assert.ok(item, 'muss lesbar sein')
      assert.equal(serializeRequirementItem(item), line)
    })
  }
})
