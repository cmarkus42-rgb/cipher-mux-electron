// test/main/local-factory/runner-lauffix.test.ts
//
// Läuferfehler aus dem Live-Test 23.10. (projekt-a): Gate GRÜN, dann brach der
// Commit ab, und der Versuch stand als „haengt“ da. Echtes git-Repo; der
// Fake-Worker tut, was der Test ihm aufträgt.
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

const TEST_CMD = 'grep -q ok impl.txt'

type Arbeit = (repo: string) => void
const loest: Arbeit = () => schreib('impl.txt', 'ok\n')

function fakeHost(arbeit: Arbeit = loest) {
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
      arbeit(repo)
      fs.writeFileSync(path.join(runDir, 'REPORT.md'), 'fertig')
      fs.writeFileSync(path.join(runDir, IDLE_SIGNAL_FILENAME), String(Date.now() + 1000))
    },
    async stopWorker() {},
    async paneTail() { return [] },
    lastActivityAt() { return Date.now() - 60_000 },
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

function config(c: unknown): void {
  schreib('.cipher-mux/local-factory.json', JSON.stringify(c))
  git('add', '.cipher-mux'); git('commit', '-qm', 'config')
}

type Res = { ok: boolean; error?: string; laufId?: string; laufPfad?: string; versuch?: number }
async function lauf(r: LocalFactoryRunner, a: Record<string, unknown>): Promise<Res> {
  const res = await r.dispatch(a as never) as Res
  await r.whenIdle()
  return res
}

beforeEach(() => {
  repo = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lf-fix-')))
  laufDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-fix-lauf-'))
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  schreib('impl.txt', 'nein\n')
  git('add', '.'); git('commit', '-qm', 'init')
  schreib('test/accept.sh', `${TEST_CMD}\n`)
})

describe('Konstellation projekt-a: sauberkeitIgnoriert zugleich von einer Unter-.gitignore erfasst', () => {
  let extern: string
  beforeEach(() => {
    extern = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-fix-nm-'))
    schreib('dashboard-src/.gitignore', 'node_modules\n.svelte-kit\n')
    git('add', 'dashboard-src'); git('commit', '-qm', 'dashboard')
    config({ sauberkeitIgnoriert: ['node_modules', 'dashboard-src/node_modules', 'dashboard-src/.svelte-kit'] })
    fs.symlinkSync(extern, path.join(repo, 'dashboard-src', 'node_modules'))
    schreib('dashboard-src/.svelte-kit/tsconfig.json', '{}')
  })

  it('GRÜN wird committet: kein Läuferfehler, Commit nur mit der Arbeit des Workers', async () => {
    const host = fakeHost()
    const res = await lauf(runner(host), args())
    assert.equal(res.ok, true, res.error)
    assert.match(host.wakes[0], /GRÜN/)
    assert.equal(git('show', '--name-only', '--format=', 'HEAD'), 'impl.txt')
    assert.equal(loadLauf(res.laufPfad!)!.haeppchen[0].versuche[0].verdict, 'gruen')
  })

  it('ROT: Patch und Reset gelingen, die ignorierten Einträge bleiben liegen', async () => {
    const host = fakeHost(() => schreib('impl.txt', 'nein, nein\n'))
    const res = await lauf(runner(host), args())
    assert.match(host.wakes[0], /ROT/)
    const v = loadLauf(res.laufPfad!)!.haeppchen[0].versuche[0]
    assert.equal(v.verdict, 'rot')
    assert.match(fs.readFileSync(v.patchPfad!, 'utf-8'), /impl\.txt/)
    assert.equal(fs.readFileSync(path.join(repo, 'impl.txt'), 'utf-8'), 'nein\n')
    assert.equal(fs.lstatSync(path.join(repo, 'dashboard-src', 'node_modules')).isSymbolicLink(), true)
    assert.equal(fs.existsSync(path.join(repo, 'dashboard-src', '.svelte-kit', 'tsconfig.json')), true)
  })
})

// Der Testbefehl legt nach grünem Test eine index.lock an — ein echter git-Fehler
// beim Commit, wie im Live-Test, nur mit anderer Ursache.
const SPERRT_COMMIT = `${TEST_CMD} && touch .git/index.lock`
const gateVon = (laufPfad: string, nummer = 1, v = -1) => {
  const versuch = loadLauf(laufPfad)!.haeppchen.find(h => h.nummer === nummer)!.versuche.at(v)!
  return JSON.parse(fs.readFileSync(versuch.gatePfad!, 'utf-8'))
}

describe('Läuferfehler: eigener Ausgang statt „haengt“', () => {
  it('Commit scheitert nach GRÜN → laeuferfehler in lauf.json, Gate und Weckzeile; Arbeit bleibt im Worktree', async () => {
    const host = fakeHost()
    const res = await lauf(runner(host), { ...args(), testBefehl: SPERRT_COMMIT })
    assert.equal(res.ok, true, res.error)
    const h = loadLauf(res.laufPfad!)!.haeppchen[0]
    const v = h.versuche[0]
    assert.equal(v.verdict, 'laeuferfehler')
    assert.match(v.fehler!, /index\.lock/)
    assert.equal(h.status, 'wartet')
    // Die Arbeit des Workers ist nicht verloren: im Baum und als Patch.
    assert.equal(fs.readFileSync(path.join(repo, 'impl.txt'), 'utf-8'), 'ok\n')
    assert.match(fs.readFileSync(v.patchPfad!, 'utf-8'), /impl\.txt/)
    const g = gateVon(res.laufPfad!)
    assert.equal(g.verdict, 'gruen')
    assert.match(g.laeuferfehler.meldung, /index\.lock/)
    assert.match(g.laeuferfehler.baum, /ungesichert im Worktree/)
    assert.equal(host.wakes.length, 1)
    assert.match(host.wakes[0], /#1 „impl sagt ok“: LÄUFERFEHLER, Versuch 1\/2/)
    assert.match(host.wakes[0], /Worker-Änderung liegt ungesichert im Worktree/)
    assert.match(host.wakes[0], /Läuferfehler: git failed/)
    assert.doesNotMatch(host.wakes[0], /HÄNGT/)
  })

  it('Läuferfehler vor dem Gate (sendToWorker wirft) → laeuferfehler, Baum auf Basis wie bisher', async () => {
    const host = fakeHost()
    host.sendToWorker = async () => { schreib('impl.txt', 'kaputt\n'); throw new Error('boom') }
    const res = await lauf(runner(host), args())
    const v = loadLauf(res.laufPfad!)!.haeppchen[0].versuche[0]
    assert.equal(v.verdict, 'laeuferfehler')
    assert.match(v.fehler!, /boom/)
    assert.equal(fs.readFileSync(path.join(repo, 'impl.txt'), 'utf-8'), 'nein\n')
    assert.match(host.wakes[0], /LÄUFERFEHLER.*Baum auf die Basis zurückgesetzt/)
  })

  it('Retry ohne sauberen Baum: die Ablehnung nennt den Läuferfehler und den Patch', async () => {
    const res = await lauf(runner(fakeHost()), { ...args(), testBefehl: SPERRT_COMMIT })
    fs.rmSync(path.join(repo, '.git', 'index.lock'))
    const r2 = await lauf(runner(fakeHost()), { ...args(), laufId: res.laufId, haeppchen: 1, laeuferfehler: 'index.lock' })
    assert.equal(r2.ok, false)
    assert.match(r2.error!, /nicht sauber.*impl\.txt/)
    assert.match(r2.error!, /Läuferfehler in Versuch #1\.1.*versuch-1-1\.patch/)
  })
})

describe('Retry-Feld laeuferfehler im Läufer', () => {
  const aufraeumen = () => {
    fs.rmSync(path.join(repo, '.git', 'index.lock'), { force: true })
    git('reset', '-q', '--hard'); git('clean', '-fdq')
  }

  it('nach Läuferfehler: neuer Versuch zählt nicht, Weckzeile und lauf.json weisen ihn aus, kein „vorige Versuch“', async () => {
    const res = await lauf(runner(fakeHost()), { ...args(), testBefehl: SPERRT_COMMIT })
    aufraeumen()
    const gut = fakeHost()
    const r2 = await lauf(runner(gut), { ...args(), laufId: res.laufId, haeppchen: 1, laeuferfehler: 'Commit scheiterte an index.lock' })
    assert.equal(r2.ok, true, r2.error)
    assert.equal(r2.versuch, 2)
    assert.match(gut.wakes[0], /GRÜN, Versuch 1\/2 \(1 Läuferfehler nicht gezählt\)/)
    assert.equal(loadLauf(res.laufPfad!)!.haeppchen[0].versuche[0].laeuferfehler, 'Commit scheiterte an index.lock')
    const auftrag = fs.readFileSync(gut.sent[0].match(/\S+AUFTRAG\.md/)![0], 'utf-8')
    assert.doesNotMatch(auftrag, /vorige Versuch ist durchgefallen/)
  })

  it('zweiter Läuferfehler im selben Häppchen → ESKALIERT, weiteres Markieren abgelehnt', async () => {
    const res = await lauf(runner(fakeHost()), { ...args(), testBefehl: SPERRT_COMMIT })
    aufraeumen()
    const host = fakeHost()
    await lauf(runner(host), { ...args(), testBefehl: SPERRT_COMMIT, laufId: res.laufId, haeppchen: 1, laeuferfehler: 'eins' })
    assert.match(host.wakes[0], /LÄUFERFEHLER.*zweiter Läuferfehler.*ESKALIERT, an den User melden/)
    assert.equal(loadLauf(res.laufPfad!)!.haeppchen[0].status, 'eskaliert')
    aufraeumen()
    const r3 = await lauf(runner(fakeHost()), { ...args(), laufId: res.laufId, haeppchen: 1, laeuferfehler: 'zwei' })
    assert.equal(r3.ok, false)
    assert.match(r3.error!, /höchstens 1/)
  })

  it('Altfall lf-live: „haengt“ mit grünem Gate lässt sich als Läuferfehler markieren', async () => {
    const laufId = 'LFLIVE'
    const dir = path.join(laufDir, laufId)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'gate-1-1.json'), JSON.stringify({ verdict: 'gruen', reasons: [], testOutput: '31 passed' }))
    git('add', 'test'); git('commit', '-qm', 'lf: Abnahmetest #1')
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
    fs.writeFileSync(path.join(dir, 'lauf.json'), JSON.stringify({
      id: laufId, projekt: repo, erstellt: 1, weckrufe: 1, branch,
      // So stand es nach dem Abbruch da: kein gatePfad, Ausgang haengt.
      haeppchen: [{ nummer: 1, ziel: 'impl sagt ok', status: 'wartet', mitTest: true, versuche: [{ nr: 1, gestartet: 1, beendet: 2, verdict: 'haengt' }] }],
    }))
    const host = fakeHost()
    const r = await lauf(runner(host), { ...args(), laufId, haeppchen: 1, laeuferfehler: 'Commit brach an .gitignore ab (lf-live)' })
    assert.equal(r.ok, true, r.error)
    assert.match(host.wakes[0], /GRÜN, Versuch 1\/2 \(1 Läuferfehler nicht gezählt\)/)
  })

  it('„haengt“ mit rotem oder fehlendem Gate ist kein Läuferfehler', async () => {
    const laufId = 'LHAENGT'
    const dir = path.join(laufDir, laufId)
    fs.mkdirSync(dir, { recursive: true })
    git('add', 'test'); git('commit', '-qm', 'lf: Abnahmetest #1')
    fs.writeFileSync(path.join(dir, 'lauf.json'), JSON.stringify({
      id: laufId, projekt: repo, erstellt: 1, weckrufe: 1, branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
      haeppchen: [{ nummer: 1, ziel: 'z', status: 'wartet', versuche: [{ nr: 1, gestartet: 1, beendet: 2, verdict: 'haengt' }] }],
    }))
    const r = await lauf(runner(fakeHost()), { ...args(), laufId, haeppchen: 1, laeuferfehler: 'x' })
    assert.equal(r.ok, false)
    assert.match(r.error!, /kein Läuferfehler/)
  })
})
