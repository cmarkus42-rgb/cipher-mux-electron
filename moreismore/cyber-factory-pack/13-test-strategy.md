---
title: "Test-Strategie fuer das Cyber-Factory-Pack"
status: v0.1
date: 2026-04-30
querschnitt: true
---

# 13 — Test-Strategie

## Grundprinzip

Tests sind nicht Bonus — sie sind das Reinforcement-Signal, mit dem die Implementierung der Wellen ueberhaupt zum Ziel kommt (Whitepaper 6.6). Eine Welle gilt erst dann als abgeschlossen, wenn:

1. Bestehende Test-Suite gruen
2. Neue Tests fuer die neuen Module gruen
3. Integration-Tests gruen, die das Zusammenspiel ueber Modul-Grenzen pruefen
4. Manuelle Smoke-Tests im laufenden Cockpit dokumentiert

## Test-Pyramide pro Welle

```
                ┌────────────────┐
                │  Smoke / E2E    │  3-5 pro Welle
                └────────────────┘
              ┌────────────────────┐
              │ Integration-Tests   │  10-20 pro Welle
              └────────────────────┘
            ┌────────────────────────┐
            │   Unit-Tests             │  50-100 pro Welle
            └────────────────────────┘
```

Unit-Tests sind die Hauptstuetze. Integration-Tests pruefen die Modul-Grenzen (z.B. Cyber Factory startet Worker → Worker schreibt Risk-Review → Cyber Factory liest und uebergibt). Smoke/E2E pruefen den User-Pfad im Cockpit (z.B. "Ich starte einen Cyber-Factory-Run, sehe drei Worker, einer eskaliert, ich antworte, alle fertig").

## Test-Frameworks (bestehend, Pflicht)

- Unit + Integration: Node.js test runner (`npm run test`) — bestehend
- Renderer: existierende Test-Setup
- E2E/Smoke: manuell zu Beginn, automatisiert in spaeteren Phasen

## Pflicht-Tests pro Welle

### Welle 0 — Vorbereitung

Keine neuen Tests, nur Baseline gruen.

### Welle 1 — Foundation

| Test | Datei | Zweck |
|------|-------|-------|
| Globale Basisregeln werden injiziert | `test/main/session/global-rules-injection.test.ts` | Pruefen ob Persona-Block korrekt prepended wird |
| Basisregeln-Aenderung wirkt auf naechste Session | `test/main/session/global-rules-update.test.ts` | Hot-Reload-Verhalten |
| Audit-Session laesst sich starten mit Persona-Overlay | `test/main/session/audit-session-init.test.ts` | Builtin Audit + Overlay |
| Ideation-Run startet, Brain-Verzeichnis angelegt | `test/main/ideation-partner/run-init.test.ts` | Lifecycle Phase 0 |
| Sub-Agent-Note ohne Unsicherheits-Markierung wird zurueckgewiesen | `test/main/ideation-partner/sub-agent-validation.test.ts` | Pflicht-Regel aus ideation-lessons |
| Refinement-Erweiterung Phase 5 (Scaffolding) idempotent | `test/main/refinement/scaffolding-idempotent.test.ts` | Bestehende Files werden nicht ueberschrieben |
| Refinement-Phase 6 erzeugt Welle-Vorschlag | `test/main/refinement/handoff-cyber-factory.test.ts` | Strukturierte Uebergabe |

### Welle 2 — Cyber Factory

Vollstaendige Test-Liste aus `05-cyber-factory.md` Abschnitt "Tests" — 7 Pflicht-Tests, mindestens 30 Unit-Tests in den 9 Code-Modulen.

Plus Integration-Test:

| Test | Zweck |
|------|-------|
| `cyber-factory.run-end-to-end.test.ts` | Detail-Spec → Welle-Plan → 2 parallele Worker → beide fertig → Risk-Reviews → Welle-Abschluss |

### Welle 3 — Debugger

Vollstaendige Test-Liste aus `06-debugger.md` Abschnitt "Tests" — 7 Pflicht-Tests, mindestens 25 Unit-Tests.

Plus Integration-Test:

| Test | Zweck |
|------|-------|
| `debugger.run-end-to-end.test.ts` | Findings vom Testing → Rueckfragen → Fix-Plan → Worker → Verifikation → Walkthrough |

### Welle 4 — Workspace-Memory + Testing Assistant + Audit voll

Tests aus `09-testing-assistant.md`, `10-audit.md`, `11-workspace-memory.md`. Plus Integration:

| Test | Zweck |
|------|-------|
| `workspace-memory-cross-preset.test.ts` | Refinement schreibt `decision`, Cyber Factory liest, Worker pruefen Konflikte |
| `testing-debugger-handoff.test.ts` | Findings → Workspace-Memory → Debugger liest und arbeitet ab |
| `audit-release-recommendation.test.ts` | Diff mit 1 Hoch + 5 Mittel → Verdict matcht Tabelle |

### Welle 5 — Cutover

Migrations-Tests:

| Test | Zweck |
|------|-------|
| `migrate-mpo-to-cyber-factory.test.ts` | Alt-Konfig + DB → neue Konfig + DB-Tabellen |
| `migrate-watchdog-to-testing-assistant.test.ts` | Builtin-Wechsel ohne User-Sichtbarkeitsverlust |
| `cutover-roll-back.test.ts` | Reverse-Modus |
| `companion-onboarding-after-cutover.test.ts` | Companion zeigt Hinweis-Note an |

### Welle 6 — Cleanup

Reduktion: Tests, die ausschliesslich alte Module pruefen, werden entfernt. Smoke-Tests gegen Default-Workspace pruefen, dass das Cockpit ohne alte Module funktioniert.

## Manuelle Smoke-Tests (User-Verantwortung)

Pro Welle dokumentiert in `test-runs/welle-N-smoke.md`:

1. Welle-Akzeptanz-Kriterien aus `12-migration-rebuild.md` durchgehen
2. Pro Akzeptanz-Kriterium: User-Aktion, erwartetes Ergebnis, beobachtetes Ergebnis
3. Bei Abweichung: Issue oeffnen, Welle nicht abnehmen

## Verhaltens-Tests vs. Implementations-Tests

Whitepaper 6.6 + Testing Assistant Phase 2: Tests pruefen Verhalten, nicht Implementierung.

**Verhaltens-Test-Beispiel (gut):**
```typescript
test('Cyber-Factory-Run mit 3 Sub-Projekten startet 3 Worker-Sessions', () => {
  const run = startCyberFactoryRun({ subProjects: ['auth','db','ui'] });
  expect(run.workers.length).toBe(3);
  expect(run.workers.every(w => w.status === 'starting')).toBe(true);
});
```

**Implementations-Test-Beispiel (vermeiden):**
```typescript
test('CyberFactoryManager.startRun ruft WorkerLauncher.spawnSession dreimal auf', () => {
  const launcherMock = jest.fn();
  // ...
  expect(launcherMock).toHaveBeenCalledTimes(3);
});
```

Bei Test-Suite-Audit (Phase 2 des Testing Assistant): Implementations-Tests werden markiert und schrittweise umgeschrieben.

## Test-Frequenz

- Pre-Commit-Hook: Lint + Type-Check + Unit-Tests des geaenderten Modul (schnell, < 30s)
- Pre-Push-Hook: Vollstaendige Unit-Test-Suite + Integration-Tests (mittel, ~3 min)
- Welle-Abschluss: Komplette Suite + Smoke-Tests + Build (langsam, ~10-15 min)
- Vor Cutover (Welle 5): Externe Review-Session, dann komplette Suite mit Migrations-Tests

## Test-Coverage-Ziel

Nicht Coverage-Prozent (das ist gameable). Stattdessen:

- Pro neuem Public-API-Surface (z.B. neue MCP-Tools): mindestens 1 Happy-Path-Test plus 1 Edge-Case-Test
- Pro neuem Datenmodell-Schema-Element: mindestens 1 Persistenz-Test plus 1 Migration-Test
- Pro neuem Lifecycle-Phase-Uebergang: mindestens 1 Test, der den Uebergang erzwingt und 1 der ihn blockt

## Cyber-Factory-Worker-Tests (Sonderfall)

Worker laufen in eigenen tmux-Sessions mit echten Claude-Code-Instanzen. Direktes Unit-Testing ist nicht trivial. Strategie:

1. *Unit-Tests:* gegen Worker-Manager-Code (Spawning, Auftrags-Generierung, Read-Loop) mit Mock-tmux
2. *Integration-Tests:* gegen Mock-Claude (ein Skript, das vorhersagbar antwortet) — startet echte tmux-Session, Mock antwortet, Worker-Manager parst
3. *E2E-Tests (manuell, dokumentiert):* echte Claude-Code-Worker, kleine Aufgabe, erwartetes Verhalten dokumentiert

Mock-Claude-Skript wird unter `test/fixtures/mock-claude/` versioniert. Skript ist eine Shell, die auf tmux-Eingaben reagiert.

## Tests im Sinne des Adversarial Testing (Whitepaper Kap. 4)

Pro Welle mindestens 5 Adversarial-Tests, die das System absichtlich kaputt machen wollen:

- Cyber-Factory: 6 parallele Sub-Sessions starten (Anti-Pattern, sollte abgelehnt werden)
- Debugger: 3 Retries auf gleichem Fix (sollte eskalieren)
- Testing Assistant: Off-Limits-Pfad-Modifikation ohne Note (sollte Severity Hoch geben)
- Audit: Hardcoded Secret in Code (sollte Finding produzieren)
- Workspace-Memory: Eintrag mit `password=...`-Pattern (sollte blockiert werden)
- Refinement: Anforderungs-Paket mit fehlendem Wirksamkeits-Test (sollte User-Eskalation triggern)

Diese Tests sind explizit als `adversarial-*.test.ts` markiert.

## Pre-Mortem-Anker

Whitepaper-Praxis (Kap. 6.3 + Skill `pre-mortem`): Vor jeder Welle wird gefragt: *Wenn diese Welle in 3 Monaten als gescheitert gilt, was war der Grund?* Antwort wird in `welle-N/pre-mortem.md` festgehalten und liefert Test-Ideen.

## Whitepaper-Konformitaets-Tests

Eine Sub-Suite `test/whitepaper-conformance/` prueft, dass das Pack die Whitepaper-Tugenden tatsaechlich operationalisiert:

- *Plan-Modus-Pflicht:* Cyber Factory ohne Plan → Run blockiert
- *Test-First-Pflicht:* Worker-Auftrag ohne Test-Anforderung → Worker meldet Verstoss
- *Off-Limits-Disziplin:* Worker editiert `migrations/` ohne Autorisierung → Audit-Finding Severity Hoch
- *Iterative-Degradation-Schutz:* Sub-Session-Retries > 2 → Eskalation
- *Slopsquatting-Schutz:* `package.json` enthaelt Phantom-Paket → Audit-Finding

Diese Tests laufen bei jeder Welle, und liefern eine Whitepaper-Konformitaets-Aussage fuer den Audit.

## Status

v0.1 — wird mit jeder Welle aktualisiert, wenn neue Test-Klassen hinzukommen.
