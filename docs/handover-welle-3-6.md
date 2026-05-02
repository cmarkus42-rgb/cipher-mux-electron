# Handover: Cyber-Factory-Pack — Welle 3 bis 6 (nach Welle 2 komplett)

## Uebergabeprompt (komplett in neue Session pasten)

---

Du setzt die Implementierung des Cyber-Factory-Packs fort. **Welle 1 + 2 sind komplett** (alle abgenommen). Naechster Schritt: **Welle 3 — Debugger parallel zum heutigen Launcher.**

### Arbeitsverzeichnis

- **Hub-Repo:** `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-mux-electron/`
- **Branch:** `feat/cyber-factory-pack` (20 Commits: 10 aus Welle 1, 10 aus Welle 2)
- **Original (Fallback):** `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/` (Tag `v0.9.9-getestet`)

### Pack-Specs (alle unter Original-Pfad)

| Datei | Zweck |
|-------|-------|
| `moreismore/cyber-factory-pack/start-prompt-implementation-v0.4.md` | Start-Prompt mit Gesamt-Disziplin-Regeln |
| `moreismore/cyber-factory-pack/00-INDEX.md` | Pack-Struktur-Uebersicht |
| `moreismore/cyber-factory-pack/02-base-rules.md` | Globale Basisregeln, Worker-Phasenmodell |
| `moreismore/cyber-factory-pack/03-preset-akzente.md` | Rolle-spezifische Akzente pro Preset |
| `moreismore/cyber-factory-pack/12-migration-rebuild.md` | Wellen-Plan, Akzeptanzkriterien pro Welle |
| `moreismore/cyber-factory-pack/15-pre-mortem.md` | 4 kritische Risiken |
| `moreismore/cyber-factory-pack/16-persona-presets.md` | Persona-Default-Matrix |
| `moreismore/cyber-factory-pack/CLAUDE.md` | Pack-Konventionen + Sicherheitsregeln |

**Detail-Specs pro verbleibende Welle:**

| Welle | Detail-Spec |
|-------|-------------|
| **3** | `06-debugger.md` |
| 4 | `09-testing-assistant.md`, `10-audit.md`, `11-workspace-memory.md`, `17-projekt-struktur.md`, `18-bugreport-skill.md`, `19-bestehende-projekte-migration.md`, `20-cipher-mux-hub.md` |
| 5 | `12-migration-rebuild.md` Sektion "Welle 5" |
| 6 | `12-migration-rebuild.md` Sektion "Welle 6" |

### Was bisher geliefert wurde (NICHT nochmal bauen)

**Welle -1 + 0 (3 Commits):**
- Hub-Skelett unter `CIPHER-MUX/`, cipher-mux-electron 1:1 kopiert
- Branch `feat/cyber-factory-pack`, Backup-Skript, Baseline

**Welle 1a (6 Commits: 4ecb08a..37d25b2):**
- 6 Personas in `src/main/character/character-defaults.ts`
- Persona-Resolver in `src/main/session/persona-resolver.ts`
- Global Rules in `src/main/config/global-rules.ts`
- Audit-Skeleton in `src/main/audit/`
- PresetEditor Persona-Dropdown, CompanionTab Global-Override-Toggle

**Welle 1b (1 Commit: 4f7ac9a):**
- `src/main/refinement/` — re-audit.ts, purpose-check.ts, req-id-builder.ts, refinement-template.ts
- MCP-Tools: `mux_refinement_handoff_cyber_factory`, `mux_refinement_handoff_ideation`

**Welle 1c (1 Commit: c6438b9):**
- `src/main/ideation-partner/` — brain-manager.ts, skill-registry.ts, anforderungspaket-generator.ts
- Neue Builtin-Entity `ideation-partner`

**Welle 2 (10 Commits: ff95ba2..363147f):**
- `src/main/cyber-factory/` — 8 Module:
  - `types.ts` — CyberFactoryRun, Welle, SubProjekt, ModelRoutingConfig, StuckDetectionConfig, CYBER_FACTORY_DEFAULTS
  - `cyber-factory-manager.ts` — Run/Welle/SubProjekt CRUD via companion.db
  - `escalation-classifier.ts` — Level 1-5 Klassifizierung
  - `worker-monitor.ts` — Stuck-Detection (Heartbeat + Output-Plateau)
  - `risk-reviewer.ts` — Strukturierte Markdown Risk-Reviews
  - `diagnose.ts` — Health-Reports fuer aktive Runs
  - `cyber-factory-template.ts` — Entity-CLAUDE.md Generator
  - `model-resolver.ts` — haiku/sonnet/opus → versionierte Strings
- MPO komplett ersetzt (kein Parallel-Betrieb):
  - Entity 'mpo' → 'cyber-factory' in entity-registry + session-manager (28 Dateien)
  - IPC-Channels: MPO_* → CYBER_FACTORY_* und CF_*
  - ConfigStore: `cyber_factory` Sektion mit Model-Routing, Budget, Stuck-Detection
  - 3 neue MCP-Tools: `mux_cyber_factory_diagnose`, `mux_cyber_factory_handoff_testing`, `mux_cyber_factory_handoff_debugger`
  - companion_memory_write/recall erweitert um `scope_kind`/`scope_id`
- Workspace-Memory-Spalten (aus Welle 4 vorgezogen):
  - `memories` Tabelle: `scope_kind` + `scope_id` Spalten
  - MemoryStore: scope-aware write/recall/search
  - 3 neue DB-Tabellen: `cyber_factory_runs`, `wellen`, `sub_projekte`
- Mock-Claude-Skript: `test/fixtures/mock-claude/mock-claude.sh`
- IPC-Handlers: CYBER_FACTORY_RUN_STATUS, WELLE_LIST, WORKER_STATUS

**Test-Baseline nach Welle 2:** 913 Tests pass, 0 Failures (54+ Test-Dateien)

### Code-Architektur nach Welle 2 (fuer Orientierung)

```
src/main/
  character/character-defaults.ts     ← 6 Seed-Personas (1a)
  config/global-rules.ts              ← Globale Basisregeln (1a)
  config/config-store.ts              ← cyber_factory Defaults (2)
  session/persona-resolver.ts         ← Persona-Resolution (1a)
  session/entity-registry.ts          ← 8 Builtin-Entities inkl. cyber-factory (2)
  session/session-manager.ts          ← cyber-factory statt mpo (2)
  audit/                              ← Audit Skeleton (1a)
  refinement/                         ← RE-Audit, Purpose-Check, REQ-IDs (1b)
  ideation-partner/                   ← Brain, Skills, Anforderungspaket (1c)
  cyber-factory/                      ← 8 Module (2)
    types.ts                          ← Interfaces + CYBER_FACTORY_DEFAULTS
    cyber-factory-manager.ts          ← Run/Welle/SubProjekt CRUD
    escalation-classifier.ts          ← Level 1-5
    worker-monitor.ts                 ← Stuck-Detection
    risk-reviewer.ts                  ← Risk-Review Markdown
    diagnose.ts                       ← Health-Reports
    cyber-factory-template.ts         ← Entity-CLAUDE.md
    model-resolver.ts                 ← Model-String-Resolver
  companion/schema.ts                 ← CF-Tabellen + scope-Spalten (2)
  companion/memory-store.ts           ← Scope-aware CRUD (2)
  mcp/mcp-tools.ts                    ← 43 Tools (3 neue CF-Tools, 2 erweiterte Memory-Tools) (2)
  mpo/input-request-watcher.ts        ← Entity-agnostisch, wird von CF genutzt
```

### Welle 3 — Debugger parallel zum Launcher (NAECHSTER SCHRITT)

**Detail-Spec:** `06-debugger.md` (Pflichtlektuere!)
**Akzente:** `03-preset-akzente.md` Sektion "Debugger"
**Akzeptanzkriterien:** `12-migration-rebuild.md` Sektion "Welle 3"

**Was zu tun ist:**
1. Code-Module unter `src/main/debugger/`
2. Neue Builtin-Entity `debugger`
3. Neue ConfigStore-Sektion `debugger`
4. Neue MCP-Tools (`mux_debugger_findings_intake`)
5. Neue IPC-Channels
6. Schema-Migration: `debugger_runs`, `clarifications`, `fix_plans` Tabellen
7. Feature-Flag `experimental.debugger` (Default: aus — Launcher bleibt parallel)
8. Debugger-Persona-Overlay
9. Tests aus `06-debugger.md`

**Akzeptanzkriterien Welle 3:**
- Debugger-Run laesst sich starten
- Fix-Plan wird mit User-Bestaetigung erzeugt
- Worker-Sub-Session mit max-2-Retries funktioniert
- Linear-Walkthrough-Output ist Markdown-strukturiert
- Heutiger `projectlauncher` bleibt parallel verfuegbar

### Verbleibende Wellen (nach Welle 3)

**Welle 4 — Memory + Testing Assistant + Audit + Hub-Migration (10-15 Tage):**
Groesste Querschnitts-Welle. Workspace-Memory Vollausbau (scope-Spalten schon da aus Welle 2!), Testing Assistant (Watchdog-Umbenennung), Audit-Vollausbau, Hub-Voll-Migration.

**WICHTIG Welle 4:** Workspace-Memory scope-Spalten (`scope_kind`, `scope_id`) und scope-aware MemoryStore API sind BEREITS implementiert (Welle 2). Welle 4 muss NUR noch: UI-Filter, Notes-Tag-Integration, Session-Scope-Cleanup, Archiv-bei-Workspace-Delete.

**Welle 5 — Cutover (3-5 Tage):**
Feature-Flags Default auf neu. Migrations-Skript. 5 E2E-Runs. Cutover-Frist 14d nach W4.
BEACHTE: MPO ist bereits entfernt (Welle 2 Entscheidung), daher ist der MPO→CF-Migrationsteil von Welle 5 bereits erledigt. Welle 5 fokussiert sich auf: watchdog→testing-assistant Migration, launcher→debugger Migration, E2E-Validation.

**Welle 6 — Cleanup zu v1.0 (3-5 Tage):**
Alte Module entfernen (`src/main/mpo/` Reste, alte Persona-Drafts), Tests konsolidieren, v1.0-Tag.

### Disziplin-Regeln (gelten fuer alle Wellen)

- **Mux-Eingriffs-Disziplin:** Ist-Code lesen vor Aenderung, User-Klaerung bei Integration
- **Plan vor Code:** 15-20min Plan-Phase pro substantielle Aufgabe
- **Test-First:** Verhaltens-Tests, keine Implementations-Tests
- **Keine neuen Test-Fails:** Baseline 913 pass, 0 fail
- **Pack-Spec ist Wahrheitsquelle**, bei Konflikt mit freigetestem Mux-Code: Pack anpassen
- **Wellen streng sequentiell:** N+1 erst nach User-Abnahme von N
- **Anwendungs-Beleg pro Welle**
- **Risk-Review pro Welle** vor Abschluss
- **Handover-Prompts decken immer den ganzen Rest ab**, nicht nur den naechsten Schritt
