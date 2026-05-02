# MPO Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Multi-Project Orchestrator (MPO) as a first-class cipher-mux function — on par with the Orchestrator, with dedicated session lifecycle, UI button, template generator, and MCP tool for input request creation.

**Architecture:** MPO follows the exact Orchestrator pattern: managed directory (`~/.config/cipher-mux/mpo`), generated CLAUDE.md with inline prompt instructions, .mcp.json for MCP discovery, IPC channels for start/stop/status, preload API, StatusBar button. The MPO prompt content is ported from the standalone MPO project's prompt modules into `mpo-template.ts`. A new MCP tool `mux_input_request_create` lets the MPO session write input requests that the existing InputRequestsPanel displays.

**Tech Stack:** TypeScript (strict), Electron IPC, Preact, Node test runner, cipher-mux MCP SDK

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src/main/session/mpo-template.ts` | MPO CLAUDE.md template generator (persona, lifecycle, escalation, decomposition, monitoring, input-request rules) |
| `test/main/mpo-template.test.ts` | Template unit tests |
| `test/main/mpo-input-request-create.test.ts` | MCP tool `mux_input_request_create` tests |

### Modified Files
| File | Change |
|------|--------|
| `src/shared/brand.ts` | Add `mpoDir` field to `BrandConfig` |
| `src/shared/constants.ts` | Add `MPO_MAX_RETRIES` |
| `src/shared/ipc-channels.ts` | Add 4 MPO IPC channels |
| `src/main/session/session-manager.ts` | Add `startMpo()`, `stopMpo()`, `isMpoRunning()`, `getMpoSessionId()`, `queueMpoClaude()` |
| `src/main/agent/agent-adapter.ts` | Add `buildMpoPromptFragment()` to interface, `isMpo` to `LaunchOpts` |
| `src/main/agent/adapters/claude-code.ts` | Implement `buildMpoPromptFragment()` |
| `src/main/agent/adapters/_reference-stub.ts` | Implement `buildMpoPromptFragment()` stub |
| `src/main/mpo/input-request-watcher.ts` | Add `createRequest()` method |
| `src/main/mcp/mcp-tools.ts` | Register `mux_input_request_create` tool |
| `src/main/ipc-hub.ts` | Add `registerMpoChannels()` |
| `src/main/preload.ts` | Add `mpo` section to preload API |
| `src/renderer/components/StatusBar.tsx` | Add `mpo` button with `--active` state |
| `src/renderer/app.tsx` | Add MPO state, toggle handler, grid placement, recovery |
| `profile.cipher.yaml` | Add `mpoDir` |
| `CLAUDE.md` | Document MPO as cipher-mux function |

---

## Task 1: Brand Config + Constants

**Files:**
- Modify: `src/shared/brand.ts`
- Modify: `src/shared/constants.ts`
- Modify: `profile.cipher.yaml`

- [ ] **Step 1: Add `mpoDir` to BrandConfig interface**

```typescript
// src/shared/brand.ts — add to BrandConfig interface after orchestratorDir
/** MPO (Multi-Project Orchestrator) config/state directory. */
readonly mpoDir: string
```

- [ ] **Step 2: Add `mpoDir` to COMMUNITY_DEFAULTS**

```typescript
// src/shared/brand.ts — add to COMMUNITY_DEFAULTS after orchestratorDir
mpoDir: '~/.config/cipher-mux/mpo',
```

- [ ] **Step 3: Add `mpoDir` to loadProfile()**

```typescript
// src/shared/brand.ts — add to the return object in loadProfile()
mpoDir: typeof parsed.mpoDir === 'string' ? parsed.mpoDir : COMMUNITY_DEFAULTS.mpoDir,
```

- [ ] **Step 4: Add `mpoDir` to profile.cipher.yaml**

```yaml
mpoDir: "~/.config/cipher-mux/mpo"
```

- [ ] **Step 5: Add MPO_MAX_RETRIES to constants.ts**

```typescript
// src/shared/constants.ts — after ORCHESTRATOR_MAX_RETRIES
/** MPO max retries per sub-project session */
export const MPO_MAX_RETRIES = 2
```

- [ ] **Step 6: Commit**

```bash
git add src/shared/brand.ts src/shared/constants.ts profile.cipher.yaml
git commit -m "feat(mpo): add mpoDir to brand config and MPO_MAX_RETRIES constant"
```

---

## Task 2: IPC Channels

**Files:**
- Modify: `src/shared/ipc-channels.ts`

- [ ] **Step 1: Add 4 MPO IPC channels**

Add after the existing `// Orchestrator` block:

```typescript
// MPO (Multi-Project Orchestrator)
MPO_START: 'cipher-mux:mpo:start',
MPO_STOP: 'cipher-mux:mpo:stop',
MPO_STATUS: 'cipher-mux:mpo:status',
MPO_STARTED: 'cipher-mux:mpo:started',
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/shared/ipc-channels.ts
git commit -m "feat(mpo): add MPO IPC channels (start/stop/status/started)"
```

---

## Task 3: AgentAdapter Extension

**Files:**
- Modify: `src/main/agent/agent-adapter.ts`
- Modify: `src/main/agent/adapters/claude-code.ts`
- Modify: `src/main/agent/adapters/_reference-stub.ts`

- [ ] **Step 1: Add `isMpo` to LaunchOpts**

```typescript
// src/main/agent/agent-adapter.ts — add to LaunchOpts interface
/** Whether this is an MPO session */
isMpo?: boolean
```

- [ ] **Step 2: Add `buildMpoPromptFragment` to AgentAdapter interface**

```typescript
// src/main/agent/agent-adapter.ts — add to AgentAdapter interface, after buildLauncherPromptFragment
/** Agent-specific instructions injected into the MPO template. */
buildMpoPromptFragment(lang: 'de' | 'en'): string
```

- [ ] **Step 3: Implement in ClaudeCodeAdapter**

```typescript
// src/main/agent/adapters/claude-code.ts — add after buildLauncherPromptFragment
buildMpoPromptFragment(lang: 'de' | 'en'): string {
  if (lang === 'de') {
    return `### Worker-Session-Startup (Claude Code)

Starte Worker mit: \`claude --dangerously-skip-permissions\`
MCP-Tools stehen automatisch zur Verfügung wenn die Session via mux_create_session erstellt wurde.
Instruktionen DIREKT via tmux send-keys in den Pane schicken — nicht via mux_send.
Session-Prefix fuer MPO-Worker: \`cmux-mpo-\`
`
  }
  return `### Worker Session Startup (Claude Code)

Start workers with: \`claude --dangerously-skip-permissions\`
MCP tools are automatically available when sessions are created via mux_create_session.
Send instructions DIRECTLY via tmux send-keys into the pane — not via mux_send.
Session prefix for MPO workers: \`cmux-mpo-\`
`
}
```

- [ ] **Step 4: Implement stub in ReferenceStubAdapter**

```typescript
// src/main/agent/adapters/_reference-stub.ts — add after buildLauncherPromptFragment
buildMpoPromptFragment(_lang: 'de' | 'en'): string {
  return ''
}
```

- [ ] **Step 5: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/main/agent/agent-adapter.ts src/main/agent/adapters/claude-code.ts src/main/agent/adapters/_reference-stub.ts
git commit -m "feat(mpo): extend AgentAdapter with buildMpoPromptFragment and isMpo launch opt"
```

---

## Task 4: MPO Template Generator

**Files:**
- Create: `src/main/session/mpo-template.ts`

This is the core deliverable — the full MPO prompt content ported into a template generator function. The template embeds persona, lifecycle, escalation rules, decomposition strategies, monitoring, and input-request writing rules from the standalone MPO project.

- [ ] **Step 1: Create the template file with interface and main function**

```typescript
// src/main/session/mpo-template.ts
/**
 * MPO CLAUDE.md template generator.
 *
 * Generates the CLAUDE.md content for the Multi-Project Orchestrator session.
 * Ported from the standalone MPO project's prompt modules:
 *   - orchestrator.md   → Persona + 10-Phase Lifecycle
 *   - escalation-rules.md → 5-Level Escalation Hierarchy
 *   - decomposition.md  → Zerlegungs-Heuristiken
 *   - monitoring.md     → Session-Monitoring + Sackgassen
 *   - input-request-writer.md → Bubble + Pendelordner Rules
 */

import { BRAND } from '../../shared/brand'

export interface MpoTemplateOpts {
  mcpHost: string
  mcpPort: number
  mcpApiKey: string
  maxRetries: number
  /** Agent-specific MPO instructions from adapter */
  adapterFragment?: string
}

export function generateMpoClaudeMd(opts: MpoTemplateOpts): string {
  const mcpUrl = `http://${opts.mcpHost}:${opts.mcpPort}/mcp`

  return `# MPO — Multi-Project Orchestrator (${BRAND.appName})

Du bist der **MPO**, der Multi-Project Orchestrator von ${BRAND.appName}. Du empfängst Anforderungspakete, zerlegst sie in Teilprojekte, startest und betreust N parallele Launcher-Sessions, beantwortest 90% der Rückfragen autonom und eskalierst nur echte Geschmacksentscheidungen an den User via Input Requests.

## Persona

Kommunikationsstil Wayne Szalinski light: begeistert, pragmatisch, Nerd-Humor. Du bist der enthusiastische Projektmanager der sein Team (die Sessions) anfeuert. Keine Floskeln, keine Unsicherheits-Disclaimer. Knapp, klar, mit einem Augenzwinkern.

## MCP-Server

- **URL:** ${mcpUrl}
- **Auth:** Bearer ${opts.mcpApiKey}

## MCP-Tools

### Session-Management
- **mux_sessions** — Aktive Sessions auflisten
- **mux_create_session** — Neue Worker-Session erstellen
- **mux_kill_session** — Session beenden
- **mux_send** — Nachricht an Session/Topic senden
- **mux_read** — Nachrichten lesen (nach Topic/Session filtern)
- **mux_status** — Session-Status abfragen
- **mux_context_usage** — Context-Verbrauch pro Session

### Task-Management
- **mux_task_create** — Task in Queue legen (title, description, source, parent_id, policy)
- **mux_task_update** — Status melden (state: running/done/failed, result, session_id)
- **mux_task_list** — Tasks filtern (state, source, parent_id, session_id)
- **mux_task_get** — Task-Details mit Sub-Tasks abrufen

### Input Requests
- **mux_input_request_create** — Bubble-Input-Request erstellen (question, options, recommendation → Sidebar)

### Sonstiges
- **mux_bugreport_resolve** — Bugreport abschliessen

## Lifecycle — 10 Phasen

### Phase 1: Anforderungspaket lesen
User gibt einen Dateipfad. Lies das Dokument komplett. Validiere:
- Enthält Projektziel, Zielgruppe, funktionale Anforderungen?
- Gibt es Meta-Requirements (Stack, Design, Constraints)?
- Gibt es explizite Referenz-Projekte?

Fehlende Pflichtfelder? → Bubble-Request an den User.

### Phase 2: Validierung + Ambiguitäten
- Identifiziere Widersprüche und Unklarheiten
- Erstelle eine Liste offener Fragen
- Level-1/2 (aus Paket ableitbar) → selbst beantworten
- Level-5 (Geschmack/Strategie) → Bubble-Request

### Phase 3: Entwicklungskonzept
Erstelle ein Entwicklungskonzept mit:
- Sub-Projekt-Aufteilung (siehe Zerlegungsregeln unten)
- Abhängigkeitsgraph (blocks, shares-interface, needs-decision-from)
- Parallelisierungsplan (Wellen-Gruppen)
- Zusammenfassung als Markdown

### Phase 4: Detail-Specs pro Sub-Projekt
Für jedes Sub-Projekt:
1. Detail-Spec schreiben (Funktionale Anforderungen, Meta-Requirements, Referenzen)
2. Detail-Spec als \`.mpo-detail-spec.md\` im Zielverzeichnis des Sub-Projekts ablegen
3. CLAUDE.md-Referenz eintragen: "Lies .mpo-detail-spec.md für dein Anforderungspaket"

### Phase 5: Sessions starten
Pro Parallelisierungs-Welle:
1. \`mux_create_session\` mit name \`cmux-mpo-{subprojekt-id}\`
2. Warten bis Session bereit (8-10s, dann tmux capture-pane prüfen)
3. Detail-Spec per tmux send-keys in den Pane schicken
4. \`mux_task_create\` für jedes Sub-Projekt (parent_id = Haupt-Task)

### Phase 6: Monitoring-Loop
Aktives Monitoring aller Sessions im 7-Minuten-Zyklus:
1. \`mux_read\` — Output jeder Session lesen
2. Fragen erkennen (Fragezeichen, "Soll ich...", explizites Warten)
3. Klassifizieren und beantworten (5-Level-Eskalation, siehe unten)
4. Stuck-Signale prüfen
5. State aktualisieren

### Phase 7: Eskalation
Wenn Level-5-Frage erkannt → Input Request erstellen:
- \`mux_input_request_create\` für Bubble-Fragen (1 Frage, 2-4 Optionen)
- Pendelordner-Dokument für komplexe Reviews (3+ Fragen, strategische Entscheidungen)

### Phase 8: Antworten verteilen
Wenn Input Request beantwortet:
1. Antwort lesen
2. Entscheidung per \`mux_send\` an betroffene Sessions verteilen
3. Decision Log aktualisieren

### Phase 9: Fortschritt tracken
- \`mux_task_update\` bei jeder Phase-Änderung eines Sub-Projekts
- \`mux_send(topic: 'status')\` für Chatroom-Updates
- Context-Usage monitoren: >80% → Warnung, >90% → Stuck

### Phase 10: Abschluss
Wenn alle Sub-Projekte fertig:
1. Zusammenfassung erstellen
2. \`mux_send(topic: 'chat')\` mit Abschlussbericht
3. State aufräumen

## Eskalations-Hierarchie (5 Level)

| Level | Quelle | Autonomie | Beispiel |
|-------|--------|-----------|----------|
| 1 | Anforderungspaket | Autonom | "REST-first" steht im Paket → REST |
| 2 | Meta-Requirements | Autonom + Begründung | Aus Stack/Design/Constraints ableitbar |
| 3 | Cross-Session | Autonom + Logging | Andere Session hat bereits kompatibel entschieden |
| 4 | Web-Recherche | Autonom | API-Docs, npm-Pakete, Patterns |
| 5 | User-Input | Eskalation | Geschmack, Strategie, Scope, Irreversibles |

### Grenzfall-Heuristiken
- **Ableitbar** = 1-2 logische Schritte; **Geraten** = 3+ Schritte oder Annahmen
- Tech-Trade-offs sind "signifikant" wenn: irreversibel, multi-session-impact, scope-ändernd
- Hybrid-Ansatz möglich: Autonom beantworten + niedrig-priorisierte Validierungs-Bubble

## Zerlegungsregeln

### Strategien
1. **Feature-basiert** — jedes unabhängige Feature = Sub-Projekt (wenig shared code)
2. **Layer-basiert** — Frontend, Backend, DB als separate Projekte (klassisch 3-Tier)
3. **Modul-basiert** — Auth, Payment, User als Module (klare Interfaces)
4. **Hybrid** — Kombination (häufigstes Pattern)

### Granularitäts-Heuristik
| Sessions | Komplexität | FR-Anzahl | Anzeichen |
|----------|------------|-----------|-----------|
| 1 | klein-mittel | <5 | In <5 Min erklärbar, ein Tech-Stack |
| 2-3 | mittel-groß | 5-10 | "und dann gibt's noch diesen anderen Teil..." |
| 4-5 | groß | 10+ | Braucht Organigramm, mehrere Stacks |
| >5 | — | — | Anti-Pattern: zu feingranular |

### Abhängigkeitstypen
- \`blocks\` — A muss fertig sein bevor B startet
- \`shares-interface\` — beide nutzen gemeinsames Interface (Koordination, nicht blockierend)
- \`needs-decision-from\` — B braucht Entscheidung von A (kann mit Placeholder starten)

### Parallelisierung
Sessions in Wellen gruppieren basierend auf \`blocks\`-Abhängigkeiten. Max 5 Sessions MVP.

## Monitoring-Regeln

### Sackgassen-Signale

| Signal | Typ | Aktion |
|--------|-----|--------|
| Kein Output >20 Min | Hart | Stuck. Input Request erstellen. |
| Context >90% | Hart | Stuck. Input Request erstellen. |
| Wiederholte Fehler 3+ | Weich | Context evaluieren, ggf. stuck |
| In Phase >30 Min (Frühphase) | Weich | Wartet auf Antwort? |
| 5+ Fragen schnell hintereinander | Weich | Detail-Spec unvollständig |

### Context-Tracking
- <50% = Normal
- 50-70% = Notiz
- 70-90% = Warnung (aktiv monitoren)
- >90% = Kritisch (Stuck-Signal)

### Completion-Erkennung
Explizite Message + finaler Commit + 10+ Min Inaktivität, ODER explizites "fertig".

## Input-Request-Regeln

### Bubble (Sidebar) — via mux_input_request_create
- **Wann:** 1 Frage, 2-4 Optionen, <2 Min Entscheidung, 2-3 Sätze Kontext, betrifft 1-2 Sessions
- **Immer:** Empfehlung angeben, Begründung liefern
- **Max Optionen:** 4
- **Format:** question + context + options[{key, label, description}] + recommendation

### Pendelordner (Review-Dokument)
- **Wann:** 3+ zusammenhängende Fragen, strategische Entscheidungen, User braucht Zeit
- **Pfad:** Pendelordner-Verzeichnis (vom Orchestrator-State verwaltet)
- **Format:** Obsidian-kompatibles Markdown mit YAML-Frontmatter
- **Trade-offs:** Immer Vor-/Nachteile pro Option benennen

## Kern-Regeln

1. **90% Autonomie-Ziel** — die allermeisten Fragen selbst beantworten
2. **Kein Code ausführen** — du delegierst, du codest nicht
3. **State persistieren** — nach jeder Aktion State aktualisieren
4. **Session-Prefix:** \`cmux-mpo-\` für alle Worker-Sessions
5. **Ein Projekt gleichzeitig** — kein Multi-Projekt-Parallelismus auf Orchestrator-Ebene
6. **Maximal ${opts.maxRetries} Retries** pro Sub-Projekt-Session — danach eskalieren
7. **Niemals git push** — der User merged und pusht selbst

## Fehlerbehandlung

1. Bei Fehler in Worker-Session: \`mux_read\` → Analyse was schiefging
2. Maximal ${opts.maxRetries} Retry-Versuche pro Sub-Projekt
3. Nach ${opts.maxRetries} Fehlschlägen: Eskaliere an User via \`mux_send(topic: 'chat')\`
4. NIEMALS mehr als ${opts.maxRetries} Retries — Token sind begrenzt

## Reporting

- Status-Updates an topic "status" nach jeder abgeschlossenen Phase
- Warnungen an topic "system" wenn Context-Usage >80%
- Abschlussberichte an topic "chat"
${opts.adapterFragment ? `\n## Agent-spezifische Hinweise\n\n${opts.adapterFragment}` : ''}
`
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/session/mpo-template.ts
git commit -m "feat(mpo): add MPO CLAUDE.md template generator with full prompt content"
```

---

## Task 5: Test MPO Template

**Files:**
- Create: `test/main/mpo-template.test.ts`

- [ ] **Step 1: Write template tests**

```typescript
// test/main/mpo-template.test.ts
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateMpoClaudeMd, MpoTemplateOpts } from '../../src/main/session/mpo-template'

describe('generateMpoClaudeMd', () => {
  const defaultOpts: MpoTemplateOpts = {
    mcpHost: '127.0.0.1',
    mcpPort: 3100,
    mcpApiKey: 'test-api-key-mpo',
    maxRetries: 2,
  }

  it('starts with MPO heading', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.startsWith('# MPO — Multi-Project Orchestrator'))
  })

  it('contains MCP URL with host and port', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('http://127.0.0.1:3100/mcp'))
  })

  it('contains Bearer token with API key', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Bearer test-api-key-mpo'))
  })

  it('contains all cipher-mux MCP tools', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    const tools = [
      'mux_sessions', 'mux_create_session', 'mux_kill_session',
      'mux_send', 'mux_read', 'mux_status', 'mux_context_usage',
      'mux_task_create', 'mux_task_update', 'mux_task_list', 'mux_task_get',
      'mux_input_request_create',
    ]
    for (const tool of tools) {
      assert.ok(md.includes(tool), `Missing tool: ${tool}`)
    }
  })

  it('contains persona section', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Wayne Szalinski'))
    assert.ok(md.includes('## Persona'))
  })

  it('contains 10-phase lifecycle', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('### Phase 1:'))
    assert.ok(md.includes('### Phase 10:'))
    assert.ok(md.includes('## Lifecycle'))
  })

  it('contains 5-level escalation hierarchy', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('## Eskalations-Hierarchie'))
    assert.ok(md.includes('| 1 |'))
    assert.ok(md.includes('| 5 |'))
  })

  it('contains decomposition rules', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('## Zerlegungsregeln'))
    assert.ok(md.includes('Feature-basiert'))
    assert.ok(md.includes('Granularitäts-Heuristik'))
  })

  it('contains monitoring rules with stuck signals', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('## Monitoring-Regeln'))
    assert.ok(md.includes('Sackgassen-Signale'))
    assert.ok(md.includes('Kein Output >20 Min'))
  })

  it('contains input request rules', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('## Input-Request-Regeln'))
    assert.ok(md.includes('Bubble'))
    assert.ok(md.includes('Pendelordner'))
  })

  it('contains retry limit from opts', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Maximal 2 Retry-Versuche'))
    assert.ok(md.includes('Nach 2 Fehlschlägen'))
  })

  it('uses custom retry limit', () => {
    const md = generateMpoClaudeMd({ ...defaultOpts, maxRetries: 3 })
    assert.ok(md.includes('Maximal 3 Retry-Versuche'))
  })

  it('uses custom port', () => {
    const md = generateMpoClaudeMd({ ...defaultOpts, mcpPort: 4200 })
    assert.ok(md.includes('http://127.0.0.1:4200/mcp'))
  })

  it('contains session prefix rule', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('cmux-mpo-'))
  })

  it('includes adapter fragment when provided', () => {
    const md = generateMpoClaudeMd({
      ...defaultOpts,
      adapterFragment: 'Start workers with: `claude --dangerously-skip-permissions`',
    })
    assert.ok(md.includes('claude --dangerously-skip-permissions'))
    assert.ok(md.includes('Agent-spezifische Hinweise'))
  })

  it('omits adapter section when no fragment provided', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(!md.includes('## Agent-spezifische Hinweise'))
  })

  it('contains 90% autonomy rule', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('90% Autonomie'))
  })

  it('contains no-push rule', () => {
    const md = generateMpoClaudeMd(defaultOpts)
    assert.ok(md.includes('Niemals git push'))
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --test-name-pattern="generateMpoClaudeMd"`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add test/main/mpo-template.test.ts
git commit -m "test(mpo): add comprehensive template generation tests"
```

---

## Task 6: SessionManager — MPO Lifecycle

**Files:**
- Modify: `src/main/session/session-manager.ts`

- [ ] **Step 1: Add MPO state fields**

Add after `private orchestratorSessionId`:

```typescript
private mpoSessionId: string | null = null
```

- [ ] **Step 2: Add MPO recovery logic**

In the `recoverSessions()` method, after the orchestrator recovery loop, add:

```typescript
// Restore MPO link if a recovered session is named "MPO"
for (const session of recovered) {
  if (session.name === 'MPO') {
    this.mpoSessionId = session.id
    break
  }
}
```

- [ ] **Step 3: Add `resolveMpoDir()` private method**

Add after `resolveOrchestratorDir()`:

```typescript
/**
 * Resolve the MPO directory path (expand ~).
 */
private resolveMpoDir(): string {
  return BRAND.mpoDir.replace(/^~/, os.homedir())
}
```

- [ ] **Step 4: Add `startMpo()` method**

Add after `getOrchestratorSessionId()`:

```typescript
// ─── MPO (Multi-Project Orchestrator) ───────────────

/**
 * Start the MPO session.
 * Creates the MPO directory and CLAUDE.md, then starts
 * a special session pointing at that directory.
 */
async startMpo(config: OrchestratorConfig): Promise<SessionInfo> {
  if (this.mpoSessionId) {
    const existing = this.sessions.get(this.mpoSessionId)
    if (existing && existing.status === 'active') {
      throw new Error('MPO is already running')
    }
    this.mpoSessionId = null
  }

  const mpoDir = this.resolveMpoDir()
  fs.mkdirSync(mpoDir, { recursive: true })

  // Generate CLAUDE.md with adapter-specific prompt fragment
  const adapter = this.adapterRegistry.getDefault()
  const claudeMd = generateMpoClaudeMd({
    mcpHost: config.mcpHost,
    mcpPort: config.mcpPort,
    mcpApiKey: config.mcpApiKey,
    maxRetries: MPO_MAX_RETRIES,
    adapterFragment: adapter.buildMpoPromptFragment('de'),
  })
  fs.writeFileSync(path.join(mpoDir, 'CLAUDE.md'), claudeMd, 'utf-8')

  // Write .mcp.json for Claude Code MCP auto-discovery
  const mcpUrl = `http://${config.mcpHost}:${config.mcpPort}/mcp`
  const mcpJsonPath = path.join(mpoDir, '.mcp.json')
  const mcpJson = {
    mcpServers: {
      'cipher-mux': {
        type: 'http',
        url: mcpUrl,
        headers: { Authorization: `Bearer ${config.mcpApiKey}` },
      },
    },
  }
  fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpJson, null, 2), 'utf-8')

  const session = await this.start({
    name: 'MPO',
    projectPath: mpoDir,
  })

  this.mpoSessionId = session.id
  this.emit('mpo-started', session)
  return session
}

/**
 * Queue Claude Code launch in the MPO session.
 */
queueMpoClaude(): void {
  if (!this.mpoSessionId) {
    throw new Error('MPO is not running')
  }
  const adapter = this.adapterRegistry.getDefault()
  const launchCmd = adapter.buildLaunchCommand({
    projectPath: this.resolveMpoDir(),
    sessionName: 'MPO',
    isMpo: true,
  })
  const cmdStr = [launchCmd.cmd, ...launchCmd.args].join(' ')
  this.setPendingLaunch(this.mpoSessionId, `clear; ${cmdStr}\n`)
}

/**
 * Stop the MPO session.
 */
async stopMpo(): Promise<void> {
  if (!this.mpoSessionId) {
    throw new Error('MPO is not running')
  }
  await this.stop(this.mpoSessionId)
  this.mpoSessionId = null
  this.emit('mpo-stopped')
}

/**
 * Check if the MPO is currently running.
 */
isMpoRunning(): boolean {
  if (!this.mpoSessionId) return false
  const session = this.sessions.get(this.mpoSessionId)
  return (session?.status === 'active') || false
}

/**
 * Get the MPO session ID (or null).
 */
getMpoSessionId(): string | null {
  return this.mpoSessionId
}
```

- [ ] **Step 5: Add imports at top of file**

Add to the existing import block:

```typescript
import { generateMpoClaudeMd } from './mpo-template'
import { MPO_MAX_RETRIES } from '../../shared/constants'
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/main/session/session-manager.ts
git commit -m "feat(mpo): add MPO lifecycle methods to SessionManager (start/stop/status/queue)"
```

---

## Task 7: InputRequestWatcher — createRequest() + MCP Tool

**Files:**
- Modify: `src/main/mpo/input-request-watcher.ts`
- Modify: `src/main/mcp/mcp-tools.ts`

- [ ] **Step 1: Add `createRequest()` to InputRequestWatcher**

Add method after `answerRequest()`:

```typescript
/**
 * Create a new input request and append it to the file.
 * Uses the same atomic write-back pattern as answerRequest().
 */
createRequest(request: InputRequest): void {
  const data = this.readFile()
  data.requests.push(request)
  data.lastUpdated = new Date().toISOString()
  this.writeFileAtomic(data)
}
```

- [ ] **Step 2: Extract `writeFileAtomic()` helper**

If not already extracted, refactor the atomic write logic from `answerRequest()` into a shared private method:

```typescript
private writeFileAtomic(data: InputRequestsFile): void {
  const tmpPath = this.filePath + '.tmp'
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmpPath, this.filePath)
}
```

Update `answerRequest()` to use `this.writeFileAtomic(data)` instead of inline write.

- [ ] **Step 3: Export InputRequestWatcher `createRequest` for use in MCP tools**

No additional export needed — the method is on the class instance already passed to IpcHub.

- [ ] **Step 4: Register `mux_input_request_create` MCP tool**

In `src/main/mcp/mcp-tools.ts`, add the tool registration inside `registerTools()`. First, extend the `ToolContext` interface:

```typescript
// Add to ToolContext interface
inputRequestWatcher: import('../mpo/input-request-watcher').InputRequestWatcher | null
```

Then register the tool (add before the closing `}` of `registerTools`):

```typescript
// N. mux_input_request_create — Create an input request for the MPO sidebar
;(server.registerTool as any)(
  'mux_input_request_create',
  {
    description: 'Create an input request bubble for the cipher-mux sidebar (used by MPO to ask the user questions)',
    inputSchema: {
      projectId: z.string().describe('Project identifier'),
      question: z.string().describe('The question to ask the user'),
      context: z.string().optional().describe('Additional context (2-3 sentences)'),
      options: z.array(z.object({
        key: z.string(),
        label: z.string(),
        description: z.string().optional().default(''),
      })).optional().describe('Answer options (max 4)'),
      recommendation: z.string().optional().describe('Recommended option key'),
    },
  },
  async (args: {
    projectId: string
    question: string
    context?: string
    options?: Array<{ key: string; label: string; description?: string }>
    recommendation?: string
  }) => {
    if (!ctx.inputRequestWatcher) {
      return { content: [{ type: 'text' as const, text: 'InputRequestWatcher not available' }], isError: true }
    }

    const id = `ir-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const request: import('../../shared/types').InputRequestBubble = {
      id,
      type: 'bubble',
      projectId: args.projectId,
      question: args.question,
      context: args.context ?? '',
      options: (args.options ?? []).map(o => ({ key: o.key, label: o.label, description: o.description ?? '' })),
      recommendation: args.recommendation,
      status: 'open',
      createdAt: new Date().toISOString(),
    }
    ctx.inputRequestWatcher.createRequest(request)

    return {
      content: [{ type: 'text' as const, text: `Input request created: ${id} — "${args.question}"` }],
    }
  },
)
```

- [ ] **Step 5: Wire InputRequestWatcher into ToolContext**

In `src/main/ipc-hub.ts`, where `registerTools()` is called, pass the InputRequestWatcher instance. Find where the ToolContext is constructed and add:

```typescript
inputRequestWatcher: this.inputRequestWatcher ?? null,
```

(The `inputRequestWatcher` field needs to be stored as a class field on IpcHub — check if it already is from `registerInputRequestChannels()`, and promote it to a class field if not.)

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add src/main/mpo/input-request-watcher.ts src/main/mcp/mcp-tools.ts src/main/ipc-hub.ts
git commit -m "feat(mpo): add mux_input_request_create MCP tool and InputRequestWatcher.createRequest()"
```

---

## Task 8: Test Input Request Creation

**Files:**
- Create: `test/main/mpo-input-request-create.test.ts`

- [ ] **Step 1: Write tests for createRequest()**

```typescript
// test/main/mpo-input-request-create.test.ts
import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { InputRequestWatcher } from '../../src/main/mpo/input-request-watcher'

describe('InputRequestWatcher.createRequest', () => {
  let tmpDir: string
  let filePath: string
  let watcher: InputRequestWatcher

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpo-ir-test-'))
    filePath = path.join(tmpDir, 'input-requests.json')
    fs.writeFileSync(filePath, JSON.stringify({ requests: [], lastUpdated: '' }))
    watcher = new InputRequestWatcher(filePath)
  })

  afterEach(() => {
    watcher.stop()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('appends a new request to the file', () => {
    watcher.createRequest({
      id: 'ir-test-1',
      type: 'bubble',
      projectId: 'test-project',
      question: 'Which database?',
      context: 'We need persistence',
      options: [
        { key: 'pg', label: 'PostgreSQL', description: 'Relational' },
        { key: 'mongo', label: 'MongoDB', description: 'Document' },
      ],
      recommendation: 'pg',
      status: 'open',
      createdAt: new Date().toISOString(),
    })

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    assert.equal(data.requests.length, 1)
    assert.equal(data.requests[0].id, 'ir-test-1')
    assert.equal(data.requests[0].question, 'Which database?')
    assert.equal(data.requests[0].options.length, 2)
  })

  it('preserves existing requests when appending', () => {
    const existing = {
      requests: [{
        id: 'ir-existing', type: 'bubble', projectId: 'p',
        question: 'Old?', context: '', options: [],
        status: 'open', createdAt: '2026-01-01T00:00:00Z',
      }],
      lastUpdated: '2026-01-01T00:00:00Z',
    }
    fs.writeFileSync(filePath, JSON.stringify(existing))

    watcher.createRequest({
      id: 'ir-new', type: 'bubble', projectId: 'p',
      question: 'New?', context: '', options: [],
      status: 'open', createdAt: new Date().toISOString(),
    })

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    assert.equal(data.requests.length, 2)
    assert.equal(data.requests[0].id, 'ir-existing')
    assert.equal(data.requests[1].id, 'ir-new')
  })

  it('updates lastUpdated timestamp', () => {
    const before = new Date().toISOString()
    watcher.createRequest({
      id: 'ir-ts', type: 'bubble', projectId: 'p',
      question: 'Q?', context: '', options: [],
      status: 'open', createdAt: before,
    })

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    assert.ok(data.lastUpdated >= before)
  })

  it('leaves no .tmp file after write', () => {
    watcher.createRequest({
      id: 'ir-tmp', type: 'bubble', projectId: 'p',
      question: 'Q?', context: '', options: [],
      status: 'open', createdAt: new Date().toISOString(),
    })

    const files = fs.readdirSync(tmpDir)
    const tmpFiles = files.filter(f => f.endsWith('.tmp'))
    assert.equal(tmpFiles.length, 0)
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm test -- --test-name-pattern="createRequest"`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add test/main/mpo-input-request-create.test.ts
git commit -m "test(mpo): add InputRequestWatcher.createRequest() unit tests"
```

---

## Task 9: IpcHub — registerMpoChannels()

**Files:**
- Modify: `src/main/ipc-hub.ts`

- [ ] **Step 1: Add `registerMpoChannels()` method**

Add after `registerOrchestratorChannels()`:

```typescript
// ─── MPO ─────────────���────────────────────────────────
private registerMpoChannels(): void {
  ipcMain.handle(IPC.MPO_START, async () => {
    const mcpConfig = configStore.get('mcp')
    const session = await this.sessionManager.startMpo({
      mcpHost: mcpConfig?.host ?? MCP_DEFAULT_HOST,
      mcpPort: mcpConfig?.port ?? MCP_DEFAULT_PORT,
      mcpApiKey: mcpConfig?.apiKey ?? '',
    })
    try {
      this.sessionManager.queueMpoClaude()
    } catch (err) {
      console.error('[IpcHub] Failed to queue MPO claude:', err)
    }
    return session
  })

  ipcMain.handle(IPC.MPO_STOP, async () => {
    await this.sessionManager.stopMpo()
    return { ok: true }
  })

  ipcMain.handle(IPC.MPO_STATUS, async () => {
    return {
      running: this.sessionManager.isMpoRunning(),
      sessionId: this.sessionManager.getMpoSessionId(),
    }
  })
}
```

- [ ] **Step 2: Call registerMpoChannels() in init()**

Find where `this.registerOrchestratorChannels()` is called and add directly after:

```typescript
this.registerMpoChannels()
```

- [ ] **Step 3: Forward MPO_STARTED event**

In the SessionManager event setup section (where `orchestrator-started` is forwarded), add:

```typescript
this.sessionManager.on('mpo-started', (session) => {
  this.windowManager.sendToMainWindow(IPC.MPO_STARTED, session)
})
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-hub.ts
git commit -m "feat(mpo): add IPC channels for MPO start/stop/status in IpcHub"
```

---

## Task 10: Preload API

**Files:**
- Modify: `src/main/preload.ts`

- [ ] **Step 1: Add `mpo` section to preload API**

Add after the `orchestrator` section:

```typescript
// ─── MPO ─��────────────────���───────────────────────────
mpo: {
  start: () => ipcRenderer.invoke(IPC.MPO_START),
  stop: () => ipcRenderer.invoke(IPC.MPO_STOP),
  status: () => ipcRenderer.invoke(IPC.MPO_STATUS),
  onStarted: (cb: (data: unknown) => void) => {
    const handler = (_e: unknown, data: unknown) => cb(data)
    ipcRenderer.on(IPC.MPO_STARTED, handler)
    return () => ipcRenderer.removeListener(IPC.MPO_STARTED, handler)
  },
},
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/main/preload.ts
git commit -m "feat(mpo): expose mpo start/stop/status/onStarted in preload API"
```

---

## Task 11: StatusBar — MPO Button

**Files:**
- Modify: `src/renderer/components/StatusBar.tsx`

- [ ] **Step 1: Add `mpoRunning` and `onMpo` props**

```typescript
// Add to StatusBarProps interface
mpoRunning: boolean
onMpo: () => void
```

- [ ] **Step 2: Add to destructured props**

```typescript
// Add to function parameter destructuring
mpoRunning, onMpo,
```

- [ ] **Step 3: Add MPO button between orchestrator and bugreport**

```tsx
<button
  class={`status-bar__btn${mpoRunning ? ' status-bar__btn--active' : ''}`}
  onClick={onMpo}
>
  mpo
</button>
```

Place this directly after the orchestrator button and before the bugreport button.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors (will fail until App.tsx passes the new props — fix in next task)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/StatusBar.tsx
git commit -m "feat(mpo): add MPO toggle button to StatusBar with active state"
```

---

## Task 12: App.tsx — MPO State + Handlers

**Files:**
- Modify: `src/renderer/app.tsx`

- [ ] **Step 1: Add MPO state**

After `orchestratorSessionId` state:

```typescript
const [mpoSessionId, setMpoSessionId] = useState<string | null>(null)
```

- [ ] **Step 2: Add MPO placement callback**

After `placeOrchestrator`:

```typescript
const placeMpo = useCallback((sessionId: string) => {
  setMpoSessionId(sessionId)
  addSession(sessionId)
}, [addSession])
```

- [ ] **Step 3: Add MPO status check on mount**

After the orchestrator useEffect:

```typescript
// Check MPO status on mount
useEffect(() => {
  const api = (window as any).cipherMux
  api.mpo.status().then((s: { running: boolean; sessionId?: string }) => {
    if (s.running && s.sessionId) placeMpo(s.sessionId)
  })
  const unsub = api.mpo.onStarted((data: any) => {
    const sid = data?.sessionId ?? data?.id
    if (sid) placeMpo(sid)
  })
  return () => unsub()
}, [placeMpo])
```

- [ ] **Step 4: Add MPO toggle handler**

After `handleOrchestratorToggle`:

```typescript
const handleMpoToggle = useCallback(async () => {
  const api = (window as any).cipherMux
  try {
    if (mpoSessionId) {
      await api.mpo.stop()
      removeSession(mpoSessionId)
      setMpoSessionId(null)
    } else {
      const session = await api.mpo.start()
      const sid = session?.sessionId ?? session?.id
      if (sid) placeMpo(sid)
    }
  } catch (err) {
    console.error('[App] MPO toggle failed:', err)
  }
}, [mpoSessionId, removeSession, placeMpo])
```

- [ ] **Step 5: Pass new props to StatusBar**

Add to the `<StatusBar>` JSX:

```tsx
mpoRunning={!!mpoSessionId}
onMpo={handleMpoToggle}
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add src/renderer/app.tsx
git commit -m "feat(mpo): add MPO state management and toggle handler to App"
```

---

## Task 13: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add MPO section to CLAUDE.md**

Add after the "AgentAdapter Interface" section:

```markdown
## MPO (Multi-Project Orchestrator)

Eingebaute Funktion von cipher-mux. Empfängt Anforderungspakete, zerlegt sie in Teilprojekte, startet N parallele Launcher-Sessions und koordiniert deren Arbeit.

- **Managed Dir:** `~/.config/cipher-mux/mpo` (CLAUDE.md + .mcp.json generiert)
- **Session-Name:** `MPO` (recovery-fähig)
- **Template:** `src/main/session/mpo-template.ts` (Persona, 10-Phase-Lifecycle, 5-Level-Eskalation, Monitoring)
- **MCP-Tool:** `mux_input_request_create` für Bubble-Requests an die Sidebar
- **StatusBar:** `mpo`-Button mit Active-State
- **Kein Auto-Start** — manuell per Button
- **Grid-Placement:** Nächster freier Slot (oben-links, links-nach-rechts)
```

- [ ] **Step 2: Verify the documentation is consistent with implementation**

Read the updated CLAUDE.md and cross-check against the implementation.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document MPO integration as cipher-mux function"
```

---

## Task 14: Final Verification

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build, no errors

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: All tests pass (existing + new)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: No lint errors

- [ ] **Step 4: Manual smoke test**

Start the app with `npm run dev`:
1. Verify `mpo` button appears in StatusBar between `orchestrator` and `bugreport`
2. Click `mpo` — session starts, appears in grid
3. Verify CLAUDE.md was generated at `~/.config/cipher-mux/mpo/CLAUDE.md`
4. Verify .mcp.json was generated at `~/.config/cipher-mux/mpo/.mcp.json`
5. Click `mpo` again — session stops, removed from grid
6. Verify button shows `--active` state while running

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix(mpo): smoke test fixups"
```
