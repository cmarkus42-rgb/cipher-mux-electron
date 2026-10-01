import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { TagClassRepo } from '../../src/main/notes/tag-repository'
import { AXIS_VALUES, PHASE_VALUES, KIND_VALUES, FLAT_MARKERS } from '../../src/shared/tag-axes'

describe('TagClassRepo', () => {
  let tmpDir: string
  let repo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-repo-test-'))
    repo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // ─── Initialization ────────────────────────────────────

  // `domain` und `project` waren hier Seed-Klassen. Der Umzug am 2026-09-30 hat
  // sie aufgeloest: `project` doppelte den Workspace, `domain` trug drei Werte.
  // Sie weiter einzusaeen haette sie beim naechsten Start neu angelegt.
  it('initializes with the axis classes and the registry start allocation', () => {
    const data = repo.getRepository()
    for (const cls of ['kind', 'status', 'phase', 'entity']) {
      assert.ok(data.classes[cls], `should have "${cls}" class`)
    }
    assert.ok(data.classes.severity, 'severity traegt eine Startbelegung')
    assert.ok(data.classes.component, 'component wird angelegt, bleibt aber leer')
    for (const cls of ['domain', 'project', 'scope']) {
      assert.ok(!data.classes[cls], `"${cls}" ist aufgeloest`)
    }
  })

  // Die Seeds sind die Achsen. `feature-request` stand hier, bis der Umzug am
  // 2026-09-30 es auf `kind:idea` abgebildet hat -- ein Wunsch ist noch keine
  // Anforderung. Es als Seed zu behalten hiesse, dass die Freitext-Vorschlaege
  // beim naechsten Start wieder einen Wert anbieten, der auf keiner Note steht.
  it('seed kind class carries the axis values', () => {
    const kindValues = repo.getRepository().classes.kind.values
    for (const v of KIND_VALUES) {
      assert.ok(kindValues.includes(v), `kind:${v} fehlt im Seed`)
    }
    assert.ok(!kindValues.includes('feature-request'), 'abgebildet auf kind:idea')
  })

  it('seed classes have colors', () => {
    const data = repo.getRepository()
    assert.ok(data.classes.kind.color, 'kind should have color')
    assert.ok(data.classes.status.color, 'status should have color')
  })

  // ─── parseTag ──────────────────────────────────────────

  it('parses class:value tags', () => {
    const result = TagClassRepo.parseTag('kind:bugreport')
    assert.equal(result.tagClass, 'kind')
    assert.equal(result.value, 'bugreport')
  })

  it('parses legacy tags without colon', () => {
    const result = TagClassRepo.parseTag('trading')
    assert.equal(result.tagClass, null)
    assert.equal(result.value, 'trading')
  })

  it('handles tags with multiple colons', () => {
    const result = TagClassRepo.parseTag('scope:workspace:abc')
    assert.equal(result.tagClass, 'scope')
    assert.equal(result.value, 'workspace:abc')
  })

  // ─── ensureTag ─────────────────────────────────────────

  it('auto-adds unknown class:value', () => {
    const changed = repo.ensureTag('priority:high')
    assert.equal(changed, true)
    const data = repo.getRepository()
    assert.ok(data.classes.priority, 'should create "priority" class')
    assert.ok(data.classes.priority.values.includes('high'))
  })

  it('adds new value to existing class', () => {
    const changed = repo.ensureTag('kind:epic')
    assert.equal(changed, true)
    const data = repo.getRepository()
    assert.ok(data.classes.kind.values.includes('epic'))
  })

  it('returns false for already-known tag', () => {
    const changed = repo.ensureTag('kind:bugreport')
    assert.equal(changed, false)
  })

  it('ignores legacy tags (no class)', () => {
    const changed = repo.ensureTag('trading')
    assert.equal(changed, false)
  })

  // ─── ensureTags (batch) ────────────────────────────────

  it('registers multiple tags at once', () => {
    const changed = repo.ensureTags(['kind:bugreport', 'priority:high', 'priority:low'])
    assert.equal(changed, true)
    const data = repo.getRepository()
    assert.ok(data.classes.priority.values.includes('high'))
    assert.ok(data.classes.priority.values.includes('low'))
  })

  it('returns false when all tags already known', () => {
    const changed = repo.ensureTags(['kind:bugreport', 'kind:testcase'])
    assert.equal(changed, false)
  })

  // ─── Persistence ───────────────────────────────────────

  it('persists to .tags.json', () => {
    repo.ensureTag('priority:critical')
    const tagsPath = path.join(tmpDir, '.tags.json')
    assert.ok(fs.existsSync(tagsPath))
    const raw = JSON.parse(fs.readFileSync(tagsPath, 'utf-8'))
    assert.ok(raw.classes.priority)
    assert.ok(raw.classes.priority.values.includes('critical'))
  })

  it('loads persisted data on re-instantiation', () => {
    repo.ensureTag('priority:critical')
    repo.setClassColor('priority', '#ff0000')

    const repo2 = new TagClassRepo(tmpDir)
    const data = repo2.getRepository()
    assert.ok(data.classes.priority.values.includes('critical'))
    assert.equal(data.classes.priority.color, '#ff0000')
  })

  it('merges persisted values with seeds', () => {
    repo.ensureTag('kind:epic')
    const repo2 = new TagClassRepo(tmpDir)
    const data = repo2.getRepository()
    // Should have both seed values and the new one
    assert.ok(data.classes.kind.values.includes('bugreport'), 'seed value preserved')
    assert.ok(data.classes.kind.values.includes('epic'), 'persisted value preserved')
  })

  // ─── setClassColor ─────────────────────────────────────

  it('sets color for existing class', () => {
    repo.setClassColor('kind', '#ff0000')
    const data = repo.getRepository()
    assert.equal(data.classes.kind.color, '#ff0000')
  })

  it('creates class when setting color for unknown class', () => {
    repo.setClassColor('newclass', '#00ff00')
    const data = repo.getRepository()
    assert.ok(data.classes.newclass)
    assert.equal(data.classes.newclass.color, '#00ff00')
    assert.deepEqual(data.classes.newclass.values, [])
  })

  // ─── Helpers ───────────────────────────────────────────

  it('getClassNames returns all class names', () => {
    const names = repo.getClassNames()
    assert.ok(names.includes('kind'))
    assert.ok(names.includes('status'))
    assert.ok(names.includes('phase'))
    assert.ok(names.includes('severity'))
  })

  it('getClassValues returns values for a class', () => {
    const values = repo.getClassValues('kind')
    assert.ok(values.includes('bugreport'))
    assert.ok(values.includes('spec'))
  })

  it('getClassValues returns empty array for unknown class', () => {
    const values = repo.getClassValues('nonexistent')
    assert.deepEqual(values, [])
  })
})

describe('TagClassRepo — Achsen als Quelle', () => {
  let tmpDir: string
  let repo: TagClassRepo

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-repo-axes-'))
    repo = new TagClassRepo(tmpDir)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  // Gemessen am 2026-09-30 gegen die echte .tags.json: `phase:coding`,
  // `phase:testing`, `kind:research` und `entity:audit` waren der Registry
  // unbekannt. `mux_notes_create` weist unbekannte Tags hart ab -- eine
  // Audit-Rolle haette ihre eigene Herkunft nicht mitgeben koennen.
  //
  // Die Achsen sind die Quelle; die Registry muss sie kennen, nicht umgekehrt.
  it('kennt jeden Wert jeder Achse', () => {
    for (const [axis, values] of Object.entries(AXIS_VALUES)) {
      for (const value of values ?? []) {
        assert.ok(repo.isKnownTag(`${axis}:${value}`), `${axis}:${value} wird abgewiesen`)
      }
    }
  })

  it('kennt jede Phase', () => {
    for (const phase of PHASE_VALUES) {
      assert.ok(repo.isKnownTag(`phase:${phase}`), `phase:${phase} wird abgewiesen`)
    }
  })

  // Bestandswerte sind nicht verhandelbar: was in .tags.json steht, stammt aus
  // echten Notes. Die Achsen ERGAENZEN, sie ersetzen nicht.
  it('behaelt Werte, die nur in der Datei stehen', () => {
    fs.writeFileSync(
      path.join(tmpDir, '.tags.json'),
      JSON.stringify({ classes: { kind: { values: ['abschlussbericht'], color: '#fff' } } }),
    )
    const reloaded = new TagClassRepo(tmpDir)
    assert.ok(reloaded.isKnownTag('kind:abschlussbericht'), 'Bestand darf nicht verschwinden')
    assert.ok(reloaded.isKnownTag('kind:spec'), 'die Achse kommt trotzdem dazu')
  })
})

describe('TagClassRepo — Startbelegung gegen Vorschrift', () => {
  let dir: string

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-repo-seed-'))
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // Der Unterschied zwischen SEED_CLASSES und REGISTRY_SEED_CLASSES ist der
  // ganze Punkt der Anforderung "die werte müssen editierbar sein": eine
  // Startbelegung wird nur gesetzt, wenn die Klasse noch gar nicht existiert.
  // Sonst waere "editierbar" nicht wahr -- wer severity:low entfernt, haette es
  // beim naechsten Start wieder, und ein Knopf, dessen Wirkung ein Neustart
  // aufhebt, ist eine Irrefuehrung.
  it('legt severity beim ersten Start mit vier Stufen an', () => {
    const repo = new TagClassRepo(dir)
    assert.deepEqual(repo.getClassValues('severity'), ['low', 'mid', 'hi', 'now'])
  })

  it('laesst component leer — welche Bauteile ein Projekt hat, weiss der Code nicht', () => {
    const repo = new TagClassRepo(dir)
    assert.deepEqual(repo.getClassValues('component'), [])
  })

  it('setzt einen entfernten severity-Wert NICHT wieder ein', () => {
    const first = new TagClassRepo(dir)
    assert.equal(first.removeValue('severity', 'low'), true)

    const second = new TagClassRepo(dir)
    assert.ok(!second.getClassValues('severity').includes('low'),
      'die Startbelegung darf beim zweiten Start nicht zurueckkommen')
    assert.ok(second.getClassValues('severity').includes('now'),
      'der Rest bleibt unangetastet')
  })

  // Die Achsen sind der Gegenfall: sie gehoeren dem Code und kommen zurueck.
  it('setzt einen entfernten Achsenwert wieder ein', () => {
    const first = new TagClassRepo(dir)
    assert.equal(first.removeValue('kind', 'spec'), true)

    const second = new TagClassRepo(dir)
    assert.ok(second.getClassValues('kind').includes('spec'),
      'kind gehoert dem Code — Ansichten haengen daran')
  })

  // Die aufgeloesten Klassen duerfen sich nicht neu anlegen.
  it('legt domain, project und scope nicht mehr an', () => {
    const repo = new TagClassRepo(dir)
    for (const cls of ['domain', 'project', 'scope']) {
      assert.deepEqual(repo.getClassValues(cls), [], `${cls} ist aufgeloest`)
    }
  })
})

describe('TagClassRepo — flache Funktionsmarker', () => {
  let dir: string
  let repo: TagClassRepo

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-repo-flat-'))
    repo = new TagClassRepo(dir)
  })

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  // Audit-Befund vom 2026-10-01: zwei Pfade widersprachen sich.
  // note-manager.ts schreibt `['handoff']` auf jede Handoff-Note und
  // mcp-tools.ts sucht genau danach -- aber isKnownTag wies den Tag ab. Nur
  // weil createHandoff die Pruefung umgeht, ist es nicht aufgefallen; ueber
  // mux_notes_create haette dieselbe Note einen Fehler ergeben.
  it('akzeptiert handoff', () => {
    assert.equal(repo.isKnownTag('handoff'), true)
  })

  it('akzeptiert kein beliebiges klassenloses Wort', () => {
    assert.equal(repo.isKnownTag('irgendwas'), false)
  })

  it('akzeptiert jeden Marker aus FLAT_MARKERS', () => {
    for (const marker of FLAT_MARKERS) {
      assert.equal(repo.isKnownTag(marker), true, marker)
    }
  })
})
