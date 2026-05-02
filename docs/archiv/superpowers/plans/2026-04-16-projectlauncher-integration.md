# Projektlauncher-Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cipher-mux-electron wird Orchestrator des existierenden `/launch`-Skills: User pastet Obsidian-Verzeichnis, cipher-mux startet eine sichtbare Launcher-Session in `projectlauncher/`, wartet auf das `kickoff_complete`-Signal und öffnet dann eine Folge-Session im Projekt mit `/interview`.

**Architecture:** Neuer `KickoffOrchestrator` ersetzt den alten `KickoffManager`. Orchestrator nutzt `SessionManager` für beide tmux-Sessions (Launcher + Folge). Ein neues MCP-Tool `kickoff_complete` dient als strukturiertes Completion-Signal; Marker-Datei `.kickoff-complete` als Fallback; Timeout als letzter Fallback. Natürlich formulierter Launcher-Prompt (kein Bullet-Stil). Der `/launch`-Skill selbst wird erweitert, um einen Merge-Modus für existierende Verzeichnisse zu unterstützen.

**Tech Stack:** TypeScript strict, Electron Main+Preload+Renderer, Preact/JSX im Renderer, Node test runner (`node:test`) mit assert/strict für Unit-Tests, `chokidar`-freie Simple-Watch via `fs.watch` (keine neue Dependency), tmux via bestehendem `TmuxManager`.

---

## File Structure Overview

**Create:**
- `src/main/project/kickoff-orchestrator.ts` — Kern-Klasse (validate, prep, start launcher, await completion, open follow-up)
- `src/main/project/launcher-prompt.ts` — Reiner String-Builder für den natürlich formulierten Prompt
- `src/main/project/kickoff-watcher.ts` — Marker-File-Fallback-Watch mit Timeout
- `test/main/kickoff-orchestrator.test.ts` — Unit-Tests für Orchestrator
- `test/main/launcher-prompt.test.ts` — Unit-Tests für Prompt-Builder
- `test/main/kickoff-watcher.test.ts` — Unit-Tests für Watcher

**Modify:**
- `src/shared/ipc-channels.ts` — neuer Event-Channel `PROJECT_KICKOFF_COMPLETED`
- `src/shared/types.ts` — neue `KickoffRequest`/`KickoffHandle`/`KickoffCompletionPayload`-Typen, `AppConfig` erweitern
- `src/shared/constants.ts` — `PROJECTLAUNCHER_DIR_DEFAULT`, `KICKOFF_TIMEOUT_MIN_DEFAULT`
- `src/main/config/config-store.ts` — Default-Values für neue Config-Keys
- `src/main/mcp/mcp-tools.ts` — Tool `kickoff_complete` registrieren + `kickoffOrchestrator`-Ref in `ToolContext`
- `src/main/ipc-hub.ts` — `KickoffManager` durch `KickoffOrchestrator` ersetzen, in ToolContext einhängen, Event-Forwarding
- `src/main/preload.ts` — `projects.kickoff` Signatur anpassen, neuer `onCompleted`-Listener
- `src/renderer/components/KickoffDialog.tsx` — komplettes Redesign: 3 Felder
- `src/renderer/app.tsx` — `handleKickoff` auf neue Signatur umstellen, Listener auf `PROJECT_KICKOFF_COMPLETED`

**Delete:**
- `src/main/project/kickoff-manager.ts` — ersetzt durch Orchestrator
- `test/main/kickoff-manager.test.ts` — Tests werden durch neue Orchestrator-Tests ersetzt

**Modify (im Nachbar-Repo `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/`):**
- `.claude/skills/launch/SKILL.md` — Merge-Modus hinzufügen, MCP-Tool-Call am Ende, Marker-Datei-Fallback

**Modify (Doku):**
- `docs/TESTCASE.md` — Tests 11–13 ergänzen

---

### Task 1: Shared Types und IPC-Channel

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/ipc-channels.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: Neue Typen in `src/shared/types.ts` hinzufügen**

Ersetze das bestehende `// ─── Kickoff ───` Segment (aktuell nur `KickoffOpts`) durch:

```ts
// ─── Kickoff ───────────────────────────────────────────────

export interface KickoffRequest {
  /** Absoluter Pfad zum existierenden Projekt-Verzeichnis (aus Obsidian). */
  projectDir: string
  /** Optional: absoluter Pfad zu einer externen Anforderungsdatei beliebigen Formats. */
  requirementsFile?: string
  /** Optional: zusätzlicher Freitext-Kontext für den Launcher-Prompt. */
  extraContext?: string
}

export interface KickoffHandle {
  /** ID der sichtbaren Launcher-tmux-Session. */
  launcherSessionId: string
  /** Normalisierter absoluter Pfad zum Projekt-Verzeichnis. */
  projectDir: string
  /** Aus Verzeichnisnamen abgeleiteter Projektname. */
  projectName: string
}

export interface KickoffCompletionPayload {
  /** Absoluter Pfad zum fertig aufgesetzten Projekt-Verzeichnis. */
  projectPath: string
  /** Projektname (aus Verzeichnisnamen). */
  projectName: string
  /** Vom /launch-Skill erkannter Tech-Stack — optional. */
  detectedStack?: string
}

export interface KickoffCompletedEvent {
  handle: KickoffHandle
  payload: KickoffCompletionPayload
  /** ID der neu gestarteten Folge-Session (im Projekt-Verzeichnis). */
  followupSessionId: string
}
```

Das alte `KickoffOpts`-Interface wird **ersatzlos entfernt** (inkl. des `autoInterview`-Felds — neuer Flow hat keinen Toggle).

- [ ] **Step 2: IPC-Channel ergänzen in `src/shared/ipc-channels.ts`**

Innerhalb des `IPC`-Objekts im `// Projects`-Block ergänzen:

```ts
  // Projects
  PROJECTS_LIST: 'cipher-mux:projects:list',
  PROJECTS_SCAN: 'cipher-mux:projects:scan',
  PROJECTS_KICKOFF: 'cipher-mux:projects:kickoff',
  PROJECT_KICKOFF_COMPLETED: 'cipher-mux:projects:kickoff-completed',
```

- [ ] **Step 3: Konstanten ergänzen in `src/shared/constants.ts`**

Am Ende der Datei anfügen:

```ts
/** Default path to the projectlauncher working directory. */
export const PROJECTLAUNCHER_DIR_DEFAULT =
  '/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher'

/** Default kickoff timeout (minutes) — how long we wait for a completion signal. */
export const KICKOFF_TIMEOUT_MIN_DEFAULT = 15
```

- [ ] **Step 4: Verify build of shared files**

Run: `npx tsc -p tsconfig.json --noEmit 2>&1 | head -40`
Expected: no errors related to the shared files. (If there are errors referencing `KickoffOpts` in other files, they are expected — they'll be fixed in later tasks.)

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/shared/ipc-channels.ts src/shared/constants.ts
git commit -m "feat(kickoff): shared types and constants for new orchestrator flow"
```

---

### Task 2: AppConfig erweitern + Config-Store-Defaults

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/config/config-store.ts`

- [ ] **Step 1: `AppConfig`-Interface in `src/shared/types.ts` erweitern**

Das `AppConfig`-Interface hat einen `app`-Block. Dort zwei Felder anfügen:

```ts
export interface AppConfig {
  app: {
    scanPaths: string[]
    scanDepth: number
    defaultProjectDir: string
    maxSessions: number
    messageRetentionDays: number
    /** Path to the projectlauncher working directory. */
    projectlauncherPath: string
    /** Minutes to wait for a kickoff completion signal before warning. */
    kickoffTimeoutMinutes: number
  }
  // ...rest unchanged
}
```

- [ ] **Step 2: Defaults in `src/main/config/config-store.ts` erweitern**

Lies zunächst die Datei, um den aktuellen Default-Config-Aufbau zu sehen:

Run: `cat src/main/config/config-store.ts | head -60`

Im Default-Config-Block den `app`-Abschnitt um die beiden neuen Felder erweitern. Import der neuen Konstanten ergänzen:

```ts
import {
  DEFAULT_SCAN_PATHS,
  DEFAULT_PROJECT_DIR,
  DEFAULT_SCAN_DEPTH,
  MAX_SESSIONS,
  MESSAGE_RETENTION_DAYS,
  MCP_DEFAULT_PORT,
  MCP_DEFAULT_HOST,
  ORCHESTRATOR_DIR,
  ORCHESTRATOR_MAX_RETRIES,
  PROJECTLAUNCHER_DIR_DEFAULT,
  KICKOFF_TIMEOUT_MIN_DEFAULT,
} from '../../shared/constants'
```

Und im Default-Objekt unter `app:`:

```ts
app: {
  scanPaths: DEFAULT_SCAN_PATHS,
  scanDepth: DEFAULT_SCAN_DEPTH,
  defaultProjectDir: DEFAULT_PROJECT_DIR,
  maxSessions: MAX_SESSIONS,
  messageRetentionDays: MESSAGE_RETENTION_DAYS,
  projectlauncherPath: PROJECTLAUNCHER_DIR_DEFAULT,
  kickoffTimeoutMinutes: KICKOFF_TIMEOUT_MIN_DEFAULT,
},
```

- [ ] **Step 3: Build check**

Run: `npx tsc -p tsconfig.main.json --noEmit 2>&1 | grep -i "types.ts\|constants\|config-store" | head -10`
Expected: no errors from these three files.

- [ ] **Step 4: Commit**

```bash
git add src/shared/types.ts src/main/config/config-store.ts
git commit -m "feat(kickoff): extend AppConfig with projectlauncher path and timeout"
```

---

### Task 3: Prompt-Builder (`launcher-prompt.ts`)

**Files:**
- Create: `src/main/project/launcher-prompt.ts`
- Test: `test/main/launcher-prompt.test.ts`

Der Prompt-Builder ist eine reine Funktion — bestens geeignet für TDD. Er erzeugt den natürlich formulierten Launcher-Prompt aus den drei Input-Feldern.

- [ ] **Step 1: Write the failing test** (`test/main/launcher-prompt.test.ts`)

```ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { buildLauncherPrompt } from '../../src/main/project/launcher-prompt'

describe('buildLauncherPrompt', () => {
  it('includes the project directory path', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/path/to/proj' })
    assert.ok(prompt.includes('/path/to/proj'))
  })

  it('mentions merge-mode for existing directory', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt, /merge/i)
    assert.match(prompt, /existiert schon/i)
  })

  it('references cipher-boox as quality baseline', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(prompt.includes('cipher-boox'))
  })

  it('mentions subagent usage', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt, /subagent/i)
  })

  it('includes requirements file path when provided', () => {
    const prompt = buildLauncherPrompt({
      projectDir: '/any',
      requirementsRelPath: 'docs/requirements.docx',
    })
    assert.ok(prompt.includes('docs/requirements.docx'))
  })

  it('omits requirements hint when no file provided', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    // The "Anforderungsdatei:" hint only appears when a relpath is given.
    assert.ok(!prompt.includes('Anforderungsdatei:'))
  })

  it('embeds extra context verbatim', () => {
    const prompt = buildLauncherPrompt({
      projectDir: '/any',
      extraContext: 'Stack ist Kotlin + Compose. Referenz: cipher-android.',
    })
    assert.ok(prompt.includes('Kotlin + Compose'))
    assert.ok(prompt.includes('cipher-android'))
  })

  it('instructs to call kickoff_complete MCP tool', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(prompt.includes('kickoff_complete'))
  })

  it('mentions the fallback marker file', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.ok(prompt.includes('.kickoff-complete'))
  })

  it('ends with /launch invocation', () => {
    const prompt = buildLauncherPrompt({ projectDir: '/any' })
    assert.match(prompt.trimEnd(), /\/launch\s*$/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/main/launcher-prompt.test.ts 2>&1 | head -30`
Expected: FAIL with "Cannot find module" or similar (file doesn't exist yet).

- [ ] **Step 3: Write the prompt builder** (`src/main/project/launcher-prompt.ts`)

```ts
/**
 * Build the prompt sent to the /launch skill in projectlauncher/.
 *
 * The prompt is deliberately written in a natural, engaging tone — LLMs
 * respond with richer output to human-sounding prompts than to clinical
 * bullet-lists. See memory/feedback_prompt_style.md for context.
 */

export interface LauncherPromptInput {
  /** Absolute path to the existing project directory. */
  projectDir: string
  /**
   * Relative path (inside projectDir) to the requirements file, if we copied
   * an external file in. Omit if the user put the requirements in the dir
   * themselves and we don't want to prescribe a location.
   */
  requirementsRelPath?: string
  /** Optional free-form context the user typed in the dialog. */
  extraContext?: string
}

const BOOX_BASELINE =
  '/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox'

export function buildLauncherPrompt(input: LauncherPromptInput): string {
  const reqHint = input.requirementsRelPath
    ? `Die Anforderungsdatei: ${input.requirementsRelPath} (relativ zum Projekt-Verzeichnis).\n\n`
    : ''

  const extra = input.extraContext?.trim()
    ? `Zusätzlicher Kontext von cipher:\n\n${input.extraContext.trim()}\n\n`
    : ''

  return `Hey, cipher setzt ein neues Projekt auf. In Obsidian hat er schon ein Verzeichnis angelegt und sein Konzept dort abgelegt:

    ${input.projectDir}

${reqHint}Lies die Anforderungen gründlich — nicht oberflächlich — und versteh, worum es wirklich geht, bevor du scaffoldest.

Das Verzeichnis existiert schon, also merge das Template rein statt neu anzulegen: vorhandene Dateien bleiben, \`.claude/\`, \`docs/SPEC.md\`-Skelett, \`.gitignore\`, Platzhalter etc. kommen dazu.

Qualitäts-Baseline: ${BOOX_BASELINE}
Schau dir an, wie tief die ADRs, die Modulstruktur und die Referenzen dort sind. Der Launcher-Output muss dieses Niveau anstreben. Nutz Subagenten parallel — einer für Requirements-Tiefenanalyse, einer für Tech-Stack + Referenz-Projekt-Matching, einer für ADR-Ableitung aus den Anforderungen.

${extra}Wenn du fertig bist, ruf das MCP-Tool \`kickoff_complete\` auf mit \`{ projectPath, projectName, detectedStack }\`. Als Fallback: schreib eine leere Datei \`.kickoff-complete\` ins Projekt-Verzeichnis.

/launch`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/main/launcher-prompt.test.ts 2>&1 | tail -15`
Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/project/launcher-prompt.ts test/main/launcher-prompt.test.ts
git commit -m "feat(kickoff): launcher prompt builder with natural tone"
```

---

### Task 4: Kickoff-Watcher (Marker-File + Timeout Fallback)

**Files:**
- Create: `src/main/project/kickoff-watcher.ts`
- Test: `test/main/kickoff-watcher.test.ts`

Dieser Watcher ist der Fallback-Mechanismus: wenn das MCP-Tool nicht gerufen wird, triggern wir über eine Marker-Datei `.kickoff-complete` im Projekt-Verzeichnis oder nach Timeout. Kein externer File-Watch-Dependency — wir nutzen `fs.watch` und Polling als Backup.

- [ ] **Step 1: Write the failing test** (`test/main/kickoff-watcher.test.ts`)

```ts
import { describe, it, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { KickoffWatcher } from '../../src/main/project/kickoff-watcher'

describe('KickoffWatcher', () => {
  let tmpDir: string
  const watchers: KickoffWatcher[] = []

  afterEach(() => {
    for (const w of watchers) w.stop()
    watchers.length = 0
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('fires onMarker when the marker file is created', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-'))

    const events: string[] = []
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 60_000,
      pollIntervalMs: 50,
      onMarker: () => events.push('marker'),
      onTimeout: () => events.push('timeout'),
    })
    watchers.push(w)
    w.start()

    // Create the marker after a short delay.
    setTimeout(() => {
      fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), '', 'utf-8')
    }, 100)

    await new Promise((r) => setTimeout(r, 300))
    assert.deepEqual(events, ['marker'])
  })

  it('fires onTimeout if no marker appears in time', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-timeout-'))

    const events: string[] = []
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 150,
      pollIntervalMs: 50,
      onMarker: () => events.push('marker'),
      onTimeout: () => events.push('timeout'),
    })
    watchers.push(w)
    w.start()

    await new Promise((r) => setTimeout(r, 300))
    assert.deepEqual(events, ['timeout'])
  })

  it('fires onMarker at most once', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-once-'))

    let markerCount = 0
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 60_000,
      pollIntervalMs: 20,
      onMarker: () => { markerCount++ },
      onTimeout: () => {},
    })
    watchers.push(w)
    w.start()

    fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 100))
    // Touch again — we want to prove the callback doesn't fire again.
    fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), 'x', 'utf-8')
    await new Promise((r) => setTimeout(r, 100))

    assert.equal(markerCount, 1)
  })

  it('stop() stops both timer and watcher', async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-watcher-stop-'))

    let fired = false
    const w = new KickoffWatcher({
      projectDir: tmpDir,
      timeoutMs: 100,
      pollIntervalMs: 20,
      onMarker: () => { fired = true },
      onTimeout: () => { fired = true },
    })
    watchers.push(w)
    w.start()
    w.stop()

    fs.writeFileSync(path.join(tmpDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 250))

    assert.equal(fired, false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/main/kickoff-watcher.test.ts 2>&1 | head -20`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement watcher** (`src/main/project/kickoff-watcher.ts`)

```ts
import * as fs from 'fs'
import * as path from 'path'

/**
 * KickoffWatcher — Watches for the `.kickoff-complete` marker file in a
 * project directory, with a hard timeout fallback.
 *
 * Uses fs.watch as primary trigger and a slow poll as Nextcloud-sync
 * safety net (fs.watch can be unreliable on networked file systems).
 */

const MARKER_FILENAME = '.kickoff-complete'

export interface KickoffWatcherOpts {
  projectDir: string
  timeoutMs: number
  /** Poll interval as a backup for fs.watch. Default 2000ms. */
  pollIntervalMs?: number
  onMarker: () => void
  onTimeout: () => void
}

export class KickoffWatcher {
  private fsWatcher: fs.FSWatcher | null = null
  private pollTimer: NodeJS.Timeout | null = null
  private timeoutTimer: NodeJS.Timeout | null = null
  private fired = false

  constructor(private opts: KickoffWatcherOpts) {}

  start(): void {
    if (this.fired) return

    const markerPath = path.join(this.opts.projectDir, MARKER_FILENAME)

    // Check immediately — marker may already exist.
    if (fs.existsSync(markerPath)) {
      this.fireMarker()
      return
    }

    // fs.watch on the directory — fires for any child entry change.
    try {
      this.fsWatcher = fs.watch(this.opts.projectDir, () => {
        if (this.fired) return
        if (fs.existsSync(markerPath)) this.fireMarker()
      })
    } catch {
      // fs.watch may fail on some filesystems — rely on polling.
    }

    // Polling backup.
    const pollMs = this.opts.pollIntervalMs ?? 2000
    this.pollTimer = setInterval(() => {
      if (this.fired) return
      if (fs.existsSync(markerPath)) this.fireMarker()
    }, pollMs)

    // Timeout.
    this.timeoutTimer = setTimeout(() => {
      if (this.fired) return
      this.fireTimeout()
    }, this.opts.timeoutMs)
  }

  stop(): void {
    if (this.fsWatcher) {
      try { this.fsWatcher.close() } catch { /* ignore */ }
      this.fsWatcher = null
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer)
      this.timeoutTimer = null
    }
  }

  private fireMarker(): void {
    if (this.fired) return
    this.fired = true
    this.stop()
    this.opts.onMarker()
  }

  private fireTimeout(): void {
    if (this.fired) return
    this.fired = true
    this.stop()
    this.opts.onTimeout()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/main/kickoff-watcher.test.ts 2>&1 | tail -15`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/main/project/kickoff-watcher.ts test/main/kickoff-watcher.test.ts
git commit -m "feat(kickoff): marker-file watcher with timeout fallback"
```

---

### Task 5: KickoffOrchestrator — Core Class

**Files:**
- Create: `src/main/project/kickoff-orchestrator.ts`
- Test: `test/main/kickoff-orchestrator.test.ts`

Der Orchestrator ist das Herzstück. Er validiert, kopiert die Requirements-Datei, baut den Prompt, startet die Launcher-Session, wartet auf Completion (MCP-Tool oder Marker-Datei), und öffnet die Folge-Session.

Wir testen hier die **Vorbereitung** (validate + file copy + prompt build) direkt; das Session-Starten wird über einen injizierten Mock-`SessionManager` abgedeckt.

- [ ] **Step 1: Write the failing test** (`test/main/kickoff-orchestrator.test.ts`)

```ts
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { EventEmitter } from 'events'
import { KickoffOrchestrator } from '../../src/main/project/kickoff-orchestrator'
import type { SessionInfo, StartSessionOpts } from '../../src/shared/types'

// Minimal SessionManager stand-in. Only the methods the orchestrator uses.
class MockSessionManager extends EventEmitter {
  public starts: StartSessionOpts[] = []
  public sendKeysCalls: Array<{ sessionId: string; keys: string }> = []

  async start(opts: StartSessionOpts): Promise<SessionInfo> {
    this.starts.push(opts)
    const id = `mock-${this.starts.length}`
    return {
      id,
      name: opts.name,
      projectPath: opts.projectPath,
      tmuxSession: `cmux-${id}`,
      tmuxPane: null,
      status: 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
  }

  async sendKeys(sessionId: string, keys: string): Promise<void> {
    this.sendKeysCalls.push({ sessionId, keys })
  }
}

describe('KickoffOrchestrator', () => {
  let tmpRoot: string
  let projectDir: string
  let launcherDir: string
  let mockSm: MockSessionManager
  let orchestrator: KickoffOrchestrator

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-orch-'))
    projectDir = path.join(tmpRoot, 'my-project')
    fs.mkdirSync(projectDir)
    launcherDir = path.join(tmpRoot, 'projectlauncher')
    fs.mkdirSync(launcherDir)
    mockSm = new MockSessionManager()
    orchestrator = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 60_000,
      pollIntervalMs: 30,
    })
  })

  afterEach(() => {
    orchestrator.destroy()
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  })

  it('rejects when projectDir does not exist', async () => {
    await assert.rejects(
      () => orchestrator.start({ projectDir: path.join(tmpRoot, 'nope') }),
      /not found|not exist/i,
    )
  })

  it('rejects when projectDir is a file, not a directory', async () => {
    const filePath = path.join(tmpRoot, 'a-file.md')
    fs.writeFileSync(filePath, 'x')
    await assert.rejects(
      () => orchestrator.start({ projectDir: filePath }),
      /not a directory/i,
    )
  })

  it('starts a launcher session in projectlauncherPath', async () => {
    const handle = await orchestrator.start({ projectDir })
    assert.equal(mockSm.starts.length, 1)
    assert.equal(mockSm.starts[0].projectPath, launcherDir)
    assert.ok(mockSm.starts[0].name.startsWith('Launcher:'))
    assert.equal(handle.projectName, 'my-project')
    assert.ok(handle.launcherSessionId)
  })

  it('copies external requirements file with original extension', async () => {
    const reqFile = path.join(tmpRoot, 'concept.docx')
    fs.writeFileSync(reqFile, 'binary-content')
    await orchestrator.start({
      projectDir,
      requirementsFile: reqFile,
    })
    const expected = path.join(projectDir, 'docs', 'requirements.docx')
    assert.ok(fs.existsSync(expected), `expected ${expected} to exist`)
    assert.equal(fs.readFileSync(expected, 'utf-8'), 'binary-content')
  })

  it('creates docs/ directory if missing before copying requirements', async () => {
    const reqFile = path.join(tmpRoot, 'req.txt')
    fs.writeFileSync(reqFile, 'hi')
    await orchestrator.start({ projectDir, requirementsFile: reqFile })
    assert.ok(fs.existsSync(path.join(projectDir, 'docs')))
  })

  it('rejects when external requirements file is unreadable', async () => {
    await assert.rejects(
      () => orchestrator.start({
        projectDir,
        requirementsFile: path.join(tmpRoot, 'missing.md'),
      }),
      /not found|not exist/i,
    )
  })

  it('sends a prompt that includes projectDir and /launch invocation', async () => {
    await orchestrator.start({ projectDir })
    // Launcher-Prompt is sent via sendKeys after autoLaunch.
    // Exact sendKeys timing is implementation detail — we assert that
    // *some* call contains the path and /launch.
    const combined = mockSm.sendKeysCalls.map((c) => c.keys).join('\n')
    assert.ok(
      combined.includes(projectDir),
      'sendKeys should include projectDir',
    )
    assert.ok(
      combined.includes('/launch'),
      'sendKeys should include /launch invocation',
    )
  })

  it('emits kickoff-complete when handleCompletion is called', async () => {
    const handle = await orchestrator.start({ projectDir })
    let fired: any = null
    orchestrator.on('kickoff-complete', (e) => { fired = e })

    orchestrator.handleCompletion({
      projectPath: projectDir,
      projectName: 'my-project',
      detectedStack: 'kotlin',
    })

    // Allow async work inside handleCompletion.
    await new Promise((r) => setTimeout(r, 50))
    assert.ok(fired, 'event not emitted')
    assert.equal(fired.handle.projectName, 'my-project')
    assert.equal(fired.payload.detectedStack, 'kotlin')
    // A follow-up session was started in projectDir.
    const followup = mockSm.starts.find((s) => s.projectPath === projectDir)
    assert.ok(followup, 'follow-up session not started')
    assert.equal(followup.name, 'my-project')
  })

  it('fires kickoff-timeout if neither MCP nor marker signals arrive', async () => {
    // Short-timeout orchestrator for this test.
    const shortOrch = new KickoffOrchestrator({
      sessionManager: mockSm as any,
      projectlauncherPath: launcherDir,
      timeoutMs: 100,
      pollIntervalMs: 30,
    })
    let timedOut = false
    shortOrch.on('kickoff-timeout', () => { timedOut = true })
    await shortOrch.start({ projectDir })
    await new Promise((r) => setTimeout(r, 250))
    assert.equal(timedOut, true)
    shortOrch.destroy()
  })

  it('fires kickoff-complete via marker-file fallback', async () => {
    const handle = await orchestrator.start({ projectDir })
    let completeFired = false
    orchestrator.on('kickoff-complete', () => { completeFired = true })
    fs.writeFileSync(path.join(projectDir, '.kickoff-complete'), '', 'utf-8')
    await new Promise((r) => setTimeout(r, 200))
    assert.equal(completeFired, true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/main/kickoff-orchestrator.test.ts 2>&1 | head -30`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the orchestrator** (`src/main/project/kickoff-orchestrator.ts`)

```ts
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import type { SessionManager } from '../session/session-manager'
import type {
  KickoffRequest,
  KickoffHandle,
  KickoffCompletionPayload,
  KickoffCompletedEvent,
} from '../../shared/types'
import { buildLauncherPrompt } from './launcher-prompt'
import { KickoffWatcher } from './kickoff-watcher'

export interface KickoffOrchestratorDeps {
  sessionManager: SessionManager
  projectlauncherPath: string
  /** Timeout for kickoff completion signal. */
  timeoutMs: number
  /** Marker-file poll interval. Default 2000ms. */
  pollIntervalMs?: number
}

interface ActiveKickoff {
  handle: KickoffHandle
  watcher: KickoffWatcher
  promptSendTimer: NodeJS.Timeout | null
}

/**
 * Delay after the launcher session is created before we send the /launch
 * prompt via sendKeys. This gives claude time to boot up after
 * autoLaunch fires on TERMINAL_READY. 5s is generous but safe.
 */
const PROMPT_SEND_DELAY_MS = 5_000

/**
 * Delay after the follow-up session is created before we send /interview.
 * Same reasoning as PROMPT_SEND_DELAY_MS.
 */
const INTERVIEW_SEND_DELAY_MS = 5_000

const AUTOLAUNCH_CLAUDE = 'clear; claude --dangerously-skip-permissions\n'

export class KickoffOrchestrator extends EventEmitter {
  private active: ActiveKickoff | null = null

  constructor(private deps: KickoffOrchestratorDeps) {
    super()
  }

  async start(req: KickoffRequest): Promise<KickoffHandle> {
    if (this.active) {
      throw new Error('A kickoff is already in progress')
    }

    // 1. Validate project directory.
    const projectDir = path.resolve(req.projectDir)
    if (!fs.existsSync(projectDir)) {
      throw new Error(`Project directory does not exist: ${projectDir}`)
    }
    const projStat = fs.statSync(projectDir)
    if (!projStat.isDirectory()) {
      throw new Error(`Project path is not a directory: ${projectDir}`)
    }

    // 2. Handle optional requirements file (copy, preserve extension).
    let requirementsRelPath: string | undefined
    if (req.requirementsFile) {
      const src = path.resolve(req.requirementsFile)
      if (!fs.existsSync(src)) {
        throw new Error(`Requirements file not found: ${src}`)
      }
      const docsDir = path.join(projectDir, 'docs')
      fs.mkdirSync(docsDir, { recursive: true })
      const ext = path.extname(src) // includes leading dot, may be empty
      const destName = `requirements${ext}`
      const dest = path.join(docsDir, destName)
      fs.copyFileSync(src, dest)
      requirementsRelPath = path.join('docs', destName)
    }

    const projectName = path.basename(projectDir)

    // 3. Build the launcher prompt.
    const prompt = buildLauncherPrompt({
      projectDir,
      requirementsRelPath,
      extraContext: req.extraContext,
    })

    // 4. Start the launcher tmux session in projectlauncherPath.
    const session = await this.deps.sessionManager.start({
      name: `Launcher: ${projectName}`,
      projectPath: this.deps.projectlauncherPath,
      autoLaunch: AUTOLAUNCH_CLAUDE,
    })

    const handle: KickoffHandle = {
      launcherSessionId: session.id,
      projectDir,
      projectName,
    }

    // 5. Schedule the prompt send after claude has had time to boot.
    const promptSendTimer = setTimeout(() => {
      this.deps.sessionManager
        .sendKeys(session.id, prompt + '\n')
        .catch((err) => {
          console.error('[KickoffOrchestrator] sendKeys failed:', err)
        })
    }, PROMPT_SEND_DELAY_MS)

    // 6. Watch for completion via marker-file + timeout.
    const watcher = new KickoffWatcher({
      projectDir,
      timeoutMs: this.deps.timeoutMs,
      pollIntervalMs: this.deps.pollIntervalMs,
      onMarker: () => {
        this.handleCompletion({
          projectPath: projectDir,
          projectName,
        })
      },
      onTimeout: () => {
        this.handleTimeout()
      },
    })
    watcher.start()

    this.active = { handle, watcher, promptSendTimer }

    return handle
  }

  /**
   * Called by the kickoff_complete MCP tool handler. Idempotent — if the
   * watcher's marker-file already fired, this call is ignored.
   */
  handleCompletion(payload: KickoffCompletionPayload): void {
    if (!this.active) return
    const active = this.active
    this.cleanupActive()

    // Start the follow-up session in the project dir.
    this.deps.sessionManager.start({
      name: active.handle.projectName,
      projectPath: active.handle.projectDir,
      autoLaunch: AUTOLAUNCH_CLAUDE,
    }).then((followup) => {
      // Queue the /interview prompt after claude has booted.
      setTimeout(() => {
        this.deps.sessionManager
          .sendKeys(followup.id, '/interview\n')
          .catch((err) => {
            console.error('[KickoffOrchestrator] /interview sendKeys failed:', err)
          })
      }, INTERVIEW_SEND_DELAY_MS)

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
    }).catch((err) => {
      console.error('[KickoffOrchestrator] follow-up session start failed:', err)
      this.emit('kickoff-error', { handle: active.handle, error: err })
    })
  }

  private handleTimeout(): void {
    if (!this.active) return
    const handle = this.active.handle
    this.cleanupActive()
    this.emit('kickoff-timeout', { handle })
  }

  private cleanupActive(): void {
    if (!this.active) return
    this.active.watcher.stop()
    if (this.active.promptSendTimer) {
      clearTimeout(this.active.promptSendTimer)
    }
    this.active = null
  }

  destroy(): void {
    this.cleanupActive()
    this.removeAllListeners()
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test test/main/kickoff-orchestrator.test.ts 2>&1 | tail -25`
Expected: all 10 tests pass. If a test fails due to timing (sendKeys not having fired yet in "sends a prompt..." test), widen the wait in that test to 5500ms (post-PROMPT_SEND_DELAY_MS) — but first check if the test is failing for a real reason.

**Note:** The "sends a prompt" test waits implicitly for the 5-second `PROMPT_SEND_DELAY_MS`. If that feels slow in tests, add a `promptSendDelayMs` override to `KickoffOrchestratorDeps` and default it to 5000 for prod, 10 for tests. Apply the same pattern to `INTERVIEW_SEND_DELAY_MS` via `interviewSendDelayMs`. Update the test setup to pass `promptSendDelayMs: 10, interviewSendDelayMs: 10`. Re-run tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/project/kickoff-orchestrator.ts test/main/kickoff-orchestrator.test.ts
git commit -m "feat(kickoff): KickoffOrchestrator with MCP + marker-file completion"
```

---

### Task 6: MCP-Tool `kickoff_complete`

**Files:**
- Modify: `src/main/mcp/mcp-tools.ts`

Wir erweitern `ToolContext` um eine `kickoffOrchestrator`-Referenz und registrieren das neue Tool.

- [ ] **Step 1: Erweitere `ToolContext` in `src/main/mcp/mcp-tools.ts`**

Oben in der Datei, im `ToolContext`-Interface:

```ts
import type { SessionManager } from '../session/session-manager'
import type { MessageBus } from '../message-bus/message-bus'
import type { StatusLineMonitor } from '../monitoring/statusline-monitor'
import type { KickoffOrchestrator } from '../project/kickoff-orchestrator'
import type { Topic } from '../../shared/types'

export interface ToolContext {
  sessionManager: SessionManager
  messageBus: MessageBus | null
  statusLineMonitor: StatusLineMonitor | null
  kickoffOrchestrator: KickoffOrchestrator | null
}
```

- [ ] **Step 2: Registriere das neue Tool**

Am Ende der `registerTools`-Funktion (nach dem letzten bestehenden Tool `mux_context_usage`, aber innerhalb der Funktion):

```ts
  // 8. kickoff_complete — Signal that /launch finished its work
  ;(server.registerTool as any)(
    'kickoff_complete',
    {
      description:
        'Signal dass der Launcher das Projekt-Scaffolding abgeschlossen hat. '
        + 'cipher-mux reagiert, indem es eine neue Claude-Session im Projekt-'
        + 'Verzeichnis öffnet und /interview startet.',
      inputSchema: {
        projectPath: z.string().describe('Absoluter Pfad zum Projekt-Verzeichnis'),
        projectName: z.string().describe('Projektname (kebab-case, aus dem Verzeichnisnamen)'),
        detectedStack: z.string().optional().describe(
          'Erkannter Tech-Stack, z.B. "kotlin-android", "electron-ts", "python"'
        ),
      },
    },
    async (args: { projectPath: string; projectName: string; detectedStack?: string }) => {
      if (!ctx.kickoffOrchestrator) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: 'KickoffOrchestrator not available' }) }],
          isError: true,
        }
      }
      try {
        ctx.kickoffOrchestrator.handleCompletion({
          projectPath: args.projectPath,
          projectName: args.projectName,
          detectedStack: args.detectedStack,
        })
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ ok: false, error: msg }) }],
          isError: true,
        }
      }
    }
  )
```

- [ ] **Step 3: Type-check**

Run: `npx tsc -p tsconfig.main.json --noEmit 2>&1 | grep -i "mcp-tools" | head -10`
Expected: no errors in mcp-tools.ts. (Errors in other files are expected and will be fixed in the next task.)

- [ ] **Step 4: Commit**

```bash
git add src/main/mcp/mcp-tools.ts
git commit -m "feat(kickoff): register kickoff_complete MCP tool"
```

---

### Task 7: IpcHub-Integration — alter Manager raus, Orchestrator rein

**Files:**
- Modify: `src/main/ipc-hub.ts`
- Delete: `src/main/project/kickoff-manager.ts`
- Delete: `test/main/kickoff-manager.test.ts`

- [ ] **Step 1: Imports in `src/main/ipc-hub.ts` anpassen**

Ersetze

```ts
import { KickoffManager } from './project/kickoff-manager'
```

durch

```ts
import { KickoffOrchestrator } from './project/kickoff-orchestrator'
```

Und in der Typen-Import-Zeile `KickoffOpts` durch `KickoffRequest` ersetzen:

```ts
import type { StartSessionOpts, SendMessage, Topic, ContextUsage, KickoffRequest } from '../shared/types'
```

- [ ] **Step 2: Instanz-Feld in `IpcHub`-Klasse ändern**

```ts
  private kickoffOrchestrator: KickoffOrchestrator
```

- [ ] **Step 3: Constructor-Initialisierung anpassen**

Im Constructor, die Zeile

```ts
    this.kickoffManager = new KickoffManager()
```

ersetzen durch:

```ts
    const appConfig = configStore.get('app')
    this.kickoffOrchestrator = new KickoffOrchestrator({
      sessionManager: this.sessionManager,
      projectlauncherPath: appConfig?.projectlauncherPath
        ?? '/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher',
      timeoutMs: ((appConfig?.kickoffTimeoutMinutes ?? 15) * 60_000),
    })
```

- [ ] **Step 4: Orchestrator in ToolContext einhängen**

Im `init()`-Methodenbody bei `this.mcpServer.start(...)` den ctx erweitern:

```ts
    this.mcpServer.start(port, host, apiKey, {
      sessionManager: this.sessionManager,
      messageBus: this.messageBus,
      statusLineMonitor: this.statusLineMonitor,
      kickoffOrchestrator: this.kickoffOrchestrator,
    }).then(() => {
```

- [ ] **Step 5: Event-Forwarding für Kickoff-Events**

In `setupEventForwarding()`-Methode am Ende hinzufügen:

```ts
    this.kickoffOrchestrator.on('kickoff-complete', (event) => {
      this.windowManager.sendToMainWindow(
        IPC.PROJECT_KICKOFF_COMPLETED,
        { status: 'complete', event },
      )
    })

    this.kickoffOrchestrator.on('kickoff-timeout', (data) => {
      this.windowManager.sendToMainWindow(
        IPC.PROJECT_KICKOFF_COMPLETED,
        { status: 'timeout', ...data },
      )
    })

    this.kickoffOrchestrator.on('kickoff-error', (data) => {
      this.windowManager.sendToMainWindow(
        IPC.PROJECT_KICKOFF_COMPLETED,
        {
          status: 'error',
          handle: data.handle,
          error: data.error instanceof Error ? data.error.message : String(data.error),
        },
      )
    })
```

- [ ] **Step 6: `registerProjectChannels` anpassen**

Den `PROJECTS_KICKOFF`-Handler komplett ersetzen durch:

```ts
    ipcMain.handle(IPC.PROJECTS_KICKOFF, async (_e, req: KickoffRequest) => {
      const handle = await this.kickoffOrchestrator.start(req)
      return handle
    })
```

(Die alte Scan-Path-Persistenz-Logik entfällt zunächst; der Folge-Session-Start sorgt dafür, dass der Pfad via `projects:scan` erfasst wird. Falls rescan das Projekt nicht findet, kann die Persistenz später wieder eingebaut werden — Notiz in Task 14.)

- [ ] **Step 7: destroy() aufrufen**

In der `destroy()`-Methode:

```ts
  async destroy(): Promise<void> {
    await this.mcpServer.stop().catch(() => {})
    this.statusLineMonitor.stop()
    this.projectScanner.stopWatch()
    this.kickoffOrchestrator.destroy()
    if (this.messageBus) this.messageBus.destroy()
    await this.sessionManager.destroy()
  }
```

- [ ] **Step 8: Alten Manager + Tests löschen**

```bash
rm src/main/project/kickoff-manager.ts
rm test/main/kickoff-manager.test.ts
```

- [ ] **Step 9: Build-Check**

Run: `npx tsc -p tsconfig.main.json --noEmit 2>&1 | head -30`
Expected: no errors (preload.ts and renderer files will be fixed in later tasks, but main should compile).

- [ ] **Step 10: Unit-Tests laufen lassen**

Run: `npm run test 2>&1 | tail -30`
Expected: all tests pass (new orchestrator tests + existing tests; old kickoff-manager tests gone).

- [ ] **Step 11: Commit**

```bash
git add src/main/ipc-hub.ts src/main/project/kickoff-manager.ts test/main/kickoff-manager.test.ts
git commit -m "refactor(kickoff): swap KickoffManager for KickoffOrchestrator in IpcHub"
```

---

### Task 8: Preload-API anpassen

**Files:**
- Modify: `src/main/preload.ts`

- [ ] **Step 1: `projects.kickoff` Signatur ist bereits generisch (`opts: unknown`) — keine Änderung am Payload-Typ nötig. Aber wir ergänzen einen `onCompleted`-Listener.**

Im `projects`-Block:

```ts
  // ─── Projects ──────────────────────────────────────────
  projects: {
    list: () => ipcRenderer.invoke(IPC.PROJECTS_LIST),
    scan: () => ipcRenderer.invoke(IPC.PROJECTS_SCAN),
    kickoff: (opts: unknown) => ipcRenderer.invoke(IPC.PROJECTS_KICKOFF, opts),
    onCompleted: (cb: (data: unknown) => void) => {
      const handler = (_e: unknown, data: unknown) => cb(data)
      ipcRenderer.on(IPC.PROJECT_KICKOFF_COMPLETED, handler)
      return () => ipcRenderer.removeListener(IPC.PROJECT_KICKOFF_COMPLETED, handler)
    },
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(kickoff): expose onCompleted listener in preload API"
```

---

### Task 9: Neuer KickoffDialog — 3 Felder

**Files:**
- Modify: `src/renderer/components/KickoffDialog.tsx`

Kompletter Redesign. Keine projektname-Ableitung im Dialog (macht der Orchestrator). Kein autoInterview-Toggle.

- [ ] **Step 1: Datei komplett ersetzen**

Ersetze den Inhalt von `src/renderer/components/KickoffDialog.tsx` durch:

```tsx
import { useState, useCallback } from 'preact/hooks'

interface KickoffDialogProps {
  visible: boolean
  onClose: () => void
  onKickoff: (req: {
    projectDir: string
    requirementsFile?: string
    extraContext?: string
  }) => void
}

const api = (window as any).cipherMux

export function KickoffDialog({ visible, onClose, onKickoff }: KickoffDialogProps) {
  const [projectDir, setProjectDir] = useState('')
  const [requirementsFile, setRequirementsFile] = useState('')
  const [extraContext, setExtraContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handlePickDir = useCallback(async () => {
    const selected = await api.dialog.openDir({
      title: 'Projekt-Verzeichnis wählen (das Obsidian-Verzeichnis)',
    })
    if (selected) setProjectDir(selected)
  }, [])

  const handlePickReqFile = useCallback(async () => {
    // No extension filter — all formats allowed.
    const selected = await api.dialog.openFile({
      title: 'Externe Anforderungsdatei wählen',
    })
    if (selected) setRequirementsFile(selected)
  }, [])

  const handleSubmit = useCallback(async () => {
    setError(null)
    if (!projectDir.trim()) {
      setError('Projekt-Verzeichnis fehlt')
      return
    }

    setLoading(true)
    try {
      await onKickoff({
        projectDir: projectDir.trim(),
        requirementsFile: requirementsFile.trim() || undefined,
        extraContext: extraContext.trim() || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [projectDir, requirementsFile, extraContext, onKickoff])

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit()
  }, [onClose, handleSubmit])

  if (!visible) return null

  return (
    <div class="kickoff-overlay" onKeyDown={handleKeyDown}>
      <div class="kickoff-dialog card card--flat">
        <div class="kickoff-dialog__header">
          <span>Neues Projekt aus Konzept</span>
          <span class="kickoff-dialog__close" onClick={onClose}>✕</span>
        </div>

        <div class="kickoff-dialog__body">
          {/* Project Directory */}
          <label class="kickoff-dialog__label">
            <span>Projekt-Verzeichnis</span>
            <div class="kickoff-dialog__file-row">
              <input
                class="input"
                type="text"
                placeholder="/Users/cipher/Nextcloud/…"
                value={projectDir}
                onInput={(e) => setProjectDir((e.target as HTMLInputElement).value)}
                autoFocus
              />
              <button class="btn btn--sm" onClick={handlePickDir}>…</button>
            </div>
            <span class="text-xs text-dim" style={{ marginTop: '4px' }}>
              Das Obsidian-Verzeichnis, in dem dein Konzept liegt.
            </span>
          </label>

          {/* External Requirements File (optional) */}
          <label class="kickoff-dialog__label">
            <span>Anforderungsdatei (optional)</span>
            <div class="kickoff-dialog__file-row">
              <input
                class="input"
                type="text"
                placeholder="Leer lassen, wenn schon im Projekt-Verzeichnis"
                value={requirementsFile}
                onInput={(e) => setRequirementsFile((e.target as HTMLInputElement).value)}
              />
              <button class="btn btn--sm" onClick={handlePickReqFile}>…</button>
            </div>
            <span class="text-xs text-dim" style={{ marginTop: '4px' }}>
              Beliebiges Format (.md, .txt, .docx, .yaml …). Wird als docs/requirements.&lt;ext&gt; ins Projekt kopiert.
            </span>
          </label>

          {/* Extra Context (optional) */}
          <label class="kickoff-dialog__label">
            <span>Zusätzlicher Kontext (optional)</span>
            <textarea
              class="input"
              rows={6}
              placeholder="Alles, was Claude zusätzlich wissen soll: Stack-Präferenzen, Referenz-Projekte, Miro-URLs, …"
              value={extraContext}
              onInput={(e) => setExtraContext((e.target as HTMLTextAreaElement).value)}
              style={{ fontFamily: "'Fira Code', monospace", fontSize: '12px', resize: 'vertical' }}
            />
          </label>

          {error && <div class="kickoff-dialog__error">{error}</div>}
        </div>

        <div class="kickoff-dialog__footer">
          <button class="btn" onClick={onClose}>Abbrechen</button>
          <button class="btn btn--primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Starte Launcher…' : 'Projekt aufsetzen'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Renderer build-check**

Run: `npx tsc -p tsconfig.renderer.json --noEmit 2>&1 | grep -i "KickoffDialog" | head -10`
Expected: no errors in KickoffDialog.tsx. (Errors in app.tsx are expected — fixed next task.)

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/KickoffDialog.tsx
git commit -m "feat(kickoff): redesign KickoffDialog with 3-field launcher input"
```

---

### Task 10: `app.tsx` — handleKickoff umstellen + Completion-Listener

**Files:**
- Modify: `src/renderer/app.tsx`

Der bestehende `handleKickoff`-Callback erwartet 4 Felder (inkl. `autoInterview`). Wir müssen ihn auf die neue 3-Felder-Signatur umstellen und die Folge-Session nicht mehr hier öffnen — das macht jetzt der Orchestrator. Wir brauchen aber einen Listener auf `PROJECT_KICKOFF_COMPLETED`, um auf die Folge-Session zu fokussieren.

- [ ] **Step 1: `handleKickoff`-Signatur ersetzen**

In `src/renderer/app.tsx`, ersetze den kompletten `handleKickoff`-`useCallback`-Block (Zeilen ~83–114) durch:

```tsx
  const handleKickoff = useCallback(async (req: {
    projectDir: string
    requirementsFile?: string
    extraContext?: string
  }) => {
    const api = (window as any).cipherMux
    // Main process starts the launcher session; we just close the dialog.
    // The focus switch to the follow-up session happens via the
    // PROJECT_KICKOFF_COMPLETED event listener below.
    await api.projects.kickoff(req)
    setKickoffVisible(false)
  }, [])
```

- [ ] **Step 2: Completion-Listener hinzufügen**

Direkt nach dem bestehenden Orchestrator-`useEffect` (vor dem Cmd+N-Effect) einen neuen `useEffect` einfügen:

```tsx
  // Listen for kickoff completion — focus follow-up session and rescan projects.
  useEffect(() => {
    const api = (window as any).cipherMux
    const unsub = api.projects.onCompleted((data: any) => {
      if (data?.status === 'complete' && data.event?.followupSessionId) {
        setActiveSessionId(data.event.followupSessionId)
        setActiveView('terminal')
        // Project dir is now populated — refresh scan so the tile appears.
        rescan().catch((err) => console.error('[App] rescan failed:', err))
      } else if (data?.status === 'timeout') {
        console.warn('[App] Kickoff timed out:', data.handle)
      } else if (data?.status === 'error') {
        console.error('[App] Kickoff error:', data.error)
      }
    })
    return () => unsub()
  }, [rescan])
```

- [ ] **Step 3: `KickoffDialog`-Aufruf prüfen**

Stelle sicher, dass der JSX-Aufruf von `<KickoffDialog … onKickoff={handleKickoff} />` noch am Ende von `App` existiert und die Prop-Signatur zur neuen Version passt. Der existierende Render-Aufruf sollte bereits so aussehen:

```tsx
<KickoffDialog
  visible={kickoffVisible}
  onClose={() => setKickoffVisible(false)}
  onKickoff={handleKickoff}
/>
```

Falls er andere Props übergibt, anpassen. (Falls die Datei `<KickoffDialog>` gar nicht rendert, Grep nutzen: `grep -n "KickoffDialog" src/renderer/app.tsx`.)

- [ ] **Step 4: Renderer build-check**

Run: `npx tsc -p tsconfig.renderer.json --noEmit 2>&1 | head -20`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/app.tsx
git commit -m "feat(kickoff): wire handleKickoff to orchestrator flow + completion listener"
```

---

### Task 11: Full build + unit tests green

**Files:** none directly — integration check across all main+renderer code.

- [ ] **Step 1: TypeScript strict check**

Run: `npx tsc -p tsconfig.json --noEmit 2>&1 | tail -20`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint 2>&1 | tail -20`
Expected: no errors (warnings OK).

- [ ] **Step 3: Alle Unit-Tests**

Run: `npm run test 2>&1 | tail -30`
Expected: alle Tests grün. (Specifically: `launcher-prompt.test.ts`, `kickoff-watcher.test.ts`, `kickoff-orchestrator.test.ts` plus bestehende Tests.)

- [ ] **Step 4: Vollständiger Build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build erfolgreich, keine Fehler.

- [ ] **Step 5: Kein Commit — falls Issues auftauchen, Task 1–10 nachbessern.**

---

### Task 12: `/launch`-Skill für Merge-Modus erweitern

**Files:**
- Modify: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/.claude/skills/launch/SKILL.md`

Dieser Schritt betrifft das Nachbar-Repo. Wir erweitern den existierenden Skill um den Merge-Modus und den MCP-Completion-Call. **Wichtig:** Kein Code aus cipher-mux dupliziert; der Skill bleibt inhaltlicher Chef.

- [ ] **Step 1: Skill-Datei lesen, um aktuellen Stand zu kennen**

Run: `cat /Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/.claude/skills/launch/SKILL.md`

Identifiziere die Abschnitte (Schritt 1 … Schritt 8) und den letzten Schritt („Nächste Schritte ausgeben" oder ähnlich).

- [ ] **Step 2: Direkt nach „Schritt 1: Input analysieren" einen neuen Abschnitt einfügen**

```markdown
## Modus-Erkennung

Bevor du scaffoldest, entscheide:

- **Create-Modus** (klassisch): Der Input beschreibt ein neues Projekt, das Zielverzeichnis gibt es noch nicht. Du legst es aus `_template/` an.
- **Merge-Modus** (neu): Der Input enthält einen Pfad zu einem **existierenden** Verzeichnis (z.B. aus Obsidian/Nextcloud). Darin liegt ggf. schon eine Anforderungsdatei. Du mergst das Template hinein, ohne existierende Dateien zu überschreiben.

Prüfe den Input:

```bash
test -d "<projectDir>" && echo "EXISTS" || echo "NEW"
```

Wenn EXISTS → **Merge-Modus**. Sonst → Create-Modus.

## Merge-Modus — Abweichungen

Im Merge-Modus gelten folgende Regeln:

1. **Kein `cp -r _template/` auf das Ziel** — das würde das User-Verzeichnis zerstören.
   Stattdessen: jede Template-Datei einzeln prüfen und nur anlegen, wenn sie nicht existiert.
2. **`CLAUDE.md` wird immer neu generiert** (aus den Platzhaltern). Wenn bereits eine existiert, frage kurz zurück: Soll sie ersetzt oder ergänzt werden? Standard: ersetzen, aber Inhalt vorher in `CLAUDE.md.bak` sichern.
3. **`docs/requirements.md`** bleibt unangetastet, wenn sie existiert. Dein Entwurfsschritt (Schritt 5) wird dann zu einem Verfeinerungs-Schritt: liest die vorhandenen Requirements, ergänzt was offensichtlich fehlt, markiert Lücken mit `[KLÄREN]`.
4. **`.gitignore`**: nur anlegen, wenn nicht vorhanden. Andernfalls unangetastet.
5. **`git init`**: nur wenn `.git/` nicht existiert.
```

- [ ] **Step 3: Am Ende des Skills (vor oder statt Schritt 8 "Nächste Schritte ausgeben") neuen Abschnitt einfügen**

```markdown
## Schritt 9: Completion signalisieren

Wenn alles durch ist (Template gemerged/kopiert, Platzhalter ersetzt, Requirements entworfen, SPEC vorbereitet, git initialisiert), ruf das MCP-Tool `kickoff_complete` auf:

```
<Tool-Aufruf über den MCP-Server "cipher-mux">
{
  "name": "kickoff_complete",
  "arguments": {
    "projectPath": "<absoluter Pfad zum Projekt-Verzeichnis>",
    "projectName": "<kebab-case Name>",
    "detectedStack": "<z.B. kotlin-android, electron-ts, python, go, rust, unknown>"
  }
}
```

Als Fallback (für den Fall, dass der MCP-Server nicht verfügbar ist): Schreib eine leere Datei `.kickoff-complete` ins Projekt-Verzeichnis:

```bash
touch "<projectPath>/.kickoff-complete"
```

Beide Signale sind idempotent — cipher-mux reagiert nur einmal.

## Schritt 10: Nächste Schritte ausgeben (wie zuvor)

[Rest bleibt unverändert.]
```

- [ ] **Step 4: Diff prüfen**

Run: `cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher && git diff .claude/skills/launch/SKILL.md | head -100`
Expected: die zwei neuen Abschnitte sind eingefügt, vorhandene Schritte unberührt.

- [ ] **Step 5: Commit im projectlauncher-Repo**

```bash
cd /Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher
git add .claude/skills/launch/SKILL.md
git commit -m "feat(launch): add merge-mode for existing dirs + kickoff_complete signal

Ermöglicht Aufruf des Skills aus cipher-mux-electron auf ein
bereits existierendes Obsidian-Projektverzeichnis. MCP-Tool
kickoff_complete meldet Fertigstellung strukturiert; .kickoff-
complete Marker-Datei als Fallback."
cd -
```

---

### Task 13: TESTCASE.md — neue manuelle Testfälle

**Files:**
- Modify: `docs/TESTCASE.md`

- [ ] **Step 1: Lies das aktuelle TESTCASE.md, finde das Ende der Test-Sektionen**

Run: `grep -n "^## Test" docs/TESTCASE.md | tail -5`

- [ ] **Step 2: Nach dem letzten Test-Block anhängen**

```markdown
## Test 11 — Kickoff mit Obsidian-Verzeichnis

**Setup:**
1. Erstelle in Nextcloud ein leeres Testverzeichnis, z.B. `/Users/Shared/Nextcloud/ClaudeCode01/kickoff-test-obsidian/`.
2. Lege darin eine Datei `requirements.md` mit 3-5 Bullet-Points zum Projektkonzept an (beliebiges Thema).

**Schritte:**
1. Starte cipher-mux-electron.
2. Drücke `Cmd+N` → Dialog "Neues Projekt aus Konzept" öffnet sich.
3. Pastet den Pfad `.../kickoff-test-obsidian/` ins Feld "Projekt-Verzeichnis".
4. Lass "Anforderungsdatei" leer (schon im Verzeichnis).
5. Tippe im Freitext-Feld: "Stack-Präferenz: Python" (oder Equivalent).
6. Klick "Projekt aufsetzen".

**Erwartung:**
- Dialog schließt sich.
- Eine neue Session namens "Launcher: kickoff-test-obsidian" erscheint und läuft.
- Nach einigen Sekunden startet Claude in dieser Session, bekommt den Launcher-Prompt und fängt an zu arbeiten (sichtbare Subagent-Dispatches idealerweise).
- Wenn der Launcher fertig ist: Eine neue Session `kickoff-test-obsidian` wird automatisch gestartet, Focus wechselt dorthin, Claude läuft und startet `/interview`.
- Das Projekt-Verzeichnis hat jetzt: `CLAUDE.md`, `.claude/`, `docs/SPEC.md`, `docs/todo.md`, `.gitignore`, ggf. `.git/`.

## Test 12 — Kickoff mit externer `.docx`-Anforderungsdatei

**Setup:**
1. Leeres Testverzeichnis wie in Test 11 — **ohne** Anforderungsdatei drin.
2. Eine externe `.docx`-Datei mit Anforderungen an einem beliebigen anderen Ort (z.B. Desktop).

**Schritte:**
1. `Cmd+N`, pastet den Verzeichnis-Pfad.
2. Im Feld "Anforderungsdatei": pastet den `.docx`-Pfad.
3. Klick "Projekt aufsetzen".

**Erwartung:**
- Vor dem Launcher-Start: im Projekt-Verzeichnis liegt jetzt `docs/requirements.docx` (Extension erhalten).
- Launcher-Session läuft, Claude liest die `.docx`-Datei (über geeigneten Reader oder verweist auf Missing-Tool).
- Folge-Session öffnet sich nach Completion.

## Test 13 — Kickoff-Fehlerfälle

**Testschritte:**
1. `Cmd+N`, pastet einen **nicht existierenden** Pfad ins Verzeichnis-Feld → Klick "Projekt aufsetzen".
   **Erwartung:** Dialog zeigt Fehler "Project directory does not exist", Dialog bleibt offen.
2. `Cmd+N`, pastet einen Pfad zu einer **Datei** (nicht Verzeichnis) → Klick.
   **Erwartung:** Fehler "Project path is not a directory".
3. Starte einen gültigen Kickoff, dann **warte 15 Minuten ohne Interaktion** (oder setze in `ConfigStore` `kickoffTimeoutMinutes: 1` und warte 1 Minute).
   **Erwartung:** Toast oder Console-Warning über Timeout. Launcher-Session bleibt sichtbar, Folge-Session startet nicht automatisch.
```

- [ ] **Step 3: Commit**

```bash
git add docs/TESTCASE.md
git commit -m "docs: add kickoff-orchestrator test cases 11-13"
```

---

### Task 14: Smoke-Test manuell + follow-up issues

**Files:** keine — nur manuelle Verifikation.

- [ ] **Step 1: Build + Start**

Run: `npm run dev` (oder `npm run build && open dist/…/cipher-mux.app` je nach Workflow).

- [ ] **Step 2: Test 11 durchspielen** (siehe `docs/TESTCASE.md`).

Dokumentiere Ergebnis mental oder in Notes:
- Dialog ok? 3 Felder?
- Launcher-Session öffnet sich?
- Claude startet?
- `/launch`-Prompt kommt an?
- Merge-Modus funktioniert (`CLAUDE.md` wird erzeugt, vorhandene `requirements.md` bleibt)?
- MCP-`kickoff_complete`-Call wird gemacht?
- Folge-Session öffnet sich und Focus wechselt?
- `/interview` startet?

- [ ] **Step 3: Falls Bugs auftauchen — als separate Tasks/Issues erfassen**

Typische Fallstricke:
- MCP-Tool nicht registriert im Launcher-Session (`claude mcp list` in der Launcher-Session prüfen; ggf. `setMcpConfig` auch für den projectlauncher-Pfad triggern — vgl. `SessionManager.registerMcpForProject`).
- Scan-Path-Persistenz fehlt (altes Verhalten im alten `PROJECTS_KICKOFF`-Handler war, den Parent-Dir in `scanPaths` aufzunehmen — nach Entfernung könnten neue Projekte beim Rescan verschwinden). Falls beim Smoke-Test das Projekt nicht im Rescan erscheint: Parent-Dir manuell ergänzen oder Logik re-integrieren im `kickoff-complete`-Pfad des Orchestrators.
- Prompt-Timing zu knapp (Claude noch nicht gebootet, wenn Prompt eintrifft) — `PROMPT_SEND_DELAY_MS` erhöhen.

Erfasse jedes solche Findigen als neuen Eintrag in `docs/issues/ISSUE-kickoff-<kurz>.md` (oder TodoWrite-Task), je nach Schweregrad.

- [ ] **Step 4: Abschluss-Commit** (nur wenn etwas bereinigt wurde):

```bash
git add -A
git commit -m "fix(kickoff): smoke-test findings"
```

---

## Self-Review (nach Planvollendung)

**1. Spec coverage** — jede Spec-Sektion hat Tasks:

- UI (Spec 2): Task 9 (KickoffDialog-Rewrite), Task 10 (app.tsx).
- Architektur (Spec 3): Task 5 (Orchestrator), Task 7 (IpcHub).
- Completion-Signal (Spec 4): Task 6 (MCP-Tool), Task 4 (Watcher-Fallback), Task 5 (Orchestrator-Logic), Task 7 (Event-Forwarding).
- Launcher-Prompt (Spec 3 Prompt-Template): Task 3.
- Änderungen am `/launch`-Skill (Spec 5): Task 12.
- Migration / Entfernen (Spec 5): Task 7 (Schritt 8).
- Neue Config-Keys (Spec 5): Task 2.
- Tests (Spec 5): Tasks 3, 4, 5 (Unit), Task 13 (manuell).
- Fehlerfälle (Spec 5): Tasks 5, 13.

**2. Placeholder scan** — keine TBDs, alle Schritte enthalten Code.

**3. Type consistency** —
- `KickoffRequest` (Task 1) = Dialog-Payload (Task 9) = IPC-Handler-Arg (Task 7) ✓
- `KickoffHandle` (Task 1) = Orchestrator-Return (Task 5) ✓
- `KickoffCompletedEvent` (Task 1) = Event-Forward-Payload (Task 7) = App-Listener-Payload (Task 10) ✓
- `kickoffOrchestrator` in `ToolContext` (Task 6) = Feld in IpcHub (Task 7) ✓
- `projectlauncherPath` Config-Key (Task 2) = Orchestrator-Dep (Tasks 5, 7) ✓

**4. Ambiguity check** — bewusste Design-Entscheidungen sind im Spec-Doc festgehalten; der Plan führt sie aus.

---

## Execution Handoff

Zwei Optionen:

**1. Subagent-Driven (empfohlen)** — frischer Subagent pro Task, zwischen den Tasks Review, schnelle Iteration.

**2. Inline Execution** — Tasks in dieser Session abarbeiten, Batch-Execution mit Checkpoints.
