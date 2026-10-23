// test/main/local-factory/runner-paket3.test.ts
//
// Paket 3 (Auftrag und Gate): Verhalten des Läufers mit echtem git-Repo.
// Der Fake-Worker tut, was der Test ihm aufträgt; alles andere ist echt.
import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { LocalFactoryRunner, type WorkerHost, type RunnerRolle } from '../../../src/main/local-factory/runner'
import { loadLauf } from '../../../src/main/local-factory/lauf'
import { IDLE_SIGNAL_FILENAME } from '../../../src/main/local-factory/worker-done'

let repo: string
let laufDir: string
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf-8' }).trim()
const schreib = (rel: string, inhalt: string) => {
  fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true })
  fs.writeFileSync(path.join(repo, rel), inhalt)
}
const lies = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf-8')

const TEST_CMD = 'grep -q ok impl.txt'

type Arbeit = (repo: string) => void
const loest: Arbeit = () => schreib('impl.txt', 'ok\n')

function fakeHost(arbeit: Arbeit = loest, opts: { haengt?: boolean } = {}) {
  let runDir = ''
  const wakes: string[] = []
  const sent: string[] = []
  const host: WorkerHost & { wakes: string[]; sent: string[] } = {
    wakes, sent,
    async workerReady() { return null },
    async startFreshWorker() {
      runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-run-'))
      return { runDir, sessionId: 's1' }
    },
    async sendToWorker(_id, line) {
      sent.push(line)
      if (opts.haengt) return
      arbeit(repo)
      fs.writeFileSync(path.join(runDir, 'REPORT.md'), 'fertig')
      fs.writeFileSync(path.join(runDir, IDLE_SIGNAL_FILENAME), String(Date.now() + 1000))
    },
    async stopWorker() {},
    async paneTail() { return [] },
    lastActivityAt() { return opts.haengt ? 0 : Date.now() - 60_000 },
    tokensAt() { return { input: 10, output: 5 } },
    async wakeArchitect(line: string, _rolle?: RunnerRolle) { wakes.push(line) },
  }
  return host
}

const runner = (host: WorkerHost, rolle?: RunnerRolle) => new LocalFactoryRunner({
  host, laufDir, sleep: async () => {}, pollMs: 0, startupWaitMs: 0,
  quietMs: 1000, stallMs: 5000, timeoutMs: 2000, testTimeoutMs: 5000, ...(rolle ? { rolle } : {}),
})

const args = () => ({
  projekt: repo,
  ziel: 'impl sagt ok',
  dateien: ['impl.txt'],
  akzeptanzkriterium: 'impl.txt enthält ok',
  geschuetzteTests: ['test/accept.sh'],
  testBefehl: TEST_CMD,
  nichtZiele: [] as string[],
})

/** Projekt-Config als Teil der Basis committen. */
function config(c: unknown): void {
  schreib('.cipher-mux/local-factory.json', JSON.stringify(c))
  git('add', '.cipher-mux'); git('commit', '-qm', 'config')
}

async function lauf(r: LocalFactoryRunner, a: Record<string, unknown>) {
  const res = await r.dispatch(a as never) as { ok: boolean; error?: string; laufId?: string; laufPfad?: string; versuch?: number; hinweise?: string[] }
  await r.whenIdle()
  return res
}

const gateVon = (laufPfad: string, nummer = 1, v = -1) => {
  const versuch = loadLauf(laufPfad)!.haeppchen.find(h => h.nummer === nummer)!.versuche.at(v)!
  return JSON.parse(fs.readFileSync(versuch.gatePfad!, 'utf-8'))
}

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lf-p3-')))
  laufDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-p3-lauf-'))
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  schreib('impl.txt', 'nein\n')
  git('add', '.'); git('commit', '-qm', 'init')
  schreib('test/accept.sh', `${TEST_CMD}\n`)
})

describe('L11 Ersetzungen und Diff außerhalb des Auftrags', () => {
  it('alt bleibt stehen → ROT trotz grünem Test, Grund im Gate', async () => {
    const host = fakeHost(() => schreib('impl.txt', 'ok\nnein\n'))
    const res = await lauf(runner(host), { ...args(), ersetzungen: [{ datei: 'impl.txt', alt: 'nein', neu: 'ok' }] })
    assert.equal(res.ok, true)
    assert.match(host.wakes[0], /ROT/)
    assert.match(gateVon(res.laufPfad!).reasons.join(), /impl\.txt.*„nein“ kommt noch 1× vor/)
  })
  it('Ersetzung erfüllt → GRÜN', async () => {
    const host = fakeHost()
    await lauf(runner(host), { ...args(), ersetzungen: [{ datei: 'impl.txt', alt: 'nein', neu: 'ok' }] })
    assert.match(host.wakes[0], /GRÜN/)
  })
  it('geänderte Datei außerhalb des Auftrags → Warnung, Urteil bleibt GRÜN', async () => {
    const host = fakeHost(() => { schreib('impl.txt', 'ok\n'); schreib('andere.txt', 'x\n'); schreib('test/eigen.test.ts', 'x') })
    const res = await lauf(runner(host), args())
    assert.match(host.wakes[0], /GRÜN.*Warnung: Diff außerhalb des Auftrags: andere\.txt$/)
    assert.deepEqual(gateVon(res.laufPfad!).warnungen, ['Diff außerhalb des Auftrags: andere.txt'])
  })
})

describe('L12 architektenfehler beim erneuten Dispatch', () => {
  it('nach Eskalation: neuer Versuch läuft, zählt nicht, steht in lauf.json; zweiter wird abgelehnt', async () => {
    const host = fakeHost(() => {}, { haengt: true })
    // timeoutMs 2000 wäre zu lang zum Hängen — eigener Läufer mit kurzer Frist
    const kurz = new LocalFactoryRunner({
      host, laufDir, sleep: async () => {}, pollMs: 0, startupWaitMs: 0,
      quietMs: 1000, stallMs: 5000, timeoutMs: 50, testTimeoutMs: 5000,
    })
    const first = await lauf(kurz, args())
    await lauf(kurz, { ...args(), laufId: first.laufId, haeppchen: 1 })
    assert.match(host.wakes[1], /ESKALIERT/)

    const gut = fakeHost()
    const r2 = runner(gut)
    const res = await lauf(r2, { ...args(), laufId: first.laufId, haeppchen: 1, architektenfehler: 'Abnahmetest prüfte die falsche Datei' })
    assert.equal(res.ok, true, res.error)
    assert.equal(res.versuch, 3)
    assert.match(gut.wakes[0], /GRÜN, Versuch 2\/2 \(1 Architektenfehler nicht gezählt\)/)
    const h = loadLauf(first.laufPfad!)!.haeppchen[0]
    assert.equal(h.versuche[1].architektenfehler, 'Abnahmetest prüfte die falsche Datei')
    // AUFTRAG.md des neuen Versuchs: kein „vorige Versuch“ aus einem Architektenfehler
    const auftrag = fs.readFileSync(gut.sent[0].match(/\S+AUFTRAG\.md/)![0], 'utf-8')
    assert.doesNotMatch(auftrag, /vorige Versuch ist durchgefallen/)

    const zweiter = await r2.dispatch({ ...args(), laufId: first.laufId, haeppchen: 1, architektenfehler: 'nochmal' } as never)
    assert.equal(zweiter.ok, false)
  })
  it('leerer architektenfehler oder ohne haeppchen → Auftrag ungültig', async () => {
    const r = runner(fakeHost())
    const leer = await r.dispatch({ ...args(), laufId: 'X', haeppchen: 1, architektenfehler: ' ' } as never) as { ok: boolean; error?: string }
    assert.match(leer.error!, /architektenfehler/)
    const ohne = await r.dispatch({ ...args(), architektenfehler: 'grund' } as never) as { ok: boolean; error?: string }
    assert.match(ohne.error!, /architektenfehler.*haeppchen/)
  })
})

describe('L13 pflichtGates aus der Projekt-Config', () => {
  it('geänderte Datei passt auf muster, befehl scheitert → ROT mit Grund und Ausgabe-Auszug', async () => {
    config({ pflichtGates: [{ muster: '*.txt', befehl: 'echo PFLICHT-KAPUTT >&2; exit 3' }] })
    const host = fakeHost()
    const res = await lauf(runner(host), args())
    assert.match(host.wakes[0], /ROT/)
    const g = gateVon(res.laufPfad!)
    assert.match(g.reasons.join('\n'), /Pflicht-Gate „echo PFLICHT-KAPUTT >&2; exit 3“ rot \(Exit 3\), ausgelöst von impl\.txt/)
    assert.match(g.reasons.join('\n'), /PFLICHT-KAPUTT/)
    assert.match(g.testOutput, /PFLICHT-KAPUTT/)
  })
  it('läuft im Projekt nach dem Testbefehl; grün → GRÜN', async () => {
    config({ pflichtGates: [{ muster: '**/*.txt', befehl: 'grep -q ok impl.txt' }] })
    const host = fakeHost()
    await lauf(runner(host), args())
    assert.match(host.wakes[0], /GRÜN/)
  })
  it('keine geänderte Datei passt → befehl läuft nicht', async () => {
    config({ pflichtGates: [{ muster: 'src/**', befehl: 'exit 1' }] })
    const host = fakeHost()
    await lauf(runner(host), args())
    assert.match(host.wakes[0], /GRÜN/)
  })
  it('Parser-Hinweise der Config gehen als hinweise in die Antwort und als Warnung ins Gate', async () => {
    config({ unbekannt: 1 })
    const host = fakeHost()
    const res = await lauf(runner(host), args())
    assert.match(res.hinweise!.join(), /Unbekannter Schluessel "unbekannt"/)
    assert.match(gateVon(res.laufPfad!).warnungen.join(), /Projekt-Config: Unbekannter Schluessel/)
  })
  it('ohne Config: keine hinweise in der Antwort', async () => {
    const res = await lauf(runner(fakeHost()), args())
    assert.equal(res.hinweise, undefined)
  })
})

describe('L2 vorpruefung vor dem Versuch', () => {
  it('{projekt} wird ersetzt; erwartet als Teilstring in stdout+stderr → Dispatch läuft', async () => {
    config({ vorpruefung: { befehl: 'echo "{projekt}" >&2', erwartet: repo } })
    const host = fakeHost()
    const res = await lauf(runner(host), args())
    assert.equal(res.ok, true, res.error)
    assert.match(host.wakes[0], /GRÜN/)
  })
  it('erwartet fehlt → „Nicht bereit“, kein Versuch, kein Lauf, kein Worker', async () => {
    config({ vorpruefung: { befehl: 'echo anderswo', erwartet: '/gibt/es/nicht' } })
    const host = fakeHost()
    const res = await lauf(runner(host), args())
    assert.equal(res.ok, false)
    assert.match(res.error!, /^Nicht bereit: Vorprüfung/)
    assert.match(res.error!, /\/gibt\/es\/nicht/)
    assert.match(res.error!, /anderswo/)
    assert.match(res.error!, /Kein Versuch gezählt/)
    assert.equal(host.sent.length, 0)
    assert.equal(fs.readdirSync(laufDir).length, 0)
  })
  it('beim erneuten Dispatch zählt ein gescheiterter Vorlauf keinen Versuch', async () => {
    const host = fakeHost(() => schreib('impl.txt', 'immer noch nein\n'))
    const first = await lauf(runner(host), args())
    config({ vorpruefung: { befehl: 'true', erwartet: 'nie' } })
    const res = await lauf(runner(host), { ...args(), laufId: first.laufId, haeppchen: 1 })
    assert.equal(res.ok, false)
    assert.equal(loadLauf(first.laufPfad!)!.haeppchen[0].versuche.length, 1)
  })
})
