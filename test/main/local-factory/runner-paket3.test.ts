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
