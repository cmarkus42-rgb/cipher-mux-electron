import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  TAG_AXES,
  KIND_VALUES,
  PHASE_VALUES,
  STATUS_VALUES,
  isAxisTag,
  filterToAxes,
  PROCESS_SET_AXES,
  ENTITY_VALUES,
  ENTITY_PHASE_DEFAULT,
  processTagsFor,
} from '../../src/shared/tag-axes'
import { EntityRegistry, registerBuiltinEntities } from '../../src/main/session/entity-registry'

// ─── Vier Achsen, nicht vierzehn ────────────────────────────
//
// Festgelegt am 2026-09-30: wichtig sind Workspace, Phase, Status und Typ.
//
// Gemessen war der Ist-Zustand ein anderer: 958 Notes, 14 Klassen, 269 Tags
// ganz ohne Klasse. `kind` allein hatte 29 Werte, `workspace` dreizehn --
// darunter "Cipher Grow KIT" und "cipher grow kit" nebeneinander --, und unter
// `phase` standen Wellennummern.
//
// Der Grund ist der Weg: das Auto-Tagging fragt ein lokales Modell und
// uebernimmt, was zurueckkommt. Ein Modell, das Klassen erfinden darf, erfindet
// welche. Die Achsen sind die Antwort darauf -- nicht als Empfehlung im Prompt,
// sondern als Filter auf dem Ergebnis.
//
// Wichtig: gefiltert wird, was das Tagging VORSCHLAEGT. Bestehende Tags an
// Notes bleiben unangetastet; es soll niemandem etwas weggenommen werden, was
// er selbst vergeben hat.

describe('TAG_AXES', () => {
  // Vier waren es am Anfang des Tages. Die fuenfte, `entity`, kam auf den
  // Einwand hin, dass Phase und Status ebenfalls den Prozess widerspiegeln --
  // "ideation refinement audit und testing tragen es ja quasi im namen".
  // Das macht die Rolle zur Tatsache statt zur Vermutung: der Mux kennt sie
  // aus der Verbindung.
  it('sind die fuenf genannten', () => {
    assert.deepEqual(
      [...TAG_AXES].sort(),
      ['entity', 'kind', 'phase', 'status', 'workspace'],
    )
  })

  it('haelt Entity und Workspace als Tatsachen auseinander von Phase und Status', () => {
    // Die Trennlinie der Oberflaeche: Tatsachen werden angezeigt, Entscheidungen
    // zur Auswahl gestellt.
    assert.deepEqual([...PROCESS_SET_AXES].sort(), ['entity', 'workspace'])
  })
})

describe('Entity-Achse', () => {
  // Deckungsgleich mit der Registry -- sonst faellt eine neue Rolle
  // stillschweigend aus der Achse und ihre Notes tragen keine Herkunft.
  it('kennt genau die Rollen der Entity-Registry', () => {
    const registry = new EntityRegistry()
    registerBuiltinEntities(registry)
    const registryIds = registry.list().map(e => e.id).sort()
    assert.deepEqual([...ENTITY_VALUES].sort(), registryIds)
  })

  it('schlaegt fuer die Rollen mit klarer Phase eine vor', () => {
    assert.equal(ENTITY_PHASE_DEFAULT['testing-assistant'], 'testing')
    assert.equal(ENTITY_PHASE_DEFAULT['refinement'], 'architecture')
    assert.equal(ENTITY_PHASE_DEFAULT['cyber-factory'], 'coding')
  })

  it('schweigt, wo die Phase nicht eindeutig ist', () => {
    // Eine falsche Phase ist schlechter als keine. Launcher und Companion
    // arbeiten quer zu den Phasen, Voice-Relay ueberhaupt nicht in einer.
    for (const id of ['launcher', 'companion', 'voice-relay']) {
      assert.equal(ENTITY_PHASE_DEFAULT[id], undefined, id)
    }
  })

  it('schlaegt nur Phasen vor, die es gibt', () => {
    for (const [id, phase] of Object.entries(ENTITY_PHASE_DEFAULT)) {
      assert.ok(PHASE_VALUES.includes(phase), `${id} -> ${phase} ist keine Phase`)
    }
  })
})

describe('processTagsFor', () => {
  // Was der Prozess weiss, muss niemand eingeben.
  it('setzt Workspace, Entity, abgeleitete Phase und Typ', () => {
    const tags = processTagsFor({
      workspaceId: 'ws-mux', entityId: 'refinement', noteType: 'spec',
    })
    assert.ok(tags.includes('workspace:ws-mux'))
    assert.ok(tags.includes('entity:refinement'))
    assert.ok(tags.includes('phase:architecture'), 'die Phase kommt aus der Rolle')
    assert.ok(tags.includes('kind:spec'))
  })

  it('laesst weg, was es nicht weiss', () => {
    assert.deepEqual(processTagsFor({}), [])
  })

  it('uebernimmt keine erfundene Rolle und keinen erfundenen Typ', () => {
    const tags = processTagsFor({ entityId: 'gibtsnicht', noteType: 'abschlussbericht' })
    assert.deepEqual(tags, [])
  })

  it('setzt fuer eine Rolle ohne klare Phase keine', () => {
    const tags = processTagsFor({ entityId: 'companion' })
    assert.ok(tags.includes('entity:companion'))
    assert.ok(!tags.some(t => t.startsWith('phase:')))
  })
})

describe('isAxisTag', () => {
  it('nimmt die geschlossenen Werte an', () => {
    assert.equal(isAxisTag('kind:spec'), true)
    assert.equal(isAxisTag('phase:architecture'), true)
    assert.equal(isAxisTag('status:open'), true)
  })

  it('weist erfundene Werte einer bekannten Achse zurueck', () => {
    assert.equal(isAxisTag('kind:abschlussbericht'), false)
    assert.equal(isAxisTag('phase:0'), false, 'Wellennummern sind keine Phase')
    assert.equal(isAxisTag('status:irgendwas'), false)
  })

  it('weist fremde Achsen zurueck', () => {
    for (const t of ['domain:ai-ml', 'component:grid', 'tech:swift', 'scope:audit']) {
      assert.equal(isAxisTag(t), false, t)
    }
  })

  // Der Workspace wird vom Mux gesetzt, nicht erraten. Seine Werte sind IDs
  // und koennen daher nicht gegen eine Liste geprueft werden -- aber ein Modell
  // darf ihn gar nicht erst vorschlagen.
  it('erkennt einen Workspace-Tag, laesst ihn aber nicht aus dem Tagging kommen', () => {
    assert.equal(isAxisTag('workspace:ws-1'), true)
    assert.ok(!filterToAxes(['workspace:erfunden']).includes('workspace:erfunden'))
  })

  it('vertraegt Unsinn ohne zu werfen', () => {
    for (const t of ['', ':', 'kind:', ':wert', 'ohneklasse']) {
      assert.equal(isAxisTag(t), false, JSON.stringify(t))
    }
  })
})

describe('filterToAxes', () => {
  it('behaelt nur, was auf eine Achse passt', () => {
    const result = filterToAxes([
      'kind:spec', 'domain:ai-ml', 'phase:architecture', 'component:grid', 'status:open',
    ])
    assert.deepEqual(result, ['kind:spec', 'phase:architecture', 'status:open'])
  })

  it('wirft alles weg, wenn nichts passt', () => {
    assert.deepEqual(filterToAxes(['tech:swift', 'projekt:x']), [])
  })

  it('normalisiert Gross- und Kleinschreibung', () => {
    assert.deepEqual(filterToAxes(['Kind:Spec', 'PHASE:Coding']), ['kind:spec', 'phase:coding'])
  })

  it('entfernt Doppelungen', () => {
    assert.deepEqual(filterToAxes(['kind:spec', 'kind:spec']), ['kind:spec'])
  })

  it('laesst pro ausschliessender Achse nur einen Wert zu', () => {
    // status und kind sind exklusiv: zwei Zustaende gleichzeitig sind keine
    // Aussage, sondern deren Abwesenheit.
    assert.deepEqual(filterToAxes(['status:open', 'status:done']), ['status:open'])
    assert.deepEqual(filterToAxes(['kind:spec', 'kind:journal']), ['kind:spec'])
  })

  it('laesst mehrere Phasen zu', () => {
    const result = filterToAxes(['phase:coding', 'phase:testing'])
    assert.equal(result.length, 2, 'eine Note darf zwei Phasen beruehren')
  })
})

describe('Wertelisten', () => {
  it('enthalten die Typen, die eine eigene Ansicht haben', () => {
    for (const t of ['testcase', 'finding', 'spec', 'requirements']) {
      assert.ok(KIND_VALUES.includes(t), `kind:${t} muss vergeben werden koennen`)
    }
  })

  it('enthalten die Phasen des Arbeitsablaufs', () => {
    assert.ok(PHASE_VALUES.includes('architecture'))
    assert.ok(PHASE_VALUES.includes('testing'))
  })

  it('enthalten einen Zustand fuer offen und fuer erledigt', () => {
    assert.ok(STATUS_VALUES.includes('open'))
    assert.ok(STATUS_VALUES.includes('done'))
  })
})
