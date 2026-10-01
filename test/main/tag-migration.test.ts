import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  KIND_MAP,
  migrateNotesDir,
  runTagMigrationOnce,
  STATUS_MAP,
  SCOPE_TO_PHASE,
  SEVERITY_MAP,
  DISSOLVED_CLASSES,
  migrateTags,
  type MigrationContext,
} from '../../src/main/notes/tag-migration'
import { KIND_VALUES, PHASE_VALUES, STATUS_VALUES, ENTITY_VALUES, SEVERITY_VALUES } from '../../src/shared/tag-axes'

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

  it('laesst eine Wellennummer unter phase fallen', () => {
    // phase:4 ist keine Phase, sondern Welle 4. Eine Zwischenstufe fuehrte sie
    // nach `welle:4`; seit `welle` aufgeloest ist ("rest kann abgeraeumt
    // werden", 2026-09-30), faellt sie. Die Nummer steht im Titel der Note.
    const result = tagsAfter(['phase:4', 'kind:plan'])
    assert.ok(!result.some(t => t.startsWith('phase:')))
    assert.ok(!result.some(t => t.startsWith('welle:')))
    assert.deepEqual(result, ['kind:plan'])
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

  it('entfaellt auch ohne Workspace-Tag', () => {
    // Zwischenstufe war: project bleibt, wo der Workspace fehlt. Mit der
    // Auflösung der Klasse gilt das nicht mehr -- ein project-Tag ohne
    // Workspace zeigt auf ein Projekt, dessen Workspace niemand kennt, und ist
    // als Filterebene damit wertlos.
    assert.deepEqual(tagsAfter(['project:cipher-grow-kit']), [])
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
  // Zwischenstand war: alle Klassen ausserhalb der Achsen bleiben. Die
  // Entscheidung vom 2026-09-30 hat das geteilt -- "severity und component
  // finde ich legitim ... rest kann abgeraeumt werden". Die Begruendung pro
  // Klasse steht in DISSOLVED_CLASSES.
  it('laesst severity und component stehen', () => {
    const result = tagsAfter(['severity:high', 'component:grid'])
    assert.ok(result.includes('severity:hi'), 'auf die Skala abgebildet')
    assert.ok(result.includes('component:grid'), 'projektspezifisch, bleibt')
  })

  it('laesst Schlagworte ohne Klasse stehen', () => {
    // Sie erzeugen keine Filterebene, und `raspberry-pi` steht nirgends sonst.
    const result = tagsAfter(['raspberry-pi', 'bluetooth', 'kind:spec'])
    assert.ok(result.includes('raspberry-pi'))
    assert.ok(result.includes('bluetooth'))
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

describe('Zweiter Schritt: Schwere abbilden, aufgeloeste Klassen raeumen', () => {
  // Anforderung vom 2026-09-30: "zum start sollte gerade severity auf 4 (low
  // mid hi now) begrenzt werden...now als höchste stufe...rest kann abgeräumt
  // werden". Der Bestand trug high(36) medium(26) low(15) critical(1).
  it('bildet die Bestands-Schweregrade auf die vier Stufen ab', () => {
    assert.deepEqual(tagsAfter(['severity:high']), ['severity:hi'])
    assert.deepEqual(tagsAfter(['severity:medium']), ['severity:mid'])
    assert.deepEqual(tagsAfter(['severity:critical']), ['severity:now'])
    assert.deepEqual(tagsAfter(['severity:low']), ['severity:low'])
  })

  it('bildet jeden Bestandswert auf eine Stufe der Skala ab', () => {
    for (const [legacy, target] of Object.entries(SEVERITY_MAP)) {
      assert.ok(SEVERITY_VALUES.includes(target), `${legacy} -> ${target} ist keine Stufe`)
    }
  })

  it('laesst nur eine Schwere uebrig', () => {
    // high und critical bilden auf verschiedene Stufen ab -- die erste gewinnt.
    assert.deepEqual(tagsAfter(['severity:high', 'severity:critical']), ['severity:hi'])
  })

  // Die aufgeloesten Klassen. scope-Phasen sind zu phase geworden, project
  // doppelte den Workspace, req-status doppelt den Zustand, den der
  // requirements-parser aus dem Rumpf liest.
  it('raeumt die aufgeloesten Klassen weg', () => {
    for (const klass of DISSOLVED_CLASSES) {
      const result = tagsAfter([`${klass}:irgendwas`, 'kind:spec'])
      assert.ok(!result.some(t => t.startsWith(`${klass}:`)), `${klass} steht noch da`)
      assert.ok(result.includes('kind:spec'), 'der Rest bleibt')
    }
  })

  it('hebt eine scope-Phase, bevor sie geraeumt wird', () => {
    // Die Reihenfolge entscheidet: erst heben, dann raeumen. Andernfalls waere
    // scope:testing weg, ohne dass phase:testing entstanden ist.
    assert.deepEqual(tagsAfter(['scope:testing']), ['phase:testing'])
  })

  it('laesst severity und component stehen — die sind legitim', () => {
    const result = tagsAfter(['severity:high', 'component:grid'])
    assert.ok(result.includes('severity:hi'))
    assert.ok(result.includes('component:grid'))
  })

  // Freie Schlagworte ohne Klasse bleiben: sie erzeugen keine Filterebene, und
  // `raspberry-pi` oder `bluetooth` steht nirgends sonst.
  it('laesst ein freies Schlagwort stehen', () => {
    assert.ok(tagsAfter(['raspberry-pi', 'kind:spec']).includes('raspberry-pi'))
  })
})

describe('runTagMigrationOnce', () => {
  let dir: string

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tag-migration-once-'))
    await fs.writeFile(
      path.join(dir, 'a.md'),
      '---\ntitle: A\ntags:\n  - \'kind:wellenplan\'\n---\n\n# A\n',
    )
  })

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true })
  })

  // Der Grund fuer diese Funktion: tag-migration.ts landete ueberhaupt nicht im
  // Build, weil nichts im Main-Prozess es importierte. Auf einer zweiten
  // Maschine waere die alte Tag-Suppe unberuehrt geblieben -- unbemerkt.
  it('zieht beim ersten Start um', async () => {
    const report = await runTagMigrationOnce({ notesDir: dir, workspaces: [] })
    assert.ok(report)
    assert.equal(report.written, 1)
    assert.match(await fs.readFile(path.join(dir, 'a.md'), 'utf-8'), /kind:plan/)
  })

  it('laeuft beim zweiten Start nicht erneut', async () => {
    await runTagMigrationOnce({ notesDir: dir, workspaces: [] })
    const second = await runTagMigrationOnce({ notesDir: dir, workspaces: [] })
    assert.equal(second, null, 'der Marker haelt den zweiten Lauf ab')
  })

  it('bildet den Workspace-Anzeigenamen auf die ID ab', async () => {
    await fs.writeFile(
      path.join(dir, 'b.md'),
      '---\ntitle: B\ntags:\n  - \'workspace:Cipher Grow KIT\'\n---\n\n# B\n',
    )
    await runTagMigrationOnce({
      notesDir: dir,
      workspaces: [{ id: 'ws-123', name: 'Cipher Grow KIT' }],
    })
    assert.match(await fs.readFile(path.join(dir, 'b.md'), 'utf-8'), /workspace:ws-123/)
  })

  // Ein fehlgeschlagener Umzug darf den Start nicht verhindern.
  it('wirft bei einem fehlenden Verzeichnis nicht', async () => {
    await assert.doesNotReject(
      runTagMigrationOnce({ notesDir: '/definitely/not/here', workspaces: [] }),
    )
  })
})
