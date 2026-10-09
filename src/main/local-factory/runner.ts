// src/main/local-factory/runner.ts
import * as fs from 'fs'
import * as path from 'path'
import { ulid } from 'ulidx'
import { validateAuftrag, buildAuftragMd, type AuftragInput } from './auftrag'
import { decideGate, type GateResult } from './gate'
import {
  newLauf, beginVersuch, endVersuch, countWeckruf, markAbgenommen,
  loadLauf, saveLauf, abortRunning, MAX_VERSUCHE, type Lauf,
} from './lauf'
import { classifyWorker, IDLE_SIGNAL_FILENAME } from './worker-done'
import {
  runShell, dirtyFiles, headCommit, commitPaths, commitAll, changedSince,
  checksums, savePatchAndReset, toRepoRelative,
} from './git-ops'
import { PROTECTED_PATHS_FILENAME } from '../session/entity-boundaries'

/**
 * Der Läufer (Spec §7). Kein Modell: er startet, wartet, prüft und weckt.
 * Der Architekt verbraucht nur Züge, wenn es etwas zu entscheiden gibt —
 * das ist der ganze Grund, warum er existiert (Keel: Warten kostete Tokens).
 */

export interface WorkerHost {
  endpointReachable(): Promise<boolean>
  startFreshWorker(projekt: string): Promise<{ runDir: string; sessionId: string }>
  sendToWorker(sessionId: string, line: string): Promise<void>
  stopWorker(sessionId: string): Promise<void>
  lastActivityAt(sessionId: string): number
  tokensAt(sessionId: string): { input: number; output: number } | null
  wakeArchitect(line: string): Promise<void>
}

export interface RunnerOpts {
  host: WorkerHost
  /** Wurzel für Läufe: <laufDir>/<laufId>/lauf.json, gate-*.json, *.patch */
  laufDir: string
  now?: () => number
  sleep?: (ms: number) => Promise<void>
  pollMs?: number
  startupWaitMs?: number
  quietMs?: number
  stallMs?: number
  timeoutMs?: number
  testTimeoutMs?: number
}

export interface DispatchArgs extends AuftragInput {
  laufId?: string
  haeppchen?: number
}

export type DispatchAccepted = { ok: true; laufId: string; nummer: number; versuch: number; laufPfad: string }
export type DispatchRejected = { ok: false; error: string }

interface GateRecord extends GateResult { testOutput: string }

export class LocalFactoryRunner {
  private readonly o: Required<Omit<RunnerOpts, 'host' | 'laufDir'>> & Pick<RunnerOpts, 'host' | 'laufDir'>
  private running: Promise<void> = Promise.resolve()
  private busy = false

  constructor(opts: RunnerOpts) {
    this.o = {
      now: () => Date.now(),
      sleep: ms => new Promise(r => setTimeout(r, ms)),
      pollMs: 15_000,
      startupWaitMs: 12_000,
      quietMs: 30_000,
      stallMs: 10 * 60_000,
      timeoutMs: 60 * 60_000,
      testTimeoutMs: 15 * 60_000,
      ...opts,
    }
  }

  whenIdle(): Promise<void> {
    return this.running
  }

  private laufFile(laufId: string): string {
    return path.join(this.o.laufDir, laufId, 'lauf.json')
  }

  accept(laufId: string, nummer: number): void {
    const f = this.laufFile(laufId)
    const lauf = loadLauf(f)
    if (lauf) saveLauf(f, markAbgenommen(lauf, nummer))
  }

  async dispatch(args: DispatchArgs): Promise<DispatchAccepted | DispatchRejected> {
    const errs = validateAuftrag(args)
    if (errs.length) return { ok: false, error: `Auftrag ungültig: ${errs.join('; ')}` }
    if (this.busy) return { ok: false, error: 'Es läuft bereits ein Worker. Nacheinander (Spec E2).' }

    if (!(await this.o.host.endpointReachable())) {
      await this.o.host.wakeArchitect('[local-factory] Endpunkt nicht erreichbar — kein Versuch gezählt.')
      return { ok: false, error: 'Endpunkt des lokalen Modells nicht erreichbar. Kein Versuch gezählt.' }
    }

    const projekt = args.projekt
    const prot = args.geschuetzteTests.map(t => toRepoRelative(projekt, t))

    // Offene Dateien dürfen nur die geschützten Tests sein — die committet der Läufer als Basis.
    const dirty = await dirtyFiles(projekt)
    const fremd = dirty.filter(f => !prot.includes(f))
    if (fremd.length) {
      return { ok: false, error: `Arbeitsbaum nicht sauber, außer den Abnahmetests offen: ${fremd.join(', ')}` }
    }
    const fehlend = prot.filter(f => !fs.existsSync(path.join(projekt, f)))
    if (fehlend.length) return { ok: false, error: `Abnahmetest fehlt: ${fehlend.join(', ')}` }

    const vorher = await runShell(args.testBefehl, projekt, this.o.testTimeoutMs)
    if (vorher.exitCode === 0) {
      return { ok: false, error: 'Der Abnahmetest ist vor der Arbeit schon grün — er prüft nichts.' }
    }

    const laufId = args.laufId ?? ulid()
    const laufPfad = this.laufFile(laufId)
    let lauf0: Lauf = loadLauf(laufPfad) ?? newLauf(laufId, projekt, this.o.now())
    // Ein „laeuft“ ohne lebenden Durchlauf in diesem Prozess ist ein Rest eines App-Neustarts (Spec §9).
    if (!this.busy && lauf0.haeppchen.some(h => h.status === 'laeuft')) {
      lauf0 = abortRunning(lauf0)
      saveLauf(laufPfad, lauf0)
    }
    const begun = beginVersuch(lauf0, { nummer: args.haeppchen, ziel: args.ziel, now: this.o.now() })
    if ('error' in begun) return { ok: false, error: begun.error }

    const offeneTests = dirty.filter(f => prot.includes(f))
    if (offeneTests.length) await commitPaths(projekt, offeneTests, `lf: Abnahmetest #${begun.nummer}`)
    const base = await headCommit(projekt)
    const sumsBefore = checksums(projekt, prot)
    saveLauf(laufPfad, begun.lauf)

    // Vorheriges Gate für einen zweiten Versuch — aus der Datei, nicht vom Architekten.
    const prevV = args.haeppchen !== undefined
      ? lauf0.haeppchen.find(h => h.nummer === begun.nummer)?.versuche.at(-1)
      : undefined
    let vorherigesGate: { reasons: string[]; testOutput: string } | undefined
    if (prevV?.gatePfad) {
      try {
        const g = JSON.parse(fs.readFileSync(prevV.gatePfad, 'utf-8')) as GateRecord
        vorherigesGate = { reasons: g.reasons ?? [], testOutput: g.testOutput ?? '' }
      } catch { /* kein lesbares Gate — dann ohne */ }
    }

    this.busy = true
    this.running = this.runAttempt({
      args, prot, base, sumsBefore, laufId, laufPfad,
      nummer: begun.nummer, versuch: begun.versuch, vorherigesGate,
    })
      .catch(err => this.o.host.wakeArchitect(`[local-factory] #${begun.nummer} Läuferfehler: ${String(err)}`))
      .finally(() => { this.busy = false })

    return { ok: true, laufId, nummer: begun.nummer, versuch: begun.versuch, laufPfad }
  }

  private async runAttempt(a: {
    args: DispatchArgs; prot: string[]; base: string; sumsBefore: Record<string, string>
    laufId: string; laufPfad: string; nummer: number; versuch: number
    vorherigesGate?: { reasons: string[]; testOutput: string }
  }): Promise<void> {
    const { host } = this.o
    const projekt = a.args.projekt
    const { runDir, sessionId } = await host.startFreshWorker(projekt)

    fs.writeFileSync(
      path.join(runDir, PROTECTED_PATHS_FILENAME),
      JSON.stringify(a.prot.map(p => path.join(projekt, p))),
      'utf-8',
    )
    const auftragPfad = path.join(runDir, 'AUFTRAG.md')
    fs.writeFileSync(
      auftragPfad,
      buildAuftragMd(a.args, { nummer: a.nummer, versuch: a.versuch, vorherigesGate: a.vorherigesGate }),
      'utf-8',
    )
    for (const f of ['REPORT.md', IDLE_SIGNAL_FILENAME]) {
      try { fs.unlinkSync(path.join(runDir, f)) } catch { /* nicht da */ }
    }

    await this.o.sleep(this.o.startupWaitMs)
    const startedAt = this.o.now()
    await host.sendToWorker(sessionId, `Lies ${auftragPfad}, arbeite ihn ab, schreib REPORT.md.`)

    let state = classifyWorker(this.observe(runDir, sessionId, startedAt), this.cfg())
    while (state === 'arbeitet') {
      await this.o.sleep(this.o.pollMs)
      state = classifyWorker(this.observe(runDir, sessionId, startedAt), this.cfg())
    }
    const tokens = host.tokensAt(sessionId)
    await host.stopWorker(sessionId)

    const test = state === 'fertig'
      ? await runShell(a.args.testBefehl, projekt, this.o.testTimeoutMs)
      : { exitCode: null, output: '' }
    const gate = decideGate({
      workerFinished: state === 'fertig',
      testExitCode: test.exitCode,
      checksumsBefore: a.sumsBefore,
      checksumsAfter: checksums(projekt, a.prot),
      changedFiles: await changedSince(projekt, a.base),
      protectedFiles: a.prot,
    })

    const dir = path.dirname(a.laufPfad)
    const gatePfad = path.join(dir, `gate-${a.nummer}-${a.versuch}.json`)
    fs.writeFileSync(gatePfad, JSON.stringify({ ...gate, testOutput: test.output } satisfies GateRecord, null, 2), 'utf-8')

    let commit: string | undefined
    let patchPfad: string | undefined
    if (gate.verdict === 'gruen') {
      commit = await commitAll(projekt, `lf: ${a.args.ziel}`)
    } else {
      patchPfad = path.join(dir, `versuch-${a.nummer}-${a.versuch}.patch`)
      await savePatchAndReset(projekt, a.base, patchPfad)
    }

    let lauf = loadLauf(a.laufPfad) ?? newLauf(a.laufId, projekt, this.o.now())
    lauf = endVersuch(lauf, a.nummer, {
      verdict: gate.verdict, gatePfad, ...(patchPfad ? { patchPfad } : {}), ...(commit ? { commit } : {}),
      ...(tokens ? { tokensAmEnde: tokens } : {}),
    }, this.o.now())
    lauf = countWeckruf(lauf)
    saveLauf(a.laufPfad, lauf)

    const h = lauf.haeppchen.find(x => x.nummer === a.nummer)
    const kopf = `[local-factory] #${a.nummer} „${a.args.ziel}“`
    const zahl = `Versuch ${a.versuch}/${MAX_VERSUCHE}`
    const line = gate.verdict === 'gruen'
      ? `${kopf}: GRÜN, ${zahl}, Commit ${commit!.slice(0, 8)}, Lauf: ${a.laufPfad}`
      : `${kopf}: ${gate.verdict === 'rot' ? 'ROT' : 'HÄNGT'}, ${zahl}, Gate: ${gatePfad}`
        + (h?.status === 'eskaliert' ? ' — ESKALIERT, an den User melden' : '')
    await host.wakeArchitect(line)
  }

  private cfg() {
    return { quietMs: this.o.quietMs, timeoutMs: this.o.timeoutMs, stallMs: this.o.stallMs }
  }

  private observe(runDir: string, sessionId: string, startedAt: number) {
    const mtime = (f: string): number | null => {
      try { return fs.statSync(path.join(runDir, f)).mtimeMs } catch { return null }
    }
    let idle: number | null = null
    try { idle = Number(fs.readFileSync(path.join(runDir, IDLE_SIGNAL_FILENAME), 'utf-8')) || null } catch { /* */ }
    return {
      now: this.o.now(),
      startedAt,
      reportMtime: mtime('REPORT.md'),
      idleSignalAt: idle,
      lastActivityAt: Math.max(startedAt, this.o.host.lastActivityAt(sessionId)),
    }
  }
}
