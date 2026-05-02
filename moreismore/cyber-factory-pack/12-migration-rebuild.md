---
title: "Migration: Komplett-Rebuild parallel mit Cutover"
status: v0.1
date: 2026-04-30
querschnitt: true
---

# 12 — Migration

## Strategie

Komplett-Rebuild parallel zur bestehenden Welt, mit definiertem Cutover-Punkt. Begruendung: Reversibilitaet ist die teuerste, aber wichtigste Eigenschaft fuer ein Ein-Personen-Cockpit. Bis zum Cutover bleibt die alte Welt in vollem Umfang funktionsfaehig.

Das hat Konsequenzen:

- *Kein Big-Bang-Refactor.* Alte Module bleiben, neue Module entstehen daneben.
- *Feature-Flags pro Welle.* Jede neue Komponente hat einen experimentellen Flag in der ConfigStore-Sektion.
- *Datenbank-Migration mit Roll-back.* Schema-Aenderungen sind zusaetzlich, nicht ersetzend, bis zum Cutover.
- *Tests laufen in beiden Welten parallel.* Build muss in alter und neuer Welt gruen sein.

## Wellen-Plan

```
Welle -1: CIPHER-MUX-Hub-Skelett + cipher-mux-electron-Migration (siehe `20-cipher-mux-hub.md`)
    ↓
Welle 0:  Vorbereitung — Git-Tag, Backup, Test-Baseline
    ↓
Welle 1a: Globale Basisregeln + Audit-Overlay (3-5 Tage)
    ↓
Welle 1b: Refinement-Erweiterung (5-7 Tage)
    ↓
Welle 1c: Ideation Partner (5-8 Tage)
    ↓
Welle 2:  Cyber Factory parallel zur MPO
    ↓
Welle 3:  Debugger parallel zum heutigen Launcher (projectlauncher)
    ↓
Welle 4:  Workspace-Memory + Testing Assistant + Audit-Vollstaendigkeit
    ↓
Welle 5:  Cutover (Pflicht innerhalb 14 Tage nach Welle 4)
    ↓
Welle 6:  Cleanup — alte Module entfernen, Tests konsolidieren (v1.0)
```

## Pre-Mortem-Verweis

`15-pre-mortem.md` hat vier kritische Risiken identifiziert (Score >=12). Die folgenden Akzeptanz-Kriterien adressieren sie explizit:

1. *Doppel-Welt-Sehnsucht* → **Cutover-Frist 14 Tage nach Welle-4-Abschluss** (siehe Welle 5)
2. *Welle 1 zu fett* → **Welle 1 in 1a/1b/1c gesplittet** (siehe oben)
3. *Worker-Tests unzuverlaessig* → **Mock-Claude-Skript ist Welle-2-Akzeptanz-Kriterium** (siehe Welle 2)
4. *Tool wird Selbstzweck* → **Anwendungs-Beleg pro Welle Pflicht** (Akzeptanz-Kriterium pro Welle)

## Welle -1 — CIPHER-MUX-Hub-Skelett (vor Welle 0)

**Ziel:** Hub unter `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/` ist angelegt, cipher-mux-electron ist als erstes Projekt migriert. Alle folgenden Pack-Wellen 0-6 laufen **dort**, nicht im Original-Pfad.

**Basis-Version:** Mux **0.9.9** (Stand 2026-04-30, freigetestet ausser Presets). Detail-Spec: `20-cipher-mux-hub.md` Sektion "Welle -1".

Konkret (kompakt):

0. **Analyse-Phase (Pflicht).** Mux-Version aus `package.json` verifizieren (= 0.9.9), Test-Status im Original erfassen, freigetestete Bereiche vs. nicht-freigetestete (Presets) dokumentieren in `CIPHER-MUX/migrations/cipher-mux-electron/inventory-<datum>.md`. User-Bestaetigung der Inventur.

1. **0.9.9-Basis-Tag im Original** setzen: `git tag v0.9.9-getestet` im Original-Repo.

2. `CIPHER-MUX/`-Verzeichnis-Skelett anlegen (`projects/`, `workspaces/`, `migrations/`, `notes/` als Symlink, `concepts/` optional)

3. Hub-CLAUDE.md schreiben (Inhalt in `20-cipher-mux-hub.md`)

4. ARCHIV-VERWEIS.md schreiben (Tabelle mit erkannten Originalen + Status `nicht-migriert`)

5. cipher-mux-electron komplett kopieren nach `CIPHER-MUX/projects/cipher-mux-electron/` (Original bleibt)

6. Build + Tests im migrierten Verzeichnis verifizieren — gleiche Test-Anzahl wie im Original gruen

7. Workspace-Konfig anlegen unter `CIPHER-MUX/workspaces/ws-cipher-mux-electron.json`

8. `.project-meta.json` mit `lifecycle_phase: 'pack-implementation'`, `archived_origin`-Verweis, `base_version: '0.9.9'`, `freigetestete_bereiche` und `nicht_freigetestet`-Listen

9. Git-Tag `v0.9.9-pre-pack-cyber-factory` im migrierten Repo (Hub-Pfad)

**Akzeptanz-Kriterien Welle -1:**
- Analyse-Inventur dokumentiert
- 0.9.9-Tag im Original-Repo gesetzt
- `CIPHER-MUX/`-Skelett existiert
- cipher-mux-electron ist 1:1 kopiert (Diff-Check 0 Unterschiede vor Migration)
- Build + Tests im Hub-Pfad gruen
- Original bleibt unveraendert (Mtime-Check + Tag bleibt)
- Workspace in cipher-mux-App aktivierbar mit `projectPath` auf Hub-Version
- ARCHIV-VERWEIS.md zeigt cipher-mux-electron als `migriert-getestet`

**Aufwand:** 1-2 Tage. Hauptzeit: Inventur-Dokumentation + Build/Test-Verifikation.

**Wichtig:** Ab Welle 0 laufen alle Pack-Wellen im Hub-Pfad. Pre-Welle-0-Tag wird im Hub-Repo `v0.9.9-pre-pack-cyber-factory` heissen — nicht mehr `v0.9.7-pre-cyber-factory-pack` (das war veralteter Versions-Stand aus Pack-v0.4-Zeit).

## Welle 0 — Vorbereitung

**Ziel:** Stabile Ausgangslage vor jedem neuen Code.

Konkret:

1. Git-Tag setzen: `git tag v0.9.9-pre-pack-cyber-factory` (im Hub-Repo, nicht im Original — das hat schon `v0.9.9-getestet` aus Welle -1)
2. Backup-Skript fuer ConfigStore und SQLite-DBs:
   ```bash
   scripts/backup-cipher-mux-state.sh --target ~/cipher-mux-backups/$(date +%Y-%m-%d)
   ```
3. Test-Baseline: alle 527 Tests gruen, dokumentiert in `BASELINE.md`.
4. Branch erstellen: `feat/cyber-factory-pack`.

**Akzeptanz-Kriterien:**
- Tag existiert
- Backup-Skript laeuft fehlerfrei und produziert wiederherstellbares Archiv
- `BASELINE.md` mit Test-Output committed

**Hinweis zu offener Test-Last (MPO-Handoff 2026-04-29):**

Der MPO-Handoff dokumentiert offene Retests und offene Punkte am aktuellen v0.11-Code. Diese Test-Last laeuft **unabhaengig** vom Pack — sie wird im normalen Bug-Fix-/Test-Workflow am bestehenden Code erledigt, bevor der Pack-Cutover ueberhaupt aktuell wird. Welle 0 hat darauf keinen Hebel und muss sie auch nicht uebernehmen.

Erst beim Cutover (Welle 5) wird relevant: bekannte MPO-Bugs muessen am neuen Cyber-Factory-Code re-validiert werden, weil die zugrunde liegende Logik ersetzt wurde. Der Pre-Cutover-Test (5 echte E2E-Cyber-Factory-Runs, siehe Welle 5) deckt das ab. Das W8 (Watchdog→Testing Assistant) wird strukturell in Welle 4 erledigt.

(Anmerkung: External Review v2 Fund 1 hatte vorgeschlagen, die Retests in Welle 0 des Packs aufzunehmen. Bei kritischer Pruefung gehoeren sie nicht in den Pack-Scope — sie sind operative Test-Last am aktuellen Code. Siehe `external-review-v2-integration.md` fuer Verwerfungs-Begruendung.)

## Welle 1 — Foundation (Ebene 1) — gesplittet in 1a/1b/1c

**Begruendung der Splittung:** Pre-Mortem (`15-pre-mortem.md` Grund 2) hat Welle 1 als kritisches Risiko identifiziert — vier Komponenten parallel ist objektiv zu fett fuer ein Ein-Personen-Cockpit. Splittung in drei kleinere Sub-Wellen reduziert das Risiko, dass Welle 1 im Sand verlaeuft.

### Welle 1a — Globale Basisregeln + Audit-Overlay + Persona-Zuweisungs-Architektur (4-6 Tage)

**Ziel:** Persona-Fundament steht. Persona-Architektur ist umgebaut.

**Mux-Eingriffs-Disziplin (Pflicht aus `02-base-rules.md` Punkt 13):** Vor Implementierung Ist-Code lesen — bestehende Persona-Drafts (`docs/mpo-specs/persona-drafts/`), bestehende Character-Tabelle in der Companion-DB, `CompanionTab.tsx`, `PresetEditor.tsx`. Plan abstimmen mit User: welche Mux-Module werden geaendert, welche bestehenden Tests sind betroffen, wo greift es in 0.9.9-getestete Mechanik. **Presets sind nicht-freigetestet — hier ist Pack-Spec autoritativer**, aber Ist-Code trotzdem lesen, um nichts zu uebersehen.

1. **Globale Basisregeln** (`02-base-rules.md`)
   - Neuer ConfigStore-Sektion `globalRules` (siehe EN-2__globale-basisregeln-persona-system.md fuer Details)
   - Neuer PresetEditor-Tab "Basisregeln"
   - Session-Injector liest und prepended Basisregeln vor Entity-CLAUDE.md
   - Template-Engine fuer relay-core.md ({{display_name}}, {{user_profile_yaml}}, {{evolved_annotations}})
   - Tests: Basisregeln werden injiziert; Aenderung wirkt auf naechste Session; Template-Variablen aufgeloest

2. **Audit-Overlay** (`03-preset-akzente.md` Audit + `10-audit.md`)
   - Neuer Persona-Overlay `docs/mpo-specs/persona-drafts/overlay-audit.md`
   - Audit-Code-Module unter `src/main/audit/` (rudimentaer; volle Funktionalitaet in Welle 4)
   - Tests: Audit-Session laesst sich starten, hat Persona-Overlay in CLAUDE.md

3. **Persona-Zuweisungs-Architektur** (`16-persona-presets.md`)
   - Vier neue Seed-Charaktere in `character-defaults.ts`: Cipher, Kyniker, Sokrates, Glitch
   - PresetConfig-Schema-Erweiterung: `defaultPersonaId`, `personaIdOverride`
   - CharacterStoreState-Erweiterung: `globalActivePersonaId`
   - Persona-Resolver-Modul `src/main/session/persona-resolver.ts` (Prio 1: global, 2: Preset, 3: Relay-Fallback)
   - PresetEditor-Umbau: Persona-Dropdown statt Inline-Edit (ersetzt EN-2d)
   - Companion-Tab-Erweiterung: Toggle "Diese Persona global aktivieren"
   - Migration: bestehende Setups bekommen Default-Matrix gesetzt; aktiver Charakter bleibt unveraendert
   - Tests: Resolution-Hierarchie, Default-Matrix beim Seed, Persona-Loesch-Schutz

**Akzeptanz-Kriterien Welle 1a:**
- Drei Komponenten lassen sich einzeln aktivieren
- Test-Baseline + neue Tests gruen
- PresetEditor zeigt Personas-Dropdown ohne Inline-Edit
- Default-Matrix wird auf alle existierenden Presets angewendet ohne User-Override-Verlust
- *Anwendungs-Beleg* (Pre-Mortem Grund 4 + Review-Fund 7): User dokumentiert in `moreismore/cyber-factory-pack/wave-1a-evidence/` zwei kurze Mini-Beispiele:
  1. Markdown-Note (oder Screenshot mit Bildtext) eines 2-5-Minuten-Dialogs, in dem eine Basisregel sichtbar Verhalten geaendert hat (z.B. Off-Limits-Hinweis hat Worker am Schreiben gehindert)
  2. Markdown-Note eines Dialogs, in dem eine Persona-Zuweisung erkennbar Tonalitaet veraendert hat (z.B. Cipher in Cyber Factory vs. Relay vorher)
  Format: kurze freie Form, max 1 Seite pro Beispiel. Keine formale Bewertung — Existenz reicht. Audit prueft beim Welle-Abschluss nur Existenz, nicht Inhalt-Qualitaet.

- *Puffer-Empfehlung (Review-Fund 12):* 4-6 Tage ist eng kalkuliert mit drei parallelen Komponenten. Wenn `persona-resolver.ts` mehr als 3 Bugs in Tests findet, akzeptierter Puffer +2 Tage. Welle gilt nicht als gescheitert, wenn der Puffer benoetigt wird.

### Welle 1b — Refinement-Erweiterung (5-7 Tage)

**Ziel:** Refinement uebernimmt Scaffolding, Detail-Spec-Generierung ist strukturiert.

**Mux-Eingriffs-Disziplin:** Refinement-Builtin existiert in 0.9.9 — Ist-Code lesen (`src/main/refinement/`, `overlay-refinement.md`), bestehendes Verhalten dokumentieren, Pack-Erweiterung als zusaetzliche Phasen anbauen statt bestehendes umschreiben. User-Klaerung: welche Refinement-Test-Faelle sind getestet, welche brechen potentiell.

1. **Refinement-Erweiterung** (`08-refinement-extended.md`)
   - Code-Erweiterung von `src/main/refinement/` (existiert teilweise)
   - Scaffolding-Modul (uebernommen aus Launcher-Konventionen)
   - MCP-Tools `mux_refinement_handoff_cyber_factory`, `mux_refinement_handoff_ideation`
   - Feature-Flag `experimental.refinement_extended` (Default: aus)
   - Tests: erweiterte Refinement-Phase 5 + 6 funktional

**Akzeptanz-Kriterien Welle 1b:**
- Refinement-Run mit Scaffolding-Phase laeuft auf einem Test-Projekt durch
- Bestehende Refinement-Funktion unveraendert bei `experimental.refinement_extended=false`
- *Anwendungs-Beleg*: User nutzt das erweiterte Refinement fuer ein reales Mini-Projekt (z.B. ein neues Skript-Sub-Verzeichnis)

### Welle 1c — Ideation Partner (5-8 Tage)

**Ziel:** Vor-Refinement-Phase als eigener Preset.

**Mux-Eingriffs-Disziplin:** Ideation-Partner-Entity existiert teilweise (`~/.config/cipher-mux/entities/ideationpartner/`). Ist-Code lesen, vorhandene Skill-Verzeichnisse pruefen. Pack baut zusaetzlich, ersetzt nichts Getestetes.

1. **Ideation Partner** (`07-ideation-partner.md`)
   - Neue builtin-Entity `ideation-partner` (parallel zur existierenden gescannten `ideationpartner`)
   - Code-Module unter `src/main/ideation-partner/`
   - Brain-Manager + Skill-Registry + Anforderungspaket-Generator
   - MCP-Tools `mux_ideation_skill_run`, `mux_ideation_handoff_refinement`
   - Tests: Ideation-Run startet, Brain-Verzeichnis angelegt, Skills aufgelistet

**Akzeptanz-Kriterien Welle 1c:**
- Ideation-Run mit Phase 0..4 laeuft auf einem Test-Beispiel durch
- Sub-Agent-Recherche-Konvention (drei Unsicherheits-Markierungen) wird erzwungen
- *Anwendungs-Beleg*: User fuehrt eine echte Ideation durch (kann auch nur 30 Minuten dauern), Output landet als Anforderungs-Paket im Brain

## Welle 2 — Cyber Factory parallel zur MPO

**Ziel:** Multi-Session-Orchestrierung als neues Modul, alte MPO bleibt unveraendert.

**Mux-Eingriffs-Disziplin (heikel):** MPO ist freigetestet in 0.9.9 — Ist-Code intensiv lesen (`src/main/session/mpo-template.ts`, `src/main/mpo/InputRequestWatcher.ts`, MPO-Builtin-Entity, alle MPO-Test-Faelle in `test/main/mpo/`). Cyber-Factory baut **parallel** als neue Module unter `src/main/cyber-factory/` — nichts am MPO wird angefasst. Beide Welten leben bis Cutover. User-Klaerung pro IPC-Channel, ConfigStore-Sektion, MCP-Tool-Registrierung — Konflikte mit MPO-Naming sind moeglich.

Konkret:

1. Code-Module unter `src/main/cyber-factory/` (siehe `05-cyber-factory.md`)
2. Neue builtin-Entity `cyber-factory`
3. Neue ConfigStore-Sektion `cyber_factory`
4. Neue MCP-Tools (`mux_cyber_factory_handoff_testing`, `mux_cyber_factory_handoff_debugger`)
5. Neue IPC-Channels
6. Schema-Migration: `cyber_factory_runs`, `wellen`, `sub_projekte` Tabellen (additiv)
7. Feature-Flag `experimental.cyber_factory` (Default: aus)
8. Cyber-Factory-Persona-Overlay als CLAUDE.md fuer die Entity
9. Tests: Vollstaendige Test-Suite aus `05-cyber-factory.md` Abschnitt "Tests"

**Akzeptanz-Kriterien:**
- Cyber-Factory-Run laesst sich starten
- 3 parallele Worker-Sessions koennen orchestriert werden
- Risk-Review wird pro Worker-Session generiert
- MPO bleibt unveraendert funktional
- *Mock-Claude-Skript* (Pre-Mortem Grund 3) unter `test/fixtures/mock-claude/` funktional und gepflegt
- *Cyber-Factory-Diagnose-Tool* unter `src/main/cyber-factory/diagnose.ts` produziert Health-Report fuer aktive Runs
- *Anwendungs-Beleg*: User nutzt Cyber Factory fuer ein reales kleines Projekt (z.B. eine Refactor-Aufgabe in einem bestehenden Hobby-Projekt)

## Welle 3 — Debugger parallel zum Launcher

**Ziel:** Bugfixing-Spezialist als neues Modul.

**Mux-Eingriffs-Disziplin:** Launcher-Builtin und `projectlauncher`-Entity sind freigetestet in 0.9.9. Ist-Code lesen (`src/main/project/launcher-prompt.ts`, `LauncherCell.tsx`, `KickoffOrchestrator.ts`). Debugger baut **parallel**, beide Welten existieren bis Cutover. Bei Beruehrung von Launcher-Modulen (z.B. um Hooks zu setzen): User-Klaerung.

Konkret:

1. Code-Module unter `src/main/debugger/` (siehe `06-debugger.md`)
2. Neue builtin-Entity `debugger`
3. Neue ConfigStore-Sektion `debugger`
4. Neue MCP-Tools (`mux_debugger_findings_intake`)
5. Neue IPC-Channels
6. Schema-Migration: `debugger_runs`, `clarifications`, `fix_plans` Tabellen
7. Feature-Flag `experimental.debugger` (Default: aus)
8. Debugger-Persona-Overlay
9. Tests aus `06-debugger.md`

**Akzeptanz-Kriterien:**
- Debugger-Run laesst sich starten
- Fix-Plan wird mit User-Bestaetigung erzeugt
- Worker-Sub-Session mit max-2-Retries funktioniert
- Linear-Walkthrough-Output ist Markdown-strukturiert
- Heutiger `projectlauncher` bleibt parallel verfuegbar

## Welle 4 — Workspace-Memory + Testing Assistant + Audit voll + Hub-Voll-Migration

**Ziel:** Querschnitts-Funktionen, die alle anderen Wellen ergaenzen.

**Mux-Eingriffs-Disziplin (besonders heikel):** Companion-DB-Schema-Erweiterung greift in **freigetestete** Memory-Mechanik. Ist-Code lesen (`src/main/companion/schema.ts`, `memory-store.ts`, `retriever.ts`), bestehende Migrations-Mechanik verstehen, **additive Spalten** schreiben (kein Schema-Drop). User-Klaerung: welche Tests in `test/main/companion/` sind betroffen, wie wird Migration getestet. Watchdog → Testing Assistant Cut: Watchdog-Tests pruefen, was uebergeht, was wegfaellt — User-Klaerung.

Konkret:

1. **Workspace-Memory** (siehe `11-workspace-memory.md`)
   - Code-Module unter `src/main/workspace-memory/`
   - DB-Skeleton pro Workspace
   - MCP-Tools `mux_workspace_memory_*`
   - Workspace-Schema-Erweiterung (`projectPath`, `workspaceMemoryEnabled`, `memoryFilters`)
   - Feature-Flag `experimental.workspace_memory` (Default: aus)

2. **Testing Assistant** (siehe `09-testing-assistant.md`)
   - Code-Module unter `src/main/testing-assistant/`
   - Umbenennung der Builtin-Entity `watchdog` → `testing-assistant` (als neue Entity registriert; alte `watchdog` bleibt parallel sichtbar=false)
   - MCP-Tools `mux_testing_*`
   - Feature-Flag `experimental.testing_assistant` (Default: aus)

3. **Audit volle Funktionalitaet**
   - Code-Module unter `src/main/audit/` werden vervollstaendigt
   - MCP-Tools `mux_audit_run_*`
   - Feature-Flag `experimental.audit_full`

4. **Hub-Voll-Migration anderer Code-Projekte** (siehe `20-cipher-mux-hub.md` Welle 4)
   - Brownfield-Tools (`mux_brownfield_*`) sind ab dieser Welle implementiert (siehe `19-bestehende-projekte-migration.md`)
   - Auto-Detection auf `/Users/Shared/Nextcloud/Claude/` mit verschaerftem Filter (Stack-Manifest + Code-Verzeichnis + .git)
   - User-Pick aus Vorschlags-Liste (Code-Projekte vorgeschlagen, Konzept-Verzeichnisse ausgegraut)
   - Pro Projekt: Komplett-Kopie nach `CIPHER-MUX/projects/<name>/`, Inventur, Migrations-Plan, Apply, Build/Test-Verifikation
   - Default-Modus pro Code-Projekt: Voll-Adoption. Pack-Light pro Projekt als Override moeglich
   - Hub-Tools `mux_hub_*` werden hier registriert (`mux_hub_init` fuer Projekt-Migration, `mux_hub_status`, `mux_hub_release`, `mux_hub_rollback`)

**Akzeptanz-Kriterien:**
- Workspace-Memory write/recall funktional
- Testing Assistant produziert Findings-Report
- Audit-Run mit Release-Empfehlung
- Alle drei Komponenten arbeiten zusammen — Cyber Factory schreibt Welle, Testing Assistant liest und produziert Findings ins Workspace-Memory, Debugger arbeitet sie ab, Audit liest ueber alles
- *Hub-Migration:* alle vom User gewaehlten Code-Projekte sind in `CIPHER-MUX/projects/` migriert, Build + Tests pro Projekt gruen, ARCHIV-VERWEIS.md aktualisiert

## Welle 5 — Cutover (Pflicht-Frist)

**Ziel:** Alle Feature-Flags Default auf neu, ConfigStore-Migration der User-Setups.

**Pflicht-Frist (Pre-Mortem Grund 1):** Cutover-Datum darf nicht weiter als **14 Tage** nach Welle-4-Abschluss liegen. Wenn die Frist droht, abgelaufen zu werden, erinnert der Companion aktiv. Ueberschreitet die Frist 14 Tage: Welle 4 gilt nachtraeglich als nicht abgeschlossen. Die Frist ist da, um Doppel-Welt-Sehnsucht (alte und neue Welt parallel betreiben) zu vermeiden.

**Pre-Cutover-Tests (Pre-Mortem Grund 3):**
- 5 echte E2E-Cyber-Factory-Runs mit Sub-Tasks variabler Komplexitaet, dokumentiert
- Failure-Quote >20% blockiert den Cutover
- Mock-Claude-Skript ist gepflegt und gruen

Konkret:

1. Feature-Flags Default `experimental.*` → `true`
2. Migrations-Skript `scripts/migrate-to-cyber-factory.ts`:
   - ConfigStore `mpo` → `cyber_factory` (mit Defaults wo Felder fehlen)
   - User-Workspaces, die `mpo` als Persona nutzen → `cyber-factory`
   - User-Workspaces mit `watchdog` → `testing-assistant`
   - User-Notes mit `mpo`-Tag → `cyber-factory`-Tag
3. Onboarding-Hinweis im Companion: "Hey, der MPO heisst jetzt Cyber Factory. Soll ich dir die Aenderungen zeigen?"
4. Migration-Tests: Alt-Konfig-Datei kopieren, Migration laufen lassen, Resultat pruefen
5. Tests: alle Tests in beiden Welten gruen

**Akzeptanz-Kriterien:**
- Migrations-Skript portiert User-Setup ohne Datenverlust
- User-Cockpit funktioniert nach Cutover ohne Aktion
- Roll-back-Pfad: `experimental.*` zurueckdrehen, Migrations-Skript hat einen Reverse-Modus

## Welle 6 — Cleanup (v1.0)

**Ziel:** Alte Module entfernen, Codebase auf Soll-Zustand reduzieren.

Konkret:

1. Alte Module entfernen: `src/main/mpo/`, `src/main/session/mpo-template.ts`, `src/main/project/launcher-prompt.ts` (falls `projectlauncher`-Funktion komplett im Debugger aufgegangen)
2. Alte Builtin-Entities entfernen: `mpo`, `watchdog`, evtl. `launcher`
3. Alte Tests entfernen oder als Legacy-Tests dokumentieren
4. ConfigStore-Sektionen `mpo`, `watchdog` entfernen (Migration wurde in Welle 5 gemacht)
5. Schema-Migration: alte Tabellen droppen
6. Doku aktualisieren: README, CLAUDE.md, ARCHITECTURE.md
7. Version bump: v1.0.0

**Akzeptanz-Kriterien:**
- Test-Suite reduziert (keine Doppel-Tests)
- Codebase kleiner als vor Welle 0 (Code-Bloat-Compensation)
- v1.0-Tag setzen

## Roll-back-Strategie

Bei jeder Welle: Pre-Welle-Tag, Backup-Skript, Feature-Flag.

```bash
# Roll-back nach Welle 2 (z.B. Cyber Factory bricht)
git checkout v0.9.7-pre-cyber-factory-pack
scripts/restore-cipher-mux-state.sh ~/cipher-mux-backups/2026-05-XX
# ConfigStore-Sektion cyber_factory wird ignoriert (alte Welt liest nicht)
# experimental.cyber_factory bleibt aus, alte MPO laeuft
```

Nach Welle 5 (Cutover) ist Roll-back nur per ConfigStore-Reset moeglich:

```bash
scripts/cutover-rollback.sh
# Setzt experimental.* zurueck auf alte Defaults
# User muss neu starten, alte Welt uebernimmt
```

## Reihenfolge-Disziplin

Wellen werden **streng nacheinander** durchgefuehrt. Welle N startet erst, wenn Welle N-1 vollstaendig abgenommen ist (Tests gruen, Akzeptanz-Kriterien erfuellt). Iterative-Degradation-Schutz (Whitepaper 5.2): Sich mit halb-fertiger Welle in die naechste begeben akkumuliert Schwachstellen.

## Worker-Disziplin pro Welle

Jede Welle wird mit dem Worker-Phasenmodell aus Basisregeln implementiert:

1. Untersuchen — Ist-Code lesen
2. Plan schreiben — pro Welle eine `plan-welle-N.md`
3. Plan pruefen — gegen die jeweilige Spec-Datei (z.B. `05-cyber-factory.md` fuer Welle 2)
4. Umsetzen — Code mit Layered Implementation
5. Umsetzung pruefen — Self-Review
6. Tests — neue Tests fuer neue Module
7. Fertig melden — mit Risk-Review und Akzeptanz-Status

## Aufwands-Schaetzung (rohe Naeherung)

| Welle      | Aufwand (User + AI-gestuetzt, mit Plan-Disziplin) |
| ---------- | ------------------------------------------------- |
| 0          | 1-2 Tage                                          |
| 1          | 5-10 Tage                                         |
| 2          | 10-15 Tage                                        |
| 3          | 7-12 Tage                                         |
| 4          | 10-15 Tage                                        |
| 5          | 3-5 Tage                                          |
| 6          | 3-5 Tage                                          |
| **Gesamt** | **~40-65 Tage**                                   |

Achtung: Die Schaetzung beruht auf der Annahme, dass die Spec-Inhalte stabil bleiben und keine fundamentalen Konzept-Aenderungen waehrend der Implementierung kommen. Whitepaper 5.2 (iterative Degradation) ist dabei eine Kostenfalle — Plan-Modus-Disziplin reduziert sie messbar.

## Ablauf-Sicherheits-Hinweise

- *Nach jedem Schritt einer Welle: Test-Suite gruen vor Commit.* Pre-Commit-Hook erzwingt das.
- *Pro Welle ein Branch.* Merges in `main` erst nach Welle-Abschluss.
- *ADR pro substanzieller Aenderung.* Wenn die Spec auseinandergeht: Spec zuerst aendern, dann Code.
- *External Review nach Welle 4 (Cutover-Vorbereitung).* Bevor Cutover, frische Session-Pruefung der Konsistenz.

## Offene Punkte

- *Wie wird die Migration des heutigen `projectlauncher`-Entity gehandhabt?* Empfehlung: in Welle 3, `projectlauncher` wird `visible=false` (nicht entfernt), nach Welle 6 entfernt.
- *MPO-Persona-Overlay wird gebraucht oder kann es 1:1 zu cyber-factory umbenannt werden?* Empfehlung: in Welle 2 wird Cyber-Factory-Overlay neu erstellt, MPO-Overlay bleibt fuer Legacy.
- *User-Onboarding fuer das neue Konzept.* Companion ist der Guide und muss es kennen - aber wir arbeiten hier am prerelease - eine lernreise und ähnliches wird später zum gesamtumfang gestalten und in `~/.config/cipher-mux/guides/` verortet. 
