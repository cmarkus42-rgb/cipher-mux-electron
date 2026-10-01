import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  TAG_DERIVED_NOTE_TYPES,
  isTypeCarryingTag,
  preserveTypeTags,
} from '../../src/main/notes/note-type-tags'
import { PROCESS_SET_AXES, filterToAxes } from '../../src/shared/tag-axes'

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

  // Zwischenstand war: ein Tag ohne Klasse ("alt") darf ersetzt werden. Der
  // Audit vom 2026-10-01 hat das umgedreht -- ersetzbar ist, was das Tagging
  // VORSCHLAGEN kann, und ein freies Schlagwort kann es nicht. Es weiter
  // ersetzen zu lassen hiesse, dass jeder Tagging-Lauf still Schlagworte
  // loescht, die ein Mensch vergeben hat.
  it('keeps workspace binding, the handoff marker and a free keyword', () => {
    const result = preserveTypeTags(
      ['workspace:ws-1', 'handoff', 'raspberry-pi'],
      ['phase:coding'],
    )
    assert.ok(result.includes('workspace:ws-1'))
    assert.ok(result.includes('handoff'))
    assert.ok(result.includes('raspberry-pi'), 'nicht vorschlagbar, also erhalten')
    assert.ok(result.includes('phase:coding'), 'der Vorschlag kommt dazu')
  })

  it('replaces an axis tag the tagging can propose', () => {
    const result = preserveTypeTags(['status:open'], ['status:done'])
    assert.ok(result.includes('status:done'))
    assert.ok(!result.includes('status:open'))
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

describe('preserveTypeTags — Prozess-Tatsachen', () => {
  // Dieselbe Falle wie beim Notentyp, nur eine Achse weiter: die Erhaltungsliste
  // zaehlte die Achsen einzeln auf, und `entity` kam erst am 2026-09-30 dazu.
  // Eine Liste, die man beim Hinzufuegen einer Achse pflegen muss, ist beim
  // naechsten Mal wieder unvollstaendig -- deshalb wird sie jetzt aus
  // PROCESS_SET_AXES abgeleitet.
  it('behaelt die Entity, die der Prozess gesetzt hat', () => {
    const result = preserveTypeTags(
      ['entity:refinement', 'kind:spec'],
      ['phase:architecture', 'status:open'],
    )
    assert.ok(result.includes('entity:refinement'), 'die Herkunft darf kein Modell ueberschreiben')
  })

  it('behaelt den Workspace weiterhin', () => {
    const result = preserveTypeTags(['workspace:ws-mux'], ['status:open'])
    assert.ok(result.includes('workspace:ws-mux'))
  })

  it('erhaelt jede Prozess-Achse, nicht nur die aufgezaehlten', () => {
    for (const axis of PROCESS_SET_AXES) {
      const tag = `${axis}:irgendwas`
      assert.ok(
        preserveTypeTags([tag], ['status:open']).includes(tag),
        `${axis} muss erhalten bleiben`,
      )
    }
  })
})

describe('preserveTypeTags — die Umkehrung', () => {
  // Befund des Audits vom 2026-10-01: die Erhaltungsliste war eine Aufzaehlung
  // (Typ + Prozess-Achsen + handoff), und `severity` und `component` standen
  // nicht drin. Das Auto-Tagging haette sie geloescht -- also genau die Werte,
  // die ein Mensch von Hand gewaehlt hat. Dritte Fassung derselben Falle: erst
  // fehlte `kind:spec`, dann `entity:`, dann diese zwei.
  //
  // Die Regel ist deshalb umgedreht: erhalten wird, was das Auto-Tagging
  // ueberhaupt nicht VORSCHLAGEN kann. Das ist nicht zu pflegen, weil es keine
  // Liste ist -- filterToAxes entscheidet es.
  it('behaelt eine von Hand gewaehlte Schwere und ein Bauteil', () => {
    const result = preserveTypeTags(
      ['kind:finding', 'severity:now', 'component:grid'],
      ['phase:debugging', 'status:open'],
    )
    assert.ok(result.includes('severity:now'), 'severity ist keine Achse und bleibt')
    assert.ok(result.includes('component:grid'), 'component ebenso')
  })

  it('behaelt ein freies Schlagwort', () => {
    const result = preserveTypeTags(['raspberry-pi'], ['status:open'])
    assert.ok(result.includes('raspberry-pi'))
  })

  // Der Gegenfall: was das Tagging vorschlagen KANN, darf es auch ersetzen.
  // Sonst waere die Note nach dem ersten Lauf fuer immer festgeschrieben.
  it('laesst Phase und Zustand ersetzen', () => {
    const result = preserveTypeTags(['phase:coding'], ['phase:testing', 'status:done'])
    assert.ok(result.includes('phase:testing'))
    assert.ok(result.includes('status:done'))
    assert.ok(!result.includes('phase:coding'), 'eine Phase ist vorschlagbar und damit ersetzbar')
  })

  it('erhaelt jeden Tag, den filterToAxes verwirft', () => {
    for (const tag of ['severity:hi', 'component:xterm', 'workspace:ws-1',
      'entity:debugger', 'handoff', 'eigenes-schlagwort']) {
      assert.equal(filterToAxes([tag]).length, 0, `${tag} ist nicht vorschlagbar`)
      assert.ok(preserveTypeTags([tag], ['status:open']).includes(tag),
        `${tag} muss erhalten bleiben`)
    }
  })
})
