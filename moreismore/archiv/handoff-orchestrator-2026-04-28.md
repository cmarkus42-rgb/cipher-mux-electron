# Uebergabe: Orchestrator-Session 2026-04-27/28

**Von:** Orchestrator (Session 2ab5ed0e, 42% Context verbraucht)
**An:** Naechste Orchestrator-Session
**Datum:** 2026-04-28

---

## Was passiert ist (2 Tage, 1 Session)

### Commits auf main (cipher-mux-electron)

```
acb16be  fix: eliminate GridPlacementPopup race + dead session grid slots (RT-X2, RT-X1) — Macro-Analysis
9187e1d  fix: harden MCP server against connection drops
4df45ea  fix: eliminate GridPlacementPopup race condition on preset start (RT-X2) — v1, nicht wirksam
48d71c6  fix: workspace system cleanup (T-UI.4, T-UI.X10, T-UI.X12, T-UI.X18)
6b7fda9  fix: prevent CLAUDE.md overwrite on Orchestrator/MPO session restart
0136aa9  fix: sidebar window behavior, organization, and notes scaling (T-UI.X1/X3/X5/X14/X15/X16)
d1bfa1c  fix: 3 grid bugs (RT-X1, RT-X2, RT-X3) — v1, teilweise wirksam
6edabe7  fix: 5 UI fixes (RT-X5, RT-X6, T-UI.X7, T-UI.X11, T-UI.X12)
c2407b5  fix: terminal line fragmentation on session open and restore-from-background (T-LC.7, RT-3)
ada0801  fix: session restore dialog now appears on app restart (T-SL.3, T-SL.4, RT-4) — nicht wirksam
c1a413d  fix: Projektwechseln button now opens LauncherCell popup (RT-2, T-LC.X1)
2124a61  fix: open GridSelector when clicking sidebar note (T-LC.X2)
1639c39  feat: add session restore dialog on app restart (T-SL.3, T-SL.4) — nicht wirksam
075c28e  fix: re-sync terminal with tmux after resize (T-LC.7) — v1
a847537  fix: LauncherCell popup z-index + Projektwechseln button (T-LC.2, T-LC.X1)
0c38666  feat: add Companion Demo Mode MCP tools (highlight, open, theme)
```

### Aktuelles DMG

`out/cipher-mux-0.9.7-arm64.dmg` — enthaelt ALLE Commits bis acb16be. Bereit fuer Re-Test.

---

## Testcases-Dokument

**Single Source of Truth:** `docs/v0.11-w3.1-testcases.md`

Companion und User arbeiten damit. Ergebnisse werden direkt im Dokument festgehalten. Orchestrator liest es, dispatcht Fixes, schreibt Re-Test-Cases rein.

### RE-TEST offen (im aktuellen DMG)

| Item | Was | Commit |
|------|-----|--------|
| RT-X2 | GridSelector Race — Macro-Analysis: doppeltes Event + stale State | acb16be |
| RT-X1 | Grid LauncherCells — tote Sessions mit rowSpan | acb16be |
| RT-2 | Projektwechseln-Button | c1a413d |
| T-UI.4 | Default-Workspace setzbar + Auto-Load | 48d71c6 |
| T-UI.X10 | Workspace-Editor: FolderPicker statt Dropdown | 48d71c6 |
| T-UI.X18 | Scan-Pfade entfernt | 48d71c6 |
| MCP | Connection-Drops gehaertet | 9187e1d |

### Bekannt offen (NICHT angehen ohne User-Go)

- **RT-4 Session Restore** — 2x gescheitert, ruht bis Workspace-Kontext geklaert
- **T-UI.X25 Persona-Injection** — Architektur-Thema, Spec liegt in moreismore/spec-entity-persona-integration.md
- **T-UI.X23 mux_create_session Claude-Start** — Feature, nicht Bug
- **Voice-Bugs** (T-VC.3/4/5, T-VC.X1) — eigener Cluster, noch nicht dran
- **RT-X4 Project Launcher Preset** — gehoert zu Entity/Persona-Integration

---

## Prozess-Learnings (diese Session)

### Was funktioniert hat

1. **3-Phasen-Modell (Investigate → Fix → Verify):** Runde 1 ohne Investigation: 2/5 Fixes wirksam. Runde 2 mit Investigation: 3/3.
2. **Macro-Analysis bei >2 gescheiterten Fixes:** RT-X2 beim 6. Versuch geloest — Root Cause war Backend-Event-Duplikat, alle vorherigen Frontend-Fixes waren auf falscher Ebene.
3. **Subagenten fuer Investigation:** Worker spawnt Explore-Agents fuer parallele Code-Analyse, spart Haupt-Context.
4. **Companion + Orchestrator Arbeitsteilung:** Companion testet mit User, Orchestrator dispatcht Fixes parallel.
5. **Testcases-Dokument als Single Source of Truth:** Kein Notes-Spam, alles an einem Ort.

### Was NICHT funktioniert hat

1. **Parallele Worker auf demselben Branch:** Zwei Worker haben gleiche Dateien editiert → Test-Interferenz, Merge-Risiko. Seriell bleiben.
2. **Worker sofort killen nach Commit:** Re-Test schlaegt fehl → neuer Worker von Null. Besser: Worker lebt bis PASS.
3. **CLAUDE.md manuell editieren:** Wird bei jedem App-Start ueberschrieben (session-manager.ts). Fix: 6b7fda9 — nur noch beim ersten Start geschrieben. Learnings muessen ins Template im Source-Code.
4. **MCP-Tools droppen nach ~30min Inaktivitaet:** Fix: 9187e1d — Timeout 4h, Keep-Alive, Error-Handler. Upstream-Problem (Claude Code reconnected nicht) bleibt.

### Wo die Orchestrator-CLAUDE.md Aenderungen hin muessen

Die Datei wird aus `src/main/session/orchestrator-template.ts` generiert. Seit Commit 6b7fda9 wird sie nur noch beim ersten Start geschrieben. Aber die Template-Datei im Source-Code muss die Learnings enthalten:

- Bugfix-Phasenmodell (Investigate → Fix → Verify)
- Macro-Analysis Eskalation nach 2 Fehlschlaegen
- Worker-Briefing-Regeln (Symptome beschreiben, nicht Loesung vorgeben)
- Thematisches Clustering
- Worker-Startup-Protokoll (12 Schritte)
- Worker lebt bis Re-Test PASS
- Context-Uebergabe bei >80%
- Subagents fuer Debugging

Diese stehen aktuell im Memory (`~/.claude/projects/.../memory/`) und in der generierten CLAUDE.md, aber NICHT im Template. Bei Neuinstallation waeren sie weg.

---

## Offene Specs in moreismore/

| Spec | Status | Beschreibung |
|------|--------|-------------|
| spec-entity-persona-integration.md | Draft | Relay-Persona fuer alle Entities, Preset-Dynamik, Watchdog |
| spec-qa-entity.md | Draft | Watchdog/QA-Tester Entity |
| spec-learning-separation.md | Draft | Privates vs. Produkt-Wissen, Routing-Regel |

---

## Aktive Worker

| Session | Status | Zweck |
|---------|--------|-------|
| macro-grid-v3 ($268) | Committed, wartet auf Re-Test | RT-X2 + RT-X1 Fixes |

**Regel:** Worker NICHT killen bis Re-Test PASS.

---

## Fuer die naechste Session

1. **Re-Test-Ergebnisse lesen** — docs/v0.11-w3.1-testcases.md
2. **Grid-Worker Feedback geben** wenn RT-X2/RT-X1 immer noch FAIL
3. **Sidebar-Fenster-Verhalten** (T-UI.X1/X14/X15/X16) ist nach dem Sidebar-Fix (0136aa9) im Re-Test offen
4. **Voice-Cluster** ist komplett unberuehrt — eigene Iteration
5. **Demo-Mode Tests** (T-DM.*) — teilweise getestet, MCP-Stability war Blocker
6. **Context-%-Anzeige → Farbbalken** — Design-Entscheidung steht:
   - **Keine Prozentzahl mehr.** Stattdessen ein Ladebalken der sich von links nach rechts fuellt.
   - **Farbverlauf:** Gruen (0-30%) → Gelb (~40%) → Orange (~50%) → Rot (~60%+). Frueh warnen weil der angezeigte Wert niedriger ist als der reale (upstream Bug).
   - **Visuell:** Halbtransparenter Layer HINTER der Schrift im Session-Header. Fuellt sich von links nach rechts. Dezent, nicht aufdringlich, passt sich ins bestehende Layout ein.
   - **Bereich:** 0% = leer, 65% angezeigt = komplett gefuellt (weil 65% angezeigt ≈ 85-90% real).
   - **Recherche liegt vor:** `docs/research-context-and-xterm-2026-04-27.md` — Abschnitt 1, Context-Nutzungsanzeige, upstream Bugs, Empfehlungen.
   - **Umsetzung:** Kann als Frontend-Design-Task mit Vorschau-Ansicht umgesetzt werden.
