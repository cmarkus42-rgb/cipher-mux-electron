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
