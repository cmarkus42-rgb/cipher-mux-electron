import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  PICK_ROWS,
  SEVERITY_VALUES,
  isExclusiveClass,
  toggleTag,
  rowFor,
  orderedValuesForRow,
} from '../../src/shared/tag-axes'

// ─── Was editierbar ist, muss auswaehlbar sein ──────────────
//
// Anforderung vom 2026-09-30, in zwei Schritten gestellt:
//
//   "severity und component finde ich legitim - aber die werte müssen
//    editierbar sein - gerade component ist dabei ja schon projektspezifisch"
//   "halt über das editieren auch fest als auswahl vorgeben - ich denke das
//    fehlt"
//
// Damit gibt es zwei Arten von Zeile im Auswahlfeld, und der Unterschied ist
// die HERKUNFT der Werte, nicht ihre Verbindlichkeit:
//
//   source: 'axis'      Werte stehen im Code. Der Mux kennt sie, Ansichten
//                       haengen daran, sie sind nicht verhandelbar.
//   source: 'registry'  Werte stehen in .tags.json und sind im TagManager
//                       editierbar. `component` ist projektspezifisch -- welche
//                       Bauteile ein Projekt hat, weiss der Code nicht.
//
// Beide werden gleich angeboten: als Knopf. Ein editierbarer Wert, der nirgends
// zur Auswahl steht, ist eine Einstellung ohne Wirkung.

describe('PICK_ROWS', () => {
  it('nennt die Achsen, die eine Entscheidung sind', () => {
    const axes = PICK_ROWS.filter(r => r.source === 'axis').map(r => r.klass)
    assert.deepEqual(axes, ['kind', 'phase', 'status'])
  })

  it('nennt die editierbaren Klassen', () => {
    const registry = PICK_ROWS.filter(r => r.source === 'registry').map(r => r.klass)
    assert.deepEqual(registry, ['severity', 'component'])
  })

  // workspace und entity sind Tatsachen aus dem Prozess. Ein Auswahlknopf dafuer
  // waere eine Einladung, eine Note unter eine fremde Herkunft zu haengen.
  it('bietet weder Workspace noch Entity zur Auswahl an', () => {
    for (const fact of ['workspace', 'entity']) {
      assert.ok(!PICK_ROWS.some(r => r.klass === fact), fact)
    }
  })

  it('traegt fuer jede Zeile eine Beschriftung', () => {
    for (const row of PICK_ROWS) {
      assert.ok(row.label.length > 0, row.klass)
    }
  })
})

describe('SEVERITY_VALUES', () => {
  // "zum start sollte gerade severity auf 4 (low mid hi now) begrenzt werden...
  //  now als höchste stufe"
  it('sind genau die vier, aufsteigend', () => {
    assert.deepEqual([...SEVERITY_VALUES], ['low', 'mid', 'hi', 'now'])
  })

  it('hat now an der hoechsten Stelle', () => {
    assert.equal(SEVERITY_VALUES[SEVERITY_VALUES.length - 1], 'now')
  })
})

describe('isExclusiveClass', () => {
  it('erlaubt nur eine Schwere', () => {
    // Zwei Schweregrade gleichzeitig sind keine Aussage, sondern deren
    // Abwesenheit -- genau wie bei Typ und Zustand.
    assert.equal(isExclusiveClass('severity'), true)
  })

  it('erlaubt mehrere Bauteile', () => {
    // Eine Note darf zwei Bauteile beruehren; das ist eher die Regel.
    assert.equal(isExclusiveClass('component'), false)
  })

  it('bleibt bei den Achsen, was es war', () => {
    assert.equal(isExclusiveClass('kind'), true)
    assert.equal(isExclusiveClass('status'), true)
    assert.equal(isExclusiveClass('entity'), true)
    assert.equal(isExclusiveClass('phase'), false)
  })

  it('sagt bei einer unbekannten Klasse nein', () => {
    assert.equal(isExclusiveClass('domain'), false)
  })
})

describe('toggleTag', () => {
  it('nimmt einen Wert einer editierbaren Klasse auf', () => {
    assert.deepEqual(toggleTag([], 'severity:hi'), ['severity:hi'])
  })

  it('tauscht bei der Schwere aus, statt zu sammeln', () => {
    assert.deepEqual(toggleTag(['severity:low'], 'severity:now'), ['severity:now'])
  })

  it('sammelt bei Bauteilen', () => {
    const result = toggleTag(['component:grid'], 'component:notes')
    assert.deepEqual(result.sort(), ['component:grid', 'component:notes'])
  })

  it('nimmt denselben Wert bei zweitem Druck wieder weg', () => {
    assert.deepEqual(toggleTag(['component:grid'], 'component:grid'), [])
  })

  // Der Unterschied zwischen Achse und Registry: die Achse hat eine
  // geschlossene Werteliste im Code und prueft dagegen. Bei der Registry
  // buergt der Aufrufer -- die Oberflaeche bietet nur an, was in .tags.json
  // steht, und eine zweite Liste im Code waere genau die Doppelung, die
  // irgendwann auseinanderlaeuft.
  it('weist einen erfundenen Wert einer Achse zurueck', () => {
    assert.deepEqual(toggleTag(['kind:spec'], 'kind:erfunden'), ['kind:spec'])
  })

  it('nimmt einen beliebigen Wert einer editierbaren Klasse an', () => {
    assert.ok(toggleTag([], 'component:was-auch-immer').includes('component:was-auch-immer'))
  })

  it('laesst fremde Tags in Ruhe', () => {
    const result = toggleTag(['workspace:ws-1', 'welle:3'], 'severity:hi')
    assert.ok(result.includes('workspace:ws-1'))
    assert.ok(result.includes('welle:3'))
  })

  it('aendert die Eingabe nicht', () => {
    const before = ['severity:low']
    toggleTag(before, 'severity:now')
    assert.deepEqual(before, ['severity:low'])
  })
})

describe('rowFor', () => {
  it('findet die Zeile einer Klasse', () => {
    assert.ok((rowFor('severity')?.label.length ?? 0) > 0)
    assert.equal(rowFor('severity')?.source, 'registry')
    assert.equal(rowFor('kind')?.source, 'axis')
  })

  it('gibt undefined fuer eine Klasse ohne Zeile', () => {
    assert.equal(rowFor('workspace'), undefined)
  })
})

describe('orderedValuesForRow', () => {
  // Bei einer Skala ist die Reihenfolge eine Aussage. Nach dem Umzug stand in
  // .tags.json `low hi now mid` -- die Reihenfolge kam aus der
  // Entstehungsgeschichte der Datei, und "now als höchste stufe" (2026-09-30)
  // war im Auswahlfeld nicht zu sehen.
  it('ordnet severity nach der Skala, nicht nach der Datei', () => {
    const fromFile = ['low', 'hi', 'now', 'mid']
    assert.deepEqual(orderedValuesForRow('severity', fromFile), ['low', 'mid', 'hi', 'now'])
  })

  // Editierbar heisst: ein eigener Wert verschwindet nicht, nur weil der Code
  // ihn nicht kennt. Er haengt hinten an.
  it('haengt einen eigenen Wert hinten an', () => {
    const result = orderedValuesForRow('severity', ['sofort', 'low', 'now'])
    assert.deepEqual(result, ['low', 'now', 'sofort'])
  })

  it('laesst eine Klasse ohne Skala in Dateireihenfolge', () => {
    // `component` hat keine kanonische Ordnung -- welche Bauteile zuerst kommen,
    // entscheidet das Projekt und nicht der Code.
    const values = ['grid', 'xterm', 'notes']
    assert.deepEqual(orderedValuesForRow('component', values), values)
  })

  it('vertraegt eine leere Liste', () => {
    assert.deepEqual(orderedValuesForRow('severity', []), [])
  })
})
