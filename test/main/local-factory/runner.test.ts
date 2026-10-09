// test/main/local-factory/runner.test.ts
import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { LocalFactoryRunner, type WorkerHost } from '../../../src/main/local-factory/runner'
import { loadLauf, saveLauf, newLauf } from '../../../src/main/local-factory/lauf'
import { PROTECTED_PATHS_FILENAME } from '../../../src/main/session/entity-boundaries'
import { IDLE_SIGNAL_FILENAME } from '../../../src/main/local-factory/worker-done'

let repo: string
let laufDir: string
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf-8' }).trim()

// Abnahmetest: rot, solange impl.txt nicht "ok" enthält.
const TEST_CMD = 'grep -q ok impl.txt'

type Behaviour = 'brav' | 'schummelt' | 'haengt' | 'nicht-bereit' | 'committet' | 'wechselt-branch'

function fakeHost(behaviour: Behaviour): WorkerHost & { wakes: string[]; sent: string[] } {
  let runDir = ''
  const wakes: string[] = []
  const sent: string[] = []
  return {
    wakes, sent,
    async workerReady() {
      return behaviour === 'nicht-bereit' ? 'Endpunkt des lokalen Modells antwortet nicht (HTTP 404)' : null
    },
    async startFreshWorker() {
      runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-run-'))
      return { runDir, sessionId: 's1' }
    },
    async sendToWorker(_id, line) {
      sent.push(line)
      if (behaviour === 'haengt') return
      if (behaviour === 'wechselt-branch') git('checkout', '-qb', 'worker-eigen')
      fs.writeFileSync(path.join(repo, 'impl.txt'), 'ok\n')
      if (behaviour === 'committet') {
        git('add', '-A'); git('commit', '-qm', 'worker: eigener Commit')
        fs.writeFileSync(path.join(repo, 'extra.txt'), 'x\n')
      }
      if (behaviour === 'schummelt') fs.writeFileSync(path.join(repo, 'test', 'accept.sh'), 'exit 0\n')
      fs.writeFileSync(path.join(runDir, 'REPORT.md'), 'fertig')
      // Idle nach dem Report — sonst wartet der Läufer bis zum Timeout und wertet „hängt“.
      fs.writeFileSync(path.join(runDir, IDLE_SIGNAL_FILENAME), String(Date.now() + 1000))
    },
    async stopWorker() {},
    lastActivityAt() { return behaviour === 'haengt' ? 0 : Date.now() - 60_000 },
    tokensAt() { return { input: 10, output: 5 } },
    async wakeArchitect(line) { wakes.push(line) },
  }
}

type Res = { ok: boolean; error?: string; laufId?: string; laufPfad?: string; nummer?: number; versuch?: number }

const args = () => ({
  projekt: repo,
  ziel: 'impl sagt ok',
  dateien: ['impl.txt'],
  akzeptanzkriterium: 'impl.txt enthält ok',
  geschuetzteTests: ['test/accept.sh'],
  testBefehl: TEST_CMD,
  nichtZiele: [],
})

// timeoutMs klein, damit „haengt“ schnell greift. Wer im Fake-Worker git
// aufruft, braucht mehr — sonst läuft die Frist schon während sendToWorker ab.
const fast = (host: WorkerHost, timeoutMs = 50) => new LocalFactoryRunner({
  host, laufDir, sleep: async () => {}, pollMs: 0, startupWaitMs: 0,
  quietMs: 1000, stallMs: 5000, timeoutMs, testTimeoutMs: 5000,
})

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-proj-'))
  laufDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-lauf-'))
  git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  fs.writeFileSync(path.join(repo, 'impl.txt'), 'nein\n')
  git('add', '.'); git('commit', '-qm', 'init')
  // Architekt hat den Abnahmetest geschrieben, nicht committet
  fs.mkdirSync(path.join(repo, 'test'))
  fs.writeFileSync(path.join(repo, 'test', 'accept.sh'), `${TEST_CMD}\n`)
})

describe('LocalFactoryRunner', () => {
  it('brav: committet Abnahmetest als Basis, Worker grün, Commit, Weckzeile GRÜN', async () => {
    const host = fakeHost('brav')
    const r = fast(host)
    const res = await r.dispatch(args())
    assert.equal(res.ok, true)
    await r.whenIdle()
    assert.match(host.wakes[0], /#1 „impl sagt ok“: GRÜN, Versuch 1\/2, Commit/)
    assert.match(git('log', '--format=%s', '-3'), /lf: impl sagt ok[\s\S]*lf: Abnahmetest #1/)
    const lauf = loadLauf((res as any).laufPfad)!
    assert.equal(lauf.haeppchen[0].status, 'wartet')
    assert.equal(lauf.weckrufe, 1)
    assert.deepEqual(lauf.haeppchen[0].versuche[0].tokensAmEnde, { input: 10, output: 5 })
  })

  it('schreibt die geschützten Pfade absolut in die Sperrliste des Workers', async () => {
    const host = fakeHost('brav')
    let listed: string[] = []
    const orig = host.sendToWorker
    host.sendToWorker = async (id, line) => {
      const runDir = path.dirname(line.match(/\S+AUFTRAG\.md/)![0])
      listed = JSON.parse(fs.readFileSync(path.join(runDir, PROTECTED_PATHS_FILENAME), 'utf-8'))
      return orig(id, line)
    }
    const r = fast(host)
    await r.dispatch(args()); await r.whenIdle()
    assert.deepEqual(listed, [path.join(repo, 'test/accept.sh')])
  })

  it('schummelt: geschützter Test geändert → ROT, Baum zurück auf Basis, Patch gesichert', async () => {
    const host = fakeHost('schummelt')
    const r = fast(host)
    const res: any = await r.dispatch(args())
    await r.whenIdle()
    assert.match(host.wakes[0], /ROT, Versuch 1\/2, Gate: /)
    assert.equal(fs.readFileSync(path.join(repo, 'impl.txt'), 'utf-8'), 'nein\n')
    const v = loadLauf(res.laufPfad)!.haeppchen[0].versuche[0]
    assert.ok(fs.existsSync(v.patchPfad!))
    assert.match(fs.readFileSync(v.gatePfad!, 'utf-8'), /Geschützte Tests verändert/)
  })

  it('zweiter Versuch: Gate-Ausgabe steht im neuen AUFTRAG.md; dritter wird abgelehnt', async () => {
    const host = fakeHost('haengt')
    const r = fast(host)
    const first: any = await r.dispatch(args()); await r.whenIdle()
    assert.match(host.wakes[0], /HÄNGT, Versuch 1\/2/)
    const second: any = await r.dispatch({ ...args(), laufId: first.laufId, haeppchen: 1 })
    assert.equal(second.versuch, 2)
    await r.whenIdle()
    assert.match(host.wakes[1], /ESKALIERT/)
    const auftrag = fs.readFileSync(host.sent[1].match(/\S+AUFTRAG\.md/)![0], 'utf-8')
    assert.match(auftrag, /vorige Versuch ist durchgefallen/)
    const third: any = await r.dispatch({ ...args(), laufId: first.laufId, haeppchen: 1 })
    assert.equal(third.ok, false)
    assert.match(third.error, /eskaliert/)
  })

  it('Abnahmetest schon grün → Ablehnung, kein Worker', async () => {
    fs.writeFileSync(path.join(repo, 'impl.txt'), 'ok\n'); git('commit', '-qam', 'schon ok')
    const host = fakeHost('brav')
    const res: any = await fast(host).dispatch(args())
    assert.equal(res.ok, false)
    assert.match(res.error, /prüft nichts/)
    assert.equal(host.sent.length, 0)
  })

  it('fremde offene Datei → Ablehnung mit Dateiname', async () => {
    fs.writeFileSync(path.join(repo, 'fremd.txt'), 'x')
    const res: any = await fast(fakeHost('brav')).dispatch(args())
    assert.equal(res.ok, false)
    assert.match(res.error, /fremd\.txt/)
  })

  it('nicht bereit → Ablehnung mit Grund und Weckzeile, kein Versuch gezählt (R15)', async () => {
    const host = fakeHost('nicht-bereit')
    const res = await fast(host).dispatch(args()) as Res
    assert.equal(res.ok, false)
    assert.match(res.error!, /Nicht bereit: Endpunkt .*HTTP 404/)
    assert.deepEqual(host.wakes, [
      '[local-factory] Nicht bereit: Endpunkt des lokalen Modells antwortet nicht (HTTP 404) — kein Versuch gezählt.',
    ])
    assert.equal(fs.readdirSync(laufDir).length, 0)
  })

  it('ungültiger Auftrag → Ablehnung mit allen Feldfehlern', async () => {
    const res: any = await fast(fakeHost('brav')).dispatch({ ...args(), ziel: '', testBefehl: '' })
    assert.equal(res.ok, false)
    assert.match(res.error, /ziel/)
    assert.match(res.error, /testBefehl/)
  })
  it('Neustart-Rest: ein „laeuft“ ohne lebenden Lauf blockiert nicht, frühere Versuche bleiben', async () => {
    const laufId = 'LRESTART'
    const laufPfad = path.join(laufDir, laufId, 'lauf.json')
    const l = newLauf(laufId, repo, 1)
    l.haeppchen.push({ nummer: 1, ziel: 'impl sagt ok', status: 'laeuft', versuche: [{ nr: 1, gestartet: 5 }] })
    saveLauf(laufPfad, l)
    const host = fakeHost('brav')
    const r = fast(host)
    const res: any = await r.dispatch({ ...args(), laufId, haeppchen: 1 })
    assert.equal(res.ok, true)
    assert.equal(res.versuch, 2)
    await r.whenIdle()
    const h = loadLauf(laufPfad)!.haeppchen[0]
    assert.equal(h.versuche.length, 2)
    assert.equal(h.versuche[0].gestartet, 5)
  })
  it('Race: zwei parallele dispatch -> genau einer ok, ein Arbeitscommit', async () => {
    const host = fakeHost('brav')
    const r = fast(host)
    const [a, b] = await Promise.all([r.dispatch(args()), r.dispatch(args())]) as any[]
    assert.equal([a, b].filter(x => x.ok).length, 1)
    const rej = [a, b].find(x => !x.ok)
    assert.match(rej.error, /Es läuft bereits ein Worker/)
    await r.whenIdle()
    assert.equal(git('log', '--format=%s').split('\n').filter(l => l.startsWith('lf: ') && !l.startsWith('lf: Abnahmetest')).length, 1)
  })

  it('sendToWorker wirft: Worker gestoppt, Häppchen nicht laeuft, Baum auf Basis, Läuferfehler-Weckzeile', async () => {
    const host = fakeHost('brav')
    let stopped = 0
    host.stopWorker = async () => { stopped++ }
    host.sendToWorker = async () => { fs.writeFileSync(path.join(repo, 'impl.txt'), 'kaputt\n'); throw new Error('boom') }
    const r = fast(host)
    const res: any = await r.dispatch(args())
    await r.whenIdle()
    assert.ok(stopped >= 1)
    assert.notEqual(loadLauf(res.laufPfad)!.haeppchen[0].status, 'laeuft')
    assert.equal(fs.readFileSync(path.join(repo, 'impl.txt'), 'utf-8'), 'nein\n')
    assert.ok(host.wakes.some(w => w.includes('Läuferfehler')))
  })

  it('projekt ist Unterverzeichnis -> Ablehnung, nichts geschrieben', async () => {
    fs.mkdirSync(path.join(repo, 'sub'))
    const res: any = await fast(fakeHost('brav')).dispatch({ ...args(), projekt: path.join(repo, 'sub') })
    assert.equal(res.ok, false)
    assert.match(res.error, /nicht die Wurzel/)
    assert.equal(fs.readdirSync(laufDir).length, 0)
  })

  it('laufId mit Pfadanteilen -> Ablehnung', async () => {
    const res: any = await fast(fakeHost('brav')).dispatch({ ...args(), laufId: '../../x' })
    assert.equal(res.ok, false)
    assert.match(res.error, /laufId/)
    assert.equal(fs.readdirSync(laufDir).length, 0)
  })
  it('wakeArchitect wirft nach GRÜN: Arbeitscommit bleibt HEAD, Lauf zeigt gruen', async () => {
    const host = fakeHost('brav')
    host.wakeArchitect = async () => { throw new Error('pane weg') }
    const r = fast(host)
    const res: any = await r.dispatch(args())
    await r.whenIdle()
    assert.equal(git('log', '-1', '--format=%s'), 'lf: impl sagt ok')
    const v = loadLauf(res.laufPfad)!.haeppchen[0].versuche[0]
    assert.equal(v.verdict, 'gruen')
    assert.equal(v.commit, git('rev-parse', 'HEAD'))
  })

  it('wakeArchitect wirft nach ROT: Patch behält die Änderung des Workers', async () => {
    const host = fakeHost('schummelt')
    host.wakeArchitect = async () => { throw new Error('pane weg') }
    const r = fast(host)
    const res: any = await r.dispatch(args())
    await r.whenIdle()
    const v = loadLauf(res.laufPfad)!.haeppchen[0].versuche[0]
    const patch = fs.readFileSync(v.patchPfad!, 'utf-8')
    assert.ok(patch.length > 0)
    assert.match(patch, /impl\.txt/)
  })

  it('Worker committet selbst → GRÜN, genau ein lf:-Commit über der Basis (R14)', async () => {
    const host = fakeHost('committet')
    const r = fast(host, 10_000)
    const res = await r.dispatch(args()) as Res
    await r.whenIdle()
    assert.match(host.wakes[0], /GRÜN/)
    const subjects = git('log', '--format=%s').split('\n')
    assert.deepEqual(subjects.slice(0, 3), ['lf: impl sagt ok', 'lf: Abnahmetest #1', 'init'])
    assert.deepEqual(git('show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['extra.txt', 'impl.txt'])
    const v = loadLauf(res.laufPfad!)!.haeppchen[0].versuche[0]
    assert.equal(v.verdict, 'gruen')
    assert.equal(v.commit, git('rev-parse', 'HEAD'))
  })

  it('pre-commit-Hook exit 1: Abnahmetest-Commit und grüner Commit gelingen trotzdem (R14)', async () => {
    fs.writeFileSync(path.join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 })
    const host = fakeHost('brav')
    const r = fast(host)
    const res = await r.dispatch(args()) as Res
    assert.equal(res.ok, true)
    await r.whenIdle()
    assert.match(host.wakes[0], /GRÜN/)
    assert.deepEqual(git('log', '--format=%s', '-2').split('\n'), ['lf: impl sagt ok', 'lf: Abnahmetest #1'])
  })

  it('Worker wechselt den Branch → ROT mit Grund, nichts zurückgesetzt, Basisbranch unberührt', async () => {
    const host = fakeHost('wechselt-branch')
    const r = fast(host, 10_000)
    const startBranch = git('rev-parse', '--abbrev-ref', 'HEAD')
    const res = await r.dispatch(args()) as Res
    await r.whenIdle()
    assert.match(host.wakes[0], /ROT, Versuch 1\/2/)
    assert.match(host.wakes[0], /Branch gewechselt/)
    const v = loadLauf(res.laufPfad!)!.haeppchen[0].versuche[0]
    assert.equal(v.verdict, 'rot')
    assert.match(fs.readFileSync(v.gatePfad!, 'utf-8'), /Worker hat den Branch gewechselt/)
    // Konservativ: kein reset auf einem fremden Branch, Arbeit des Workers bleibt stehen.
    assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD'), 'worker-eigen')
    assert.equal(fs.readFileSync(path.join(repo, 'impl.txt'), 'utf-8'), 'ok\n')
    assert.equal(git('log', '-1', '--format=%s', startBranch), 'lf: Abnahmetest #1')
  })

  it('Weckzeilen sind einzeilig und gekappt: ziel mit Zeilenumbruch', async () => {
    const host = fakeHost('brav')
    const r = fast(host)
    await r.dispatch({ ...args(), ziel: 'impl\nsagt   ok\r\n' + 'x'.repeat(600) })
    await r.whenIdle()
    assert.equal(host.wakes.length, 1)
    assert.doesNotMatch(host.wakes[0], /[\r\n]/)
    assert.ok(host.wakes[0].length <= 400, `Länge ${host.wakes[0].length}`)
    assert.match(host.wakes[0], /„impl sagt ok/)
  })

  it('Läuferfehler mit mehrzeiligem Fehlertext → einzeilige Weckzeile', async () => {
    const host = fakeHost('brav')
    host.sendToWorker = async () => { throw new Error('zeile1\nzeile2') }
    const r = fast(host)
    await r.dispatch(args()); await r.whenIdle()
    const w = host.wakes.find(x => x.includes('Läuferfehler'))!
    assert.doesNotMatch(w, /\n/)
    assert.match(w, /zeile1 zeile2/)
  })

  it('accept: grün-wartend → ok und abgenommen', async () => {
    const r = fast(fakeHost('brav'))
    const res = await r.dispatch(args()) as Res
    await r.whenIdle()
    assert.deepEqual(r.accept(res.laufId!, 1), { ok: true })
    assert.equal(loadLauf(res.laufPfad!)!.haeppchen[0].status, 'abgenommen')
  })

  it('accept: unbekannter Lauf bzw. nicht grün-wartend → ok:false mit Grund', async () => {
    const r = fast(fakeHost('schummelt'))
    const unbekannt = r.accept('GIBTESNICHT', 1)
    assert.equal(unbekannt.ok, false)
    assert.match((unbekannt as Res).error!, /unbekannt/)
    const res = await r.dispatch(args()) as Res
    await r.whenIdle()
    const rot = r.accept(res.laufId!, 1)
    assert.equal(rot.ok, false)
    assert.match((rot as Res).error!, /nicht grün/)
    const fehlt = r.accept(res.laufId!, 7)
    assert.equal(fehlt.ok, false)
    assert.match((fehlt as Res).error!, /#7/)
    assert.equal(r.accept('../x', 1).ok, false)
  })

  it('Fremddatei bei Neustart-Rest: Fehlermeldung nennt den unterbrochenen Versuch', async () => {
    const laufId = 'LREST2'
    const l = newLauf(laufId, repo, 1)
    l.haeppchen.push({ nummer: 3, ziel: 'z', status: 'laeuft', versuche: [{ nr: 1, gestartet: 5 }] })
    saveLauf(path.join(laufDir, laufId, 'lauf.json'), l)
    fs.writeFileSync(path.join(repo, 'impl.txt'), 'halb\n')
    const res = await fast(fakeHost('brav')).dispatch({ ...args(), laufId, haeppchen: 3 }) as Res
    assert.equal(res.ok, false)
    assert.match(res.error!, /impl\.txt/)
    assert.match(res.error!, /vermutlich Rest eines unterbrochenen Versuchs #3 — Patch sichern oder Baum zurücksetzen/)
  })

  it('Läuferfehler nach Branchwechsel: kein reset auf dem fremden Branch', async () => {
    const host = fakeHost('brav')
    host.sendToWorker = async () => {
      git('checkout', '-qb', 'fremd')
      fs.writeFileSync(path.join(repo, 'impl.txt'), 'arbeit\n')
      git('commit', '-qam', 'fremde Arbeit')
      throw new Error('boom')
    }
    const r = fast(host)
    await r.dispatch(args()); await r.whenIdle()
    assert.equal(git('log', '-1', '--format=%s', 'fremd'), 'fremde Arbeit')
    assert.ok(host.wakes.some(w => w.includes('Läuferfehler')))
  })
})
