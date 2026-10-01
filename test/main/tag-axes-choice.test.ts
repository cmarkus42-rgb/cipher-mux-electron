import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { toggleTag, PROCESS_SET_AXES } from '../../src/shared/tag-axes'

// ─── Tags werden ausgewaehlt, nicht getippt ─────────────────
//
// Anforderung vom 2026-09-30: "tags muessen glaub ich schlicht hart zur
// auswahl angeboten werden bzw aus dem prozess kommen".
//
// Das ist die schaerfere Fassung der Achsen-Entscheidung. Keine der vier
// Achsen ist eine Einschaetzung:
//
//   - workspace und kind sind Tatsachen. Sie kommen aus dem Prozess: aus der
//     Verbindung, ueber die eine Note entsteht, und aus dem Typ, als der sie
//     angelegt wird. Niemand muss sie eingeben, und niemand soll sie raten.
//   - phase und status sind eine Entscheidung. Sie gehoeren dem Menschen, und
//     zwar als Auswahl aus einer geschlossenen Liste.
//
// Ein Freitextfeld kann beides nicht: es laedt zum Erfinden ein, und genau
// dabei sind 14 Klassen und 29 kind-Werte entstanden.

describe('toggleTag', () => {
  it('nimmt einen Wert auf, den es noch nicht gibt', () => {
    assert.deepEqual(toggleTag([], 'status:open'), ['status:open'])
  })

  it('nimmt denselben Wert bei zweitem Druck wieder weg', () => {
    assert.deepEqual(toggleTag(['status:open'], 'status:open'), [])
  })

  // Der eigentliche Punkt einer ausschliessenden Achse: die Auswahl wechselt,
  // sie sammelt nicht. Ohne das entstehen genau die Notes, die "open" UND
  // "done" tragen -- und das ist keine Aussage, sondern deren Abwesenheit.
  it('tauscht bei einer ausschliessenden Achse aus, statt zu sammeln', () => {
    assert.deepEqual(toggleTag(['status:open'], 'status:done'), ['status:done'])
    assert.deepEqual(toggleTag(['kind:spec'], 'kind:research'), ['kind:research'])
  })

  it('sammelt bei der Phase, weil eine Note zwei beruehren darf', () => {
    const result = toggleTag(['phase:coding'], 'phase:testing')
    assert.deepEqual(result.sort(), ['phase:coding', 'phase:testing'])
  })

  it('laesst Tags anderer Achsen unberuehrt', () => {
    const result = toggleTag(['workspace:ws-1', 'kind:spec'], 'status:open')
    assert.ok(result.includes('workspace:ws-1'))
    assert.ok(result.includes('kind:spec'))
  })

  // Bestehende Tags sind nicht verhandelbar: was jemand selbst vergeben hat
  // oder was aus alten Runs stammt, nimmt ihm die Auswahl nicht weg.
  it('laesst Tags ausserhalb der Achsen stehen', () => {
    const result = toggleTag(['domain:trading', 'welle:3'], 'status:open')
    assert.ok(result.includes('domain:trading'))
    assert.ok(result.includes('welle:3'))
  })

  // Geprueft wird, was der Code kennt: bei einer geschlossenen Achse muss der
  // Wert in ihrer Liste stehen. Registry-Klassen (severity, component) sind
  // ausdruecklich offen -- siehe tag-pick-rows.test.ts.
  it('weist einen Wert zurueck, den die Achse nicht kennt', () => {
    const before = ['status:open']
    assert.deepEqual(toggleTag(before, 'status:erfunden'), before)
    assert.deepEqual(toggleTag(before, 'phase:0'), before)
  })

  it('aendert die Eingabe nicht', () => {
    const before = ['status:open']
    toggleTag(before, 'status:done')
    assert.deepEqual(before, ['status:open'], 'toggleTag arbeitet nicht auf dem Original')
  })
})

describe('PROCESS_SET_AXES', () => {
  // Die Trennlinie der Oberflaeche: was der Prozess setzt, wird angezeigt und
  // nicht zur Auswahl gestellt. Ein Auswahlknopf fuer den Workspace waere eine
  // Einladung, eine Note in ein fremdes Projekt zu haengen.
  it('nennt den Workspace, weil er aus der Verbindung kommt', () => {
    assert.ok(PROCESS_SET_AXES.includes('workspace'))
  })

  it('nennt phase und status nicht -- die sind eine Entscheidung', () => {
    assert.ok(!PROCESS_SET_AXES.includes('phase'))
    assert.ok(!PROCESS_SET_AXES.includes('status'))
  })
})
