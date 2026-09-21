# Multi-Workspace-Sessions (Paket A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Presets laufen parallel in mehreren Workspaces, weil jede Session ihren Workspace selbst trägt statt ihn aus dem globalen App-Zustand zu lesen.

**Architecture:** `SessionInfo` bekommt ein `workspaceId`-Feld, das in `sessions.json` persistiert wird und `recover()` überlebt. Entity-Sessions laufen in Run-Verzeichnissen pro (Workspace, Entity), sodass CLAUDE.md und `.mcp.json` sich nicht mehr zwischen Workspaces überschreiben. Der MCP-Server bindet den Workspace beim `initialize` aus einem `X-Mux-Workspace`-Header in den Tool-Kontext. `singleInstance` und Handoff-Routing gelten damit pro Workspace.

**Tech Stack:** TypeScript strict, Electron, Preact (Renderer), `node:test` + `node:assert/strict` (Tests), better-sqlite3, tmux.

**Spec:** `docs/superpowers/specs/2026-09-20-multi-workspace-sessions-design.md`

## Global Constraints

- **TypeScript strict mode.** Keine `any`-Rückfälle in neuen Modulen; wo bestehender Code `any` nutzt (z. B. `configStore.get`), lokal bleiben.
- **Tests:** `node:test` mit `describe`/`it`, `assert` aus `node:assert/strict`, Testdateien unter `test/main/`. **Import des Ziels per ESM-`import` auf Modulebene** — das ist die Konvention der Suite (67 von 71 Dateien). `require()` nutzen nur vier Ausreißer, darunter `entity-registry.test.ts`; es erzeugt zusätzlich einen `no-require-imports`-Lintfehler. Korrigiert am 2026-09-20, nachdem der Constraint aus genau diesem Ausreißer verallgemeinert worden war.
- **Kein Test darf in `~/.config/cipher-mux/` schreiben.** Neue Module, die Pfade auflösen, nehmen das Basisverzeichnis als optionalen letzten Parameter mit Default. Tests übergeben ein `fs.mkdtempSync`-Verzeichnis.
- **Tests brauchen Node 22.** Vor jedem Testbefehl: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`. Unter dem System-Node 26.8.2 kompiliert `better-sqlite3@11.10.0` nicht (V8-API-Fehler), der `rebuild:node`-Schritt bricht ab und die `&&`-Kette im `test`-Skript führt keinen einzigen Test aus. `.nvmrc` und `engines.node` im Repo halten die Version fest, aber npm wertet sie nicht selbst aus — der PATH-Export bleibt nötig.
- **Der volle Testbefehl lautet `npm run test`** und nimmt keine Dateiargumente entgegen (`node --test ... $(find test -name '*.test.ts')`). Für einen einzelnen Lauf: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/<datei>.test.ts`.
- **`npm run lint` ist projektweit rot und war es vor diesem Paket schon** — 830 Probleme, 478 Fehler, 352 Warnungen über `src/`. Ein grüner Gesamtlauf ist kein erreichbares Abnahmekriterium. Das Gate lautet: **die vom Task berührten Dateien fügen kein neues Problem hinzu**. Prüfen mit `npx eslint <die geänderten Dateien>` und die Treffer gegen `git blame` abgleichen, statt `npm run lint` als Ja/Nein zu lesen.
- **Die Baseline ist bekannt rot.** Stand vor Task 1: **1531 Tests, 1526 pass, 3 fail, 2 cancelled**. Vorbestehend rot und nicht Teil dieses Pakets: `migrate-to-cyber-factory.test.ts`, `task-hooks.test.ts` (Event-Loop-Flake), `voice-catalog.test.ts`, `voice-downloader.test.ts`. Abnahme heißt: **genau diese vier und keine weiteren**, und die Gesamtzahl der Tests steigt. Die Angabe "858 Tests, 0 Failures" in der CLAUDE.md ist veraltet.
- **`npm run test` läuft gegen Node-ABI, `npm start` gegen Electron-ABI.** Nach einem Testlauf nie `electron .` direkt starten — immer `npm start` (prestart-Hook rebuildet better-sqlite3).
- **Defensiv bei neuen Feldern.** Jeder Lesezugriff auf `workspaceId` aus persistierten Daten nutzt `?? null`. Ein Crash in der Init-Chain killt Keep-Working still und vollständig (siehe CLAUDE.md, Abschnitt "Keep Working Restore — Fragile Zone").
- **Sentinel für "kein Workspace":** In Pfaden und in `entityStatus`-Arrays ist das der String `'_global'`. Im Datenmodell (`SessionInfo.workspaceId`, `PersistedSession.workspaceId`, ToolContext) ist es `null`. Nie vermischen.
- **Commits:** Deutsch, Conventional-Commit-Präfix (`feat:`, `test:`, `refactor:`), max 5–10 Dateien pro Commit.
- **Branch:** `feat/multi-workspace-sessions` (existiert bereits, Spec-Commit `2bfb3be`).

---

## File Structure

**Neue Dateien:**

| Datei | Verantwortung |
|---|---|
| `src/shared/workspace-key.ts` | Die eine Definition von `'_global'` und `workspaceKey()`. In `shared/`, weil Main (Run-Dirs, Lookup) und Renderer (Status-Ableitung) dieselbe Abbildung brauchen — zwei Kopien würden auseinanderlaufen. |
| `src/main/session/entity-run-dir.ts` | Auflösen, Anlegen und Aufräumen der Run-Verzeichnisse pro (Workspace, Entity). Reine Pfad- und FS-Logik, kein Session-Wissen. |
| `src/main/session/entity-session-lookup.ts` | Reine Suchfunktionen über eine Session-Liste: welche Entity-Session läuft in welchem Workspace. Von SessionManager, Handoff-Kernel und Renderer-Ableitung genutzt. |
| `src/shared/entity-status.ts` | Ableitung `sessions → Record<entityId, workspaceKey[]>` für die UI. In `shared/`, weil Main und Renderer sie brauchen und der Test sie ohne Electron importieren muss. |
| `src/main/mcp/workspace-header.ts` | Parsen und Validieren des `X-Mux-Workspace`-Headers; Bauen der MCP-Server-Config mit Header. |

**Geänderte Dateien:** `src/shared/types.ts`, `src/main/session/session-store.ts`, `src/main/session/session-manager.ts`, `src/main/mcp/mcp-server.ts`, `src/main/mcp/mcp-tools.ts`, `src/main/mcp/handoff-kernel.ts`, `src/main/agent/agent-adapter.ts`, `src/main/agent/adapters/claude-code.ts`, `src/main/ipc-hub.ts`, `src/main/preload.ts`, `src/renderer/app.tsx`, `src/renderer/components/EntityPickerPopup.tsx`, `src/renderer/components/LauncherCell.tsx`, `src/renderer/components/PaneHeader.tsx`, `src/renderer/components/SidebarPanel.tsx`, `src/renderer/components/SessionGrid.tsx`, `src/renderer/styles/components.css`, `src/renderer/locales/de.json`, `src/renderer/locales/en.json`.

**Neue Tests:** `test/main/session-workspace-binding.test.ts`, `test/main/entity-run-dirs.test.ts`, `test/main/entity-session-lookup.test.ts`, `test/main/entity-status-derivation.test.ts`, `test/main/mcp-workspace-header.test.ts`, `test/main/handoff-workspace-routing.test.ts`. Erweitert: `test/main/entity-claudemd-assembly.test.ts`.

Abweichung zum Spec: dort heißt die vierte Datei `entity-singleinstance-workspace.test.ts`. Sie testet hier das Modul, das die Regel trägt, und heißt deshalb nach dem Modul — `entity-session-lookup.test.ts`. Gleicher Inhalt, ehrlicherer Name.

---

## Task 1: `workspaceId` im Datenmodell und in der Persistenz

**Files:**
- Modify: `src/shared/types.ts` (Interface `SessionInfo` ab Zeile 55, `StartSessionOpts` ab Zeile 76)
- Modify: `src/main/session/session-store.ts` (Interface `PersistedSession` ab Zeile 9)
- Modify: `src/main/session/session-manager.ts` (`start()` Zeile 316–327, `persistSession()` Zeile 1590, `recover()` Zeile 553)
- Test: `test/main/session-workspace-binding.test.ts`

**Interfaces:**
- Produces: `SessionInfo.workspaceId?: string | null`, `StartSessionOpts.workspaceId?: string | null`, `PersistedSession.workspaceId: string | null`, und die exportierte reine Funktion `toPersistedSession(session: SessionInfo, gridSlot: number | null): PersistedSession` aus `session-store.ts`.

- [ ] **Step 1: Write the failing test**

Create `test/main/session-workspace-binding.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { toPersistedSession } = require('../../src/main/session/session-store')

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: '01J000000000000000000001',
    name: 'Companion',
    projectPath: '/tmp/x',
    tmuxSession: 'cmux-companion-0001',
    tmuxPane: '%1',
    status: 'active',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('toPersistedSession', () => {
  it('carries workspaceId through to the persisted shape', () => {
    const ps = toPersistedSession(session({ workspaceId: 'ws-alpha' }), null)
    assert.equal(ps.workspaceId, 'ws-alpha')
  })

  it('maps a missing workspaceId to null, never undefined', () => {
    const ps = toPersistedSession(session(), null)
    assert.equal(ps.workspaceId, null)
    assert.ok('workspaceId' in ps)
  })

  it('maps a missing entityId to null (existing behaviour, guarded)', () => {
    const ps = toPersistedSession(session(), null)
    assert.equal(ps.entityId, null)
  })

  it('passes the grid slot through unchanged', () => {
    const ps = toPersistedSession(session({ workspaceId: 'ws-beta' }), 3)
    assert.equal(ps.gridSlot, 3)
    assert.equal(ps.workspaceId, 'ws-beta')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test test/main/session-workspace-binding.test.ts`
Expected: FAIL mit `toPersistedSession is not a function`.

- [ ] **Step 3: Add the field to the shared types**

In `src/shared/types.ts`, `SessionInfo` (nach `entityId`, Zeile 71):

```ts
  /** Entity ID if this session belongs to a registered entity. */
  entityId?: EntityId
  /**
   * Workspace this session was started in. null = no workspace binding.
   * Survives restarts via sessions.json. Never inferred from the currently
   * active workspace during recovery — an unbound session stays unbound.
   */
  workspaceId?: string | null
```

In `StartSessionOpts` (nach `contextPaths`, Zeile 92):

```ts
  /** Workspace this session belongs to. null/undefined = no binding. */
  workspaceId?: string | null
```

- [ ] **Step 4: Add the field and the pure mapper to SessionStore**

In `src/main/session/session-store.ts`, `PersistedSession` erweitern:

```ts
export interface PersistedSession {
  id: string
  name: string
  tmuxSession: string
  entityId: EntityId | null
  projectPath: string | null
  gridSlot: number | null
  status: 'active' | 'background'
  /** Workspace binding. null = unbound. Absent in stores written before v0.9.12. */
  workspaceId: string | null
}
```

Am Ende der Datei, **außerhalb** der Klasse:

```ts
/**
 * Map an in-memory session to its persisted shape.
 * Pure — no disk access — so the mapping can be tested directly.
 */
export function toPersistedSession(
  session: {
    id: string
    name: string
    tmuxSession: string
    entityId?: string | null
    projectPath: string | null
    workspaceId?: string | null
  },
  gridSlot: number | null,
): PersistedSession {
  return {
    id: session.id,
    name: session.name,
    tmuxSession: session.tmuxSession,
    entityId: (session.entityId as EntityId) ?? null,
    projectPath: session.projectPath,
    gridSlot,
    status: gridSlot === null ? 'background' : 'active',
    workspaceId: session.workspaceId ?? null,
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/session-workspace-binding.test.ts`
Expected: PASS, 4 Tests.

- [ ] **Step 6: Wire the field through SessionManager**

In `src/main/session/session-manager.ts`:

`start()`, im `SessionInfo`-Literal (Zeile 316–327) nach `capabilities`:

```ts
      adapterId: adapter.id,
      capabilities: adapter.getCapabilities(),
      workspaceId: opts.workspaceId ?? null,
```

`persistSession()` (Zeile 1590) durch die reine Funktion ersetzen — Import oben in der Datei ergänzen (`import { SessionStore, toPersistedSession } from './session-store'`, bestehenden Import erweitern):

```ts
  private persistSession(session: SessionInfo): void {
    // gridSlot null: der Renderer setzt Slots später via persistGridState()
    this.sessionStore.upsertSession(toPersistedSession(session, null))
  }
```

Achtung: `toPersistedSession` setzt `status` aus `gridSlot`. Das alte `persistSession` schrieb hart `'active'`. Damit das Verhalten identisch bleibt, nach dem Aufruf korrigieren:

```ts
  private persistSession(session: SessionInfo): void {
    const ps = toPersistedSession(session, null)
    ps.status = 'active'
    this.sessionStore.upsertSession(ps)
  }
```

`recover()` (Zeile 553), im `SessionInfo`-Literal nach `entityId`:

```ts
            entityId: ps.entityId ?? undefined,
            workspaceId: ps.workspaceId ?? null,
```

- [ ] **Step 7: Verify the build and the full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npm run test`
Expected: Lint sauber, keine Typfehler, alle Tests grün (Baseline: 1531 Tests, 3 fail + 2 cancelled in den vier bekannt-roten Dateien — keine weiteren Failures, Gesamtzahl steigt).

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/session/session-store.ts \
        src/main/session/session-manager.ts \
        test/main/session-workspace-binding.test.ts
git commit -m "feat(session): workspaceId am Session-Datenmodell und in sessions.json"
```

---

## Task 2: Run-Verzeichnisse pro (Workspace, Entity)

**Files:**
- Create: `src/shared/workspace-key.ts`
- Create: `src/main/session/entity-run-dir.ts`
- Test: `test/main/entity-run-dirs.test.ts`

**Interfaces:**
- Produces:
  - `GLOBAL_WORKSPACE_KEY = '_global'` und `workspaceKey(workspaceId: string | null | undefined): string` aus `src/shared/workspace-key.ts` — die einzige Definition dieser Abbildung im Projekt. Task 4 und Task 10 importieren sie von dort.
  - `resolveRunDir(workspaceId: string | null, entityId: string, baseDir?: string): string`
  - `ensureRunDir(workspaceId: string | null, entityId: string, entityDir: string, linkNames: string[], baseDir?: string): string` — legt das Verzeichnis an, setzt Symlinks idempotent, gibt den Pfad zurück.
  - `pruneRunDirs(knownWorkspaceIds: string[], baseDir?: string): string[]` — löscht Run-Verzeichnisse unbekannter Workspaces, gibt die gelöschten Pfade zurück.
- Consumes: nichts aus anderen Tasks. Wird in Task 3 verdrahtet.

- [ ] **Step 1: Write the failing test**

Create `test/main/entity-run-dirs.test.ts`:

```ts
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const { workspaceKey } = require('../../src/shared/workspace-key')
const {
  resolveRunDir,
  ensureRunDir,
  pruneRunDirs,
} = require('../../src/main/session/entity-run-dir')

let base: string
let entityDir: string

beforeEach(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-runs-'))
  entityDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmux-entity-'))
  fs.mkdirSync(path.join(entityDir, '.claude', 'skills'), { recursive: true })
  fs.writeFileSync(path.join(entityDir, '.claude', 'skills', 'a.md'), 'skill', 'utf-8')
})

afterEach(() => {
  fs.rmSync(base, { recursive: true, force: true })
  fs.rmSync(entityDir, { recursive: true, force: true })
})

describe('workspaceKey', () => {
  it('maps null to the _global sentinel', () => {
    assert.equal(workspaceKey(null), '_global')
  })

  it('maps undefined to the _global sentinel', () => {
    assert.equal(workspaceKey(undefined), '_global')
  })

  it('passes a real workspace id through unchanged', () => {
    assert.equal(workspaceKey('ws-alpha'), 'ws-alpha')
  })
})

describe('resolveRunDir', () => {
  it('separates the same entity across two workspaces', () => {
    const a = resolveRunDir('ws-alpha', 'companion', base)
    const b = resolveRunDir('ws-beta', 'companion', base)
    assert.notEqual(a, b)
    assert.equal(a, path.join(base, 'ws-alpha', 'companion'))
    assert.equal(b, path.join(base, 'ws-beta', 'companion'))
  })

  it('separates two entities inside the same workspace', () => {
    const a = resolveRunDir('ws-alpha', 'companion', base)
    const b = resolveRunDir('ws-alpha', 'refinement', base)
    assert.notEqual(a, b)
  })

  it('uses the _global sentinel when unbound', () => {
    assert.equal(resolveRunDir(null, 'audit', base), path.join(base, '_global', 'audit'))
  })
})

describe('ensureRunDir', () => {
  it('creates the directory', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, [], base)
    assert.ok(fs.existsSync(dir))
  })

  it('links requested names from the entity dir into .claude/', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(dir, '.claude', 'skills')
    assert.ok(fs.existsSync(link))
    assert.equal(fs.readFileSync(path.join(link, 'a.md'), 'utf-8'), 'skill')
  })

  it('is idempotent — a second call does not throw', () => {
    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(base, 'ws-alpha', 'companion', '.claude', 'skills')
    assert.ok(fs.existsSync(link))
  })

  it('repairs a dangling symlink instead of leaving it broken', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    const link = path.join(dir, '.claude', 'skills')
    fs.unlinkSync(link)
    fs.symlinkSync(path.join(entityDir, 'does-not-exist'), link)
    assert.equal(fs.existsSync(link), false, 'precondition: link is dangling')

    ensureRunDir('ws-alpha', 'companion', entityDir, ['skills'], base)
    assert.ok(fs.existsSync(link))
    assert.equal(fs.readFileSync(path.join(link, 'a.md'), 'utf-8'), 'skill')
  })

  it('skips link names that do not exist in the entity dir', () => {
    const dir = ensureRunDir('ws-alpha', 'companion', entityDir, ['nope'], base)
    assert.equal(fs.existsSync(path.join(dir, '.claude', 'nope')), false)
  })
})

describe('pruneRunDirs', () => {
  it('removes run dirs of workspaces that no longer exist', () => {
    ensureRunDir('ws-alpha', 'companion', entityDir, [], base)
    ensureRunDir('ws-gone', 'companion', entityDir, [], base)

    const removed = pruneRunDirs(['ws-alpha'], base)

    assert.deepEqual(removed, [path.join(base, 'ws-gone')])
    assert.ok(fs.existsSync(path.join(base, 'ws-alpha')))
    assert.equal(fs.existsSync(path.join(base, 'ws-gone')), false)
  })

  it('never removes the _global dir', () => {
    ensureRunDir(null, 'audit', entityDir, [], base)
    const removed = pruneRunDirs(['ws-alpha'], base)
    assert.deepEqual(removed, [])
    assert.ok(fs.existsSync(path.join(base, '_global')))
  })

  it('returns an empty list when the base dir does not exist yet', () => {
    const missing = path.join(base, 'not-created')
    assert.deepEqual(pruneRunDirs(['ws-alpha'], missing), [])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-run-dirs.test.ts`
Expected: FAIL mit `Cannot find module '../../src/main/session/entity-run-dir'`.

- [ ] **Step 3a: Write the shared key module**

Create `src/shared/workspace-key.ts`:

```ts
// src/shared/workspace-key.ts — The one mapping from a workspace binding to a key.
//
// Main uses it for run directory paths and entity lookups, the renderer for the
// launcher's running-state derivation. Two copies of "null means _global" would
// drift apart, and the drift would only show up as sessions landing in the
// wrong place.

/** Path segment and lookup key for sessions with no workspace binding. */
export const GLOBAL_WORKSPACE_KEY = '_global'

/**
 * Map a workspace binding to its key.
 * null/undefined → '_global'. Never returns an empty string.
 */
export function workspaceKey(workspaceId: string | null | undefined): string {
  return workspaceId ?? GLOBAL_WORKSPACE_KEY
}
```

- [ ] **Step 3b: Write the run-dir implementation**

Create `src/main/session/entity-run-dir.ts`:

```ts
// src/main/session/entity-run-dir.ts — Run directories per (workspace, entity)
//
// The entity directory (~/.config/cipher-mux/entities/<id>) holds *authored*
// artefacts: preset.md, skills, guides. It is write-once and survives manual
// edits. The run directory holds *generated* artefacts — CLAUDE.md, .mcp.json,
// .claude/settings.local.json — and is the session's cwd.
//
// Splitting per workspace is what keeps two instances of the same preset in
// different workspaces from overwriting each other's CLAUDE.md.

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { GLOBAL_WORKSPACE_KEY, workspaceKey } from '../../shared/workspace-key'

/** Default base for all run directories. */
export const RUNS_BASE = path.join(os.homedir(), '.config', 'cipher-mux', 'runs')

/** Absolute run directory for an (workspace, entity) pair. No disk access. */
export function resolveRunDir(
  workspaceId: string | null | undefined,
  entityId: string,
  baseDir: string = RUNS_BASE,
): string {
  return path.join(baseDir, workspaceKey(workspaceId), entityId)
}

/**
 * Create the run directory and (re-)link authored assets from the entity dir.
 *
 * Links live under <run>/.claude/<name> because .claude itself must stay a
 * real directory — settings.local.json is generated into it.
 *
 * Idempotent: re-links dangling symlinks, leaves healthy ones alone, and skips
 * names the entity dir does not provide.
 */
export function ensureRunDir(
  workspaceId: string | null | undefined,
  entityId: string,
  entityDir: string,
  linkNames: string[],
  baseDir: string = RUNS_BASE,
): string {
  const runDir = resolveRunDir(workspaceId, entityId, baseDir)
  const claudeDir = path.join(runDir, '.claude')
  fs.mkdirSync(claudeDir, { recursive: true })

  for (const name of linkNames) {
    const target = path.join(entityDir, '.claude', name)
    if (!fs.existsSync(target)) continue

    const link = path.join(claudeDir, name)
    let needsLink = true
    try {
      const stat = fs.lstatSync(link)
      if (stat.isSymbolicLink()) {
        // Healthy link pointing at the right target → leave alone.
        needsLink = !fs.existsSync(link) || fs.readlinkSync(link) !== target
      } else {
        // A real file or dir sits where the link belongs — don't touch it.
        needsLink = false
      }
    } catch {
      // lstat threw → nothing there yet.
      needsLink = true
    }

    if (!needsLink) continue
    try { fs.unlinkSync(link) } catch { /* nothing to remove */ }
    try {
      fs.symlinkSync(target, link, 'dir')
    } catch (err) {
      console.warn(`[entity-run-dir] symlink ${link} -> ${target} failed:`, err)
    }
  }

  return runDir
}

/**
 * Remove run directories belonging to workspaces that no longer exist.
 * The _global directory is never pruned. Returns the removed paths.
 *
 * Callers must only pass workspace IDs they know to be current, and must not
 * call this while sessions of those workspaces are still running.
 */
export function pruneRunDirs(
  knownWorkspaceIds: string[],
  baseDir: string = RUNS_BASE,
): string[] {
  if (!fs.existsSync(baseDir)) return []

  const keep = new Set([...knownWorkspaceIds, GLOBAL_WORKSPACE_KEY])
  const removed: string[] = []

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (keep.has(entry.name)) continue
    const full = path.join(baseDir, entry.name)
    try {
      fs.rmSync(full, { recursive: true, force: true })
      removed.push(full)
    } catch (err) {
      console.warn(`[entity-run-dir] prune ${full} failed:`, err)
    }
  }

  return removed
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-run-dirs.test.ts`
Expected: PASS, 13 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/shared/workspace-key.ts src/main/session/entity-run-dir.ts \
        test/main/entity-run-dirs.test.ts
git commit -m "feat(session): Run-Verzeichnisse pro (Workspace, Entity)"
```

---

## Task 3: `startEntity()` schreibt in das Run-Verzeichnis

**Files:**
- Modify: `src/main/workspace/workspace-utils.ts`
- Modify: `src/main/session/session-manager.ts` (`startEntity()` ab Zeile 996; Verzeichnis-Anlage Zeile 1022; `.mcp.json`/`.mcp-connection.md`/`settings.local.json` Zeilen 1098–1112 und 1063–1096; CLAUDE.md-Assembly Zeilen 1114–1150; `start()`-Aufruf Zeile 1163)
- Test: `test/main/entity-claudemd-assembly.test.ts` (erweitert)

**Interfaces:**
- Consumes: `ensureRunDir` aus Task 2; `StartSessionOpts.workspaceId` aus Task 1.
- Produces:
  - `resolveEntityWorkspace(workspaceId: string | null | undefined, workspaces: readonly Workspace[], activeWorkspaceId: string | null): Workspace | null` aus `workspace-utils.ts`.
  - `startEntity(entityId, opts?)` akzeptiert `opts.workspaceId` und setzt `projectPath` der Session auf das Run-Verzeichnis. Die authored Artefakte bleiben im Entity-Verzeichnis.

**Warum die Verdrahtung selbst keinen Unit-Test bekommt:** `startEntity()` schreibt unter `~/.config/cipher-mux/` und ruft `tmux.createSession()`. Ein Test dafür fasst entweder echte Nutzerverzeichnisse an (per Global Constraint verboten) oder mockt so viel, dass er nur noch die Mocks prüft. Die eigenständig prüfbaren Teile sind in Task 2 (Pfade) und in Schritt 1 dieses Tasks (Workspace-Auflösung) getestet; der Rest wird über den manuellen Durchlauf in Task 12 abgenommen.

- [ ] **Step 1: Write the failing test for the workspace resolution**

Der Spec verlangt, dass die Workspace-Auflösung aus einem expliziten `workspaceId` kommt statt aus `getActiveWorkspace()`. Diese Entscheidung wird als reine Funktion herausgezogen und getestet.

An `test/main/entity-claudemd-assembly.test.ts` anhängen:

```ts
const { resolveEntityWorkspace } = require('../../src/main/workspace/workspace-utils')

const WORKSPACES = [
  { id: 'ws-alpha', name: 'Alpha', workspacePrompt: 'Prompt A', contextPaths: ['/a'] },
  { id: 'ws-beta', name: 'Beta', workspacePrompt: 'Prompt B', contextPaths: ['/b'] },
]

describe('resolveEntityWorkspace', () => {
  it('takes the explicitly requested workspace, not the active one', () => {
    const ws = resolveEntityWorkspace('ws-beta', WORKSPACES, 'ws-alpha')
    assert.equal(ws?.id, 'ws-beta')
    assert.equal(ws?.workspacePrompt, 'Prompt B')
  })

  it('falls back to the active workspace when the caller did not choose', () => {
    const ws = resolveEntityWorkspace(undefined, WORKSPACES, 'ws-alpha')
    assert.equal(ws?.id, 'ws-alpha')
  })

  it('treats an explicit null as unbound and does NOT fall back to active', () => {
    assert.equal(resolveEntityWorkspace(null, WORKSPACES, 'ws-alpha'), null)
  })

  it('returns null for a workspace id that no longer exists', () => {
    assert.equal(resolveEntityWorkspace('ws-deleted', WORKSPACES, 'ws-alpha'), null)
  })

  it('returns null when nothing is chosen and nothing is active', () => {
    assert.equal(resolveEntityWorkspace(undefined, WORKSPACES, null), null)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-claudemd-assembly.test.ts`
Expected: FAIL mit `resolveEntityWorkspace is not a function`.

- [ ] **Step 3: Implement the resolver**

An `src/main/workspace/workspace-utils.ts` anhängen:

```ts
/**
 * Resolve the workspace an entity session should use.
 *
 * undefined = caller expressed no preference → fall back to the active one.
 * null      = caller explicitly wants no binding → stays unbound.
 *
 * Pure: takes the workspace list and the active id as arguments so the
 * decision can be tested without ConfigStore.
 */
export function resolveEntityWorkspace(
  workspaceId: string | null | undefined,
  workspaces: readonly Workspace[],
  activeWorkspaceId: string | null,
): Workspace | null {
  if (workspaceId === null) return null
  const targetId = workspaceId ?? activeWorkspaceId
  if (!targetId) return null
  return workspaces.find(w => w.id === targetId) ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-claudemd-assembly.test.ts`
Expected: PASS, die 5 neuen Tests plus die bestehenden.

- [ ] **Step 5: Add the imports to SessionManager**

Oben in `src/main/session/session-manager.ts` zu den bestehenden Imports:

```ts
import { ensureRunDir } from './entity-run-dir'
import { configStore } from '../config/config-store'
```

Den bestehenden Import aus `workspace-utils` erweitern:

```ts
import { getActiveWorkspace, resolveEntityWorkspace } from '../workspace/workspace-utils'
```

- [ ] **Step 6: Resolve the workspace and the run directory at the top of startEntity()**

Direkt nach dem Registry-Lookup in `startEntity()` (nach `if (!config) throw ...`, Zeile ~1000):

```ts
    const targetWorkspace = resolveEntityWorkspace(
      opts?.workspaceId,
      (configStore.get('workspaces') ?? []) as Workspace[],
      (configStore.get('activeWorkspaceId') ?? null) as string | null,
    )
    const workspaceId = targetWorkspace?.id ?? null
    // Authored artefacts (preset.md, skills, guides) stay in the entity dir.
    // Generated artefacts (CLAUDE.md, .mcp.json, settings) go to the run dir,
    // which is separate per workspace — that is what stops two instances in
    // different workspaces from overwriting each other's CLAUDE.md.
    const entityDir = config.projectPath
    const runDir = ensureRunDir(workspaceId, entityId, entityDir, ['skills'])
```

`Workspace` muss als Typ importiert werden: `import type { Workspace } from '../../shared/persona-types'`.

- [ ] **Step 7: Keep authored writes on the entity dir, move generated writes to the run dir**

Im Block ab Zeile 1022 bleibt `fs.mkdirSync(config.projectPath, ...)` unverändert — das Entity-Verzeichnis wird weiterhin gebraucht.

Diese drei Schreibvorgänge wechseln von `config.projectPath` auf `runDir`:

1. `.mcp-connection.md` (Zeile ~1107): `path.join(runDir, '.mcp-connection.md')`
2. `.claude/settings.local.json` mit den MCP-Permissions (Zeile ~1119): `const claudeDir = path.join(runDir, '.claude')`
3. `.mcp.json` (Zeile ~1101): `const mcpJsonPath = path.join(runDir, '.mcp.json')`

Unverändert auf `config.projectPath` bleiben alle `preset.md`-Schreibvorgänge und die `deploy*`-Aufrufe (`deployCompanionGuides`, `deployRefinementSkills`, …).

- [ ] **Step 8: Assemble CLAUDE.md from the entity dir into the run dir**

Der Assembly-Block (Zeile ~1114) liest heute `preset.md` und `CLAUDE.md` aus `config.projectPath` und schreibt nach `config.projectPath`. Neu:

```ts
    {
      // Source of truth stays in the entity dir; the assembled result lands in
      // the run dir, which is the session's cwd.
      const presetMdPath = path.join(config.projectPath, 'preset.md')
      const legacyClaudeMdPath = path.join(config.projectPath, 'CLAUDE.md')
      const claudeMdPath = path.join(runDir, 'CLAUDE.md')

      let presetContent: string | null = null
      if (fs.existsSync(presetMdPath)) {
        presetContent = fs.readFileSync(presetMdPath, 'utf-8')
      } else if (fs.existsSync(legacyClaudeMdPath)) {
        presetContent = fs.readFileSync(legacyClaudeMdPath, 'utf-8')
      }

      if (presetContent !== null) {
        // Explicit opts win; otherwise the workspace this session is bound to
        // (already resolved in Step 6 — no second lookup, no getActiveWorkspace()).
        let wsPrompt = opts?.workspacePrompt
        let wsPaths = opts?.contextPaths
        if (!wsPrompt && !wsPaths && targetWorkspace) {
          if (targetWorkspace.workspacePrompt?.trim()) wsPrompt = targetWorkspace.workspacePrompt.trim()
          if (targetWorkspace.contextPaths?.length) wsPaths = targetWorkspace.contextPaths
        }
        const assembled = this.assembleEntityClaudeMd(
          presetContent,
          entityId,
          wsPrompt,
          wsPaths,
        )
        fs.writeFileSync(claudeMdPath, assembled, 'utf-8')
      }
    }
```

Der bisherige `getActiveWorkspace()`-Aufruf an dieser Stelle (Zeile ~1136) entfällt damit — das ist genau die Umstellung, die der Spec verlangt. Prüfen, ob `getActiveWorkspace` in `session-manager.ts` danach noch benutzt wird; wenn nicht, den Import entfernen, sonst meldet ESLint eine ungenutzte Variable.

- [ ] **Step 9: Start the session in the run directory and bind the workspace**

Der `this.start({...})`-Aufruf (Zeile ~1163). `opts.projectPath` muss herausgezogen werden, bevor gespreadet wird — sonst überschreibt ein mitgegebener Pfad das Run-Verzeichnis, und ein doppelter Key im Literal verstößt gegen `no-dupe-keys`:

```ts
    const { projectPath: _callerProjectPath, ...restOpts } = opts ?? {}
    const session = await this.start({
      name: displayName,
      ...restOpts,
      projectPath: runDir,
      workspaceId,
      _entityInjected: true,
    })
```

- [ ] **Step 10: Point the post-start Session-Identity injection at the run dir**

Der Block direkt nach `start()` (Zeile ~1170) injiziert die Session-ID in die CLAUDE.md. Pfad von `config.projectPath` auf `runDir` umstellen:

```ts
        const claudeMdPath = path.join(runDir, 'CLAUDE.md')
```

- [ ] **Step 11: Sweep for remaining entity-dir assumptions**

Run: `grep -n "config.projectPath" src/main/session/session-manager.ts`
Jede Fundstelle prüfen: Schreibt sie ein *authored* Artefakt (preset.md, deploy*) → bleibt. Schreibt oder liest sie ein *generiertes* (CLAUDE.md, .mcp.json, .claude/settings.local.json) → muss `runDir` sein.

Zusätzlich: `grep -rn "entities/" src/main/ --include="*.ts" | grep -v entity-registry` — Stellen, die das Entity-Verzeichnis als cwd annehmen (z. B. Handoff- oder Diagnose-Code), auflisten und im Commit-Text benennen, falls welche auftauchen.

- [ ] **Step 12: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren. Besonders auf `entity-claudemd-assembly.test.ts` achten — die Assembly-Funktion selbst ist unverändert, nur ihr Ziel-Pfad.

- [ ] **Step 13: Commit**

```bash
git add src/main/session/session-manager.ts src/main/workspace/workspace-utils.ts \
        test/main/entity-claudemd-assembly.test.ts
git commit -m "feat(session): Entity-Sessions laufen im Run-Verzeichnis ihres Workspace"
```

---

## Task 4: `singleInstance` und Start-Mutex gelten pro Workspace

**Files:**
- Create: `src/main/session/entity-session-lookup.ts`
- Modify: `src/main/session/session-manager.ts` (Mutex Zeile 1002–1006, Singleton-Check Zeile 1009–1020, `getEntitySessionId()` Zeile 1332)
- Test: `test/main/entity-session-lookup.test.ts`

**Interfaces:**
- Produces:
  - `type LookupSession = { id: string; entityId?: string; status: string; workspaceId?: string | null }`
  - `findEntitySessions(sessions: LookupSession[], entityId: string, workspaceId: string | null): LookupSession[]` — nur aktive Sessions dieses Entity in diesem Workspace.
  - `hasActiveEntitySession(sessions: LookupSession[], entityId: string, workspaceId: string | null): boolean`
  - `entityStartKey(entityId: string, workspaceId: string | null): string` — Mutex-Schlüssel, Format `<entityId>@<workspaceKey>`.
- Consumes: `workspaceKey` aus `src/shared/workspace-key.ts` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `test/main/entity-session-lookup.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  findEntitySessions,
  hasActiveEntitySession,
  entityStartKey,
} = require('../../src/main/session/entity-session-lookup')

const SESSIONS = [
  { id: 's1', entityId: 'companion', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's2', entityId: 'companion', status: 'active', workspaceId: 'ws-beta' },
  { id: 's3', entityId: 'companion', status: 'exited', workspaceId: 'ws-alpha' },
  { id: 's4', entityId: 'debugger', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's5', entityId: 'audit', status: 'active', workspaceId: null },
  { id: 's6', entityId: 'audit', status: 'active' },
  { id: 's7', status: 'active', workspaceId: 'ws-alpha' },
]

describe('findEntitySessions', () => {
  it('matches only the requested entity in the requested workspace', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-alpha')
    assert.deepEqual(found.map((s: any) => s.id), ['s1'])
  })

  it('does not leak sessions across workspaces', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-beta')
    assert.deepEqual(found.map((s: any) => s.id), ['s2'])
  })

  it('ignores sessions that are not active', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-alpha')
    assert.equal(found.some((s: any) => s.id === 's3'), false)
  })

  it('treats a missing workspaceId as unbound, same as null', () => {
    const found = findEntitySessions(SESSIONS, 'audit', null)
    assert.deepEqual(found.map((s: any) => s.id), ['s5', 's6'])
  })

  it('ignores sessions without an entityId', () => {
    const found = findEntitySessions(SESSIONS, 'companion', 'ws-alpha')
    assert.equal(found.some((s: any) => s.id === 's7'), false)
  })

  it('returns an empty array when nothing matches', () => {
    assert.deepEqual(findEntitySessions(SESSIONS, 'refinement', 'ws-alpha'), [])
  })
})

describe('hasActiveEntitySession', () => {
  it('is true where the entity runs', () => {
    assert.equal(hasActiveEntitySession(SESSIONS, 'debugger', 'ws-alpha'), true)
  })

  it('is false in a workspace where it does not run — this is what lets a singleInstance entity start a second time elsewhere', () => {
    assert.equal(hasActiveEntitySession(SESSIONS, 'debugger', 'ws-beta'), false)
  })

  it('is false for an unbound lookup when the entity only runs bound', () => {
    assert.equal(hasActiveEntitySession(SESSIONS, 'debugger', null), false)
  })
})

describe('entityStartKey', () => {
  it('separates the same entity across workspaces', () => {
    assert.notEqual(entityStartKey('companion', 'ws-alpha'), entityStartKey('companion', 'ws-beta'))
  })

  it('uses the _global sentinel when unbound', () => {
    assert.equal(entityStartKey('companion', null), 'companion@_global')
  })

  it('is stable for the same pair', () => {
    assert.equal(entityStartKey('companion', 'ws-alpha'), 'companion@ws-alpha')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-session-lookup.test.ts`
Expected: FAIL mit `Cannot find module '../../src/main/session/entity-session-lookup'`.

- [ ] **Step 3: Write the implementation**

Create `src/main/session/entity-session-lookup.ts`:

```ts
// src/main/session/entity-session-lookup.ts — Pure lookups over a session list.
//
// Kept free of SessionManager so the same rules can be applied by the handoff
// kernel and mirrored by the renderer's status derivation without three
// slightly different implementations drifting apart.

import { workspaceKey } from '../../shared/workspace-key'

export interface LookupSession {
  id: string
  entityId?: string | null
  status: string
  workspaceId?: string | null
}

/** Active sessions of one entity inside one workspace. */
export function findEntitySessions<T extends LookupSession>(
  sessions: readonly T[],
  entityId: string,
  workspaceId: string | null,
): T[] {
  const key = workspaceKey(workspaceId)
  return sessions.filter(
    s => s.entityId === entityId
      && s.status === 'active'
      && workspaceKey(s.workspaceId) === key,
  )
}

/** Whether the entity already runs in this workspace. */
export function hasActiveEntitySession(
  sessions: readonly LookupSession[],
  entityId: string,
  workspaceId: string | null,
): boolean {
  return findEntitySessions(sessions, entityId, workspaceId).length > 0
}

/**
 * Mutex key for the concurrent-start guard. Per (entity, workspace) — a
 * key of just the entity would block starting the same preset in two
 * workspaces at once.
 */
export function entityStartKey(entityId: string, workspaceId: string | null): string {
  return `${entityId}@${workspaceKey(workspaceId)}`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-session-lookup.test.ts`
Expected: PASS, 12 Tests.

- [ ] **Step 5: Rewire the mutex in SessionManager**

Import ergänzen:

```ts
import { findEntitySessions, hasActiveEntitySession, entityStartKey } from './entity-session-lookup'
```

Feld-Deklaration (Zeile 159) — Typ bleibt `Set<string>`, aber der Inhalt sind jetzt zusammengesetzte Schlüssel. Kommentar anpassen:

```ts
  /** Mutex: (entity, workspace) pairs currently being started — prevents double-start races. */
  private startingEntities: Set<string> = new Set()
```

In `startEntity()`, der Mutex-Block (Zeile 1002–1006):

```ts
    const startKey = entityStartKey(entityId, workspaceId)
    if (this.startingEntities.has(startKey)) {
      throw new Error(`${config.displayName} is already starting`)
    }
    this.startingEntities.add(startKey)
```

Und der zugehörige `finally`-Block am Ende von `startEntity()` (dort steht heute `this.startingEntities.delete(entityId)`):

```ts
      this.startingEntities.delete(startKey)
```

Run: `grep -n "startingEntities" src/main/session/session-manager.ts` — alle Fundstellen müssen `startKey` nutzen, keine mehr `entityId`.

- [ ] **Step 6: Rewire the singleton check**

Der Block Zeile 1009–1020 ersetzt durch:

```ts
    // Singleton check — singleInstance means "once per workspace", not app-wide.
    if (config.singleInstance) {
      const active = findEntitySessions(this.list(), entityId, workspaceId)
      if (active.length > 0) {
        throw new Error(`${config.displayName} is already running`)
      }
      // Drop stale links for this entity whose sessions are gone.
      for (const eid of this.getAllEntitySessionIds(entityId)) {
        if (!this.sessions.has(eid)) {
          this.removeEntitySession(entityId, eid)
          this.entityRegistry.unlinkSession(eid)
        }
      }
    }
```

- [ ] **Step 7: Check the remaining callers of getEntitySessionId()**

Run: `grep -rn "getEntitySessionId\b" src/`

`getEntitySessionId(entityId)` bleibt unverändert — es liefert eine beliebige Instanz des Entity, unabhängig vom Workspace. Für jeden Aufrufer entscheiden und im Commit-Text festhalten: reicht "irgendeine Instanz" (dann bleibt es), oder braucht er den Workspace (dann `findEntitySessions(this.list(), entityId, workspaceId)[0]?.id ?? null` inline)?

Keine neue Methode auf Vorrat anlegen — `hasActiveEntitySession` und `findEntitySessions` decken die Fälle dieses Pakets ab.

- [ ] **Step 8: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren.

- [ ] **Step 9: Commit**

```bash
git add src/main/session/entity-session-lookup.ts \
        test/main/entity-session-lookup.test.ts \
        src/main/session/session-manager.ts
git commit -m "feat(session): singleInstance und Start-Mutex gelten pro Workspace"
```

---

## Task 5: MCP-Workspace-Header — Parsen und Config-Bau

**Files:**
- Create: `src/main/mcp/workspace-header.ts`
- Test: `test/main/mcp-workspace-header.test.ts`

**Interfaces:**
- Produces:
  - `WORKSPACE_HEADER = 'x-mux-workspace'` (lowercase — Node normalisiert eingehende Header so)
  - `parseWorkspaceHeader(headers: Record<string, string | string[] | undefined>): string | null`
  - `resolveWorkspaceId(raw: string | null, knownWorkspaceIds: readonly string[]): string | null`
  - `buildMcpServerConfig(mcpUrl: string, apiKey: string, workspaceId: string | null): { type: 'http'; url: string; headers: Record<string, string> }`
- Consumes: nichts. Wird in Task 6 (Schreiben) und Task 7 (Lesen) verdrahtet.

- [ ] **Step 1: Write the failing test**

Create `test/main/mcp-workspace-header.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  WORKSPACE_HEADER,
  parseWorkspaceHeader,
  resolveWorkspaceId,
  buildMcpServerConfig,
} = require('../../src/main/mcp/workspace-header')

describe('parseWorkspaceHeader', () => {
  it('reads the lowercase header name Node hands us', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': 'ws-alpha' }), 'ws-alpha')
  })

  it('returns null when the header is absent — an older client must keep working', () => {
    assert.equal(parseWorkspaceHeader({ authorization: 'Bearer x' }), null)
  })

  it('returns null for an empty or whitespace-only value', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': '' }), null)
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': '   ' }), null)
  })

  it('trims surrounding whitespace', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': ' ws-alpha ' }), 'ws-alpha')
  })

  it('takes the first value when the header arrives repeated', () => {
    assert.equal(parseWorkspaceHeader({ 'x-mux-workspace': ['ws-alpha', 'ws-beta'] }), 'ws-alpha')
  })

  it('exposes the header name in lowercase', () => {
    assert.equal(WORKSPACE_HEADER, 'x-mux-workspace')
  })
})

describe('resolveWorkspaceId', () => {
  it('accepts a known workspace', () => {
    assert.equal(resolveWorkspaceId('ws-alpha', ['ws-alpha', 'ws-beta']), 'ws-alpha')
  })

  it('falls back to null for an unknown workspace instead of throwing', () => {
    assert.equal(resolveWorkspaceId('ws-deleted', ['ws-alpha']), null)
  })

  it('passes null straight through', () => {
    assert.equal(resolveWorkspaceId(null, ['ws-alpha']), null)
  })

  it('falls back to null when no workspaces exist at all', () => {
    assert.equal(resolveWorkspaceId('ws-alpha', []), null)
  })
})

describe('buildMcpServerConfig', () => {
  it('includes the workspace header when bound', () => {
    const cfg = buildMcpServerConfig('http://127.0.0.1:7777/mcp', 'key123', 'ws-alpha')
    assert.equal(cfg.type, 'http')
    assert.equal(cfg.url, 'http://127.0.0.1:7777/mcp')
    assert.equal(cfg.headers.Authorization, 'Bearer key123')
    assert.equal(cfg.headers['X-Mux-Workspace'], 'ws-alpha')
  })

  it('omits the header entirely when unbound — not an empty string', () => {
    const cfg = buildMcpServerConfig('http://127.0.0.1:7777/mcp', 'key123', null)
    assert.equal('X-Mux-Workspace' in cfg.headers, false)
    assert.equal(cfg.headers.Authorization, 'Bearer key123')
  })

  it('round-trips through parseWorkspaceHeader with lowercased keys', () => {
    const cfg = buildMcpServerConfig('http://x/mcp', 'k', 'ws-alpha')
    const lowered: Record<string, string> = {}
    for (const [k, v] of Object.entries(cfg.headers)) lowered[k.toLowerCase()] = v
    assert.equal(parseWorkspaceHeader(lowered), 'ws-alpha')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/mcp-workspace-header.test.ts`
Expected: FAIL mit `Cannot find module '../../src/main/mcp/workspace-header'`.

- [ ] **Step 3: Write the implementation**

Create `src/main/mcp/workspace-header.ts`:

```ts
// src/main/mcp/workspace-header.ts — Workspace identity on the MCP connection.
//
// The MCP server cannot otherwise tell its callers apart: one URL, one bearer
// token for everyone. Rather than asking the model to pass a workspace id as a
// tool parameter (which it can forget, silently writing into the wrong
// workspace), the identity rides on the connection headers and is bound once
// at initialize time.

/** Header name as Node normalises incoming headers: lowercase. */
export const WORKSPACE_HEADER = 'x-mux-workspace'

/** Header name as written into .mcp.json / settings.local.json. */
export const WORKSPACE_HEADER_CANONICAL = 'X-Mux-Workspace'

/**
 * Read the workspace binding off an incoming request's headers.
 * Returns null for absent, empty or whitespace-only values.
 */
export function parseWorkspaceHeader(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const raw = headers[WORKSPACE_HEADER]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Validate a raw header value against the workspaces that currently exist.
 * An unknown id is treated as unbound rather than as an error — a client
 * whose workspace was deleted mid-session must keep working.
 */
export function resolveWorkspaceId(
  raw: string | null,
  knownWorkspaceIds: readonly string[],
): string | null {
  if (raw === null) return null
  if (knownWorkspaceIds.includes(raw)) return raw
  console.warn(`[mcp] unknown workspace id in ${WORKSPACE_HEADER_CANONICAL}: "${raw}" — treating as unbound`)
  return null
}

/**
 * Build the `mcpServers['cipher-mux']` entry written into .mcp.json and
 * settings.local.json. Omits the workspace header when unbound so an unbound
 * session is indistinguishable from a pre-upgrade one.
 */
export function buildMcpServerConfig(
  mcpUrl: string,
  apiKey: string,
  workspaceId: string | null,
): { type: 'http'; url: string; headers: Record<string, string> } {
  const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` }
  if (workspaceId) headers[WORKSPACE_HEADER_CANONICAL] = workspaceId
  return { type: 'http', url: mcpUrl, headers }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/mcp-workspace-header.test.ts`
Expected: PASS, 13 Tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/mcp/workspace-header.ts test/main/mcp-workspace-header.test.ts
git commit -m "feat(mcp): Workspace-Header parsen, validieren und Server-Config bauen"
```

---

## Task 6: Header in `.mcp.json` und `settings.local.json` schreiben

**Files:**
- Modify: `src/main/agent/agent-adapter.ts` (Interface `AdapterContext` ab Zeile 49)
- Modify: `src/main/agent/adapters/claude-code.ts` (`postLaunchInjection()` ab Zeile 76, `mcpServerConfig`-Literal Zeile 77–81)
- Modify: `src/main/session/session-manager.ts` (`.mcp.json`-Block ab Zeile 1098, Adapter-Aufruf Zeile 269–274)
- Test: keiner neu — `buildMcpServerConfig` ist in Task 5 getestet

**Interfaces:**
- Consumes: `buildMcpServerConfig` aus Task 5; `StartSessionOpts.workspaceId` aus Task 1.
- Produces: `AdapterContext.workspaceId: string | null`.

- [ ] **Step 1: Extend AdapterContext**

In `src/main/agent/agent-adapter.ts`, `AdapterContext` (Zeile 49):

```ts
export interface AdapterContext {
  /** Absolute path to the project directory */
  projectPath: string
  /** MCP server URL (full, including /mcp path) */
  mcpUrl: string
  /** MCP auth key */
  mcpApiKey: string
  /** Session ULID */
  sessionId: string
  /** Workspace this session is bound to. null = unbound. */
  workspaceId: string | null
}
```

- [ ] **Step 2: Use the shared builder in the adapter**

In `src/main/agent/adapters/claude-code.ts`, Import ergänzen:

```ts
import { buildMcpServerConfig } from '../../mcp/workspace-header'
```

Das Literal in `postLaunchInjection()` (Zeile 77–81) ersetzen:

```ts
  async postLaunchInjection(ctx: AdapterContext): Promise<void> {
    const mcpServerConfig = buildMcpServerConfig(ctx.mcpUrl, ctx.mcpApiKey, ctx.workspaceId)
```

Der Rest der Methode (drei Schreibpfade) bleibt unverändert — alle drei serialisieren `mcpServerConfig`.

- [ ] **Step 3: Pass the workspace into the adapter call**

In `src/main/session/session-manager.ts`, `start()` (Zeile 269–274):

```ts
          await adapter.postLaunchInjection({
            projectPath: opts.projectPath,
            mcpUrl: mcpFullUrl,
            mcpApiKey: this.mcpConfig.mcpApiKey,
            sessionId: id,
            workspaceId: opts.workspaceId ?? null,
          })
```

- [ ] **Step 4: Use the builder for the entity .mcp.json too**

In `startEntity()`, der `.mcp.json`-Block (Zeile ~1098), unter Verwendung des `runDir` aus Task 3:

```ts
    if (config.features.includes('mcp') && this.mcpConfig) {
      const mcpUrl = `http://${this.mcpConfig.mcpHost}:${this.mcpConfig.mcpPort}/mcp`
      const mcpJsonPath = path.join(runDir, '.mcp.json')
      const mcpJson = {
        mcpServers: {
          'cipher-mux': buildMcpServerConfig(mcpUrl, this.mcpConfig.mcpApiKey, workspaceId),
        },
      }
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2), 'utf-8')
    }
```

Import in `session-manager.ts` ergänzen:

```ts
import { buildMcpServerConfig } from '../mcp/workspace-header'
```

- [ ] **Step 5: Find every other AdapterContext construction**

Run: `grep -rn "postLaunchInjection\|AdapterContext" src/ test/ --include="*.ts"`
Jede Stelle, die ein `AdapterContext`-Objekt baut (inklusive Mocks in Tests), braucht das neue Pflichtfeld `workspaceId`. TypeScript zeigt sie ohnehin an — dieser Schritt stellt sicher, dass auch Test-Mocks aktualisiert werden.

- [ ] **Step 6: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren.

- [ ] **Step 7: Commit**

```bash
git add src/main/agent/agent-adapter.ts src/main/agent/adapters/claude-code.ts \
        src/main/session/session-manager.ts
git commit -m "feat(mcp): X-Mux-Workspace-Header in .mcp.json und settings.local.json schreiben"
```

---

## Task 7: Header beim `initialize` in den Tool-Kontext binden

**Files:**
- Modify: `src/main/mcp/mcp-server.ts` (`createSession()` Zeile 137–176, `handleRequest()` Zeile ~183, `routePost()` Zeile ~283–300)
- Modify: `src/main/mcp/mcp-tools.ts` (Interface `ToolContext` Zeile 23–38)
- Test: keiner neu — Parsing und Validierung sind in Task 5 getestet

**Interfaces:**
- Consumes: `parseWorkspaceHeader`, `resolveWorkspaceId` aus Task 5.
- Produces: `ToolContext.workspaceId: string | null` — der Workspace der rufenden Verbindung. **Paket B** tauscht damit die Scope-Quelle in den Notes- und Memory-Tools; **Paket A** nutzt ihn nur im Handoff-Kernel (Task 8).

- [ ] **Step 1: Add the field to ToolContext**

In `src/main/mcp/mcp-tools.ts`, `ToolContext` (Zeile 23):

```ts
export interface ToolContext {
  sessionManager: SessionManager
  // ... unverändert ...
  getFocusedSessionId?: () => string | null
  /**
   * Workspace of the connection these tools were registered for.
   * null = unbound (no header, or an id that no longer exists).
   * Bound once per MCP session at initialize — never read from
   * configStore at call time, which is the whole point.
   */
  workspaceId?: string | null
}
```

- [ ] **Step 2: Thread the header through createSession()**

In `src/main/mcp/mcp-server.ts`, Import ergänzen:

```ts
import { parseWorkspaceHeader, resolveWorkspaceId } from './workspace-header'
```

`createSession()` (Zeile 137) bekommt einen Parameter und bindet den Workspace in den Tool-Kontext:

```ts
  private async createSession(workspaceId: string | null = null): Promise<McpSession> {
    // Enforce session limit — evict oldest if at capacity
    if (this.sessions.size >= MAX_MCP_SESSIONS) {
      await this.evictOldestSession()
    }

    const mcpServer = new McpServer(
      { name: APP_NAME, version: APP_VERSION },
      { capabilities: { tools: {} } }
    )

    // Bind the workspace into this session's tool closures. Tools registered
    // here see one workspace for their whole lifetime — that binding is the
    // per-session identity the transport cannot otherwise provide.
    registerTools(mcpServer, { ...this.toolCtx!, workspaceId })

    // ... Rest unverändert ...
```

- [ ] **Step 3: Resolve the header at the initialize request**

In `routePost()`, im `isInit`-Zweig (Zeile 286–292). Der Block sieht heute so aus:

```ts
    if (!sessionId) {
      // Check if the body contains an initialize method
      const isInit = this.isInitializeRequest(body)
      if (isInit) {
        try {
          const session = await this.createSession()
          session.lastActivity = Date.now()
          res.on('finish', () => { session.lastActivity = Date.now() })
          session.transport.handleRequest(req, res, body)
        } catch (err) {
```

Nur der `createSession()`-Aufruf ändert sich:

```ts
      if (isInit) {
        try {
          // Bind the workspace once, here — this is the only point in the
          // connection's life where the client's headers are available.
          const workspaceId = resolveWorkspaceId(
            parseWorkspaceHeader(req.headers),
            this.listKnownWorkspaceIds(),
          )
          const session = await this.createSession(workspaceId)
          session.lastActivity = Date.now()
          res.on('finish', () => { session.lastActivity = Date.now() })
          session.transport.handleRequest(req, res, body)
        } catch (err) {
```

Run: `grep -n "createSession(" src/main/mcp/mcp-server.ts` — es darf nach der Änderung nur noch diesen einen Aufrufer plus die Definition geben. Falls ein weiterer auftaucht, bekommt er denselben aufgelösten Workspace.

- [ ] **Step 4: Add the workspace lookup helper**

Als private Methode in `McpServerManager`:

```ts
  /**
   * IDs of the workspaces that currently exist. Read at initialize only —
   * a workspace deleted later leaves its bound sessions alone.
   */
  private listKnownWorkspaceIds(): string[] {
    try {
      const { configStore } = require('../config/config-store')
      const workspaces = (configStore.get('workspaces') ?? []) as Array<{ id: string }>
      return workspaces.map(w => w.id)
    } catch {
      return []
    }
  }
```

- [ ] **Step 5: Log the binding so it is diagnosable**

Im Log-Statement von `createSession()` (Zeile ~175):

```ts
    console.log(`[McpServer] new session created: ${sessionId} workspace=${workspaceId ?? '_global'} (total: ${this.sessions.size})`)
```

- [ ] **Step 6: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren. `mcp-server-lifecycle.test.ts` besonders beachten — falls es `createSession()` direkt aufruft, funktioniert der Default-Parameter, aber der Test sollte zusätzlich einen gebundenen Fall abdecken, wenn er die Signatur ohnehin anfasst.

- [ ] **Step 7: Commit**

```bash
git add src/main/mcp/mcp-server.ts src/main/mcp/mcp-tools.ts
git commit -m "feat(mcp): Workspace beim initialize in den Tool-Kontext binden"
```

---

## Task 8: Handoff-Routing bleibt im Workspace des Aufrufers

**Files:**
- Modify: `src/main/mcp/handoff-kernel.ts` (`findBestSession()` Zeile 80–121, `startEntitySession()` Zeile 153–170, Aufrufstelle Zeile ~205)
- Test: `test/main/handoff-workspace-routing.test.ts`

**Interfaces:**
- Consumes: `findEntitySessions` aus Task 4; `ToolContext.workspaceId` aus Task 7.
- Produces: `findBestSession(ctx, entityId)` berücksichtigt `ctx.workspaceId`; `startEntitySession(ctx, entityId, opts)` setzt `workspaceId: ctx.workspaceId ?? null`.

- [ ] **Step 1: Write the failing test**

Create `test/main/handoff-workspace-routing.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { findBestSession } = require('../../src/main/mcp/handoff-kernel')

/**
 * Minimal ToolContext stand-in.
 * isBusy() (handoff-kernel.ts:56) reads (sessionManager as any).tmux.getPaneCommand()
 * with `session.tmuxPane ?? session.tmuxSession` as the target, and treats a
 * command containing 'claude' as busy.
 */
function ctxWith(sessions: any[], workspaceId: string | null, busyTargets: string[] = []) {
  return {
    workspaceId,
    sessionManager: {
      list: () => sessions,
      getEntityRegistry: () => ({
        get: (id: string) => ({ id, displayName: id, singleInstance: id === 'debugger' }),
      }),
      tmux: {
        getPaneCommand: async (target: string) =>
          busyTargets.includes(target) ? 'claude' : 'zsh',
      },
    },
    statusLineMonitor: null,
  }
}

const SESSIONS = [
  { id: 'd-alpha', entityId: 'debugger', status: 'active', workspaceId: 'ws-alpha', tmuxSession: 't1', tmuxPane: null },
  { id: 'd-beta', entityId: 'debugger', status: 'active', workspaceId: 'ws-beta', tmuxSession: 't2', tmuxPane: null },
]

describe('findBestSession — workspace isolation', () => {
  it('picks the entity session in the caller workspace', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-alpha'), 'debugger')
    assert.equal(result?.session.id, 'd-alpha')
  })

  it('picks the other workspace when the caller sits there', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-beta'), 'debugger')
    assert.equal(result?.session.id, 'd-beta')
  })

  it('returns null when the entity runs only in a foreign workspace — the caller must start its own', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-gamma'), 'debugger')
    assert.equal(result, null)
  })

  it('an unbound caller does not reach into bound sessions', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, null), 'debugger')
    assert.equal(result, null)
  })

  it('an unbound caller finds unbound sessions', async () => {
    const sessions = [{ id: 'd-global', entityId: 'debugger', status: 'active', workspaceId: null, tmuxSession: 't3' }]
    const result = await findBestSession(ctxWith(sessions, null), 'debugger')
    assert.equal(result?.session.id, 'd-global')
  })

  it('returns null when no session of that entity exists at all', async () => {
    const result = await findBestSession(ctxWith(SESSIONS, 'ws-alpha'), 'refinement')
    assert.equal(result, null)
  })
})
```

Hinweis: `findBestSession` ist derzeit **nicht exportiert** (`async function findBestSession`, Zeile 81). Schritt 3 exportiert sie.

Da alle Mock-Sessions hier als idle gelten (`getPaneCommand` liefert `'zsh'`), greift immer Priorität 1 — genau das, was diese Tests prüfen wollen: die Workspace-Filterung *vor* der Prioritätslogik. Die Prioritäten selbst sind unverändert und bleiben ungetestet wie bisher.

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/handoff-workspace-routing.test.ts`
Expected: FAIL mit `findBestSession is not a function`.

- [ ] **Step 3: Export and filter by workspace**

In `src/main/mcp/handoff-kernel.ts`, Import ergänzen:

```ts
import { findEntitySessions } from '../session/entity-session-lookup'
```

`findBestSession` exportieren und die Kandidatenauswahl ersetzen (Zeile 80–88):

```ts
export async function findBestSession(
  ctx: ToolContext,
  entityId: EntityId,
): Promise<{ session: SessionInfo; wasExisting: true } | null> {
  // Stay inside the caller's workspace. A handoff from workspace B must not
  // land in the debugger sitting in workspace A — it starts its own instead.
  const entitySessions = findEntitySessions(
    ctx.sessionManager.list(),
    entityId,
    ctx.workspaceId ?? null,
  )

  if (entitySessions.length === 0) return null
```

Der Rest der Funktion (Priorität 1–5) bleibt unverändert.

- [ ] **Step 4: Inherit the workspace when starting a new session**

`startEntitySession()` (Zeile 153):

```ts
export async function startEntitySession(
  ctx: ToolContext,
  entityId: EntityId,
  opts?: { projectPath?: string; name?: string },
): Promise<SessionInfo> {
  const session = await ctx.sessionManager.startEntity(entityId, {
    name: opts?.name ?? entityId,
    workspaceId: ctx.workspaceId ?? null,
    ...(opts?.projectPath ? { projectPath: opts.projectPath } : {}),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/handoff-workspace-routing.test.ts`
Expected: PASS, 6 Tests.

- [ ] **Step 6: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren.

- [ ] **Step 7: Commit**

```bash
git add src/main/mcp/handoff-kernel.ts test/main/handoff-workspace-routing.test.ts
git commit -m "feat(mcp): Handoff-Routing bleibt im Workspace des Aufrufers"
```

---

## Task 9: IPC-Kanal — Workspace beim Preset-Start übergeben

**Files:**
- Modify: `src/main/preload.ts` (Zeile 400)
- Modify: `src/main/ipc-hub.ts` (`ENTITY_START`-Handler Zeile 2266–2290; Keep-Working-Snapshot Zeile 2965–2993; `/tmp/kw-debug.json` Zeile 421–431)
- Test: keiner neu — der Handler ist dünne Verdrahtung; das Snapshot-Feld wird in Task 12 manuell abgenommen

**Interfaces:**
- Consumes: `startEntity(entityId, { workspaceId })` aus Task 3.
- Produces: `api.entity.start(entityId, workspaceId?)` im Renderer; `keepWorkingSnapshot.sessions[].workspaceId`.

- [ ] **Step 1: Widen the preload signature**

In `src/main/preload.ts`, Zeile 400:

```ts
    start: (entityId: string, workspaceId?: string | null) =>
      ipcRenderer.invoke(IPC.ENTITY_START, { entityId, workspaceId: workspaceId ?? undefined }),
```

- [ ] **Step 2: Resolve the workspace in the IPC handler**

In `src/main/ipc-hub.ts`, `ENTITY_START` (Zeile 2266):

```ts
    ipcMain.handle(IPC.ENTITY_START, async (_e, { entityId, workspaceId }: {
      entityId: EntityId
      workspaceId?: string | null
    }) => {
      // Feature flag gate: debugger is opt-in (defaults to disabled)
      if (entityId === 'debugger') {
        const debuggerConfig = configStore.get('debugger')
        if (!debuggerConfig?.enabled) {
          throw new Error('Debugger is disabled. Enable it in Settings → Debugger.')
        }
      }

      // Explicit choice wins; otherwise the globally active workspace.
      // undefined means "caller did not choose" — null means "explicitly unbound".
      const effectiveWorkspaceId = workspaceId === undefined
        ? (configStore.get('activeWorkspaceId') ?? null)
        : workspaceId

      const mcpConfig = configStore.get('mcp')
      this.sessionManager.setMcpConfig({
        mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
        mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
        mcpApiKey: mcpConfig?.apiKey ?? '',
      })
      const session = await this.sessionManager.startEntity(entityId, {
        workspaceId: effectiveWorkspaceId,
      })
      // ... Rest des Handlers unverändert ...
```

- [ ] **Step 3: Carry the binding in the Keep-Working snapshot**

In `src/shared/types.ts`, `keepWorkingSnapshot` (Zeile 248):

```ts
  keepWorkingSnapshot?: {
    sessions: Array<{
      name: string
      projectPath: string
      gridSlot: number
      entityId?: string
      topic?: string
      workspaceId?: string | null
    }>
    gridConfig?: { cols: number; rows: number }
    notesSlots?: Array<{ slotIndex: number; notesId?: string; openNoteIds?: string[] }>
  }
```

In `src/main/ipc-hub.ts`, der Snapshot-Push (Zeile ~2973):

```ts
        projectPath: s.projectPath ?? '',
        gridSlot: slotIdx,
        entityId: s.entityId,
        topic: resolveSessionTopic(s, allTasks, capture),
        workspaceId: s.workspaceId ?? null,
```

- [ ] **Step 4: Restore the binding and surface it in the diagnostics file**

`restoreKeepWorkingFromRecovery()` finden (`grep -n "restoreKeepWorkingFromRecovery" src/main/ipc-hub.ts`) und dort, wo eine Snapshot-Zeile auf eine recovered Session gematcht wird, die Bindung zurücksetzen. `SessionManager.linkEntity()` (Zeile ~1346) ist das Vorbild; eine analoge Methode ergänzen in `session-manager.ts`:

```ts
  /**
   * Re-bind a recovered session to a workspace (used by keepWorking restore).
   * No-op for unknown session IDs — never throws into the init chain.
   */
  bindWorkspace(sessionId: string, workspaceId: string | null): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.workspaceId = workspaceId
    this.persistSession(session)
  }
```

Aufruf im Restore-Pfad, pro gematchter Session:

```ts
        this.sessionManager.bindWorkspace(recoveredSession.id, snapshotEntry.workspaceId ?? null)
```

Und in den Debug-Dump (Zeile ~427):

```ts
          recovered: result.recovered.map(r => ({ id: r.id, name: r.name, workspaceId: r.workspaceId ?? null })),
```

**Defensiv bleiben:** `snapshotEntry.workspaceId` kann in einem alten Snapshot fehlen. `?? null` ist Pflicht, kein `!`. Ein geworfener Fehler in dieser Kette killt das gesamte Keep-Working-Restore lautlos.

- [ ] **Step 5: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren.

- [ ] **Step 6: Commit**

```bash
git add src/main/preload.ts src/main/ipc-hub.ts src/shared/types.ts \
        src/main/session/session-manager.ts
git commit -m "feat(ipc): Workspace beim Preset-Start uebergeben und im Keep-Working-Snapshot halten"
```

---

## Task 10: Renderer — Status-Ableitung pro Workspace

**Files:**
- Create: `src/shared/entity-status.ts`
- Modify: `src/renderer/app.tsx` (`entitySetters` Zeile 322–330, `entitySessionMap` Zeile 332–340, Cleanup-Effekt Zeile 396–400, `entityStatus` Zeile 405–411, `getEntitySessionId` Zeile 992–994, `handleStartEntity` Zeile 996–1017, `handleFocusEntity` Zeile 1035–1044, Entity-Started-Listener Zeile 1155–1180)
- Test: `test/main/entity-status-derivation.test.ts`

**Interfaces:**
- Consumes: `SessionInfo.workspaceId` aus Task 1; `workspaceKey` aus Task 2.
- Produces:
  - `deriveEntityStatus(sessions): Record<string, string[]>` — entityId → Workspace-Keys, in denen es aktiv läuft.
  - `findEntitySessionId(sessions, entityId, workspaceId): string | null`
  - `handleStartEntity(entityId, slotIndex, workspaceId?)` im Renderer.

- [ ] **Step 1: Write the failing test**

Create `test/main/entity-status-derivation.test.ts`:

```ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { deriveEntityStatus, findEntitySessionId } = require('../../src/shared/entity-status')
const { GLOBAL_WORKSPACE_KEY } = require('../../src/shared/workspace-key')

const SESSIONS = [
  { id: 's1', entityId: 'companion', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's2', entityId: 'companion', status: 'active', workspaceId: 'ws-beta' },
  { id: 's3', entityId: 'companion', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's4', entityId: 'debugger', status: 'active', workspaceId: 'ws-alpha' },
  { id: 's5', entityId: 'audit', status: 'active', workspaceId: null },
  { id: 's6', entityId: 'refinement', status: 'exited', workspaceId: 'ws-alpha' },
  { id: 's7', status: 'active', workspaceId: 'ws-alpha' },
]

describe('deriveEntityStatus', () => {
  it('lists every workspace an entity runs in', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.deepEqual([...status.companion].sort(), ['ws-alpha', 'ws-beta'])
  })

  it('deduplicates two instances in the same workspace', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.equal(status.companion.filter((w: string) => w === 'ws-alpha').length, 1)
  })

  it('represents unbound sessions with the _global sentinel', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.deepEqual(status.audit, [GLOBAL_WORKSPACE_KEY])
  })

  it('omits entities whose sessions are not active', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.equal('refinement' in status, false)
  })

  it('ignores sessions without an entityId', () => {
    const status = deriveEntityStatus(SESSIONS)
    assert.equal(Object.values(status).flat().length, 4)
  })

  it('returns an empty object for an empty session list', () => {
    assert.deepEqual(deriveEntityStatus([]), {})
  })
})

describe('findEntitySessionId', () => {
  it('finds the session of an entity in a given workspace', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'debugger', 'ws-alpha'), 's4')
  })

  it('returns null when the entity runs only elsewhere', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'debugger', 'ws-beta'), null)
  })

  it('finds unbound sessions with a null lookup', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'audit', null), 's5')
  })

  it('returns the first match when several instances run in one workspace', () => {
    assert.equal(findEntitySessionId(SESSIONS, 'companion', 'ws-alpha'), 's1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-status-derivation.test.ts`
Expected: FAIL mit `Cannot find module '../../src/shared/entity-status'`.

- [ ] **Step 3: Write the implementation**

Create `src/shared/entity-status.ts`:

```ts
// src/shared/entity-status.ts — Entity running-state derived from the session list.
//
// Lives in shared/ because the renderer needs it for the launcher and the test
// must import it without pulling in Electron. Deliberately does NOT depend on
// SessionInfo so the test can pass plain literals.

import { workspaceKey as key } from './workspace-key'

export interface StatusSession {
  id: string
  entityId?: string | null
  status: string
  workspaceId?: string | null
}

/**
 * entityId → workspace keys the entity is currently running in.
 *
 * Replaces the old Record<entityId, boolean>: "runs somewhere" cannot express
 * a preset that runs in one workspace but is startable in another, which is
 * exactly the decision the launcher has to make.
 */
export function deriveEntityStatus(
  sessions: readonly StatusSession[],
): Record<string, string[]> {
  const status: Record<string, string[]> = {}
  for (const s of sessions) {
    if (!s.entityId || s.status !== 'active') continue
    const list = status[s.entityId] ?? (status[s.entityId] = [])
    const k = key(s.workspaceId)
    if (!list.includes(k)) list.push(k)
  }
  return status
}

/** Session ID of an entity inside one workspace, or null. */
export function findEntitySessionId(
  sessions: readonly StatusSession[],
  entityId: string,
  workspaceId: string | null,
): string | null {
  const k = key(workspaceId)
  return sessions.find(
    s => s.entityId === entityId && s.status === 'active' && key(s.workspaceId) === k,
  )?.id ?? null
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && node --test --import tsx test/main/entity-status-derivation.test.ts`
Expected: PASS, 10 Tests.

- [ ] **Step 5: Replace the six hand-maintained hooks in app.tsx**

`entitySetters` (Zeile 322–330) und `entitySessionMap` (Zeile 332–340) sowie die zugehörigen `useState`-Hooks (`workshopSessionId`, `cyberFactorySessionId`, `companionSessionId`, `refinementSessionId`, `voiceRelaySessionId`, `auditSessionId`) entfernen und durch Ableitung ersetzen:

```ts
import { deriveEntityStatus, findEntitySessionId } from '../shared/entity-status'

  // Entity running state per workspace — derived, never hand-maintained.
  const entityStatus = useMemo(() => deriveEntityStatus(sessions), [sessions])

  const getEntitySessionId = useCallback(
    (entityId: EntityId, workspaceId: string | null = activeWorkspaceId) =>
      findEntitySessionId(sessions, entityId, workspaceId),
    [sessions, activeWorkspaceId],
  )
```

**Vorsicht — die sechs Hooks haben Nebenaufgaben.** Vor dem Löschen:

Run: `grep -n "workshopSessionId\|cyberFactorySessionId\|companionSessionId\|refinementSessionId\|voiceRelaySessionId\|auditSessionId\|entitySetters\|entitySessionMap" src/renderer/app.tsx`

Jede Fundstelle einzeln prüfen. Bekannte Fälle:
- `placeWorkshop` / `placeCyberFactory` (Zeile ~413) setzen Grid-Slots — die Slot-Logik bleibt, nur das Setzen des State-Hooks entfällt.
- Der Cleanup-Effekt (Zeile 396–400) nullt tote Entity-Sessions; er wird überflüssig, weil die Ableitung tote Sessions gar nicht erst enthält — ersatzlos entfernen.
- Der Entity-Started-Listener (Zeile 1155–1180) setzt den Hook; er behält nur noch die Grid-Platzierung.
- `workshopSessionId` wird als Prop an `SessionGrid` gereicht (`app.tsx:1314` Umgebung) — dort durch `getEntitySessionId('workshop')` ersetzen.
- `handleResumeEntity` (Zeile 1019–1033) ruft `entitySetters[entityId]?.(sid)` — diese Zeile entfällt ersatzlos, `setSessionAtSlot` und `setFocusedSessionId` bleiben.

Nach dem Umbau darf der obige grep **keine** Treffer mehr liefern außer in Kommentaren.

- [ ] **Step 6: Pass the chosen workspace through the start handler**

`handleStartEntity` (Zeile 996):

```ts
  const handleStartEntity = useCallback(async (
    entityId: EntityId,
    slotIndex: number,
    workspaceId?: string | null,
  ) => {
    const api = (window as any).cipherMux
    inFlightEntityStarts.current.add(entityId)
    try {
      const custom = CUSTOM_START[entityId]
      const session = custom
        ? await custom.start(api)
        : await api.entity.start(entityId, workspaceId)
      const sid = custom ? custom.extractId(session) : session?.id
      if (sid) {
        setSessionAtSlot(slotIndex, sid)
        setFocusedSessionId(sid)
      }
    } finally {
      inFlightEntityStarts.current.delete(entityId)
    }
  }, [setSessionAtSlot])
```

`workspaceId === undefined` bedeutet "keine Wahl getroffen" und lässt den Main-Prozess den aktiven Workspace einsetzen — genau die Semantik aus Task 9, Schritt 2.

- [ ] **Step 7: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.renderer.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren.

- [ ] **Step 8: Commit**

```bash
git add src/shared/entity-status.ts test/main/entity-status-derivation.test.ts \
        src/renderer/app.tsx
git commit -m "refactor(renderer): Entity-Status pro Workspace ableiten statt sechs Hooks pflegen"
```

---

## Task 11: Launcher-UI — zweiter Start-Button mit Workspace-Auswahl

**Files:**
- Modify: `src/renderer/components/EntityPickerPopup.tsx` (Props Zeile 23–40, Presets-Tab Zeile 145–192)
- Modify: `src/renderer/components/LauncherCell.tsx` (Props Zeile 11–28, `handleSelectPreset` Zeile 67–82, Popup-Aufruf Zeile 122–133)
- Modify: `src/renderer/components/SessionGrid.tsx` (Durchreichen von `onStartEntity`, Zeile ~247 und ~323)
- Modify: `src/renderer/styles/components.css`
- Modify: `src/renderer/locales/de.json`, `src/renderer/locales/en.json`
- Test: keiner — reine Darstellung über abgeleitetem State; die Entscheidungslogik ist in Task 10 getestet

**Interfaces:**
- Consumes: `entityStatus: Record<string, string[]>` und `handleStartEntity(entityId, slotIndex, workspaceId?)` aus Task 10.
- Produces: `EntityPickerPopupProps.onSelectPreset(presetId, running, workspaceId?)`, `EntityPickerPopupProps.workspaces`, `EntityPickerPopupProps.activeWorkspaceId`.

- [ ] **Step 1: Add the i18n keys**

In `src/renderer/locales/de.json` (flache Keys, alphabetisch bei den übrigen `unified.*` einsortieren):

```json
  "unified.startInWorkspace": "In anderem Workspace starten",
  "unified.workspaceBadgeTitle": "Läuft in Workspace: {{name}}",
  "unified.workspaceBadgeGlobal": "ohne Workspace",
  "unified.runningInWorkspaces": "Läuft in: {{names}}",
```

In `src/renderer/locales/en.json`:

```json
  "unified.startInWorkspace": "Start in another workspace",
  "unified.workspaceBadgeTitle": "Running in workspace: {{name}}",
  "unified.workspaceBadgeGlobal": "no workspace",
  "unified.runningInWorkspaces": "Running in: {{names}}",
```

- [ ] **Step 2: Widen the popup props**

In `src/renderer/components/EntityPickerPopup.tsx`:

```ts
export interface WorkspaceOption {
  id: string
  name: string
}

export interface EntityPickerPopupProps {
  /**
   * Called when the user picks a preset.
   * workspaceId undefined = start in the active workspace (the default path).
   * workspaceId set = start in that workspace instead.
   */
  onSelectPreset: (presetId: EntityId, running: boolean, workspaceId?: string) => void
  onResumePreset?: (presetId: EntityId) => void
  onSelectPath: (path: string, opts: PathStartOpts) => void
  onSelectNote: (note: any) => void
  onNewNote?: () => void
  onClose: () => void
  /** entityId → workspace keys the preset currently runs in. */
  entityStatus?: Record<string, string[]>
  startingEntity?: string | null
  /** All configured workspaces, for the alternate-start chips. */
  workspaces?: WorkspaceOption[]
  /** The currently active workspace — excluded from the chip list. */
  activeWorkspaceId?: string | null
}
```

- [ ] **Step 3: Render the second button and the inline chips**

Im Presets-Tab, die Map-Funktion (Zeile 148–189) ersetzen:

```tsx
        {tab === 'presets' && (
          <div class="launcher-popup__body">
            <div class="launcher-popup__presets">
              {entityPresets.map(preset => {
                const runningIn = entityStatus?.[preset.id] ?? []
                const activeKey = activeWorkspaceId ?? '_global'
                const runsHere = runningIn.includes(activeKey)
                const isStarting = startingEntity === preset.id
                // Focus instead of start only when a singleInstance preset is
                // already running *in this workspace*. Running in another one
                // must still start a fresh instance here.
                const effectiveRunning = runsHere && (preset.singleInstance ?? false)
                const otherWorkspaces = (workspaces ?? []).filter(w => w.id !== activeWorkspaceId)
                const expanded = wsPickerFor === preset.id
                const runningNames = runningIn
                  .map(k => k === '_global' ? '—' : (workspaces ?? []).find(w => w.id === k)?.name ?? k)

                return (
                  <div key={preset.id}>
                    <div class="unified-dialog__card-row">
                      <button
                        class={`unified-dialog__card${runsHere ? ' unified-dialog__card--running' : ''}`}
                        onClick={() => onSelectPreset(preset.id as EntityId, effectiveRunning)}
                        disabled={isStarting}
                        style={{ '--entity-color': preset.color } as any}
                      >
                        <div class="unified-dialog__card-info">
                          <span class="unified-dialog__card-name">
                            {runsHere && <span class="unified-dialog__card-dot" />}
                            {preset.displayName}
                          </span>
                        </div>
                        {runningIn.length > 0 && (
                          <span
                            class="unified-dialog__card-status"
                            title={t('unified.runningInWorkspaces', { names: runningNames.join(', ') })}
                          >
                            {runningNames.slice(0, 2).join(', ')}
                            {runningNames.length > 2 ? ` +${runningNames.length - 2}` : ''}
                          </span>
                        )}
                        {isStarting && (
                          <span class="unified-dialog__card-status">{t('unified.starting')}</span>
                        )}
                      </button>
                      {otherWorkspaces.length > 0 && (
                        <button
                          class="unified-dialog__card-ws"
                          onClick={() => setWsPickerFor(expanded ? null : preset.id)}
                          disabled={isStarting}
                          title={t('unified.startInWorkspace')}
                        >
                          ⤳
                        </button>
                      )}
                      {onResumePreset && (
                        <button
                          class="unified-dialog__card-resume"
                          onClick={() => onResumePreset(preset.id as EntityId)}
                          disabled={isStarting}
                          title={t('unified.resume')}
                        >
                          {t('unified.resumeShort')}
                        </button>
                      )}
                    </div>
                    {expanded && (
                      <div class="unified-dialog__ws-chips">
                        {otherWorkspaces.map(w => (
                          <button
                            key={w.id}
                            class="unified-dialog__ws-chip"
                            onClick={() => {
                              setWsPickerFor(null)
                              onSelectPreset(preset.id as EntityId, false, w.id)
                            }}
                          >
                            {w.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
```

Neuer State oben in der Komponente, neben `const [tab, setTab] = useState<TabMode>('presets')`:

```ts
  const [wsPickerFor, setWsPickerFor] = useState<string | null>(null)
```

Beachte: der bisherige `e.stopPropagation()` im Resume-Button ist entfallen. Das ist Absicht — laut CLAUDE.md bricht `stopPropagation` in preact/compat Child-Klicks; die Buttons liegen ohnehin außerhalb der Karte, nicht darin.

- [ ] **Step 4: Load the workspaces in the popup**

Zum bestehenden `useEffect` (Zeile 73–80) ergänzen:

```ts
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])

  useEffect(() => {
    cipherApi().workspaces.list().then((list: any[]) => {
      setWorkspaces((list ?? []).map(w => ({ id: w.id, name: w.name })))
    }).catch(() => { /* no workspaces configured */ })
  }, [])
```

`workspaces` als Prop wird damit optional — die Komponente lädt selbst. Die Prop aus Schritt 2 trotzdem behalten, damit `WorkspacePopup` sie bei Bedarf überschreiben kann; Default ist der selbst geladene State.

- [ ] **Step 5: Thread the workspace through LauncherCell**

In `src/renderer/components/LauncherCell.tsx`:

```ts
  onStartEntity: (entityId: EntityId, workspaceId?: string) => Promise<void>
  entityStatus: Record<string, string[]>
```

```ts
  const handleSelectPreset = useCallback(async (
    entityId: EntityId,
    running: boolean,
    workspaceId?: string,
  ) => {
    if (running) {
      onFocusEntity(entityId)
      setPopupOpen(false)
      return
    }
    setStarting(entityId)
    try {
      await onStartEntity(entityId, workspaceId)
      setPopupOpen(false)
    } catch (err) {
      console.error(`[LauncherCell] Failed to start ${entityId}:`, err)
    } finally {
      setStarting(null)
    }
  }, [onStartEntity, onFocusEntity])
```

Im Popup-Aufruf zusätzlich `activeWorkspaceId={activeWorkspaceId}` übergeben — die Prop existiert bereits auf `LauncherCellProps` (Zeile 22) und wurde bisher nicht genutzt.

In `SessionGrid.tsx` beide Props weiten, sodass sie bis `app.tsx` durchkommen (`SessionGridProps`, Zeile ~21 und die zwei `LauncherCell`-Aufrufe Zeile ~247 und ~323):

```ts
  onStartEntity: (entityId: EntityId, slotIndex: number, workspaceId?: string) => Promise<void>
  entityStatus: Record<string, string[]>
```

Run: `grep -rn "entityStatus" src/renderer/` — jede Stelle, die den alten `boolean`-Typ annimmt (`entityStatus?.[id] ?? false`, `if (entityStatus[id])`), muss auf die Array-Form umgestellt werden. TypeScript findet sie, aber `?? false` gegen ein Array wirft keinen Typfehler an jeder Stelle — einmal mit grep gegenprüfen.

- [ ] **Step 6: Add the styles**

In `src/renderer/styles/components.css`, bei den übrigen `unified-dialog__`-Regeln:

Direkt hinter `.unified-dialog__card-resume` (Zeile 3370) einfügen. Die Tokens spiegeln bewusst die dort bereits verwendeten `--session-action-btn-*`-Overrides, damit beide Buttons in allen zehn Themes zusammen aussehen — das Projekt nutzt durchgängig das `--color-*`-Präfix, nicht `--accent`/`--text-secondary`:

```css
.unified-dialog__card-ws {
  flex-shrink: 0;
  padding: 6px 9px;
  background: var(--session-action-btn-bg, transparent);
  border: 1px solid var(--session-action-btn-border, var(--color-border));
  color: var(--session-action-btn-text, var(--color-accent));
  font-family: var(--font-mono);
  font-size: var(--font-size-base);
  line-height: 1;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  display: flex;
  align-items: center;
}

.unified-dialog__card-ws:hover:not(:disabled) {
  background: var(--session-action-btn-bg-hover, var(--color-accent-soft));
  border-color: var(--session-action-btn-text, var(--color-accent));
  color: var(--session-action-btn-text-hover, var(--color-text));
}

.unified-dialog__ws-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding: var(--space-xs) 0 var(--space-sm) var(--space-md);
}

.unified-dialog__ws-chip {
  padding: 2px var(--space-sm);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.unified-dialog__ws-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
```

Kein `border-radius`: das Theme setzt `--radius-sm/md/lg` durchgängig auf `0` (`theme.css:72`), abgerundete Ecken wären ein Stilbruch.

- [ ] **Step 7: Verify build**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.renderer.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/components/EntityPickerPopup.tsx \
        src/renderer/components/LauncherCell.tsx \
        src/renderer/components/SessionGrid.tsx \
        src/renderer/styles/components.css \
        src/renderer/locales/de.json src/renderer/locales/en.json
git commit -m "feat(launcher): Preset-Start in anderem Workspace ueber zweiten Button"
```

---

## Task 12: Workspace-Badge, Run-Dir-Aufräumung und manuelle Abnahme

**Files:**
- Modify: `src/renderer/components/PaneHeader.tsx` (Props Zeile 3–10)
- Modify: `src/renderer/components/SessionCell.tsx` (PaneHeader-Aufruf)
- Modify: `src/renderer/components/SidebarPanel.tsx` (Session-Liste)
- Modify: `src/renderer/styles/components.css`
- Modify: `src/main/ipc-hub.ts` (Init-Chain, nach `recover()`)
- Test: manuelle Testcase-Note

**Interfaces:**
- Consumes: `pruneRunDirs` aus Task 2; `SessionInfo.workspaceId` aus Task 1.
- Produces: `PaneHeaderProps.workspaceBadge?: string | null`.

- [ ] **Step 1: Add the badge to PaneHeader**

In `src/renderer/components/PaneHeader.tsx`, Props erweitern:

```ts
interface PaneHeaderProps {
  sessionName: string
  contextUsage?: number
  capabilities?: AdapterCapabilities
  entityId?: EntityId
  voiceState?: string
  isSpeaking?: boolean
  /**
   * Workspace name to show as a badge. Pass null when the session sits in the
   * active workspace — the badge is a deviation signal, not decoration.
   */
  workspaceBadge?: string | null
}
```

Im JSX, neben dem Session-Namen:

```tsx
      {workspaceBadge && (
        <span class="pane-header__ws-badge" title={workspaceBadge}>
          {workspaceBadge}
        </span>
      )}
```

- [ ] **Step 2: Compute the badge at the call site**

In `SessionCell.tsx` (und analog in der Sidebar-Session-Liste in `SidebarPanel.tsx`), dort wo Session und `activeWorkspaceId` beide vorliegen:

```tsx
  const workspaceBadge = useMemo(() => {
    const sessionWs = session.workspaceId ?? null
    if (sessionWs === (activeWorkspaceId ?? null)) return null
    // Unbound sessions are visible from every workspace (see spec, "Was 'global' konkret heisst"),
    // so while a workspace is active they need their own marker — otherwise they are
    // indistinguishable from sessions that actually belong to it.
    if (sessionWs === null) return activeWorkspaceId ? t('unified.workspaceBadgeGlobal') : null
    const ws = workspaces.find(w => w.id === sessionWs)
    // A workspace that no longer exists still gets a badge — its sessions keep
    // running, and hiding the binding would make them indistinguishable.
    return ws?.name ?? `${sessionWs} (gelöscht)`
  }, [session.workspaceId, activeWorkspaceId, workspaces])
```

Wo `workspaces` in diesen Komponenten noch nicht vorliegt, per `cipherApi().workspaces.list()` in einem `useEffect` laden — dasselbe Muster wie in `SidebarPanel.tsx:100`.

- [ ] **Step 3: Add the badge style**

In `src/renderer/styles/components.css`:

```css
.pane-header__ws-badge {
  margin-left: var(--space-xs);
  padding: 0 var(--space-xs);
  border: 1px solid var(--color-border-subtle);
  color: var(--color-text-dim);
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
```

- [ ] **Step 4: Prune orphaned run directories on startup**

In `src/main/ipc-hub.ts`, in der Init-Chain nach `recover()` und **nach** dem Keep-Working-Restore (damit wiederhergestellte Sessions ihre Verzeichnisse noch vorfinden):

```ts
      // Remove run dirs of workspaces that no longer exist. Sessions of a
      // deleted workspace keep running — their dirs survive until the next
      // start after they are gone.
      try {
        const { pruneRunDirs } = require('./session/entity-run-dir')
        const workspaces = (configStore.get('workspaces') ?? []) as Array<{ id: string }>
        const liveWorkspaceIds = new Set(workspaces.map(w => w.id))
        for (const s of this.sessionManager.list()) {
          if (s.workspaceId) liveWorkspaceIds.add(s.workspaceId)
        }
        const removed = pruneRunDirs([...liveWorkspaceIds])
        if (removed.length > 0) {
          console.log(`[IpcHub] pruned ${removed.length} orphaned run dir(s)`)
        }
      } catch (err) {
        console.warn('[IpcHub] run dir prune failed:', err)
      }
```

Der `try`/`catch` ist nicht optional: ein Wurf an dieser Stelle liegt in der Init-Chain und würde Keep-Working still killen.

- [ ] **Step 5: Verify build and full suite**

Run: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH" && npm run lint && npx tsc --noEmit -p tsconfig.main.json && npx tsc --noEmit -p tsconfig.renderer.json && npm run test`
Expected: Typecheck sauber, keine neuen Lint-Probleme in den geänderten Dateien; Testlauf zeigt genau die vier bekannt-roten Dateien und keine weiteren.

- [ ] **Step 6: Run the app and walk the manual acceptance**

Run: `npm start`
(Nicht `electron .` — der prestart-Hook rebuildet better-sqlite3 gegen die Electron-ABI. Nach einem `npm run test` ist das Modul gegen Node gebaut und der MessageBus fehlt sonst.)

Diese Schritte manuell durchgehen und das Ergebnis notieren:

1. Zwei Workspaces anlegen (falls nicht vorhanden), Workspace A aktivieren.
2. Companion starten (Karte anklicken) → läuft in A.
3. Launcher erneut öffnen, bei Companion ⤳ klicken, Workspace B wählen → zweite Companion-Instanz startet, aktiver Workspace bleibt A.
4. Prüfen: `ls ~/.config/cipher-mux/runs/` zeigt zwei Workspace-Verzeichnisse mit je einem `companion/`; beide `CLAUDE.md` enthalten unterschiedliche `## Workspace Prompt`-Abschnitte.
5. Prüfen: `grep -l X-Mux-Workspace ~/.config/cipher-mux/runs/*/companion/.mcp.json` findet beide, mit verschiedenen IDs.
6. Debugger (singleInstance) in A starten. Launcher öffnen → Karte zeigt A als laufend. ⤳ → B wählen → startet, wirft **nicht** "already running".
7. Debugger erneut in A starten → wirft "already running".
8. PaneHeader der B-Sessions zeigt das Badge, die A-Sessions nicht.
9. Keep Working aktivieren, Cmd+Q, App neu starten → beide Sessions kommen zurück, Badges stimmen weiterhin, `/tmp/kw-debug.json` zeigt `workspaceId` pro recovered Session.
10. Workspace B löschen → B-Sessions laufen weiter, Badge zeigt "(gelöscht)". App neu starten → Verzeichnis `runs/<ws-B-id>/` ist erst weg, nachdem auch die Sessions weg sind.

- [ ] **Step 7: Write the testcase note**

Die Schritte aus Schritt 6 als Testcase-Note anlegen — `mux_notes_create` mit Tag `testcase`, IDs `T-MWS.1` bis `T-MWS.10`, Format exakt `- [ ] **T-MWS.N** Beschreibung` unter einer neuen `## Multi-Workspace-Sessions`-Sektion. Kein anderes Markdown (keine `###`, kein `**bold**` in Beschreibungen, keine Tabellen) — der TestcaseView-Parser erkennt sonst nichts.

- [ ] **Step 8: Update CLAUDE.md**

Im Abschnitt "Workspaces + Personas" ergänzen:

```markdown
- **Multi-Workspace-Sessions:** Jede Session traegt ihren Workspace (`SessionInfo.workspaceId`,
  persistiert in `sessions.json`). Entity-Sessions laufen in `~/.config/cipher-mux/runs/<workspaceId>/<entityId>/`
  (generierte Artefakte) und lesen aus `~/.config/cipher-mux/entities/<id>/` (preset.md, Skills).
  `singleInstance` gilt pro Workspace. MCP-Aufrufe tragen `X-Mux-Workspace` und binden den
  Workspace beim `initialize`. Launcher: ⤳-Button startet ein Preset in einem anderen Workspace.
  **Noch global:** Notes-Tagging und Companion-Memory-Scope (Paket B).
```

- [ ] **Step 9: Commit**

```bash
git add src/renderer/components/PaneHeader.tsx \
        src/renderer/components/SessionCell.tsx \
        src/renderer/components/SidebarPanel.tsx \
        src/renderer/styles/components.css \
        src/main/ipc-hub.ts CLAUDE.md
git commit -m "feat(ui): Workspace-Badge bei Abweichung und Aufraeumen verwaister Run-Verzeichnisse"
```

---

## Abschluss

Nach Task 12 ist Paket A fertig: Presets laufen parallel in mehreren Workspaces, die Bindung überlebt Neustarts, und der Kanal für Paket B (`ToolContext.workspaceId`) steht.

**Offen und bewusst nicht in diesem Paket:**
- Notes-Tagging und Memory-Scope lesen weiter `activeWorkspaceId` → Paket B.
- Zwei Instanzen desselben Presets im selben Workspace teilen sich CLAUDE.md und damit die injizierte `Session Identity`. Bestandsverhalten, eigener Fix.
- Projekt-Sessions auf demselben Repo-Pfad teilen sich `settings.local.json`; der spätere Start überschreibt den Header des früheren.
