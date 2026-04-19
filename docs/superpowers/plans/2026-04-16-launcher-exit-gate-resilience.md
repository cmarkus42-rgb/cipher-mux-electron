# Plan 1 — Exit-Gate & Orchestrator-Resilienz

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den produktionsblockierenden Bug aus `ISSUE-launch-skill-skipped-completion.md` beheben — die Kickoff-Completion-Erkennung wird resilient gegen einen übersprungenen Exit-Gate, und der `/launch`-Skill wird so umformuliert, dass Claude die Handover-Phase nicht mehr als optional liest.

**Architecture:** Drei Änderungen, die zusammenspielen:
1. Im `/launch`-Skill wird Schritt 8 (bisher one-liner) zu einer eigenen verbindlichen **Handover-Phase** umgeschrieben, mit Marker-Datei als Primary und MCP-Call als Bonus.
2. Im `KickoffOrchestrator` (cipher-mux-electron) wird der Timeout-Pfad um einen **CLAUDE.md-Existenz-Check** erweitert: wenn die Datei im Zielverzeichnis existiert, wird der Timeout als impliziter Complete interpretiert statt als Fehler.
3. Jeder Completion-Pfad bekommt einen **Reason-Tag** (`'normal' | 'marker' | 'implicit'`), der als Feld am Event und als strukturierte Log-Zeile landet. Damit können wir nach ein paar Kickoffs messen, ob der Exit-Gate-Fix greift.

**Tech Stack:** TypeScript strict, Node test runner (`node:test`) mit `assert/strict`, `fs` (existsSync/watch), bestehender `console.log`-Pattern für Logs (kein neuer Logger, kein neues Dependency).

---

## File Structure Overview

**Modify (cipher-mux-electron):**
- `src/shared/types.ts` — Neuer Typ `KickoffCompleteReason`, Feld `reason` auf `KickoffCompletedEvent`
- `src/main/project/kickoff-orchestrator.ts` — `reason` auf `handleCompletion`, Implicit-Complete-Fallback in `handleTimeout`, strukturierte Log-Zeile pro Complete-Pfad
- `src/main/mcp/mcp-tools.ts` — MCP-Handler propagiert `reason='normal'`
- `test/main/kickoff-orchestrator.test.ts` — Tests für Implicit-Complete und Reason-Propagation

**Modify (projectlauncher):**
- `.claude/skills/launch/SKILL.md` — Schritt 8 wird zu eigener Handover-Phase umformuliert, Marker-Datei wird Primary

**Modify (Doku, cipher-mux-electron):**
- `docs/issues/ISSUE-launch-skill-skipped-completion.md` — Status auf „in implementation" setzen, Link zu diesem Plan

**Delete:** Nichts.

**Scope-Abgrenzung:** Dieser Plan rührt **nichts** am Template an, nichts an den Schritten 1–4 des Skills, nichts am Kickoff-Dialog, nichts an den Projekt-Skills `/decide` oder `/doc-review`. Das ist alles Plan 2.

---

### Task 1: `KickoffCompleteReason`-Typ und Event-Erweiterung

**Files:**
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Typ und Feld im Event hinzufügen**

Füge im „Kickoff"-Block (`src/shared/types.ts`, ab Zeile ~143) nach `KickoffCompletionPayload` den neuen Typ ein, und erweitere `KickoffCompletedEvent` um das Pflichtfeld `reason`:

```ts
/**
 * Grund, warum die Kickoff-Arbeit als abgeschlossen behandelt wurde.
 *
 * - `normal`  — /launch hat das MCP-Tool `kickoff_complete` aufgerufen.
 * - `marker`  — /launch hat die `.kickoff-complete`-Datei geschrieben (Bonus-Pfad
 *               aus Skill-Sicht, aber der Primary-Pfad in der neuen Skill-Version).
 * - `implicit`— Timeout ist abgelaufen, aber CLAUDE.md existiert im Zielverzeichnis.
 *               Wir interpretieren das als „Scaffold fertig, nur Exit-Gate verpasst".
 */
export type KickoffCompleteReason = 'normal' | 'marker' | 'implicit'

export interface KickoffCompletedEvent {
  handle: KickoffHandle
  payload: KickoffCompletionPayload
  /** ID der neu gestarteten Folge-Session (im Projekt-Verzeichnis). */
  followupSessionId: string
  /** Welcher Pfad hat den Complete ausgelöst. */
  reason: KickoffCompleteReason
}
```

- [ ] **Step 2: TypeScript-Compile prüfen**

Run: `npm run build`
Expected: Build schlägt fehl mit Fehlern in `kickoff-orchestrator.ts` und evtl. `mcp-tools.ts`, weil diese `reason` noch nicht setzen. Das ist erwartet — die fixen wir in den nächsten Tasks.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(kickoff): add KickoffCompleteReason type + event field"
```

---

### Task 2: Reason-Propagation in Orchestrator (normal + marker)

**Files:**
- Modify: `src/main/project/kickoff-orchestrator.ts`
- Modify: `src/main/mcp/mcp-tools.ts`
- Modify: `test/main/kickoff-orchestrator.test.ts`

- [ ] **Step 1: Failing test — Reason `'marker'` im Event bei Marker-Trigger**

Im `test/main/kickoff-orchestrator.test.ts`, direkt vor dem `})` der `describe`-Block-Zeile (am Ende der Datei), neuer Test:

```ts
  it('tags kickoff-complete reason=marker when triggered via marker file', async () => {
    await orchestrator.start({ projectDir })
    let fired: any = null
    orchestrator.on('kickoff-complete', (e) => { fired = e })
    fs.writeFileSync(path.join(projectDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 200))
    assert.ok(fired, 'event not emitted')
    assert.equal(fired.reason, 'marker')
  })

  it('tags kickoff-complete reason=normal when triggered via MCP handleCompletion', async () => {
    await orchestrator.start({ projectDir })
    let fired: any = null
    orchestrator.on('kickoff-complete', (e) => { fired = e })
    orchestrator.handleCompletion({
      projectPath: projectDir,
      projectName: 'my-project',
    })
    await new Promise((r) => setTimeout(r, 80))
    assert.ok(fired, 'event not emitted')
    assert.equal(fired.reason, 'normal')
  })
```

- [ ] **Step 2: Tests laufen lassen, Fehler bestätigen**

Run: `npm run test -- --test-name-pattern="reason=marker|reason=normal"`
Expected: FAIL — `fired.reason` ist undefined (das Feld gibt es noch nicht).

- [ ] **Step 3: Orchestrator: `handleCompletion` bekommt Reason-Parameter**

In `src/main/project/kickoff-orchestrator.ts`:

1. Importiere den neuen Typ:

```ts
import type {
  KickoffRequest,
  KickoffHandle,
  KickoffCompletionPayload,
  KickoffCompletedEvent,
  KickoffCompleteReason,
} from '../../shared/types'
```

2. Ändere die Signatur von `handleCompletion` (Zeile ~134) und die Event-Konstruktion (Zeile ~156). Ersetze:

```ts
  handleCompletion(payload: KickoffCompletionPayload): void {
    if (!this.active) return
    const active = this.active
    this.cleanupActive()
```

durch:

```ts
  handleCompletion(
    payload: KickoffCompletionPayload,
    reason: KickoffCompleteReason = 'normal',
  ): void {
    if (!this.active) return
    const active = this.active
    this.cleanupActive()
```

Und ersetze den Event-Block:

```ts
      const event: KickoffCompletedEvent = {
        handle: active.handle,
        payload: {
          projectPath: payload.projectPath || active.handle.projectDir,
          projectName: payload.projectName || active.handle.projectName,
          detectedStack: payload.detectedStack,
        },
        followupSessionId: followup.id,
      }
      this.emit('kickoff-complete', event)
```

durch:

```ts
      const event: KickoffCompletedEvent = {
        handle: active.handle,
        payload: {
          projectPath: payload.projectPath || active.handle.projectDir,
          projectName: payload.projectName || active.handle.projectName,
          detectedStack: payload.detectedStack,
        },
        followupSessionId: followup.id,
        reason,
      }
      this.emit('kickoff-complete', event)
```

- [ ] **Step 4: Marker-Pfad ruft `handleCompletion` mit `reason='marker'` auf**

In `src/main/project/kickoff-orchestrator.ts`, in `start()`, im Watcher-Setup (Zeile ~109): ersetze

```ts
      onMarker: () => {
        this.handleCompletion({
          projectPath: projectDir,
          projectName,
        })
      },
```

durch:

```ts
      onMarker: () => {
        this.handleCompletion({
          projectPath: projectDir,
          projectName,
        }, 'marker')
      },
```

- [ ] **Step 5: Tests laufen lassen, jetzt grün**

Run: `npm run test -- --test-name-pattern="reason=marker|reason=normal"`
Expected: PASS — beide neuen Tests sind grün, alle bestehenden Tests bleiben grün.

- [ ] **Step 6: MCP-Handler übergibt `reason='normal'` explizit**

In `src/main/mcp/mcp-tools.ts`, Zeile ~243, ersetze:

```ts
        ctx.kickoffOrchestrator.handleCompletion({
          projectPath: args.projectPath,
          projectName: args.projectName,
          detectedStack: args.detectedStack,
        })
```

durch:

```ts
        ctx.kickoffOrchestrator.handleCompletion({
          projectPath: args.projectPath,
          projectName: args.projectName,
          detectedStack: args.detectedStack,
        }, 'normal')
```

Begründung: `'normal'` ist zwar Default, aber explizit passt zu unserer Log-Strategie — wir wollen keinen impliziten Default-Pfad in Logs sehen.

- [ ] **Step 7: Gesamten Test-Lauf prüfen**

Run: `npm run test`
Expected: Alle Tests grün (vorher 110+, jetzt 112+).

- [ ] **Step 8: Commit**

```bash
git add src/main/project/kickoff-orchestrator.ts src/main/mcp/mcp-tools.ts test/main/kickoff-orchestrator.test.ts
git commit -m "feat(kickoff): propagate reason on MCP and marker complete paths"
```

---

### Task 3: Implicit-Complete-Fallback bei Timeout mit CLAUDE.md-Check

**Files:**
- Modify: `src/main/project/kickoff-orchestrator.ts`
- Modify: `test/main/kickoff-orchestrator.test.ts`

- [ ] **Step 1: Failing test — Timeout mit CLAUDE.md fires kickoff-complete, nicht kickoff-timeout**

Im `test/main/kickoff-orchestrator.test.ts`, am Ende der `describe`-Block (vor der schließenden `})`), neuer Test:

```ts
  it('treats timeout as implicit complete when CLAUDE.md exists in projectDir', async () => {
    const shortOrch = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 80,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })

    let completeEvent: any = null
    let timeoutFired = false
    shortOrch.on('kickoff-complete', (e) => { completeEvent = e })
    shortOrch.on('kickoff-timeout', () => { timeoutFired = true })

    // Scaffold has "happened" — CLAUDE.md is there but marker is missing.
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# my-project\n', 'utf-8')
    await shortOrch.start({ projectDir })

    // Wait past timeout + handleCompletion async work.
    await new Promise((r) => setTimeout(r, 300))

    assert.equal(timeoutFired, false, 'kickoff-timeout should NOT fire when CLAUDE.md exists')
    assert.ok(completeEvent, 'kickoff-complete should fire as implicit')
    assert.equal(completeEvent.reason, 'implicit')
    shortOrch.destroy()
  })

  it('still fires kickoff-timeout when CLAUDE.md is absent at timeout', async () => {
    const shortOrch = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 80,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })

    let completeFired = false
    let timeoutFired = false
    shortOrch.on('kickoff-complete', () => { completeFired = true })
    shortOrch.on('kickoff-timeout', () => { timeoutFired = true })

    // No CLAUDE.md — scaffold never got there.
    await shortOrch.start({ projectDir })
    await new Promise((r) => setTimeout(r, 300))

    assert.equal(timeoutFired, true, 'kickoff-timeout should fire')
    assert.equal(completeFired, false, 'kickoff-complete should NOT fire without CLAUDE.md')
    shortOrch.destroy()
  })
```

- [ ] **Step 2: Tests laufen lassen, Fehler bestätigen**

Run: `npm run test -- --test-name-pattern="implicit complete|still fires kickoff-timeout"`
Expected: FAIL — der erste Test schlägt fehl, weil `handleTimeout` aktuell immer `kickoff-timeout` emittiert, egal ob CLAUDE.md da ist. Der zweite Test müsste passen (ist identisch zum bestehenden Timeout-Test) — wenn er failt, ist was anderes kaputt.

- [ ] **Step 3: `handleTimeout` um CLAUDE.md-Check erweitern**

In `src/main/project/kickoff-orchestrator.ts`, ersetze `handleTimeout` (Zeile ~172):

```ts
  private handleTimeout(): void {
    if (!this.active) return
    const handle = this.active.handle
    this.cleanupActive()
    this.emit('kickoff-timeout', { handle })
  }
```

durch:

```ts
  private handleTimeout(): void {
    if (!this.active) return
    const handle = this.active.handle

    // Pragmatic resilience: if /launch scaffolded the project but skipped the
    // exit gate (marker + MCP call), CLAUDE.md still exists in the target dir.
    // Treat that state as an implicit complete so the follow-up session opens
    // instead of leaving the user stranded at the launcher.
    const claudeMdPath = path.join(handle.projectDir, 'CLAUDE.md')
    const hasClaudeMd = fs.existsSync(claudeMdPath)

    if (hasClaudeMd) {
      console.warn(
        `[KickoffOrchestrator] Implicit complete via CLAUDE.md presence — `
        + `/launch skill skipped exit gate for project ${handle.projectName}`,
      )
      this.handleCompletion({
        projectPath: handle.projectDir,
        projectName: handle.projectName,
      }, 'implicit')
      return
    }

    this.cleanupActive()
    this.emit('kickoff-timeout', { handle })
  }
```

Wichtig: `cleanupActive()` wird im Implicit-Pfad NICHT gerufen, weil `handleCompletion` es am Anfang selbst tut.

- [ ] **Step 4: Tests laufen lassen, jetzt grün**

Run: `npm run test -- --test-name-pattern="implicit complete|still fires kickoff-timeout"`
Expected: PASS — beide Tests grün.

- [ ] **Step 5: Gesamten Test-Lauf**

Run: `npm run test`
Expected: Alle 114+ Tests grün.

- [ ] **Step 6: Commit**

```bash
git add src/main/project/kickoff-orchestrator.ts test/main/kickoff-orchestrator.test.ts
git commit -m "feat(kickoff): implicit complete fallback via CLAUDE.md presence on timeout"
```

---

### Task 4: Strukturierte Log-Zeile pro Complete-Pfad

**Files:**
- Modify: `src/main/project/kickoff-orchestrator.ts`
- Modify: `test/main/kickoff-orchestrator.test.ts`

Ziel: Jeder Complete- und Hard-Fail-Pfad schreibt exakt eine Log-Zeile mit konsistentem Format, sodass wir per `grep` nachträglich die Rate der verschiedenen Pfade auswerten können.

Log-Format (einzeiliger String, key=value, in dieser Reihenfolge):
```
[KickoffOrchestrator] kickoff-result reason=<r> project=<name> path=<p>
```
Wobei `<r>` eines von `normal|marker|implicit|hard-fail` ist (die drei Complete-Reasons + ein `hard-fail` für den echten Timeout ohne CLAUDE.md).

- [ ] **Step 1: Failing test — jeder der vier Pfade schreibt genau eine passende Log-Zeile**

Im `test/main/kickoff-orchestrator.test.ts`, am Ende der `describe`-Block, neuer Test. Wir brauchen einen Console-Capture-Helper — den fügen wir ganz oben nach den Imports ein (einmal für die ganze Datei):

1. Nach den bestehenden Imports einfügen:

```ts
/** Captures console.log + console.warn output for assertions. */
function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const origLog = console.log
  const origWarn = console.warn
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  return {
    lines,
    restore: () => { console.log = origLog; console.warn = origWarn },
  }
}
```

2. Vor dem schließenden `})` des describe-Blocks, neuer Test:

```ts
  it('emits one structured log line per complete path', async () => {
    // Pfad A: reason=normal (via handleCompletion).
    const cap1 = captureConsole()
    await orchestrator.start({ projectDir })
    orchestrator.handleCompletion({ projectPath: projectDir, projectName: 'my-project' })
    await new Promise((r) => setTimeout(r, 80))
    cap1.restore()
    const normalLogs = cap1.lines.filter((l) => l.includes('kickoff-result'))
    assert.equal(normalLogs.length, 1, `normal path: expected 1 log line, got ${normalLogs.length}`)
    assert.match(normalLogs[0], /reason=normal/)
    assert.match(normalLogs[0], /project=my-project/)
    orchestrator.destroy()

    // Pfad B: reason=marker (via marker file).
    const fresh = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 60_000,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })
    const cap2 = captureConsole()
    await fresh.start({ projectDir })
    fs.writeFileSync(path.join(projectDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 200))
    cap2.restore()
    const markerLogs = cap2.lines.filter((l) => l.includes('kickoff-result'))
    assert.equal(markerLogs.length, 1, `marker path: expected 1 log line, got ${markerLogs.length}`)
    assert.match(markerLogs[0], /reason=marker/)
    fresh.destroy()
    fs.rmSync(path.join(projectDir, '.kickoff-complete'))

    // Pfad C: reason=implicit (Timeout mit CLAUDE.md).
    const impl = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 80,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })
    fs.writeFileSync(path.join(projectDir, 'CLAUDE.md'), '# x', 'utf-8')
    const cap3 = captureConsole()
    await impl.start({ projectDir })
    await new Promise((r) => setTimeout(r, 300))
    cap3.restore()
    const implLogs = cap3.lines.filter((l) => l.includes('kickoff-result'))
    assert.equal(implLogs.length, 1, `implicit path: expected 1 log line, got ${implLogs.length}`)
    assert.match(implLogs[0], /reason=implicit/)
    impl.destroy()
    fs.rmSync(path.join(projectDir, 'CLAUDE.md'))

    // Pfad D: reason=hard-fail (Timeout ohne CLAUDE.md).
    const hard = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 80,
      pollIntervalMs: 30,
      promptSendDelayMs: 10,
      interviewSendDelayMs: 10,
    })
    const cap4 = captureConsole()
    await hard.start({ projectDir })
    await new Promise((r) => setTimeout(r, 300))
    cap4.restore()
    const hardLogs = cap4.lines.filter((l) => l.includes('kickoff-result'))
    assert.equal(hardLogs.length, 1, `hard-fail path: expected 1 log line, got ${hardLogs.length}`)
    assert.match(hardLogs[0], /reason=hard-fail/)
    hard.destroy()
  })
```

- [ ] **Step 2: Tests laufen lassen, Fehler bestätigen**

Run: `npm run test -- --test-name-pattern="structured log line"`
Expected: FAIL — die Log-Zeilen existieren noch nicht (bzw. nur die Implicit-Warnung aus Task 3, aber die matched nicht `kickoff-result`).

- [ ] **Step 3: Log-Zeile in `handleCompletion` schreiben**

In `src/main/project/kickoff-orchestrator.ts`, direkt nach dem Block `this.active = { handle, watcher, promptSendTimer }` innerhalb von `handleCompletion`, aber VOR dem `setTimeout` / SessionManager-start-Block — genauer: am Anfang von `handleCompletion`, direkt nach `this.cleanupActive()`:

```ts
  handleCompletion(
    payload: KickoffCompletionPayload,
    reason: KickoffCompleteReason = 'normal',
  ): void {
    if (!this.active) return
    const active = this.active
    this.cleanupActive()

    const effectiveName = payload.projectName || active.handle.projectName
    const effectivePath = payload.projectPath || active.handle.projectDir
    console.log(
      `[KickoffOrchestrator] kickoff-result reason=${reason} `
      + `project=${effectiveName} path=${effectivePath}`,
    )

    const interviewDelay = this.deps.interviewSendDelayMs ?? DEFAULT_INTERVIEW_SEND_DELAY_MS
    // ... rest of the method unchanged
```

- [ ] **Step 4: Log-Zeile in `handleTimeout` (Hard-Fail-Pfad) schreiben**

In `src/main/project/kickoff-orchestrator.ts`, im `handleTimeout`, nach dem Implicit-Early-Return, aber VOR `this.emit('kickoff-timeout', …)`:

```ts
    if (hasClaudeMd) {
      console.warn(
        `[KickoffOrchestrator] Implicit complete via CLAUDE.md presence — `
        + `/launch skill skipped exit gate for project ${handle.projectName}`,
      )
      this.handleCompletion({
        projectPath: handle.projectDir,
        projectName: handle.projectName,
      }, 'implicit')
      return
    }

    console.error(
      `[KickoffOrchestrator] kickoff-result reason=hard-fail `
      + `project=${handle.projectName} path=${handle.projectDir}`,
    )
    this.cleanupActive()
    this.emit('kickoff-timeout', { handle })
```

Hinweis: `console.error` ist bewusst — ein Hard-Fail ist ein Fehler, der aufmerksam wahrgenommen werden soll. Die `captureConsole`-Helfer-Funktion im Test hat `console.log` + `console.warn` abgefangen — wir müssen sie um `console.error` erweitern, sonst findet der Hard-Fail-Test die Zeile nicht.

- [ ] **Step 5: `captureConsole` um `console.error` erweitern**

Im `test/main/kickoff-orchestrator.test.ts`, den `captureConsole`-Helper (aus Step 1) ersetzen durch:

```ts
/** Captures console.log + console.warn + console.error output for assertions. */
function captureConsole(): { lines: string[]; restore: () => void } {
  const lines: string[] = []
  const origLog = console.log
  const origWarn = console.warn
  const origError = console.error
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  console.warn = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  return {
    lines,
    restore: () => {
      console.log = origLog
      console.warn = origWarn
      console.error = origError
    },
  }
}
```

- [ ] **Step 6: Tests laufen lassen, jetzt grün**

Run: `npm run test -- --test-name-pattern="structured log line"`
Expected: PASS.

- [ ] **Step 7: Gesamten Test-Lauf**

Run: `npm run test`
Expected: Alle 115+ Tests grün.

- [ ] **Step 8: Commit**

```bash
git add src/main/project/kickoff-orchestrator.ts test/main/kickoff-orchestrator.test.ts
git commit -m "feat(kickoff): structured log line per complete path (normal/marker/implicit/hard-fail)"
```

---

### Task 5: `/launch`-Skill: Handover als verbindliche Phase

**Files:**
- Modify: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/.claude/skills/launch/SKILL.md`

Wichtig: Dieser Task ändert eine Datei in einem **anderen Git-Repo**. Stelle sicher, dass du dort getrennt committest.

- [ ] **Step 1: Den bisherigen „Schritt 8: Completion signalisieren"-Block lesen**

Öffne `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/.claude/skills/launch/SKILL.md` und lokalisiere die Zeilen ab „## Schritt 8: Completion signalisieren" (aktuell ca. Zeile 121–143).

- [ ] **Step 2: Den Block ersetzen**

Ersetze den kompletten Block von „## Schritt 8: Completion signalisieren" bis (ausschließlich) „## Schritt 9: Ausgabe" durch:

```markdown
## Schritt 8: Handover — verbindlicher Exit-Gate

Dieser Schritt ist kein Housekeeping, sondern Teil der Aufgabe.

Dein Job ist erst erledigt, wenn cipher-mux weiß, dass er das Projekt öffnen soll.
Ohne dieses Signal bleibt die Follow-up-Session zu, der User sitzt auf einem
fertigen Scaffold ohne weiterführenden Prompt, und muss manuell rescannen.
Das ist der Fehlerfall, den du hier vermeidest.

Du signalisierst Completion über **zwei Wege — in genau dieser Reihenfolge**:

### Primary: Marker-Datei schreiben

```bash
touch "<projectPath>/.kickoff-complete"
```

Das ist der verbindliche Signal-Pfad. Ein leeres `touch` genügt — cipher-mux
reagiert auf das Anlegen der Datei. Die Marker-Datei ist idempotent (mehrfach
anlegen ist harmlos) und funktioniert auch dann, wenn der MCP-Server nicht
erreichbar ist.

### Bonus: MCP-Tool aufrufen

Wenn du das MCP-Tool `kickoff_complete` in deinem Werkzeug-Inventar siehst,
ruf es zusätzlich auf:

```json
{
  "name": "kickoff_complete",
  "arguments": {
    "projectPath": "<absoluter Pfad>",
    "projectName": "<kebab-case>",
    "detectedStack": "<z.B. electron-ts, kotlin-android, python, go, rust, unknown>"
  }
}
```

Das Tool ist strukturierter (liefert `detectedStack`) und hat Priorität gegenüber
der Marker-Datei. Falls du es nicht siehst oder der Aufruf scheitert: ignoriere
das — die Marker-Datei reicht.

### Wann bist du fertig?

- Marker-Datei wurde geschrieben → **✓ Minimum erreicht**
- Zusätzlich MCP-Call erfolgreich → **✓✓ Optimaler Pfad**

Wenn du weder das eine noch das andere hinbekommst, ist das ein harter Fehler
— sag dem User explizit, dass du den Exit-Gate nicht setzen konntest, damit er
manuell rescannen kann.
```

- [ ] **Step 3: „Schritt 9: Ausgabe"-Block überprüfen — Kontext anpassen**

Der existierende Schritt 9 (die User-facing Anleitung) bleibt inhaltlich erhalten, aber der Übergang muss sich mit der neuen Schritt-8-Überschrift verstehen lassen. Prüfe den Abschnitt und passe nur die erste Zeile an, wenn nötig (zum Beispiel das Komma nach „Wenn du durch bist" etc.).

Keine inhaltliche Änderung — nur sicherstellen, dass die Reihenfolge im Dokument stimmt.

- [ ] **Step 4: Commit im projectlauncher-Repo**

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher
git add .claude/skills/launch/SKILL.md
git commit -m "feat(launch): exit gate als verbindliche handover phase, marker primary"
```

---

### Task 6: Issue-Status aktualisieren

**Files:**
- Modify: `docs/issues/ISSUE-launch-skill-skipped-completion.md`

- [ ] **Step 1: Status-Zeile und Referenz-Block anpassen**

Im Kopf des Issues (ca. Zeile 3) ersetze:

```
**Status:** offen
```

durch:

```
**Status:** in implementation (Plan 1, `docs/superpowers/plans/2026-04-16-launcher-exit-gate-resilience.md`)
```

Und am Ende der Datei (nach der „## Referenz"-Liste), neue Sektion anhängen:

```markdown

## Implementierungs-Bezug

Behoben durch Plan 1 (Exit-Gate & Orchestrator-Resilienz) — siehe
`docs/superpowers/plans/2026-04-16-launcher-exit-gate-resilience.md`.

Konkret:
- `/launch`-Skill Schritt 8 → eigene verbindliche Handover-Phase (Marker als Primary)
- `KickoffOrchestrator`: CLAUDE.md-Existenz-Check im Timeout-Pfad als impliziter Complete
- Structured Logging (`kickoff-result reason=…`) für späteres Messen der Pfade
```

- [ ] **Step 2: Commit**

```bash
git add docs/issues/ISSUE-launch-skill-skipped-completion.md
git commit -m "docs(issue): link launch-skill-skipped-completion issue to plan 1"
```

---

### Task 7: Manuelle End-to-End-Validierung

**Files:** Keine Änderung — nur Verifikation.

- [ ] **Step 1: Build**

Run: `npm run build`
Expected: Erfolgreich, kein TypeScript-Error.

- [ ] **Step 2: Linter**

Run: `npm run lint`
Expected: Keine neuen Warnings in den geänderten Dateien.

- [ ] **Step 3: Vollständiger Testlauf**

Run: `npm run test`
Expected: Alle Tests grün (115+), insbesondere:
- `tags kickoff-complete reason=marker when triggered via marker file`
- `tags kickoff-complete reason=normal when triggered via MCP handleCompletion`
- `treats timeout as implicit complete when CLAUDE.md exists in projectDir`
- `still fires kickoff-timeout when CLAUDE.md is absent at timeout`
- `emits one structured log line per complete path`

- [ ] **Step 4: Dev-Run Smoke-Test**

Run: `npm run dev`

Dann in der App:
1. Drücke `Cmd+N` → Kickoff-Dialog öffnet.
2. Wähle ein vorhandenes Test-Obsidian-Verzeichnis mit Konzept-Datei (Absprache mit cipher — z.B. dasselbe Verzeichnis, das beim 2026-04-16-Smoke-Test benutzt wurde, aber eine Kopie).
3. Target-Dir: neues, leeres Temp-Verzeichnis.
4. Warte auf Launcher-Session, bis `/launch` durchgelaufen ist.
5. Prüfe: Marker-Datei `.kickoff-complete` existiert im Target-Dir (`ls -la`).
6. Prüfe: Follow-up-Session hat sich geöffnet.
7. Prüfe: Console (Terminal, wo `npm run dev` läuft) zeigt genau eine Zeile `[KickoffOrchestrator] kickoff-result reason=<marker|normal> project=… path=…`.

Expected: Alle sieben Punkte grün. Wenn `reason=implicit` erscheint, hat der neue Skill Schritt 8 immer noch übersprungen — dann muss Task 5 nachgebessert werden (vermutlich ist das Verbindlichkeits-Wording noch nicht stark genug).

- [ ] **Step 5: Ergebnis notieren**

Hänge das Ergebnis als kurze Notiz an das Issue an (`docs/issues/ISSUE-launch-skill-skipped-completion.md`), am Ende:

```markdown

## Verifikation 2026-04-XX

End-to-End-Test mit neuem /launch-Skill + resilientem Orchestrator:
- reason=<gemessen>
- Marker-Datei: <existiert|fehlt>
- Follow-up-Session: <geöffnet|nicht geöffnet>

[Ggf. Fazit, ob Plan 2 Template-Tiefe notwendig bleibt oder ob das Grundproblem
weiter besteht.]
```

Und committen:

```bash
git add docs/issues/ISSUE-launch-skill-skipped-completion.md
git commit -m "docs(issue): record verification result for plan 1"
```

---

## Spec-Coverage-Check

| Spec-Forderung | Abgedeckt in |
|---|---|
| Marker-Datei als Primary, MCP-Call als Bonus (Skill-Seite) | Task 5 |
| Verbindliche Handover-Phase im Skill (nicht informell) | Task 5 |
| CLAUDE.md-Existenz-Check als implicit-complete-Fallback im Orchestrator | Task 3 |
| Structured Logging der Complete-Pfade (normal/marker/implicit/hard-fail) | Task 4 |
| Issue-Status-Pflege | Task 6 |
| End-to-End-Validierung | Task 7 |

**Nicht in Plan 1 (gehört in Plan 2):** Template-Tiefe, Subagent-Parallelisierung beim Input, Streichung der Schritte 5/6/9 im Skill, Projekt-Skills `/decide` + `/doc-review`-Refactor, CLAUDE.md-Template-Rewrite.

---

## Post-Plan

Wenn Plan 1 durch ist, ist cipher-mux-electron produktionsreif für den nächsten Kickoff-Versuch — egal ob der `/launch`-Skill den MCP-Call richtig absetzt oder nur die Marker-Datei schreibt. Die strukturierten Logs geben uns nach ein paar Kickoffs die Datengrundlage, ob Plan 2 auch den Skill-Refactor priorisieren muss oder ob primär die Template-Tiefe dran ist.
