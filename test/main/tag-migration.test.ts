import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  KIND_MAP,
  migrateNotesDir,
  STATUS_MAP,
  SCOPE_TO_PHASE,
  migrateTags,
  type MigrationContext,
} from '../../src/main/notes/tag-migration'
import { KIND_VALUES, PHASE_VALUES, STATUS_VALUES, ENTITY_VALUES } from '../../src/shared/tag-axes'

// ─── Umzug der Bestands-Tags auf die Achsen ─────────────────
//
// Beauftragt am 2026-09-30 ("umziehen bitte gerne"), nachdem 958 Notes
// gemessen waren: 14 Tag-Klassen, `kind` mit 29 Werten, `workspace` als
// ANZEIGENAME in 13 Schreibweisen, 269 Tags ganz ohne Klasse.
//
// Zwei Befunde haben die Abbildung geprägt:
//
//  - Unter `scope` lagen echte Phasen: scope:testing (46x), scope:debugging
//    (21x), scope:audit (19x). Das ist Information, die kein anderes Tag
//    traegt -- sie wird gehoben, nicht weggeworfen.
//  - Unter `phase` lagen Wellennummern (phase:4, phase:1, phase:0, phase:2).
//    Die gehoeren in die Klasse, die Wellen bedeutet: `welle`.
//
// Grundsatz: nichts verschwindet stillschweigend. Was sich nicht auf eine
// Achse abbilden laesst, bleibt stehen und wird berichtet.

const CTX: MigrationContext = {
  workspaceNameToId: new Map([
    ['cipher grow kit', 'ws-1779806802206'],
    ['cipher-mux', 'ws-1777957373268'],
    ['keel', 'ws-1780606236960'],
  ]),
}

/** Bequemer Zugriff: nur die Tags, ohne den Bericht. */
function tagsAfter(tags: string[], ctx: MigrationContext = CTX): string[] {
  return migrateTags(tags, ctx).tags
}

describe('Workspace: Anzeigename wird zur ID', () => {
  // Die Ursache der Dubletten. "Cipher Grow KIT" (368x) und "cipher grow kit"
  // (27x) sind derselbe Workspace, und ein buchstabengenauer Filter sah sie
  // als zwei.
  it('bildet beide Schreibweisen auf dieselbe ID ab', () => {
    assert.deepEqual(tagsAfter(['workspace:Cipher Grow KIT']), ['workspace:ws-1779806802206'])
    assert.deepEqual(tagsAfter(['workspace:cipher grow kit']), ['workspace:ws-1779806802206'])
  })

  it('laesst eine ID unangetastet', () => {
    assert.deepEqual(tagsAfter(['workspace:ws-1779806802206']), ['workspace:ws-1779806802206'])
  })

  // Zwei Notes zeigen auf "NEW WORKSPACE" und "Testinng Workspace" -- die gibt
  // es in der Konfiguration nicht mehr. Der Tag bleibt: ihn zu loeschen wuerde
  // die Note in jeden Workspace heben, und das ist schlimmer als ein Tag, der
  // auf nichts zeigt.
  it('behaelt einen Workspace, den die Konfiguration nicht kennt, und berichtet ihn', () => {
    const result = migrateTags(['workspace:Testinng Workspace'], CTX)
    assert.deepEqual(result.tags, ['workspace:Testinng Workspace'])
    assert.ok(result.unmapped.some(u => u.includes('Testinng')))
  })
})

describe('Kind: 29 Werte auf die Achse', () => {
  it('bildet jeden Bestandswert auf einen Achsenwert ab', () => {
    for (const [legacy, target] of Object.entries(KIND_MAP)) {
      assert.ok(KIND_VALUES.includes(target), `${legacy} -> ${target} ist kein Achsenwert`)
    }
  })

  it('fasst die deutschen und englischen Doppelungen zusammen', () => {
    assert.deepEqual(tagsAfter(['kind:architektur']), tagsAfter(['kind:architecture']))
    assert.deepEqual(tagsAfter(['kind:handover']), ['kind:handoff'])
  })

  it('erkennt die haeufigen Bestandstypen wieder', () => {
    assert.deepEqual(tagsAfter(['kind:wellenplan']), ['kind:plan'])
    assert.deepEqual(tagsAfter(['kind:abschlussbericht']), ['kind:report'])
    assert.deepEqual(tagsAfter(['kind:findings-report']), ['kind:finding'])
    assert.deepEqual(tagsAfter(['kind:anforderungspaket']), ['kind:requirements'])
    assert.deepEqual(tagsAfter(['kind:walkthrough']), ['kind:guide'])
  })

  it('laesst einen Wert stehen, den die Abbildung nicht kennt, und berichtet ihn', () => {
    const result = migrateTags(['kind:voelligneu'], CTX)
    assert.deepEqual(result.tags, ['kind:voelligneu'])
    assert.ok(result.unmapped.some(u => u.includes('voelligneu')))
  })
})

describe('Status: Bestandswerte auf die Achse', () => {
  it('bildet jeden Bestandswert auf einen Achsenwert ab', () => {
    for (const [legacy, target] of Object.entries(STATUS_MAP)) {
      assert.ok(STATUS_VALUES.includes(target), `${legacy} -> ${target} ist kein Achsenwert`)
    }
  })

  it('fasst fixed und active zusammen', () => {
    assert.deepEqual(tagsAfter(['status:fixed']), ['status:done'])
    assert.deepEqual(tagsAfter(['status:active']), ['status:in-progress'])
    assert.deepEqual(tagsAfter(['status:archived']), ['status:superseded'])
  })
})

describe('Phase: gehoben und geraeumt', () => {
  it('hebt die Phasen, die unter scope lagen', () => {
    for (const [scope, phase] of Object.entries(SCOPE_TO_PHASE)) {
      assert.ok(PHASE_VALUES.includes(phase), `scope:${scope} -> ${phase} ist keine Phase`)
      assert.ok(tagsAfter([`scope:${scope}`]).includes(`phase:${phase}`), scope)
    }
  })

  it('macht aus einer Wellennummer unter phase eine Welle', () => {
    // phase:4 ist keine Phase, sondern Welle 4. Die Klasse `welle` bedeutet
    // genau das und ist mit 89 Vergaben bereits im Bestand.
    assert.ok(tagsAfter(['phase:4']).includes('welle:4'))
    assert.ok(!tagsAfter(['phase:4']).some(t => t.startsWith('phase:')))
  })

  it('behaelt eine echte Phase', () => {
    assert.deepEqual(tagsAfter(['phase:architecture']), ['phase:architecture'])
  })

  // Die Ableitung aus processTagsFor, rueckwirkend angewandt: 557 Notes tragen
  // eine Entity, und fast alle keine Phase.
  it('leitet die Phase aus der Entity ab, wenn keine da ist', () => {
    const result = tagsAfter(['entity:testing-assistant'])
    assert.ok(result.includes('phase:testing'))
  })

  it('ueberschreibt eine vorhandene Phase nicht mit der abgeleiteten', () => {
    const result = tagsAfter(['entity:testing-assistant', 'phase:architecture'])
    assert.ok(result.includes('phase:architecture'))
    assert.ok(!result.includes('phase:testing'), 'das Vorhandene gewinnt gegen die Ableitung')
  })
})

describe('Tags ohne Klasse', () => {
  // 269 Vergaben ohne Klasse, davon nennen die haeufigsten einen Achsenwert:
  // handoff (46x), done (39x), bugreport (9x), open (9x), cyber-factory (7x).
  it('hebt einen Achsenwert in seine Achse', () => {
    assert.deepEqual(tagsAfter(['handoff']), ['kind:handoff'])
    assert.deepEqual(tagsAfter(['done']), ['status:done'])
    assert.deepEqual(tagsAfter(['open']), ['status:open'])
  })

  it('hebt eine Rolle in die Entity-Achse', () => {
    const result = tagsAfter(['cyber-factory'])
    assert.ok(result.includes('entity:cyber-factory'))
  })

  it('behaelt ein Schlagwort, das keine Achse kennt', () => {
    assert.deepEqual(tagsAfter(['raspberry-pi']), ['raspberry-pi'])
  })
})

describe('project: doppelt zum Workspace', () => {
  // project:cipher-grow-kit (147x) sagt dasselbe wie der Workspace-Tag. Wo
  // beide stehen, fliegt die Doppelung; wo der Workspace fehlt, bleibt sie.
  it('entfaellt, wenn ein Workspace-Tag da ist', () => {
    const result = tagsAfter(['workspace:Cipher Grow KIT', 'project:cipher-grow-kit'])
    assert.ok(!result.some(t => t.startsWith('project:')))
  })

  it('bleibt, wenn kein Workspace-Tag da ist', () => {
    assert.ok(tagsAfter(['project:cipher-grow-kit']).includes('project:cipher-grow-kit'))
  })
})

describe('Ausschliessende Achsen', () => {
  it('laesst nach dem Zusammenfassen nur einen Wert uebrig', () => {
    // status:done und status:fixed bilden beide auf done ab -- einmal, nicht
    // zweimal.
    assert.deepEqual(tagsAfter(['status:done', 'status:fixed']), ['status:done'])
  })

  it('behaelt bei zwei verschiedenen Werten den ersten', () => {
    assert.deepEqual(tagsAfter(['kind:spec', 'kind:testcase']), ['kind:spec'])
  })
})

describe('Was nicht angetastet wird', () => {
  // severity, welle, component, domain, tech, req-status, verdict tragen
  // Information, die keine Achse haelt. Sie bleiben, damit der Umzug nichts
  // vernichtet, was sich nicht wiederherstellen laesst.
  it('laesst Klassen ausserhalb der Achsen stehen', () => {
    const keep = ['severity:high', 'welle:1', 'component:grid', 'domain:infra',
      'tech:typescript', 'req-status:final', 'verdict:release']
    const result = tagsAfter([...keep])
    for (const t of keep) assert.ok(result.includes(t), t)
  })

  it('aendert die Eingabe nicht', () => {
    const before = ['kind:wellenplan']
    migrateTags(before, CTX)
    assert.deepEqual(before, ['kind:wellenplan'])
  })

  it('vertraegt Unsinn ohne zu werfen', () => {
    for (const t of ['', ':', 'kind:', ':wert']) {
      assert.doesNotThrow(() => migrateTags([t], CTX), JSON.stringify(t))
    }
  })
})

describe('Die Achsen tragen die Bestandstypen', () => {
  // Der Umzug hat die Wertelisten erweitert, statt Bestand in einen falschen
  // Wert zu pressen: 63 Wellenplaene sind Plaene, 59 Abschlussberichte sind
  // Berichte, 31 Walkthroughs und Guides sind Anleitungen.
  it('kennt plan, report und guide', () => {
    for (const v of ['plan', 'report', 'guide']) {
      assert.ok(KIND_VALUES.includes(v), `kind:${v} fehlt`)
    }
  })

  it('bildet jede bekannte Rolle ab', () => {
    for (const id of ['cyber-factory', 'refinement', 'debugger', 'testing-assistant',
      'ideation-partner', 'companion', 'workshop']) {
      assert.ok(ENTITY_VALUES.includes(id), id)
    }
  })
})

describe('migrateNotesDir', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tag-migration-'))
    await fs.writeFile(
      path.join(dir, 'a.md'),
      '---\ntitle: A\ntags:\n  - \'kind:wellenplan\'\n  - \'workspace:Cipher Grow KIT\'\n---\n\n# A\n\nInhalt.\n',
    )
    await fs.writeFile(
      path.join(dir, 'b.md'),
      '---\ntitle: B\ntags:\n  - \'kind:spec\'\n  - \'phase:architecture\'\n---\n\n# B\n',
    )
    await fs.writeFile(path.join(dir, 'ohne-tags.md'), '---\ntitle: C\n---\n\n# C\n')
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  // Der Trockenlauf ist die Voreinstellung. Bei 958 echten Notes ist der
  // Bericht vor dem Schreiben kein Luxus.
  it('schreibt ohne apply nichts', async () => {
    const before = await fs.readFile(path.join(dir, 'a.md'), 'utf-8')
    const report = await migrateNotesDir({ notesDir: dir, ctx: CTX })

    assert.equal(report.changed, 1, 'a.md aendert sich, b.md nicht')
    assert.equal(report.written, 0, 'im Trockenlauf wird nicht geschrieben')
    assert.equal(await fs.readFile(path.join(dir, 'a.md'), 'utf-8'), before)
  })

  it('schreibt mit apply und laesst den Inhalt in Ruhe', async () => {
    const report = await migrateNotesDir({ notesDir: dir, ctx: CTX, apply: true })
    assert.equal(report.written, 1)

    const after = await fs.readFile(path.join(dir, 'a.md'), 'utf-8')
    assert.match(after, /kind:plan/)
    assert.match(after, /workspace:ws-1779806802206/)
    assert.match(after, /# A\n\nInhalt\./, 'der Rumpf bleibt unveraendert')
  })

  it('laesst eine Note ohne Tags unangetastet', async () => {
    const before = await fs.readFile(path.join(dir, 'ohne-tags.md'), 'utf-8')
    await migrateNotesDir({ notesDir: dir, ctx: CTX, apply: true })
    assert.equal(await fs.readFile(path.join(dir, 'ohne-tags.md'), 'utf-8'), before)
  })

  it('ist wiederholbar — ein zweiter Lauf aendert nichts mehr', async () => {
    await migrateNotesDir({ notesDir: dir, ctx: CTX, apply: true })
    const second = await migrateNotesDir({ notesDir: dir, ctx: CTX, apply: true })
    assert.equal(second.changed, 0, 'der Umzug ist ein Zustand, kein Vorgang')
  })

  it('meldet ein fehlendes Verzeichnis, statt zu werfen', async () => {
    const report = await migrateNotesDir({ notesDir: '/definitely/not/here', ctx: CTX })
    assert.equal(report.examined, 0)
    assert.ok(report.problems.length > 0)
  })

  it('zaehlt die Verteilung nach dem Umzug', async () => {
    const report = await migrateNotesDir({ notesDir: dir, ctx: CTX })
    assert.equal(report.after['kind']['plan'], 1)
    assert.equal(report.after['kind']['spec'], 1)
  })
})
