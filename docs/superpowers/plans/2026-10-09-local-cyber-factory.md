# Local Cyber Factory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Claude-Rolle `local-factory` schneidet Arbeit in Häppchen und prüft sie; ein Läufer im Mux startet pro Häppchen eine frische opencode-Session `local-worker` mit lokalem Modell, führt ein Gate ohne Modell aus und weckt den Architekten mit einer Zeile.

**Architecture:** Zwei neue Entities (Registry, Grenzen, Presets). Ein neues Modul `src/main/local-factory/` mit reinen Funktionen (Auftrag, Gate, Lauf-Zustand, Ende-Erkennung), einer Git/Shell-Schicht und einem Läufer, der seine Außenwelt über ein `WorkerHost`-Interface bekommt — testbar mit einem Fake. Das MCP-Werkzeug `mux_local_worker_dispatch` ist nur für `local-factory` registriert und kehrt sofort zurück.

**Tech Stack:** TypeScript strict, Node 22, `node:test` + `tsx`, zod (MCP-Schemas), opencode 1.18.x als Worker-CLI.

**Spec:** `docs/superpowers/specs/2026-10-09-local-cyber-factory-design.md`

## Global Constraints

- Node 22 für jeden Test-/Typecheck-Befehl: `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"`.
- Einzeltests ohne SQLite: `node --test --import tsx <datei>`. Gesamtlauf: `npm run test` — Stand vor diesem Plan 2303/2303 grün; ein roter Lauf ist eine Regression.
- Lint-Gate: keine neuen Probleme in geänderten Dateien, `npx eslint <dateien>`. Typecheck: `npx tsc -p tsconfig.main.json --noEmit` null Fehler.
- Tests importieren per ESM `import`, nie `require()`.
- **Keine SQLite-Migration.** Zählung nur in `lauf.json` (Spec §8).
- **Fragile Zone Keep Working:** nichts in die Init-Kette von `recover()`; jeder Lesezugriff auf persistierte Felder defensiv; Läufer-Fehler in `try`/`catch`.
- Kein Schlüssel in der Config (Spec §6).
- Commit-Nachrichten enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `src/shared/version.ts` nicht committen; kein `npm run build`.
- Maximal **2 Versuche** pro Häppchen, danach `eskaliert` (Spec E3) — im Läufer erzwungen.

## Review Focus

1. **Architekt schreibt Abnahmetest, ruft dispatch ohne Commit** → Läufer akzeptiert nur Änderungen an den geschützten Testdateien und committet sie selbst als Basis; jede andere offene Datei → Ablehnung. Test in Task 9 (`preflight`-Szenarien).
2. **Abnahmetest vor der Arbeit grün** → Ablehnung „prüft nichts“, kein Worker-Start. Test in Task 9.
3. **Worker ändert geschützten Test per Shell** (Plugin-Grenze umgangen) → Gate rot über `git diff`, auch wenn die Tests danach grün sind. Test in Task 5 und Task 9.
4. **Dritter Versuch auf dasselbe Häppchen** → Werkzeug lehnt ab, Häppchen steht auf `eskaliert`. Test in Task 7 und Task 9.
5. **`lauf.json` kaputt oder alt** (fehlende Felder nach Formatänderung) → Laden liefert einen leeren bzw. aufgefüllten Lauf statt zu werfen. Test in Task 7.

---

## Datei-Landkarte

| Datei | Verantwortung |
|---|---|
| `src/shared/types.ts` | `BuiltinEntityId` + `agent.localWorker` |
| `src/main/config/config-store.ts` | Default `agent.localWorker: null` |
| `src/main/local-factory/local-provider.ts` | opencode-Anbieterblock aus `agent.localWorker` |
| `src/main/agent/adapters/opencode.ts` | Anbieter, Modell, Kontextfenster für `local-worker` schreiben |
| `src/main/session/entity-boundaries.ts` | Grenzen beider Rollen; dynamische Sperrliste im opencode-Plugin |
| `src/main/session/entity-registry.ts` | zwei neue Registry-Einträge |
| `src/main/local-factory/presets.ts` | `preset.md` beider Rollen |
| `src/main/session/session-manager.ts` | Presets schreiben, MCP-Permission für `local-factory` |
| `src/main/local-factory/auftrag.ts` | Pflichtfelder prüfen, `AUFTRAG.md` bauen |
| `src/main/local-factory/gate.ts` | Gate-Entscheidung (rein) |
| `src/main/local-factory/lauf.ts` | `lauf.json`-Zustand (rein + defensives Laden/Speichern) |
| `src/main/local-factory/worker-done.ts` | Ende-Erkennung (rein) + Idle-Plugin |
| `src/main/local-factory/git-ops.ts` | git- und Shell-Aufrufe |
| `src/main/local-factory/runner.ts` | Läufer: Vorprüfung → Start → Warten → Gate → Wecken |
| `src/main/local-factory/worker-host.ts` | echte `WorkerHost`-Implementierung über SessionManager |
| `src/main/mcp/entity-header.ts` | `mayUseLocalWorkerDispatch` |
| `src/main/mcp/local-factory-tool.ts` | `mux_local_worker_dispatch` |
| `test/main/local-factory/*.test.ts` | Tests |

---

### Task 0: Rauchtest gegen den Spark (von Hand, Gate für alles Weitere)

Kein Code. Ergebnis wird in die Spec geschrieben. **Fällt Messung 1 negativ aus, hier anhalten** und Spec §5/§6 mit dem User überarbeiten (Worker im Projekt statt im Run-Verzeichnis).

**Files:**
- Modify: `docs/superpowers/specs/2026-10-09-local-cyber-factory-design.md` (neuer Abschnitt „10a. Messergebnis")

- [ ] **Step 1: Testumgebung anlegen**

```bash
S=/private/tmp/claude-502/lf-rauch; rm -rf $S; mkdir -p $S/run $S/projekt
cd $S/projekt && git init -q && echo 'export const x = 1' > a.ts && git add . && git commit -qm init
curl -s http://100.78.7.108:8000/v1/models | head -c 400   # Modellname ablesen
```

- [ ] **Step 2: Anbieter in `$S/run/opencode.json`**

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "cipher-local": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "cipher-local",
      "options": { "baseURL": "http://100.78.7.108:8000/v1" },
      "models": { "<MODELL>": { "name": "<MODELL>", "limit": { "context": 131072, "output": 4000 } } }
    }
  },
  "model": "cipher-local/<MODELL>"
}
```

Das Ausgabelimit ist hier mit 4000 bewusst klein, für Messung 2.

- [ ] **Step 3: Messung 1 — Edit außerhalb des cwd unter `--auto`**

```bash
tmux new -d -s lfr -c $S/run 'opencode --auto'; sleep 10
tmux send-keys -t lfr "Ändere $S/projekt/a.ts so, dass x = 2 ist." Enter; sleep 90
tmux capture-pane -t lfr -p | tail -30; cat $S/projekt/a.ts
```

Festhalten: Wurde die Datei geändert? Gab es einen Dialog zum externen Verzeichnis? Wenn ein Dialog kommt: Hilft `"permission": {"external_directory": "allow"}` in `opencode.json`? (Falls ja: Task 2 schreibt diesen Schlüssel mit.)

- [ ] **Step 4: Messung 2 — Ausgabelimit**

```bash
tmux send-keys -t lfr "Schreibe $S/projekt/big.ts mit 400 exportierten Konstanten c0..c399, jede mit einem 60-Zeichen-Kommentar." Enter; sleep 180
tmux capture-pane -t lfr -p | tail -40; wc -l $S/projekt/big.ts
```

Festhalten: Fehlermeldung, abgeschnittene Datei oder stiller Abbruch?

- [ ] **Step 5: Messung 3 — Idle-Ereignis**

Lege `$S/run/.opencode/plugin/idle-probe.js` an:

```js
import * as fs from 'node:fs'
export default async () => ({
  event: async (raw) => {
    const t = raw && raw.event && raw.event.type
    if (t) fs.appendFileSync('/private/tmp/claude-502/lf-rauch/events.log', t + '\n')
  },
})
```

opencode neu starten, einen kurzen Auftrag geben, danach `sort events.log | uniq -c`. Festhalten: Wie heißt das Ereignis am Ende eines Zugs (erwartet `session.idle`)?

- [ ] **Step 6: Messung 4 — Wecken in eine laufende Claude-Session**

```bash
tmux new -d -s lfc -c $S/projekt 'claude'; sleep 10
tmux send-keys -t lfc "Zähle langsam von 1 bis 40, ein Satz pro Zahl." Enter; sleep 3
tmux send-keys -t lfc "[local-factory] #1 TEST: GRÜN" Enter; sleep 60
tmux capture-pane -t lfc -p -S -80 | tail -60
```

Festhalten: Wurde die Zeile eingereiht und danach beantwortet, verschluckt oder als Unterbrechung behandelt?

- [ ] **Step 7: Aufräumen, Ergebnis eintragen, committen**

```bash
tmux kill-session -t lfr; tmux kill-session -t lfc
```

In der Spec den Abschnitt `## 10a. Messergebnis (2026-10-xx, opencode <version>, Modell <name>)` mit den vier Befunden ergänzen.

```bash
git add docs/superpowers/specs/2026-10-09-local-cyber-factory-design.md
git commit -m "docs(spec): Local Cyber Factory -- Rauchtest gegen den Spark

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 1: Config `agent.localWorker` und Anbieterblock

**Files:**
- Modify: `src/shared/types.ts` (Block `agent`, nach `codexTrustRunDirs`)
- Modify: `src/main/config/config-store.ts` (Defaults `agent`)
- Create: `src/main/local-factory/local-provider.ts`
- Test: `test/main/local-factory/local-provider.test.ts`

**Interfaces:**
- Produces: `interface LocalWorkerConfig { baseUrl: string; model: string; contextWindow: number; maxOutputTokens: number; timeoutMinutes?: number }`, `LOCAL_PROVIDER_ID = 'cipher-local'`, `readLocalWorkerConfig(raw: unknown): LocalWorkerConfig | null`, `buildLocalProviderBlock(cfg): Record<string, unknown>`, `localModelSpec(cfg): string`.

- [ ] **Step 1: Failing test**

```ts
// test/main/local-factory/local-provider.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  readLocalWorkerConfig,
  buildLocalProviderBlock,
  localModelSpec,
  LOCAL_PROVIDER_ID,
} from '../../../src/main/local-factory/local-provider'

const ok = { baseUrl: 'http://h:8000/v1', model: 'qwen', contextWindow: 131072, maxOutputTokens: 16384 }

describe('readLocalWorkerConfig', () => {
  it('liest eine vollständige Config', () => {
    assert.deepEqual(readLocalWorkerConfig(ok), ok)
  })
  it('null, undefined, Nicht-Objekt → null', () => {
    assert.equal(readLocalWorkerConfig(null), null)
    assert.equal(readLocalWorkerConfig(undefined), null)
    assert.equal(readLocalWorkerConfig('x'), null)
  })
  it('fehlendes Pflichtfeld → null statt halber Config', () => {
    assert.equal(readLocalWorkerConfig({ ...ok, model: '' }), null)
    assert.equal(readLocalWorkerConfig({ ...ok, contextWindow: 0 }), null)
    assert.equal(readLocalWorkerConfig({ baseUrl: ok.baseUrl }), null)
  })
  it('übernimmt timeoutMinutes nur als positive Zahl', () => {
    assert.equal(readLocalWorkerConfig({ ...ok, timeoutMinutes: 30 })?.timeoutMinutes, 30)
    assert.equal(readLocalWorkerConfig({ ...ok, timeoutMinutes: -1 })?.timeoutMinutes, undefined)
  })
})

describe('buildLocalProviderBlock', () => {
  it('OpenAI-kompatibler Anbieter mit Grenzen aus der Config', () => {
    const block = buildLocalProviderBlock(ok) as any
    assert.equal(block.npm, '@ai-sdk/openai-compatible')
    assert.equal(block.options.baseURL, 'http://h:8000/v1')
    assert.deepEqual(block.models.qwen.limit, { context: 131072, output: 16384 })
  })
  it('localModelSpec ist anbieter/modell', () => {
    assert.equal(localModelSpec(ok), `${LOCAL_PROVIDER_ID}/qwen`)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `node --test --import tsx test/main/local-factory/local-provider.test.ts` → Modul fehlt.

- [ ] **Step 3: Implementierung**

```ts
// src/main/local-factory/local-provider.ts
/**
 * Der lokale Anbieter für die Rolle `local-worker` (Spec §6, Entscheidung E4).
 *
 * opencode spricht den Endpunkt direkt an, kein Gateway dazwischen. Die
 * Kontextgröße steht in der Config, weil opencode sie für einen selbst
 * eingetragenen Anbieter nicht kennt — mit ihr ist die Prozentanzeige eine
 * Rechnung gegen eine bekannte Zahl statt gegen OPENCODE_FALLBACK_CONTEXT_WINDOW.
 */

export const LOCAL_PROVIDER_ID = 'cipher-local'

export interface LocalWorkerConfig {
  baseUrl: string
  model: string
  contextWindow: number
  maxOutputTokens: number
  timeoutMinutes?: number
}

function positive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** Defensiv: eine halbe Config ist keine — dann gibt es keinen lokalen Worker. */
export function readLocalWorkerConfig(raw: unknown): LocalWorkerConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.baseUrl !== 'string' || r.baseUrl.trim() === '') return null
  if (typeof r.model !== 'string' || r.model.trim() === '') return null
  if (!positive(r.contextWindow) || !positive(r.maxOutputTokens)) return null
  return {
    baseUrl: r.baseUrl.trim(),
    model: r.model.trim(),
    contextWindow: r.contextWindow,
    maxOutputTokens: r.maxOutputTokens,
    ...(positive(r.timeoutMinutes) ? { timeoutMinutes: r.timeoutMinutes } : {}),
  }
}

export function buildLocalProviderBlock(cfg: LocalWorkerConfig): Record<string, unknown> {
  return {
    npm: '@ai-sdk/openai-compatible',
    name: LOCAL_PROVIDER_ID,
    options: { baseURL: cfg.baseUrl },
    models: {
      [cfg.model]: {
        name: cfg.model,
        limit: { context: cfg.contextWindow, output: cfg.maxOutputTokens },
      },
    },
  }
}

export function localModelSpec(cfg: LocalWorkerConfig): string {
  return `${LOCAL_PROVIDER_ID}/${cfg.model}`
}
```

In `src/shared/types.ts`, Block `agent`, nach `codexTrustRunDirs: boolean`:

```ts
    /**
     * Lokales Modell für die Rolle `local-worker` (Local Cyber Factory).
     * null = nicht eingerichtet; dann startet der Läufer keinen Worker.
     * Gelesen über `readLocalWorkerConfig`, nie direkt — ein halber Eintrag
     * gilt als keiner. Kein Schlüssel hier.
     */
    localWorker: import('../main/local-factory/local-provider').LocalWorkerConfig | null
```

Falls `shared/` nicht aus `main/` importieren darf (Typecheck des Renderers prüfen): die Schnittstelle `LocalWorkerConfig` stattdessen in `src/shared/types.ts` definieren und in `local-provider.ts` von dort importieren und re-exportieren.

In `src/main/config/config-store.ts`, Defaults `agent`, nach `codexTrustRunDirs: true,`:

```ts
    // Local Cyber Factory: ohne Eintrag kein lokaler Worker. Siehe
    // local-factory/local-provider.ts.
    localWorker: null,
```

- [ ] **Step 4: Run, expect PASS**; dazu `npx tsc -p tsconfig.main.json --noEmit` und `npx tsc -p tsconfig.renderer.json --noEmit` → 0 Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/config/config-store.ts src/main/local-factory/local-provider.ts test/main/local-factory/local-provider.test.ts
git commit -m "feat(local-factory): Config fuer das lokale Modell und der opencode-Anbieterblock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: opencode-Adapter schreibt Anbieter, Modell und Kontextfenster für `local-worker`

**Files:**
- Modify: `src/main/agent/adapters/opencode.ts` (`mergeOpenCodeConfig`, `postLaunchInjection`, `writePlugins`, Config-Reader)
- Test: `test/main/opencode-local-provider.test.ts`

**Interfaces:**
- Consumes: `readLocalWorkerConfig`, `buildLocalProviderBlock`, `localModelSpec`, `LOCAL_PROVIDER_ID` (Task 1).
- Produces: `mergeOpenCodeConfig(existing, entry, pluginSpecs, local?: { provider: Record<string, unknown>; model: string; allowExternal?: boolean } | null)`; `OpenCodeConfigReader.getLocalWorker(): LocalWorkerConfig | null`.

- [ ] **Step 1: Failing test**

```ts
// test/main/opencode-local-provider.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { mergeOpenCodeConfig, buildOpenCodeMcpEntry } from '../../src/main/agent/adapters/opencode'
import { buildLocalProviderBlock, localModelSpec } from '../../src/main/local-factory/local-provider'

const entry = buildOpenCodeMcpEntry('http://127.0.0.1:3100/mcp', 'k', null, 'local-worker')
const cfg = { baseUrl: 'http://h/v1', model: 'qwen', contextWindow: 1000, maxOutputTokens: 100 }
const local = { provider: buildLocalProviderBlock(cfg), model: localModelSpec(cfg) }

describe('mergeOpenCodeConfig mit lokalem Anbieter', () => {
  it('schreibt provider.cipher-local und model', () => {
    const m = mergeOpenCodeConfig({}, entry, [], local) as any
    assert.equal(m.provider['cipher-local'].options.baseURL, 'http://h/v1')
    assert.equal(m.model, 'cipher-local/qwen')
  })
  it('fremde Anbieter bleiben stehen', () => {
    const m = mergeOpenCodeConfig({ provider: { other: { x: 1 } } }, entry, [], local) as any
    assert.deepEqual(m.provider.other, { x: 1 })
  })
  it('ohne local: ein früher geschriebener eigener Anbieter verschwindet, fremdes model bleibt', () => {
    const before = mergeOpenCodeConfig({}, entry, [], local)
    const m = mergeOpenCodeConfig({ ...before, model: 'anthropic/x' }, entry, [], null) as any
    assert.equal(m.provider?.['cipher-local'], undefined)
    assert.equal(m.model, 'anthropic/x')
  })
  it('ohne local: das eigene model wird entfernt', () => {
    const before = mergeOpenCodeConfig({}, entry, [], local)
    const m = mergeOpenCodeConfig(before, entry, [], null) as any
    assert.equal(m.model, undefined)
  })
})
```

- [ ] **Step 2: Run, expect FAIL** — `node --test --import tsx test/main/opencode-local-provider.test.ts`.

- [ ] **Step 3: Implementierung**

In `opencode.ts` Importe ergänzen:

```ts
import {
  readLocalWorkerConfig,
  buildLocalProviderBlock,
  localModelSpec,
  LOCAL_PROVIDER_ID,
  type LocalWorkerConfig,
} from '../../local-factory/local-provider'
```

Config-Reader erweitern:

```ts
export interface OpenCodeConfigReader {
  getSkipPermissions(): boolean
  /** Lokales Modell für `local-worker`, oder null. Spec 2026-10-09 §6. */
  getLocalWorker?(): LocalWorkerConfig | null
}

const defaultConfigReader: OpenCodeConfigReader = {
  getSkipPermissions(): boolean {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    return configStore.get('agent').skipPermissions
  },
  getLocalWorker(): LocalWorkerConfig | null {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { configStore } = require('../../config/config-store')
    return readLocalWorkerConfig(configStore.get('agent')?.localWorker ?? null)
  },
}

/** Die Rolle, für die der lokale Anbieter geschrieben wird. */
export const LOCAL_WORKER_ENTITY_ID = 'local-worker'
```

`mergeOpenCodeConfig` um einen vierten Parameter erweitern, am Ende vor `return merged`:

```ts
export function mergeOpenCodeConfig(
  existing: Record<string, unknown>,
  entry: OpenCodeMcpEntry,
  pluginSpecs: readonly string[] = [],
  local: { provider: Record<string, unknown>; model: string; allowExternal?: boolean } | null = null,
): Record<string, unknown> {
  // … bisheriger Körper unverändert bis vor `return merged` …

  // Lokaler Anbieter (Local Cyber Factory). Besitz hat der Mux nur an
  // provider['cipher-local'] und an einem model, das darauf zeigt — ein vom
  // Projekt gesetztes anderes model bleibt, wenn die Rolle keinen lokalen
  // Anbieter (mehr) hat.
  const provider =
    merged.provider && typeof merged.provider === 'object' && !Array.isArray(merged.provider)
      ? { ...(merged.provider as Record<string, unknown>) }
      : {}
  const ownModel = typeof merged.model === 'string' && merged.model.startsWith(`${LOCAL_PROVIDER_ID}/`)
  if (local) {
    provider[LOCAL_PROVIDER_ID] = local.provider
    merged.model = local.model
  } else {
    delete provider[LOCAL_PROVIDER_ID]
    if (ownModel) delete merged.model
  }
  if (Object.keys(provider).length > 0) merged.provider = provider
  else delete merged.provider

  return merged
}
```

Falls Task 0 ergeben hat, dass `permission.external_directory: "allow"` nötig ist: bei `local?.allowExternal` zusätzlich
`merged.permission = { ...(merged.permission as object ?? {}), external_directory: 'allow' }` setzen und einen Test dafür ergänzen. Sonst `allowExternal` weglassen.

In `postLaunchInjection` vor `const entry = …`:

```ts
      const localCfg =
        ctx.entityId === LOCAL_WORKER_ENTITY_ID ? (this.configReader.getLocalWorker?.() ?? null) : null
      const local = localCfg
        ? { provider: buildLocalProviderBlock(localCfg), model: localModelSpec(localCfg) }
        : null
```

`const pluginSpecs = this.writePlugins(ctx.projectPath, ctx.entityId)` → `this.writePlugins(ctx.projectPath, ctx.entityId, localCfg?.contextWindow)` und `mergeOpenCodeConfig(existing, entry, pluginSpecs, local)`.

In `writePlugins` Signatur `(projectPath, entityId?, contextWindow?: number)` und `contextWindowSize: contextWindow ?? OPENCODE_FALLBACK_CONTEXT_WINDOW`.

- [ ] **Step 4: Run** — neuer Test PASS, bestehende opencode-Tests: `node --test --import tsx test/main/opencode*.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/agent/adapters/opencode.ts test/main/opencode-local-provider.test.ts
git commit -m "feat(opencode): lokaler Anbieter und Modell fuer die Rolle local-worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Rollengrenzen — Architekt ohne Produktionscode, Worker mit dynamischer Sperrliste

**Files:**
- Modify: `src/main/session/entity-boundaries.ts`
- Modify: `src/main/agent/adapters/opencode.ts` (`writePlugins` übergibt `denyListFile`)
- Test: `test/main/entity-boundaries.test.ts` (ergänzen)

**Interfaces:**
- Produces: `EntityBoundary.denyListFile?: string`; `PROTECTED_PATHS_FILENAME = '.cipher-mux-protected.json'`; `buildOpenCodeBoundaryPlugin(deny, reason, denyListFile?: string)`.

- [ ] **Step 1: Failing tests** (an `entity-boundaries.test.ts` anhängen)

```ts
describe('Local Cyber Factory boundaries', () => {
  it('local-factory darf keinen Produktionscode schreiben', () => {
    const b = getEntityBoundary('local-factory')!
    assert.ok(isPathDenied('/p/src/app.ts', b.denyPathPatterns))
    assert.ok(isPathDenied('/p/lib/main.dart', b.denyPathPatterns))
    assert.ok(!isPathDenied('/p/test/app.test.ts', b.denyPathPatterns))
  })

  it('local-worker hat eine dynamische Sperrliste und sperrt AUFTRAG.md', () => {
    const b = getEntityBoundary('local-worker')!
    assert.equal(b.denyListFile, PROTECTED_PATHS_FILENAME)
    assert.ok(isPathDenied('/run/AUFTRAG.md', b.denyPathPatterns))
  })

  it('das opencode-Plugin liest die Sperrliste zur Aufrufzeit', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-boundary-'))
    const listFile = path.join(dir, PROTECTED_PATHS_FILENAME)
    const pluginPath = path.join(dir, 'p.mjs')
    fs.writeFileSync(pluginPath, buildOpenCodeBoundaryPlugin(['/AUFTRAG.md'], 'R', listFile))
    const mod = await import(pluginPath)
    const hooks = await mod.default()
    const call = (filePath: string) =>
      hooks['tool.execute.before']({ tool: 'edit' }, { args: { filePath } })

    // ohne Datei: nur die statische Regel
    await call('/p/test/accept.test.ts')
    fs.writeFileSync(listFile, JSON.stringify(['/p/test/accept.test.ts']))
    await assert.rejects(call('/p/test/accept.test.ts'), /R/)
    await call('/p/src/ok.ts')
    // kaputte Datei blockiert nicht pauschal
    fs.writeFileSync(listFile, '{kaputt')
    await call('/p/test/accept.test.ts')
  })
})
```

`PROTECTED_PATHS_FILENAME` in die Importliste oben aufnehmen.

- [ ] **Step 2: Run, expect FAIL** — `node --test --import tsx test/main/entity-boundaries.test.ts`.

- [ ] **Step 3: Implementierung**

In `EntityBoundary`:

```ts
  /**
   * Absolute path to a JSON array of further deny patterns, read on every
   * tool call. For `local-worker`, whose protected acceptance tests change per
   * work item (Spec 2026-10-09 §5). Only the opencode plugin honours it — the
   * worker runs nowhere else. An unreadable file adds nothing; the gate is
   * what enforces test protection, this is the guard rail.
   */
  denyListFile?: string
```

Konstante und zwei Einträge in `ENTITY_BOUNDARIES`:

```ts
/** File the runner writes the current work item's protected paths into. */
export const PROTECTED_PATHS_FILENAME = '.cipher-mux-protected.json'

  'local-factory': {
    denyPathPatterns: ['/src/', '/lib/'],
    reason:
      'Die Local Cyber Factory schneidet zu und prueft, sie codet nicht — sonst wandert die '
      + 'Arbeit still zurueck in die Cloud und die Messung, was das lokale Modell kann, ist '
      + 'wertlos (Spec 2026-10-09, E3). Abnahmetests und Auftraege bleiben erlaubt.',
  },
  'local-worker': {
    denyPathPatterns: ['/AUFTRAG.md'],
    denyListFile: PROTECTED_PATHS_FILENAME,
    reason:
      'Abnahmetests und Auftrag gehoeren dem Architekten. Wer den Test aendert, den er '
      + 'bestehen soll, beweist nichts (Keel C-001). Eigene Unit-Tests sind erlaubt.',
  },
```

`denyListFile` ist im Registry-Eintrag nur der Dateiname; der Adapter macht daraus den absoluten Pfad im Run-Verzeichnis.

`buildOpenCodeBoundaryPlugin` erweitern:

```ts
export function buildOpenCodeBoundaryPlugin(
  denyPathPatterns: readonly string[],
  reason: string,
  denyListFile?: string,
): string {
  return `// Generated by cipher-mux (entity-boundaries.ts). Do not edit — regenerated on
// every entity start. The rule and its reason are baked in below.
//
// ESM default export of a FUNCTION: opencode rejects a CommonJS module with
// "Plugin export is not a function", and says so only under --print-logs.
import * as fs from 'node:fs'

const DENY = ${JSON.stringify(denyPathPatterns)}
const REASON = ${JSON.stringify(reason)}
const EDIT_TOOLS = new Set(${JSON.stringify(OPENCODE_EDIT_TOOLS)})
const DENY_LIST_FILE = ${JSON.stringify(denyListFile ?? null)}

function extraDeny() {
  if (!DENY_LIST_FILE) return []
  try {
    const list = JSON.parse(fs.readFileSync(DENY_LIST_FILE, 'utf-8'))
    return Array.isArray(list) ? list.filter(p => typeof p === 'string' && p) : []
  } catch {
    // Fehlt oder kaputt: nur die festen Regeln. Durchgesetzt wird im Gate.
    return []
  }
}

export default async () => ({
  'tool.execute.before': async (input, output) => {
    if (!input || !EDIT_TOOLS.has(input.tool)) return

    const filePath = output && output.args ? output.args.filePath : ''
    if (typeof filePath !== 'string' || !filePath) return

    if ([...DENY, ...extraDeny()].some(pattern => filePath.includes(pattern))) {
      throw new Error(REASON)
    }
  },
})
`
}
```

Hinweis: Der bisherige Kommentar zum `throw` und zur `read`-Ausnahme bleibt im generierten Text erhalten — beim Ersetzen nur die neuen Zeilen einfügen, nicht die Kommentare streichen.

In `opencode.ts` `writePlugins`, beim Schreiben der Grenze:

```ts
        buildOpenCodeBoundaryPlugin(
          boundary.denyPathPatterns,
          boundary.reason,
          boundary.denyListFile ? path.join(projectPath, boundary.denyListFile) : undefined,
        ),
```

(`projectPath` ist hier das Run-Verzeichnis, siehe Kopfkommentar Punkt 3.)

- [ ] **Step 4: Run** — `node --test --import tsx test/main/entity-boundaries.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/session/entity-boundaries.ts src/main/agent/adapters/opencode.ts test/main/entity-boundaries.test.ts
git commit -m "feat(boundaries): Local Cyber Factory codet nicht, der Worker fasst Abnahmetests nicht an

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Zwei Rollen in Registry, Presets und Permissions

**Files:**
- Modify: `src/shared/types.ts:21` (`BuiltinEntityId`)
- Modify: `src/main/session/entity-registry.ts` (`registerBuiltinEntities`)
- Create: `src/main/local-factory/presets.ts`
- Modify: `src/main/session/session-manager.ts` (preset-Zweige in `startEntity`, `getMcpPermissionsForEntity`)
- Test: `test/main/entity-registry.test.ts` (ergänzen), `test/main/local-factory/presets.test.ts`

**Interfaces:**
- Produces: Entity-IDs `'local-factory'`, `'local-worker'`; `generateLocalFactoryPreset(): string`, `generateLocalWorkerPreset(): string`; Tool-Name `mux_local_worker_dispatch` (Konstante `LOCAL_WORKER_DISPATCH_TOOL` in `presets.ts`).

- [ ] **Step 1: Failing tests**

```ts
// an test/main/entity-registry.test.ts anhängen
describe('Local Cyber Factory im Registry', () => {
  it('registriert local-factory (claude) und local-worker (opencode, singleInstance)', () => {
    const r = new EntityRegistry()
    registerBuiltinEntities(r)
    const f = r.get('local-factory')!
    const w = r.get('local-worker')!
    assert.ok(f.features.includes('mcp'))
    assert.equal(f.singleInstance, true)
    assert.equal(w.adapterId, 'opencode')
    assert.equal(w.singleInstance, true)
  })
})
```

```ts
// test/main/local-factory/presets.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import {
  generateLocalFactoryPreset,
  generateLocalWorkerPreset,
  LOCAL_WORKER_DISPATCH_TOOL,
} from '../../../src/main/local-factory/presets'

describe('Local Cyber Factory presets', () => {
  it('Architekt nennt das Werkzeug, die 2-Versuche-Grenze und dass er nicht codet', () => {
    const p = generateLocalFactoryPreset()
    assert.match(p, new RegExp(LOCAL_WORKER_DISPATCH_TOOL))
    assert.match(p, /2 Versuche/)
    assert.match(p, /codest nicht/i)
  })
  it('Architekt pollt nicht', () => {
    assert.match(generateLocalFactoryPreset(), /nicht.*capture-pane|kein.*Polling/i)
  })
  it('Worker endet mit REPORT.md und fasst Abnahmetests nicht an', () => {
    const p = generateLocalWorkerPreset()
    assert.match(p, /REPORT\.md/)
    assert.match(p, /Abnahmetest/)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

`src/shared/types.ts:21` — `| 'local-factory' | 'local-worker'` an `BuiltinEntityId` anhängen.

In `registerBuiltinEntities` nach dem `cyber-factory`-Eintrag:

```ts
  registry.register({
    id: 'local-factory',
    displayName: 'Local Cyber Factory',
    icon: '🏗️',
    color: '#8e24aa',
    projectPath: `${entitiesBase}/local-factory`,
    features: ['mcp'],
    visible: true,
    sortOrder: 41,
    singleInstance: true,
  })

  registry.register({
    id: 'local-worker',
    displayName: 'Local Worker',
    icon: '⚙️',
    color: '#6d4c41',
    projectPath: `${entitiesBase}/local-worker`,
    features: ['mcp'],
    visible: true,
    sortOrder: 42,
    // Nacheinander (Spec E2) ist damit eine Eigenschaft der Registry.
    singleInstance: true,
    adapterId: 'opencode',
  })
```

`src/main/local-factory/presets.ts`:

```ts
/**
 * Rollentexte der Local Cyber Factory. Sie beschreiben, was die Mechanik
 * ohnehin erzwingt (Grenzen, 2 Versuche, Gate) — damit das Modell nicht gegen
 * Wände läuft. Durchgesetzt wird nicht hier.
 */

export const LOCAL_WORKER_DISPATCH_TOOL = 'mux_local_worker_dispatch'

export function generateLocalFactoryPreset(): string {
  return `# Local Cyber Factory — Architekt und Prüfer

Du schneidest Arbeit in kleine Häppchen und prüfst die Ergebnisse. Ein lokales
Modell in einer opencode-Session (Local Worker) codet. **Du codest nicht** —
Produktionscode ist für dich gesperrt. Du schreibst Abnahmetests und Aufträge.

## Pro Häppchen

1. Schreibe **einen** Abnahmetest für das Akzeptanzkriterium. Er muss jetzt rot sein.
   Nur das Kriterium, keine Vollabdeckung — Unit-Tests schreibt der Worker.
2. Rufe \`${LOCAL_WORKER_DISPATCH_TOOL}\` mit allen Pflichtfeldern auf. Committe den
   Test nicht selbst; der Läufer tut das als Basis.
3. **Warte.** Der Mux beobachtet den Worker und weckt dich mit einer Zeile
   \`[local-factory] #N …\`. Kein Polling, kein capture-pane, kein mux_context_usage
   auf den Worker — jede Abfrage kostet einen Zug.
4. **GRÜN:** Lies den Commit (\`git show\`) gegen die Spec. Grün heißt nur „nichts
   kaputt“. Erfüllt → nächstes Häppchen. Nicht erfüllt → neues Häppchen mit
   präziserem Kriterium.
5. **ROT/HÄNGT:** Dispatch erneut mit derselben \`haeppchen\`-Nummer. Die Gate-Ausgabe
   geht automatisch wörtlich in den neuen Auftrag — erzähle sie nicht nach.
6. **Maximal 2 Versuche.** Danach lehnt das Werkzeug ab und das Häppchen ist
   eskaliert: Melde es dem User mit Gate-Pfad und deiner Einschätzung.

## Zuschnitt

- Ein Häppchen = eine Änderung, die ein schwächeres Modell ohne Rückfrage schafft.
- \`dateien\` nennt die Stellen, an denen gearbeitet wird. \`nichtZiele\` nennt, was
  liegen bleibt.
- Lieber drei kleine als ein großes Häppchen.

## Am Laufende

Fasse \`lauf.json\` (Pfad steht in jeder Weckzeile) als Note zusammen: Häppchen,
Versuche, abgenommen/eskaliert, Weckrufe.
`
}

export function generateLocalWorkerPreset(): string {
  return `# Local Worker

Du arbeitest genau einen Auftrag ab: \`AUFTRAG.md\` in deinem Arbeitsverzeichnis.
Das Projekt liegt unter dem dort genannten absoluten Pfad.

- Ändere nur, was der Auftrag nennt. Die genannten **Abnahmetests** sind gesperrt:
  du sollst sie bestehen, nicht ändern.
- Eigene Unit-Tests darfst du schreiben.
- Führe den Testbefehl aus dem Auftrag selbst aus, bevor du aufhörst.
- Ändere bestehende Dateien gezielt, statt sie neu zu schreiben.
- Committe nicht. Das macht der Mux.

**Zum Schluss** schreibe \`REPORT.md\` in dein Arbeitsverzeichnis: was du geändert
hast, Ergebnis des Testbefehls, was offen ist. Danach bist du fertig.
`
}
```

In `session-manager.ts` `startEntity`, im preset-Block vor dem generischen `else if (!fs.existsSync(presetMdPath))`:

```ts
      } else if (config.id === 'local-factory') {
        if (!fs.existsSync(presetMdPath)) {
          fs.writeFileSync(presetMdPath, generateLocalFactoryPreset(), 'utf-8')
        }
      } else if (config.id === 'local-worker') {
        // Bei jedem Start neu: der Worker hat keine Handarbeit zu bewahren,
        // und ein veralteter Rollentext wäre still wirksam.
        fs.writeFileSync(presetMdPath, generateLocalWorkerPreset(), 'utf-8')
```

Import oben: `import { generateLocalFactoryPreset, generateLocalWorkerPreset, LOCAL_WORKER_DISPATCH_TOOL } from '../local-factory/presets'`.

In `getMcpPermissionsForEntity` nach dem `switch`:

```ts
  if (entityId === 'local-factory') {
    perms.push(`${MCP_PREFIX}${LOCAL_WORKER_DISPATCH_TOOL}`)
  }
```

- [ ] **Step 4: Run** — beide Tests PASS; `npx tsc -p tsconfig.main.json --noEmit` 0 Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts src/main/session/entity-registry.ts src/main/local-factory/presets.ts src/main/session/session-manager.ts test/main/entity-registry.test.ts test/main/local-factory/presets.test.ts
git commit -m "feat(local-factory): Rollen Local Cyber Factory und Local Worker

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Gate-Entscheidung (rein)

**Files:**
- Create: `src/main/local-factory/gate.ts`
- Test: `test/main/local-factory/gate.test.ts`

**Interfaces:**
- Produces:
  - `type GateVerdict = 'gruen' | 'rot' | 'haengt'`
  - `interface GateInput { workerFinished: boolean; testExitCode: number | null; checksumsBefore: Record<string, string>; checksumsAfter: Record<string, string>; changedFiles: string[]; protectedFiles: string[] }`
  - `interface GateResult { verdict: GateVerdict; reasons: string[] }`
  - `touchedProtected(changed: string[], protectedFiles: string[]): string[]`
  - `changedChecksums(before, after): string[]`
  - `decideGate(input: GateInput): GateResult`

Pfade in `changedFiles` und `protectedFiles` sind **repo-relativ** (so liefert sie `git diff --name-only`); der Läufer normalisiert die Pfade des Architekten vorher (Task 9).

- [ ] **Step 1: Failing test**

```ts
// test/main/local-factory/gate.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { decideGate, touchedProtected, changedChecksums } from '../../../src/main/local-factory/gate'

const base = {
  workerFinished: true,
  testExitCode: 0,
  checksumsBefore: { 'test/a.test.ts': 'h1' },
  checksumsAfter: { 'test/a.test.ts': 'h1' },
  changedFiles: ['src/a.ts'],
  protectedFiles: ['test/a.test.ts'],
}

describe('decideGate', () => {
  it('grün: fertig, Tests grün, Schutz intakt', () => {
    assert.deepEqual(decideGate(base), { verdict: 'gruen', reasons: [] })
  })
  it('hängt: Worker nicht fertig geworden, egal was die Tests sagen', () => {
    assert.equal(decideGate({ ...base, workerFinished: false }).verdict, 'haengt')
  })
  it('rot: Tests rot', () => {
    const r = decideGate({ ...base, testExitCode: 1 })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /Testbefehl/)
  })
  it('rot: Testbefehl nicht gelaufen (null)', () => {
    assert.equal(decideGate({ ...base, testExitCode: null }).verdict, 'rot')
  })
  it('rot trotz grüner Tests, wenn ein geschützter Test im Diff steht (Shell-Weg)', () => {
    const r = decideGate({ ...base, changedFiles: ['src/a.ts', 'test/a.test.ts'] })
    assert.equal(r.verdict, 'rot')
    assert.match(r.reasons.join(), /test\/a\.test\.ts/)
  })
  it('rot, wenn die Prüfsumme abweicht, auch ohne Diff-Eintrag', () => {
    const r = decideGate({ ...base, checksumsAfter: { 'test/a.test.ts': 'h2' } })
    assert.equal(r.verdict, 'rot')
  })
  it('rot, wenn eine geschützte Datei verschwunden ist', () => {
    assert.equal(decideGate({ ...base, checksumsAfter: {} }).verdict, 'rot')
  })
})

describe('Hilfsfunktionen', () => {
  it('touchedProtected normalisiert führendes ./', () => {
    assert.deepEqual(touchedProtected(['./test/a.test.ts'], ['test/a.test.ts']), ['test/a.test.ts'])
  })
  it('changedChecksums meldet geänderte und fehlende', () => {
    assert.deepEqual(changedChecksums({ a: '1', b: '2' }, { a: '1' }), ['b'])
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

```ts
// src/main/local-factory/gate.ts
/**
 * Gate ohne Modell (Spec §7, Schritt 6).
 *
 * Zwei unabhängige Wege prüfen den Testschutz, weil jeder eine Lücke des
 * anderen schließt: die Prüfsumme sieht Inhaltsänderungen auch an Dateien, die
 * git ignoriert; der Diff sieht jede Änderung, gleichgültig ob sie über das
 * Edit-Werkzeug oder die Shell kam — dort hat die Plugin-Grenze keine Augen.
 */

export type GateVerdict = 'gruen' | 'rot' | 'haengt'

export interface GateInput {
  workerFinished: boolean
  /** null = Testbefehl lief nicht (Start fehlgeschlagen, Timeout). */
  testExitCode: number | null
  checksumsBefore: Record<string, string>
  checksumsAfter: Record<string, string>
  /** Repo-relativ, wie `git diff --name-only` sie liefert. */
  changedFiles: string[]
  /** Repo-relativ. */
  protectedFiles: string[]
}

export interface GateResult {
  verdict: GateVerdict
  reasons: string[]
}

const norm = (p: string): string => p.replace(/^\.\//, '')

export function touchedProtected(changed: string[], protectedFiles: string[]): string[] {
  const prot = new Set(protectedFiles.map(norm))
  return changed.map(norm).filter(f => prot.has(f))
}

export function changedChecksums(
  before: Record<string, string>,
  after: Record<string, string>,
): string[] {
  return Object.keys(before).filter(f => after[f] !== before[f])
}

export function decideGate(input: GateInput): GateResult {
  if (!input.workerFinished) {
    return { verdict: 'haengt', reasons: ['Worker ist nicht fertig geworden (Timeout oder Stillstand).'] }
  }
  const reasons: string[] = []
  const touched = touchedProtected(input.changedFiles, input.protectedFiles)
  if (touched.length > 0) reasons.push(`Geschützte Tests verändert: ${touched.join(', ')}`)
  const sums = changedChecksums(input.checksumsBefore, input.checksumsAfter)
    .filter(f => !touched.includes(norm(f)))
  if (sums.length > 0) reasons.push(`Prüfsumme geschützter Tests abweichend: ${sums.join(', ')}`)
  if (input.testExitCode === null) reasons.push('Testbefehl ist nicht gelaufen.')
  else if (input.testExitCode !== 0) reasons.push(`Testbefehl rot (Exit ${input.testExitCode}).`)
  return { verdict: reasons.length === 0 ? 'gruen' : 'rot', reasons }
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/main/local-factory/gate.ts test/main/local-factory/gate.test.ts
git commit -m "feat(local-factory): Gate-Entscheidung ohne Modell

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Auftrag — Pflichtfelder und `AUFTRAG.md`

**Files:**
- Create: `src/main/local-factory/auftrag.ts`
- Test: `test/main/local-factory/auftrag.test.ts`

**Interfaces:**
- Produces:
  - `interface AuftragInput { projekt: string; ziel: string; dateien: string[]; akzeptanzkriterium: string; geschuetzteTests: string[]; testBefehl: string; nichtZiele: string[] }`
  - `validateAuftrag(a: AuftragInput): string[]` (leere Liste = gültig)
  - `buildAuftragMd(a: AuftragInput, opts: { nummer: number; versuch: number; vorherigesGate?: { reasons: string[]; testOutput: string } }): string`
  - `MAX_GATE_OUTPUT_CHARS = 6000`

- [ ] **Step 1: Failing test**

```ts
// test/main/local-factory/auftrag.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { validateAuftrag, buildAuftragMd, MAX_GATE_OUTPUT_CHARS } from '../../../src/main/local-factory/auftrag'

const a = {
  projekt: '/abs/projekt',
  ziel: 'Login-Formular validiert E-Mail',
  dateien: ['src/login.ts'],
  akzeptanzkriterium: 'Ungültige E-Mail zeigt Fehlermeldung',
  geschuetzteTests: ['test/login.accept.test.ts'],
  testBefehl: 'npm test -- test/login.accept.test.ts',
  nichtZiele: ['Kein Styling'],
}

describe('validateAuftrag', () => {
  it('gültiger Auftrag → keine Fehler', () => {
    assert.deepEqual(validateAuftrag(a), [])
  })
  it('leere Pflichtfelder werden einzeln benannt', () => {
    const errs = validateAuftrag({ ...a, ziel: ' ', geschuetzteTests: [], testBefehl: '' })
    assert.equal(errs.length, 3)
    assert.match(errs.join(), /ziel/)
    assert.match(errs.join(), /geschuetzteTests/)
    assert.match(errs.join(), /testBefehl/)
  })
  it('projekt muss absolut sein', () => {
    assert.match(validateAuftrag({ ...a, projekt: 'rel' }).join(), /absolut/)
  })
  it('geschützter Test außerhalb des Projekts wird abgelehnt', () => {
    assert.match(validateAuftrag({ ...a, geschuetzteTests: ['/anderswo/x.test.ts'] }).join(), /außerhalb/)
  })
})

describe('buildAuftragMd', () => {
  it('enthält Projektpfad, Kriterium, geschützte Tests, Testbefehl', () => {
    const md = buildAuftragMd(a, { nummer: 3, versuch: 1 })
    for (const s of ['/abs/projekt', a.akzeptanzkriterium, 'test/login.accept.test.ts', a.testBefehl, '#3']) {
      assert.ok(md.includes(s), s)
    }
  })
  it('zweiter Versuch: Gate-Ausgabe wörtlich, in einem Codeblock', () => {
    const md = buildAuftragMd(a, {
      nummer: 3, versuch: 2,
      vorherigesGate: { reasons: ['Testbefehl rot (Exit 1).'], testOutput: 'AssertionError: expected "x"' },
    })
    assert.ok(md.includes('AssertionError: expected "x"'))
    assert.ok(md.includes('Versuch 2'))
  })
  it('lange Gate-Ausgabe wird vorne gekürzt, das Ende bleibt', () => {
    const out = 'A'.repeat(MAX_GATE_OUTPUT_CHARS) + 'ENDE'
    const md = buildAuftragMd(a, { nummer: 1, versuch: 2, vorherigesGate: { reasons: [], testOutput: out } })
    assert.ok(md.includes('ENDE'))
    assert.ok(md.length < out.length + 2000)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

```ts
// src/main/local-factory/auftrag.ts
import * as path from 'path'

/**
 * Der Auftrag an den Worker. Pflichtfelder statt Freitext, weil in Keel Regeln
 * nur im Schema hielten (Spec §3). Die Gate-Ausgabe eines Fehlversuchs geht
 * wörtlich mit — nacherzählt verlor sie in Keel den Fehlerort.
 */

export interface AuftragInput {
  projekt: string
  ziel: string
  dateien: string[]
  akzeptanzkriterium: string
  geschuetzteTests: string[]
  testBefehl: string
  nichtZiele: string[]
}

/** Testausgaben enden mit dem Wichtigen; gekürzt wird vorne. */
export const MAX_GATE_OUTPUT_CHARS = 6000

const blank = (s: unknown): boolean => typeof s !== 'string' || s.trim() === ''

export function validateAuftrag(a: AuftragInput): string[] {
  const errs: string[] = []
  if (blank(a.projekt) || !path.isAbsolute(a.projekt)) errs.push('projekt: absoluter Pfad erforderlich')
  if (blank(a.ziel)) errs.push('ziel: leer')
  if (blank(a.akzeptanzkriterium)) errs.push('akzeptanzkriterium: leer')
  if (blank(a.testBefehl)) errs.push('testBefehl: leer')
  if (!Array.isArray(a.geschuetzteTests) || a.geschuetzteTests.length === 0) {
    errs.push('geschuetzteTests: mindestens ein Abnahmetest')
  } else if (!blank(a.projekt) && path.isAbsolute(a.projekt)) {
    for (const t of a.geschuetzteTests) {
      const abs = path.resolve(a.projekt, t)
      if (!abs.startsWith(path.resolve(a.projekt) + path.sep)) {
        errs.push(`geschuetzteTests: ${t} liegt außerhalb des Projekts`)
      }
    }
  }
  if (!Array.isArray(a.dateien)) errs.push('dateien: Liste erforderlich')
  if (!Array.isArray(a.nichtZiele)) errs.push('nichtZiele: Liste erforderlich')
  return errs
}

function tail(s: string): string {
  return s.length <= MAX_GATE_OUTPUT_CHARS ? s : '… (gekürzt)\n' + s.slice(-MAX_GATE_OUTPUT_CHARS)
}

const list = (xs: string[]): string => (xs.length ? xs.map(x => `- ${x}`).join('\n') : '- (keine)')

export function buildAuftragMd(
  a: AuftragInput,
  opts: { nummer: number; versuch: number; vorherigesGate?: { reasons: string[]; testOutput: string } },
): string {
  const parts = [
    `# Auftrag #${opts.nummer} — Versuch ${opts.versuch}`,
    '',
    `**Projekt:** \`${a.projekt}\``,
    '',
    `## Ziel\n\n${a.ziel}`,
    `## Akzeptanzkriterium\n\n${a.akzeptanzkriterium}`,
    `## Dateien\n\n${list(a.dateien)}`,
    `## Abnahmetests — gesperrt, bestehen statt ändern\n\n${list(a.geschuetzteTests)}`,
    `## Testbefehl (im Projekt ausführen)\n\n\`\`\`\n${a.testBefehl}\n\`\`\``,
    `## Nicht-Ziele\n\n${list(a.nichtZiele)}`,
  ]
  if (opts.vorherigesGate) {
    parts.push(
      `## Der vorige Versuch ist durchgefallen\n\n${list(opts.vorherigesGate.reasons)}\n\n`
      + `Ausgabe des Testbefehls, wörtlich:\n\n\`\`\`\n${tail(opts.vorherigesGate.testOutput)}\n\`\`\``,
    )
  }
  parts.push('## Zum Schluss\n\nSchreibe `REPORT.md` in dein Arbeitsverzeichnis. Nicht committen.')
  return parts.join('\n\n') + '\n'
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/main/local-factory/auftrag.ts test/main/local-factory/auftrag.test.ts
git commit -m "feat(local-factory): Auftrag mit Pflichtfeldern und woertlicher Gate-Ausgabe

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `lauf.json` — Zustand und Zählung

**Files:**
- Create: `src/main/local-factory/lauf.ts`
- Test: `test/main/local-factory/lauf.test.ts`

**Interfaces:**
- Produces:
  - `MAX_VERSUCHE = 2`
  - `type HaeppchenStatus = 'laeuft' | 'wartet' | 'abgenommen' | 'eskaliert' | 'abgebrochen'` (`wartet` = Versuch fertig, Architekt am Zug)
  - `interface Versuch { nr: number; gestartet: number; beendet?: number; verdict?: 'gruen' | 'rot' | 'haengt'; gatePfad?: string; patchPfad?: string; commit?: string; tokensAmEnde?: { input: number; output: number } }`
  - `interface Haeppchen { nummer: number; ziel: string; status: HaeppchenStatus; versuche: Versuch[] }`
  - `interface Lauf { id: string; projekt: string; erstellt: number; weckrufe: number; haeppchen: Haeppchen[] }`
  - `newLauf(id, projekt, now): Lauf`
  - `beginVersuch(lauf, opts: { nummer?: number; ziel: string; now: number }): { lauf: Lauf; nummer: number; versuch: number } | { error: string }`
  - `endVersuch(lauf, nummer, patch: Partial<Versuch> & { verdict: 'gruen'|'rot'|'haengt' }, now): Lauf`
  - `markAbgenommen(lauf, nummer): Lauf`, `countWeckruf(lauf): Lauf`, `abortRunning(lauf): Lauf`
  - `parseLauf(raw: unknown): Lauf | null`, `loadLauf(file): Lauf | null`, `saveLauf(file, lauf): void`

- [ ] **Step 1: Failing test**

```ts
// test/main/local-factory/lauf.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import {
  newLauf, beginVersuch, endVersuch, markAbgenommen, abortRunning, countWeckruf,
  parseLauf, loadLauf, saveLauf, MAX_VERSUCHE, type Lauf,
} from '../../../src/main/local-factory/lauf'

const ok = <T>(r: T | { error: string }): T => {
  if ('error' in (r as object)) throw new Error((r as { error: string }).error)
  return r as T
}

describe('Lauf-Zustand', () => {
  it('neues Häppchen bekommt die nächste Nummer, Versuch 1', () => {
    const r = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 }))
    assert.equal(r.nummer, 1)
    assert.equal(r.versuch, 1)
    assert.equal(r.lauf.haeppchen[0].status, 'laeuft')
  })

  it('zweiter Versuch auf dasselbe Häppchen nach rot', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    const r = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3 }))
    assert.equal(r.versuch, 2)
  })

  it(`nach ${MAX_VERSUCHE} Fehlschlägen: eskaliert und kein dritter Versuch`, () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'rot' }, 2)
    l = ok(beginVersuch(l, { nummer: 1, ziel: 'a', now: 3 })).lauf
    l = endVersuch(l, 1, { verdict: 'haengt' }, 4)
    assert.equal(l.haeppchen[0].status, 'eskaliert')
    const r = beginVersuch(l, { nummer: 1, ziel: 'a', now: 5 })
    assert.ok('error' in r)
    assert.match((r as { error: string }).error, /eskaliert/)
  })

  it('kein neuer Versuch, solange einer läuft (nacheinander)', () => {
    const l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    assert.ok('error' in beginVersuch(l, { ziel: 'b', now: 2 }))
  })

  it('grün → wartet; abgenommen erst durch den Architekten', () => {
    let l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    l = endVersuch(l, 1, { verdict: 'gruen', commit: 'abc' }, 2)
    assert.equal(l.haeppchen[0].status, 'wartet')
    assert.equal(markAbgenommen(l, 1).haeppchen[0].status, 'abgenommen')
  })

  it('unbekannte Nummer → Fehler', () => {
    assert.ok('error' in beginVersuch(newLauf('L', '/p', 0), { nummer: 7, ziel: 'a', now: 1 }))
  })

  it('abortRunning markiert laufende Häppchen als abgebrochen', () => {
    const l = ok(beginVersuch(newLauf('L', '/p', 0), { ziel: 'a', now: 1 })).lauf
    assert.equal(abortRunning(l).haeppchen[0].status, 'abgebrochen')
  })

  it('countWeckruf zählt hoch', () => {
    assert.equal(countWeckruf(newLauf('L', '/p', 0)).weckrufe, 1)
  })
})

describe('parseLauf / loadLauf defensiv', () => {
  it('Müll → null', () => {
    assert.equal(parseLauf(null), null)
    assert.equal(parseLauf('x'), null)
    assert.equal(parseLauf({ id: 1 }), null)
  })
  it('fehlende Felder werden aufgefüllt, kaputte Häppchen fallen weg', () => {
    const l = parseLauf({ id: 'L', projekt: '/p', haeppchen: [{ nummer: 1, ziel: 'a' }, 'kaputt'] })!
    assert.equal(l.weckrufe, 0)
    assert.equal(l.haeppchen.length, 1)
    assert.deepEqual(l.haeppchen[0].versuche, [])
    assert.equal(l.haeppchen[0].status, 'abgebrochen')
  })
  it('Roundtrip über die Platte; kaputte Datei → null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lauf-'))
    const f = path.join(dir, 'x', 'lauf.json')
    const l: Lauf = newLauf('L', '/p', 0)
    saveLauf(f, l)
    assert.deepEqual(loadLauf(f), l)
    fs.writeFileSync(f, '{kaputt')
    assert.equal(loadLauf(f), null)
    assert.equal(loadLauf(path.join(dir, 'fehlt.json')), null)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

```ts
// src/main/local-factory/lauf.ts
import * as fs from 'fs'
import * as path from 'path'

/**
 * Zustand und Zählung eines Laufs (Spec §8). JSON statt SQLite-Spalten: das
 * wäre eine Migration, und die Datei ist direkt lesbar. Alle Übergänge sind
 * rein; nur load/save berühren die Platte.
 *
 * MAX_VERSUCHE ist hier und nicht im Prompt erzwungen (Spec E3).
 */

export const MAX_VERSUCHE = 2

export type HaeppchenStatus = 'laeuft' | 'wartet' | 'abgenommen' | 'eskaliert' | 'abgebrochen'
type Verdict = 'gruen' | 'rot' | 'haengt'

export interface Versuch {
  nr: number
  gestartet: number
  beendet?: number
  verdict?: Verdict
  gatePfad?: string
  patchPfad?: string
  commit?: string
  tokensAmEnde?: { input: number; output: number }
}

export interface Haeppchen {
  nummer: number
  ziel: string
  status: HaeppchenStatus
  versuche: Versuch[]
}

export interface Lauf {
  id: string
  projekt: string
  erstellt: number
  weckrufe: number
  haeppchen: Haeppchen[]
}

export function newLauf(id: string, projekt: string, now: number): Lauf {
  return { id, projekt, erstellt: now, weckrufe: 0, haeppchen: [] }
}

const replaceH = (lauf: Lauf, h: Haeppchen): Lauf => ({
  ...lauf,
  haeppchen: lauf.haeppchen.map(x => (x.nummer === h.nummer ? h : x)),
})

export function beginVersuch(
  lauf: Lauf,
  opts: { nummer?: number; ziel: string; now: number },
): { lauf: Lauf; nummer: number; versuch: number } | { error: string } {
  if (lauf.haeppchen.some(h => h.status === 'laeuft')) {
    return { error: 'Es läuft bereits ein Worker. Nacheinander (Spec E2).' }
  }
  if (opts.nummer === undefined) {
    const nummer = lauf.haeppchen.reduce((m, h) => Math.max(m, h.nummer), 0) + 1
    const h: Haeppchen = {
      nummer, ziel: opts.ziel, status: 'laeuft', versuche: [{ nr: 1, gestartet: opts.now }],
    }
    return { lauf: { ...lauf, haeppchen: [...lauf.haeppchen, h] }, nummer, versuch: 1 }
  }
  const h = lauf.haeppchen.find(x => x.nummer === opts.nummer)
  if (!h) return { error: `Häppchen #${opts.nummer} gibt es in diesem Lauf nicht.` }
  if (h.status === 'eskaliert') {
    return { error: `Häppchen #${h.nummer} ist eskaliert (${MAX_VERSUCHE} Versuche). An den User melden.` }
  }
  if (h.status === 'abgenommen') return { error: `Häppchen #${h.nummer} ist schon abgenommen.` }
  if (h.versuche.length >= MAX_VERSUCHE) {
    return { error: `Häppchen #${h.nummer} hat ${MAX_VERSUCHE} Versuche hinter sich. An den User melden.` }
  }
  const versuch = h.versuche.length + 1
  const next: Haeppchen = {
    ...h, ziel: opts.ziel, status: 'laeuft', versuche: [...h.versuche, { nr: versuch, gestartet: opts.now }],
  }
  return { lauf: replaceH(lauf, next), nummer: h.nummer, versuch }
}

export function endVersuch(
  lauf: Lauf,
  nummer: number,
  patch: Partial<Versuch> & { verdict: Verdict },
  now: number,
): Lauf {
  const h = lauf.haeppchen.find(x => x.nummer === nummer)
  if (!h || h.versuche.length === 0) return lauf
  const versuche = [...h.versuche]
  versuche[versuche.length - 1] = { ...versuche[versuche.length - 1], ...patch, beendet: now }
  const fehlschlaege = versuche.filter(v => v.verdict === 'rot' || v.verdict === 'haengt').length
  const status: HaeppchenStatus =
    patch.verdict === 'gruen' ? 'wartet' : fehlschlaege >= MAX_VERSUCHE ? 'eskaliert' : 'wartet'
  return replaceH(lauf, { ...h, versuche, status })
}

export function markAbgenommen(lauf: Lauf, nummer: number): Lauf {
  const h = lauf.haeppchen.find(x => x.nummer === nummer)
  return h ? replaceH(lauf, { ...h, status: 'abgenommen' }) : lauf
}

export function countWeckruf(lauf: Lauf): Lauf {
  return { ...lauf, weckrufe: lauf.weckrufe + 1 }
}

export function abortRunning(lauf: Lauf): Lauf {
  return {
    ...lauf,
    haeppchen: lauf.haeppchen.map(h => (h.status === 'laeuft' ? { ...h, status: 'abgebrochen' } : h)),
  }
}

const STATUS: readonly HaeppchenStatus[] = ['laeuft', 'wartet', 'abgenommen', 'eskaliert', 'abgebrochen']
const num = (n: unknown, d: number): number => (typeof n === 'number' && Number.isFinite(n) ? n : d)

/** Defensiv wie alles Persistierte: eine Datei aus einer älteren Fassung wird aufgefüllt. */
export function parseLauf(raw: unknown): Lauf | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.id !== 'string' || typeof r.projekt !== 'string') return null
  const haeppchen: Haeppchen[] = []
  for (const x of Array.isArray(r.haeppchen) ? r.haeppchen : []) {
    if (!x || typeof x !== 'object') continue
    const h = x as Record<string, unknown>
    if (typeof h.nummer !== 'number' || typeof h.ziel !== 'string') continue
    haeppchen.push({
      nummer: h.nummer,
      ziel: h.ziel,
      // Ohne Status weiß niemand, was daraus wurde — „abgebrochen“ behauptet am wenigsten.
      status: STATUS.includes(h.status as HaeppchenStatus) ? (h.status as HaeppchenStatus) : 'abgebrochen',
      versuche: Array.isArray(h.versuche)
        ? (h.versuche.filter(v => v && typeof v === 'object' && typeof (v as Versuch).nr === 'number') as Versuch[])
        : [],
    })
  }
  return { id: r.id, projekt: r.projekt, erstellt: num(r.erstellt, 0), weckrufe: num(r.weckrufe, 0), haeppchen }
}

export function loadLauf(file: string): Lauf | null {
  try {
    return parseLauf(JSON.parse(fs.readFileSync(file, 'utf-8')))
  } catch {
    return null
  }
}

export function saveLauf(file: string, lauf: Lauf): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(lauf, null, 2) + '\n', 'utf-8')
  fs.renameSync(tmp, file)
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/main/local-factory/lauf.ts test/main/local-factory/lauf.test.ts
git commit -m "feat(local-factory): lauf.json -- Versuche zaehlen, nach zwei Fehlschlaegen eskalieren

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Ende-Erkennung und Idle-Signal

**Files:**
- Create: `src/main/local-factory/worker-done.ts`
- Modify: `src/main/agent/adapters/opencode.ts` (`writePlugins`: Idle-Plugin nur für `local-worker`; `OPENCODE_OWNED_PLUGIN_FILENAMES`)
- Test: `test/main/local-factory/worker-done.test.ts`

**Interfaces:**
- Produces:
  - `IDLE_SIGNAL_FILENAME = '.cipher-mux-idle'`, `IDLE_PLUGIN_FILENAME = 'cipher-mux-idle.js'`
  - `IDLE_EVENT_TYPE` — Wert aus Task 0, Messung 3 (erwartet `'session.idle'`)
  - `buildIdlePlugin(signalFile: string): string`
  - `type WorkerState = 'arbeitet' | 'fertig' | 'haengt'`
  - `interface WorkerObservation { now: number; startedAt: number; reportMtime: number | null; idleSignalAt: number | null; lastActivityAt: number }`
  - `classifyWorker(o: WorkerObservation, cfg: { quietMs: number; timeoutMs: number; stallMs: number }): WorkerState`

Regel: `fertig`, wenn `REPORT.md` existiert **und** (Idle-Signal nach dem Report **oder** seit `quietMs` keine Aktivität). `haengt`, wenn `now - startedAt > timeoutMs` oder seit `stallMs` keine Aktivität ohne Report. Aktivität = jüngste mtime der Usage-JSON des Workers (Task 10 liest sie).

- [ ] **Step 1: Failing test**

```ts
// test/main/local-factory/worker-done.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { classifyWorker, buildIdlePlugin, IDLE_EVENT_TYPE } from '../../../src/main/local-factory/worker-done'

const cfg = { quietMs: 30_000, timeoutMs: 3_600_000, stallMs: 600_000 }
const o = { now: 100_000, startedAt: 0, reportMtime: null, idleSignalAt: null, lastActivityAt: 99_000 }

describe('classifyWorker', () => {
  it('arbeitet: kein Report, Aktivität frisch', () => {
    assert.equal(classifyWorker(o, cfg), 'arbeitet')
  })
  it('fertig: Report + Idle-Signal danach', () => {
    assert.equal(classifyWorker({ ...o, reportMtime: 90_000, idleSignalAt: 95_000 }, cfg), 'fertig')
  })
  it('nicht fertig: Report, aber Idle-Signal ist älter als der Report und Aktivität frisch', () => {
    assert.equal(classifyWorker({ ...o, reportMtime: 90_000, idleSignalAt: 50_000 }, cfg), 'arbeitet')
  })
  it('fertig ohne Idle-Signal: Report + Ruhe länger als quietMs', () => {
    assert.equal(classifyWorker({ ...o, reportMtime: 60_000, lastActivityAt: 60_000 }, cfg), 'fertig')
  })
  it('hängt: Timeout, auch mit Aktivität', () => {
    assert.equal(classifyWorker({ ...o, now: 3_700_000, lastActivityAt: 3_699_000 }, cfg), 'haengt')
  })
  it('hängt: lange Stille ohne Report', () => {
    assert.equal(classifyWorker({ ...o, now: 700_000, lastActivityAt: 50_000 }, cfg), 'haengt')
  })
})

describe('buildIdlePlugin', () => {
  it('schreibt die Signaldatei nur beim Idle-Ereignis', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idle-'))
    const signal = path.join(dir, 'sig')
    const p = path.join(dir, 'p.mjs')
    fs.writeFileSync(p, buildIdlePlugin(signal))
    const hooks = await (await import(p)).default()
    await hooks.event({ event: { type: 'message.updated' } })
    assert.equal(fs.existsSync(signal), false)
    await hooks.event({ event: { type: IDLE_EVENT_TYPE } })
    assert.ok(Number(fs.readFileSync(signal, 'utf-8')) > 0)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

```ts
// src/main/local-factory/worker-done.ts
/**
 * Wann ist der Worker fertig? (Spec §7, Schritt 5)
 *
 * Zwei Signale, weil keines allein trägt: REPORT.md sagt „ich halte mich für
 * fertig“, das Idle-Ereignis sagt „der Zug ist zu Ende“. Ein Report mitten im
 * Zug ist möglich, ein Idle zwischen zwei Zügen auch. Fällt das Idle-Ereignis
 * aus (anderer Name in einer neuen opencode-Version — still, wie alles dort),
 * trägt die Ruhezeit.
 */

export const IDLE_SIGNAL_FILENAME = '.cipher-mux-idle'
export const IDLE_PLUGIN_FILENAME = 'cipher-mux-idle.js'
/** Gemessen in Task 0 / Spec §10a. */
export const IDLE_EVENT_TYPE = 'session.idle'

export function buildIdlePlugin(signalFile: string): string {
  return `// Generated by cipher-mux (local-factory/worker-done.ts). Do not edit.
import * as fs from 'node:fs'

const SIGNAL = ${JSON.stringify(signalFile)}
const TYPE = ${JSON.stringify(IDLE_EVENT_TYPE)}

export default async () => ({
  event: async (raw) => {
    try {
      if (raw && raw.event && raw.event.type === TYPE) {
        fs.writeFileSync(SIGNAL, String(Date.now()), 'utf-8')
      }
    } catch {
      // Signal, keine Zusage — die Ruhezeit trägt ohne.
    }
  },
})
`
}

export type WorkerState = 'arbeitet' | 'fertig' | 'haengt'

export interface WorkerObservation {
  now: number
  startedAt: number
  reportMtime: number | null
  idleSignalAt: number | null
  lastActivityAt: number
}

export function classifyWorker(
  o: WorkerObservation,
  cfg: { quietMs: number; timeoutMs: number; stallMs: number },
): WorkerState {
  if (o.now - o.startedAt > cfg.timeoutMs) return 'haengt'
  const quiet = o.now - o.lastActivityAt
  if (o.reportMtime !== null) {
    if (o.idleSignalAt !== null && o.idleSignalAt >= o.reportMtime) return 'fertig'
    if (quiet > cfg.quietMs) return 'fertig'
    return 'arbeitet'
  }
  if (quiet > cfg.stallMs) return 'haengt'
  return 'arbeitet'
}
```

`IDLE_EVENT_TYPE` auf den in Task 0 gemessenen Namen setzen, falls er abweicht.

In `opencode.ts`:
- `OPENCODE_OWNED_PLUGIN_FILENAMES` um `IDLE_PLUGIN_FILENAME` ergänzen (Import aus `../../local-factory/worker-done`).
- In `writePlugins` nach dem Grenzen-Block:

```ts
    // Idle-Signal nur für den lokalen Worker — der Läufer liest es.
    const idlePath = path.join(pluginDir, IDLE_PLUGIN_FILENAME)
    if (entityId === LOCAL_WORKER_ENTITY_ID) {
      fs.writeFileSync(idlePath, buildIdlePlugin(path.join(projectPath, IDLE_SIGNAL_FILENAME)), {
        encoding: 'utf-8', mode: 0o644,
      })
      specs.push(toOpenCodePluginSpec(idlePath))
    } else {
      try { fs.unlinkSync(idlePath) } catch { /* war nie da */ }
    }
```

- [ ] **Step 4: Run** — neuer Test PASS, `node --test --import tsx test/main/opencode*.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/local-factory/worker-done.ts src/main/agent/adapters/opencode.ts test/main/local-factory/worker-done.test.ts
git commit -m "feat(local-factory): Ende des Workers aus Report, Idle-Signal und Ruhezeit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: git- und Shell-Schicht

**Files:**
- Create: `src/main/local-factory/git-ops.ts`
- Test: `test/main/local-factory/git-ops.test.ts`

**Interfaces:**
- Produces:
  - `runShell(cmd: string, cwd: string, timeoutMs: number): Promise<{ exitCode: number | null; output: string }>` (stdout+stderr zusammen; Timeout → `exitCode: null`)
  - `toRepoRelative(projekt: string, p: string): string`
  - `dirtyFiles(projekt): Promise<string[]>` (repo-relativ, inkl. untracked)
  - `headCommit(projekt): Promise<string>`
  - `commitPaths(projekt, paths: string[], message: string): Promise<string>` → neuer Commit-Hash
  - `commitAll(projekt, message): Promise<string>`
  - `changedSince(projekt, base): Promise<string[]>` (inkl. untracked)
  - `checksums(projekt, files: string[]): Record<string, string>` (sha256; fehlende Datei fehlt im Ergebnis)
  - `savePatchAndReset(projekt, base, patchFile): Promise<void>`

- [ ] **Step 1: Failing test**

```ts
// test/main/local-factory/git-ops.test.ts
import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import {
  runShell, dirtyFiles, headCommit, commitPaths, commitAll, changedSince,
  checksums, savePatchAndReset, toRepoRelative,
} from '../../../src/main/local-factory/git-ops'

let repo: string
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf-8' }).trim()

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-git-'))
  git('init', '-q')
  git('config', 'user.email', 't@t')
  git('config', 'user.name', 't')
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n')
  git('add', '.')
  git('commit', '-qm', 'init')
})

describe('git-ops', () => {
  it('runShell: Exitcode und Ausgabe, Timeout → null', async () => {
    assert.deepEqual(await runShell('echo hi; exit 3', repo, 5000), { exitCode: 3, output: 'hi\n' })
    assert.equal((await runShell('sleep 5', repo, 200)).exitCode, null)
  })
  it('dirtyFiles sieht geänderte und neue Dateien', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n')
    fs.mkdirSync(path.join(repo, 'test'))
    fs.writeFileSync(path.join(repo, 'test', 'x.test.ts'), 'x')
    assert.deepEqual((await dirtyFiles(repo)).sort(), ['a.txt', 'test/x.test.ts'])
  })
  it('commitPaths committet nur die genannten Pfade', async () => {
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n')
    fs.writeFileSync(path.join(repo, 'n.txt'), 'n')
    const h = await commitPaths(repo, ['n.txt'], 'nur n')
    assert.equal(h, await headCommit(repo))
    assert.deepEqual(await dirtyFiles(repo), ['a.txt'])
  })
  it('changedSince inkl. untracked; savePatchAndReset stellt die Basis her', async () => {
    const base = await headCommit(repo)
    fs.writeFileSync(path.join(repo, 'a.txt'), 'b\n')
    fs.writeFileSync(path.join(repo, 'neu.txt'), 'n')
    assert.deepEqual((await changedSince(repo, base)).sort(), ['a.txt', 'neu.txt'])
    const patch = path.join(os.tmpdir(), `lf-${Date.now()}.patch`)
    await savePatchAndReset(repo, base, patch)
    assert.match(fs.readFileSync(patch, 'utf-8'), /neu\.txt/)
    assert.deepEqual(await dirtyFiles(repo), [])
    assert.equal(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8'), 'a\n')
  })
  it('commitAll nimmt auch neue Dateien mit', async () => {
    fs.writeFileSync(path.join(repo, 'neu.txt'), 'n')
    await commitAll(repo, 'alles')
    assert.deepEqual(await dirtyFiles(repo), [])
  })
  it('checksums: fehlende Datei fehlt im Ergebnis', () => {
    const c = checksums(repo, ['a.txt', 'fehlt.txt'])
    assert.equal(Object.keys(c).length, 1)
    assert.equal(c['a.txt'].length, 64)
  })
  it('toRepoRelative', () => {
    assert.equal(toRepoRelative('/p', '/p/test/x.ts'), 'test/x.ts')
    assert.equal(toRepoRelative('/p', 'test/x.ts'), 'test/x.ts')
    assert.equal(toRepoRelative('/p', './test/x.ts'), 'test/x.ts')
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

```ts
// src/main/local-factory/git-ops.ts
import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn } from 'child_process'
import { runCommand, getEnhancedPath } from '../util/exec-util'

/**
 * git und Shell für den Läufer. Alles, was der Gate prüft, kommt von hier —
 * nicht aus dem, was der Worker berichtet.
 */

export async function runShell(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise(resolve => {
    // -l: der Testbefehl soll dieselbe Umgebung sehen wie im Terminal (node,
    // npm, flutter aus dem Profil-PATH).
    const child = spawn('/bin/zsh', ['-lc', cmd], {
      cwd,
      env: { ...process.env, PATH: getEnhancedPath() },
    })
    let output = ''
    let timedOut = false
    child.stdout.on('data', d => { output += d })
    child.stderr.on('data', d => { output += d })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ exitCode: timedOut ? null : code, output })
    })
    child.on('error', err => {
      clearTimeout(timer)
      resolve({ exitCode: null, output: output + String(err) })
    })
  })
}

export function toRepoRelative(projekt: string, p: string): string {
  const rel = path.isAbsolute(p) ? path.relative(projekt, p) : p
  return rel.replace(/^\.\//, '')
}

const git = (projekt: string, args: string[]): Promise<string> =>
  runCommand('git', args, { cwd: projekt, timeout: 30_000 })

const lines = (s: string): string[] => s.split('\n').map(l => l.trim()).filter(Boolean)

export async function dirtyFiles(projekt: string): Promise<string[]> {
  const tracked = lines(await git(projekt, ['diff', '--name-only', 'HEAD']))
  const untracked = lines(await git(projekt, ['ls-files', '--others', '--exclude-standard']))
  return [...new Set([...tracked, ...untracked])]
}

export async function headCommit(projekt: string): Promise<string> {
  return git(projekt, ['rev-parse', 'HEAD'])
}

export async function commitPaths(projekt: string, paths: string[], message: string): Promise<string> {
  await git(projekt, ['add', '--', ...paths])
  await git(projekt, ['commit', '-q', '-m', message, '--', ...paths])
  return headCommit(projekt)
}

export async function commitAll(projekt: string, message: string): Promise<string> {
  await git(projekt, ['add', '-A'])
  await git(projekt, ['commit', '-q', '-m', message])
  return headCommit(projekt)
}

export async function changedSince(projekt: string, base: string): Promise<string[]> {
  const tracked = lines(await git(projekt, ['diff', '--name-only', base]))
  const untracked = lines(await git(projekt, ['ls-files', '--others', '--exclude-standard']))
  return [...new Set([...tracked, ...untracked])]
}

export function checksums(projekt: string, files: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of files) {
    try {
      out[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(projekt, f))).digest('hex')
    } catch {
      // fehlt → fehlt im Ergebnis; decideGate wertet das als Abweichung
    }
  }
  return out
}

export async function savePatchAndReset(projekt: string, base: string, patchFile: string): Promise<void> {
  // Untracked erst in den Index (intent-to-add), damit der Patch sie enthält.
  await git(projekt, ['add', '-N', '.'])
  const patch = await git(projekt, ['diff', base])
  fs.mkdirSync(path.dirname(patchFile), { recursive: true })
  fs.writeFileSync(patchFile, patch + '\n', 'utf-8')
  await git(projekt, ['reset', '-q', '--hard', base])
  await git(projekt, ['clean', '-fdq'])
}
```

Hinweis zu `runCommand`: es `trim()`t stdout; für `git diff` als Patch ist das unkritisch (Schlusszeile wird wieder angehängt).

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/main/local-factory/git-ops.ts test/main/local-factory/git-ops.test.ts
git commit -m "feat(local-factory): git- und Shell-Schicht fuer Vorpruefung und Gate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Der Läufer

**Files:**
- Create: `src/main/local-factory/runner.ts`
- Test: `test/main/local-factory/runner.test.ts`

**Interfaces:**
- Consumes: Tasks 5–9.
- Produces:
  - `interface WorkerHost { endpointReachable(): Promise<boolean>; startFreshWorker(projekt: string): Promise<{ runDir: string; sessionId: string }>; sendToWorker(sessionId: string, line: string): Promise<void>; stopWorker(sessionId: string): Promise<void>; lastActivityAt(sessionId: string): number; tokensAt(sessionId: string): { input: number; output: number } | null; wakeArchitect(line: string): Promise<void> }`
  - `interface RunnerOpts { host: WorkerHost; laufDir: string; now?: () => number; sleep?: (ms: number) => Promise<void>; pollMs?: number; startupWaitMs?: number; quietMs?: number; stallMs?: number; timeoutMs?: number; testTimeoutMs?: number }`
  - `interface DispatchArgs extends AuftragInput { laufId?: string; haeppchen?: number }`
  - `type DispatchAccepted = { ok: true; laufId: string; nummer: number; versuch: number; laufPfad: string }`
  - `type DispatchRejected = { ok: false; error: string }`
  - `class LocalFactoryRunner { constructor(opts: RunnerOpts); dispatch(args: DispatchArgs): Promise<DispatchAccepted | DispatchRejected>; accept(laufId: string, nummer: number): void; whenIdle(): Promise<void> }`

`dispatch` führt die Vorprüfung **synchron im Aufruf** aus (damit der Architekt eine Ablehnung sofort sieht) und startet danach den Worker-Durchlauf im Hintergrund. `whenIdle()` gibt das Promise des laufenden Durchlaufs zurück — nur für Tests.

Weckzeilen (genau dieses Format, Task 4-Preset verweist darauf):
- `[local-factory] #<n> „<ziel>“: GRÜN, Versuch <v>/2, Commit <kurz>, Lauf: <laufPfad>`
- `[local-factory] #<n> „<ziel>“: ROT, Versuch <v>/2, Gate: <gatePfad>`
- `[local-factory] #<n> „<ziel>“: HÄNGT, Versuch <v>/2, Gate: <gatePfad>`
- Anhang bei Eskalation: ` — ESKALIERT, an den User melden`
- `[local-factory] Endpunkt nicht erreichbar — kein Versuch gezählt.`

- [ ] **Step 1: Failing test**

```ts
// test/main/local-factory/runner.test.ts
import { describe, it, beforeEach } from 'node:test'
import * as assert from 'node:assert/strict'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { execFileSync } from 'child_process'
import { LocalFactoryRunner, type WorkerHost } from '../../../src/main/local-factory/runner'
import { loadLauf } from '../../../src/main/local-factory/lauf'
import { PROTECTED_PATHS_FILENAME } from '../../../src/main/session/entity-boundaries'
import { IDLE_SIGNAL_FILENAME } from '../../../src/main/local-factory/worker-done'

let repo: string
let laufDir: string
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf-8' }).trim()

// Abnahmetest: rot, solange impl.txt nicht "ok" enthält.
const TEST_CMD = 'grep -q ok impl.txt'

function fakeHost(behaviour: 'brav' | 'schummelt' | 'haengt' | 'endpunkt-weg'): WorkerHost & { wakes: string[]; sent: string[] } {
  let runDir = ''
  const wakes: string[] = []
  const sent: string[] = []
  return {
    wakes, sent,
    async endpointReachable() { return behaviour !== 'endpunkt-weg' },
    async startFreshWorker() {
      runDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-run-'))
      return { runDir, sessionId: 's1' }
    },
    async sendToWorker(_id, line) {
      sent.push(line)
      if (behaviour === 'haengt') return
      fs.writeFileSync(path.join(repo, 'impl.txt'), 'ok\n')
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

const args = () => ({
  projekt: repo,
  ziel: 'impl sagt ok',
  dateien: ['impl.txt'],
  akzeptanzkriterium: 'impl.txt enthält ok',
  geschuetzteTests: ['test/accept.sh'],
  testBefehl: TEST_CMD,
  nichtZiele: [],
})

const fast = (host: WorkerHost) => new LocalFactoryRunner({
  host, laufDir, sleep: async () => {}, pollMs: 0, startupWaitMs: 0,
  quietMs: 1000, stallMs: 5000, timeoutMs: 50, testTimeoutMs: 5000,
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

  it('Endpunkt weg → Ablehnung und Weckzeile, kein Versuch gezählt', async () => {
    const host = fakeHost('endpunkt-weg')
    const res: any = await fast(host).dispatch(args())
    assert.equal(res.ok, false)
    assert.match(res.error, /Endpunkt/)
    assert.equal(fs.readdirSync(laufDir).length, 0)
  })

  it('ungültiger Auftrag → Ablehnung mit allen Feldfehlern', async () => {
    const res: any = await fast(fakeHost('brav')).dispatch({ ...args(), ziel: '', testBefehl: '' })
    assert.equal(res.ok, false)
    assert.match(res.error, /ziel/)
    assert.match(res.error, /testBefehl/)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

```ts
// src/main/local-factory/runner.ts
import * as fs from 'fs'
import * as path from 'path'
import { ulid } from 'ulidx'
import { validateAuftrag, buildAuftragMd, type AuftragInput } from './auftrag'
import { decideGate, type GateResult } from './gate'
import {
  newLauf, beginVersuch, endVersuch, countWeckruf, markAbgenommen,
  loadLauf, saveLauf, MAX_VERSUCHE, type Lauf,
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
    const lauf0: Lauf = loadLauf(laufPfad) ?? newLauf(laufId, projekt, this.o.now())
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
```

Hinweis für den Test „haengt“: `timeoutMs: 50` mit `now = Date.now()` — die Schleife läuft mit `sleep` als No-op, bis 50 ms verstrichen sind. Falls das im CI flackert, `now` im Test als Zähler injizieren (`let t = 0; now: () => (t += 10)`).

- [ ] **Step 4: Run** — `node --test --import tsx test/main/local-factory/runner.test.ts` PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/local-factory/runner.ts test/main/local-factory/runner.test.ts
git commit -m "feat(local-factory): der Laeufer -- Vorpruefung, Worker, Gate, eine Weckzeile

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Echter Host und das MCP-Werkzeug

**Files:**
- Create: `src/main/local-factory/worker-host.ts`
- Create: `src/main/mcp/local-factory-tool.ts`
- Modify: `src/main/mcp/entity-header.ts` (`mayUseLocalWorkerDispatch`)
- Modify: `src/main/mcp/mcp-tools.ts` (Registrierung aufrufen, neben `mayUseCompanionMemory`)
- Modify: `docs/mcp-tools.md` (67 → 68, neuer Eintrag)
- Test: `test/main/mcp/local-factory-gating.test.ts`, `test/main/local-factory/worker-host.test.ts`

**Interfaces:**
- Consumes: `LocalFactoryRunner`, `WorkerHost` (Task 10), `startEntitySession` aus `mcp/handoff-kernel.ts`, `findEntitySessions` aus `session/entity-session-lookup.ts`, `resolveRunDir` aus `session/entity-run-dir.ts`, `BRAND.statusLineDir`.
- Produces: `mayUseLocalWorkerDispatch(entityId): boolean`; `createWorkerHost(ctx: ToolContext): WorkerHost`; `registerLocalFactoryTool(server, ctx)`; `getRunner(workspaceId: string | null, ctx): LocalFactoryRunner` (ein Läufer pro Workspace, im Modul gehalten).

- [ ] **Step 1: Failing tests**

```ts
// test/main/mcp/local-factory-gating.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { mayUseLocalWorkerDispatch } from '../../../src/main/mcp/entity-header'

describe('mayUseLocalWorkerDispatch', () => {
  it('nur local-factory', () => {
    assert.equal(mayUseLocalWorkerDispatch('local-factory'), true)
    assert.equal(mayUseLocalWorkerDispatch('local-worker'), false)
    assert.equal(mayUseLocalWorkerDispatch('cyber-factory'), false)
  })
  it('ohne Rolle nicht — das Werkzeug startet Worker und committet in fremde Repos', () => {
    assert.equal(mayUseLocalWorkerDispatch(null), false)
    assert.equal(mayUseLocalWorkerDispatch(undefined), false)
  })
})
```

```ts
// test/main/local-factory/worker-host.test.ts
import { describe, it } from 'node:test'
import * as assert from 'node:assert/strict'
import { endpointProbeUrl, readUsageFile } from '../../../src/main/local-factory/worker-host'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('worker-host Hilfen', () => {
  it('Probe-URL hängt /models an, ohne doppelten Slash', () => {
    assert.equal(endpointProbeUrl('http://h:8000/v1'), 'http://h:8000/v1/models')
    assert.equal(endpointProbeUrl('http://h:8000/v1/'), 'http://h:8000/v1/models')
  })
  it('readUsageFile: mtime und Tokens, fehlende Datei → null', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'usage-'))
    assert.equal(readUsageFile(dir, 's'), null)
    fs.writeFileSync(path.join(dir, 's.json'), JSON.stringify({
      context_window: { total_input_tokens: 7, total_output_tokens: 3 },
    }))
    const u = readUsageFile(dir, 's')!
    assert.deepEqual(u.tokens, { input: 7, output: 3 })
    assert.ok(u.mtime > 0)
  })
})
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implementierung**

`entity-header.ts`, nach `mayUseCompanionMemory`:

```ts
/**
 * Whether a connection may dispatch local workers (Local Cyber Factory).
 *
 * Unlike companion memory, an absent role is NOT allowed: the tool starts
 * sessions, commits into the target repo and resets it on failure. That is a
 * role's job, not something any plain connection should be able to trigger.
 */
export function mayUseLocalWorkerDispatch(entityId: string | null | undefined): boolean {
  return entityId === 'local-factory'
}
```

`src/main/local-factory/worker-host.ts`:

```ts
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'node:http'
import * as https from 'node:https'
import type { ToolContext } from '../mcp/mcp-tools'
import type { WorkerHost } from './runner'
import { startEntitySession } from '../mcp/handoff-kernel'
import { findEntitySessions } from '../session/entity-session-lookup'
import { readLocalWorkerConfig } from './local-provider'
import { BRAND } from '../../shared/brand'

/**
 * Der echte Host: SessionManager, tmux, Usage-Dateien. node:http statt fetch —
 * fetch im Main-Prozess läuft über Chromiums Netzstack und fällt dort über
 * System-Proxy-Einstellungen (dieselbe Falle wie beim Gateway-Klienten).
 */

export function endpointProbeUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '') + '/models'
}

export function readUsageFile(
  dir: string,
  sessionId: string,
): { mtime: number; tokens: { input: number; output: number } | null } | null {
  const f = path.join(dir, `${sessionId}.json`)
  try {
    const mtime = fs.statSync(f).mtimeMs
    const cw = JSON.parse(fs.readFileSync(f, 'utf-8'))?.context_window
    const tokens = cw && typeof cw.total_input_tokens === 'number'
      ? { input: cw.total_input_tokens, output: cw.total_output_tokens ?? 0 }
      : null
    return { mtime, tokens }
  } catch {
    return null
  }
}

function probe(url: string, timeoutMs = 5000): Promise<boolean> {
  return new Promise(resolve => {
    const mod = url.startsWith('https:') ? https : http
    const req = mod.get(url, { timeout: timeoutMs }, res => {
      res.resume()
      resolve((res.statusCode ?? 500) < 500)
    })
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.on('error', () => resolve(false))
  })
}

export function createWorkerHost(ctx: ToolContext): WorkerHost {
  const sm = ctx.sessionManager
  const ws = ctx.workspaceId ?? null
  return {
    async endpointReachable() {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { configStore } = require('../config/config-store')
      const cfg = readLocalWorkerConfig(configStore.get('agent')?.localWorker ?? null)
      return cfg ? probe(endpointProbeUrl(cfg.baseUrl)) : false
    },
    async startFreshWorker(projekt) {
      for (const s of findEntitySessions(sm.list(), 'local-worker', ws)) {
        await sm.stopEntity('local-worker', s.id)
      }
      const session = await startEntitySession(ctx, 'local-worker', { projectPath: projekt })
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { resolveRunDir } = require('../session/entity-run-dir')
      return { runDir: resolveRunDir(ws, 'local-worker'), sessionId: session.id }
    },
    async sendToWorker(sessionId, line) {
      await sm.sendKeys(sessionId, line + '\r')
    },
    async stopWorker(sessionId) {
      try { await sm.stopEntity('local-worker', sessionId) } catch { /* schon weg */ }
    },
    lastActivityAt(sessionId) {
      return readUsageFile(BRAND.statusLineDir, sessionId)?.mtime ?? 0
    },
    tokensAt(sessionId) {
      return readUsageFile(BRAND.statusLineDir, sessionId)?.tokens ?? null
    },
    async wakeArchitect(line) {
      const target = findEntitySessions(sm.list(), 'local-factory', ws)[0]
      if (!target) {
        console.warn('[local-factory] Architekt nicht gefunden, Weckzeile verloren:', line)
        return
      }
      await sm.sendKeys(target.id, line + '\r')
    },
  }
}
```

Vor dem Schreiben prüfen: Ist `findEntitySessions(list, entityId, workspaceId)` die genaue Signatur (`src/main/session/entity-session-lookup.ts:17`)? Ist `sm.stopEntity` öffentlich? Beides ist im Ist-Code so belegt (`session-manager.ts:1536`, Aufruf in `resumeEntity`).

`src/main/mcp/local-factory-tool.ts`:

```ts
import * as path from 'path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ToolContext } from './mcp-tools'
import { LocalFactoryRunner } from '../local-factory/runner'
import { createWorkerHost } from '../local-factory/worker-host'
import { resolveRunDir } from '../session/entity-run-dir'
import { LOCAL_WORKER_DISPATCH_TOOL } from '../local-factory/presets'

/** Ein Läufer pro Workspace; er überlebt die MCP-Verbindung, nicht den App-Neustart. */
const runners = new Map<string, LocalFactoryRunner>()

export function getRunner(ctx: ToolContext): LocalFactoryRunner {
  const key = ctx.workspaceId ?? '__unbound__'
  let r = runners.get(key)
  if (!r) {
    r = new LocalFactoryRunner({
      host: createWorkerHost(ctx),
      laufDir: path.join(resolveRunDir(ctx.workspaceId ?? null, 'local-factory'), 'laeufe'),
    })
    runners.set(key, r)
  }
  return r
}

export function registerLocalFactoryTool(server: McpServer, ctx: ToolContext): void {
  ;(server as any).registerTool(
    LOCAL_WORKER_DISPATCH_TOOL,
    {
      description:
        'Local Cyber Factory: start a fresh local worker (opencode + local model) on ONE work item. '
        + 'Write the acceptance test first (must be red); do not commit it. Returns immediately; '
        + 'you are woken with one line "[local-factory] #N ..." when the gate has run. Do not poll. '
        + 'Retry: same laufId + haeppchen. Max 2 attempts, then escalate to the user. '
        + 'accept=true marks a green item as accepted after you reviewed the commit.',
      inputSchema: {
        projekt: z.string().describe('Absolute path of the target git repo'),
        ziel: z.string(),
        dateien: z.array(z.string()),
        akzeptanzkriterium: z.string(),
        geschuetzteTests: z.array(z.string()).describe('Acceptance tests, repo-relative or absolute'),
        testBefehl: z.string().describe('Shell command run in the repo; exit 0 = green'),
        nichtZiele: z.array(z.string()),
        laufId: z.string().optional(),
        haeppchen: z.number().int().positive().optional(),
        accept: z.boolean().optional(),
      } as any,
    },
    async (args: any) => {
      try {
        const runner = getRunner(ctx)
        if (args.accept && args.laufId && args.haeppchen) {
          runner.accept(args.laufId, args.haeppchen)
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, abgenommen: args.haeppchen }) }] }
        }
        const res = await runner.dispatch(args)
        return {
          content: [{ type: 'text', text: JSON.stringify(res) }],
          ...(res.ok ? {} : { isError: true }),
        }
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: String(err) }) }], isError: true }
      }
    },
  )
}
```

Vor dem Schreiben nachsehen, wie `registerMuxTool` in `mcp-tools.ts` definiert ist; wenn es exportiert ist, **dieses** statt `server.registerTool` verwenden (gleiche Signatur wie bei `mux_create_session`), damit Logging/Audit gleich bleibt.

In `mcp-tools.ts`, direkt nach dem `if (mayUseCompanionMemory(ctx.entityId)) { … }`-Block:

```ts
  if (mayUseLocalWorkerDispatch(ctx.entityId)) {
    registerLocalFactoryTool(server, ctx)
  }
```

Importe: `mayUseLocalWorkerDispatch` aus `./entity-header`, `registerLocalFactoryTool` aus `./local-factory-tool`.

**Der „accept“-Weg** ergänzt Spec §7 Schritt 8: Der Architekt markiert ein grünes Häppchen als abgenommen. Ohne ihn stünde jedes grüne Häppchen in `lauf.json` ewig auf `wartet`. Das Preset aus Task 4 um eine Zeile in Schritt 4 ergänzen: „Erfüllt → `accept: true` mit `laufId` und `haeppchen`, dann nächstes Häppchen.“

`docs/mcp-tools.md`: Zahl 67 → 68 an beiden Stellen (Zeilen 3 und 15); neuen Eintrag in der Kategorie, in der `mux_cyber_factory_diagnose` steht, mit dem Hinweis „nur für die Rolle `local-factory` registriert“. CLAUDE.md-Zahl im Abschnitt „Entities, MCP, Voice“ (67 → 68) wird in Task 12 angepasst.

- [ ] **Step 4: Run** — beide Tests PASS; `npm run test` komplett → alle grün, Anzahl = vorher + neue; `npx tsc -p tsconfig.main.json --noEmit` 0 Fehler; `npx eslint src/main/local-factory src/main/mcp/local-factory-tool.ts src/main/mcp/entity-header.ts src/main/mcp/mcp-tools.ts src/main/agent/adapters/opencode.ts src/main/session/entity-boundaries.ts src/main/session/entity-registry.ts src/main/session/session-manager.ts` → keine **neuen** Probleme gegenüber `git stash`-Stand.

- [ ] **Step 5: Commit**

```bash
git add src/main/local-factory/worker-host.ts src/main/mcp/local-factory-tool.ts src/main/mcp/entity-header.ts src/main/mcp/mcp-tools.ts src/main/local-factory/presets.ts docs/mcp-tools.md test/main/mcp/local-factory-gating.test.ts test/main/local-factory/worker-host.test.ts
git commit -m "feat(local-factory): mux_local_worker_dispatch -- nur fuer die Local Cyber Factory

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Echter Lauf, Abnahme-Testcases, CLAUDE.md

Kein neuer Produktionscode. **Gegen die Dev-Instanz oder die installierte App — nicht beide gleichzeitig** (beide wollen Port 3100).

**Files:**
- Modify: `CLAUDE.md` (nicht im Repo, siehe Commit `2124fa9` — lokal pflegen), Abschnitt „Local Cyber Factory“
- Testcase-Note (`noteType: testcase`, ID `01KQNBDCH1D4G11PMAEM60TPTX`): neuer Abschnitt

- [ ] **Step 1: Bauen und starten**

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
npm run build:main && npm run build:renderer && npm start
```

- [ ] **Step 2: Config setzen** — in `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json` unter `agent`:

```json
"localWorker": { "baseUrl": "http://100.78.7.108:8000/v1", "model": "<aus Task 0>", "contextWindow": 131072, "maxOutputTokens": 16384, "timeoutMinutes": 60 }
```

App neu starten.

- [ ] **Step 3: Echter Lauf** — kleines Wegwerf-Repo (z. B. TypeScript-Bibliothek mit `node --test`), `local-factory` starten, Aufgabe mit 3–5 Häppchen geben. Beobachten: Worker-Session erscheint, verschwindet, Weckzeilen kommen, `lauf.json` unter `~/.config/cipher-mux/runs/<ws>/local-factory/laeufe/<id>/`.

- [ ] **Step 4: Testcases anhängen** (offen, nicht selbst abhaken) unter `## Local Cyber Factory`:

```
- [ ] **T-LCF.1** Local Cyber Factory startet, Local Worker erscheint nach dispatch im Grid und verschwindet nach dem Gate
- [ ] **T-LCF.2** Weckzeile „[local-factory] #N …: GRÜN“ erscheint im Architekten-Pane, ohne dass er zwischendurch Züge macht
- [ ] **T-LCF.3** Ein grünes Häppchen ist als Commit „lf: <ziel>“ im Ziel-Repo, davor „lf: Abnahmetest #N“
- [ ] **T-LCF.4** Ein rotes Häppchen hinterlässt den Baum auf der Basis und einen Patch im Laufverzeichnis
- [ ] **T-LCF.5** Der dritte Versuch auf ein Häppchen wird abgelehnt; der Architekt meldet die Eskalation
- [ ] **T-LCF.6** Versucht der Architekt, eine Datei unter src/ zu ändern, wird es mit Begründung abgelehnt
- [ ] **T-LCF.7** Ist der Endpunkt aus, lehnt dispatch ab und kein Versuch wird gezählt
```

- [ ] **Step 5: CLAUDE.md-Abschnitt** „Local Cyber Factory“ (kurz, im Stil der Codex/opencode-Abschnitte): was es ist, Verweis auf Spec, die gemessenen Befunde aus Task 0, MCP-Zahl 67 → 68, wo `lauf.json` liegt, dass `agent.localWorker` ohne Schlüssel ist.

- [ ] **Step 6: Lauf als Note** — der Architekt fasst `lauf.json` als Note zusammen (macht er laut Preset selbst); prüfen, dass sie entstanden ist.

---

## Self-Review (erledigt beim Schreiben)

- **Spec-Abdeckung:** §5 → Task 3, 4 · §6 → Task 1, 2 · §7 Schritte 1–8 → Task 6, 9, 10, 11 (Schritt 8 „abnehmen“ als `accept`) · §8 → Task 7, 10 · §9 → Task 7, 9, 10 · §10 → Task 0 · §11 → Tests jeder Task + Task 12.
- **Abweichung von der Spec, bewusst:** Abnahmetest wird vom Läufer committet (Spec §7 sagt „Baum sauber“) — sonst wäre der Ablauf nicht ausführbar. `accept` ist neu. Beides gehört nach Task 0 als Nachtrag in die Spec.
- **Typen:** `GateVerdict` = `'gruen'|'rot'|'haengt'` durchgängig; `PROTECTED_PATHS_FILENAME` aus `entity-boundaries.ts` in Task 3, 10; `IDLE_SIGNAL_FILENAME` aus `worker-done.ts` in Task 8, 10.
