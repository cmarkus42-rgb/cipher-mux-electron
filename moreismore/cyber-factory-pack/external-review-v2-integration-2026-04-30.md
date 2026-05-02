---
title: "External Review v2 — Integrations-Notiz"
status: v0.1
date: 2026-04-30
reviewer: External Agent (frische Session, Brueche/Doppellungen-Fokus)
funde_gesamt: 20
hoch: 2
mittel: 5
niedrig: 13
---

# External Review v2 — Integrations-Notiz

Pflichtdokumentation der Funde-Verarbeitung gemaess `external-review`-Skill. Quelldokumente:

- Briefing: `external-review-v2-briefing-2026-04-30.md`
- Rueckmeldung: `external-review-v2-rueckmeldung-2026-04-30.md`

## Verarbeitungs-Status pro Fund

| Fund | Schwere | Status | Patch in / Begruendung |
|------|---------|--------|------------------------|
| **1** — MPO-Retests in Pack-Welle 0 sichern | Hoch | **Begruendet verworfen** | Reviewer-Fehlcluster: MPO-Retests sind operative Test-Last am aktuellen Code, Pack ist Konzept-fuer-Refactor. Verschiedene Workflows. Hinweis-Block in `12-migration-rebuild.md` Welle 0 dokumentiert die Trennung. Lessons-Learned-Eintrag in `ideation-lessons.md`. |
| **2** — Refinement → CF Handoff vage | Mittel | **Uebernommen + erweitert** | Komplette Refinement-Rolle scharf gezogen (`08-refinement-extended.md` v0.2). ADRs + Scaffolding aus Refinement entfernt, in CF-Architekt-Phase verschoben. CF bekommt neue Phase 2 (Architekt). Refinement = L0, CF = L1+Architekt. |
| **3** — Worker-Phasenmodell global vs. CF-spezifisch | Mittel | **Uebernommen** | `02-base-rules.md` mit Klarstellung: Geltungs-Bereich universell, Durchsetzung Aufrufer-spezifisch (CF, Debugger). |
| **4** — Watchdog → Testing Assistant Konzeptwechsel | Hoch | **Uebernommen als kompletter Cut** | `09-testing-assistant.md` v0.2 als Vollersatz markiert (kein Parallel-Lauf). `spec-qa-entity.md` mit SUPERSEDED-Frontmatter und Hinweis-Block. Begruendung: "Eleganz als Metaziel" (User-Vorgabe). |
| **5** — EN-2d Supersede-Markierung | Mittel | **Uebernommen** | `EN-2__globale-basisregeln-persona-system.md` Header mit Aktualitaets-Hinweis: EN-2a/b/c/WS-8 weiterentwickelt durch Pack, EN-2d komplett superseded (Inline-Edit raus, Dropdown rein). |
| **6** — Max-Workers global vs. pro-Session | Niedrig | **Uebernommen** | `05-cyber-factory.md` Sektion "Max-Workers-Durchsetzung" praezisiert: globales Limit ueber alle Runs. |
| **7** — Workspace-Memory Tag- vs. Ordner-Scoping | Mittel | **Uebernommen mit grosser Architektur-Aenderung** | `11-workspace-memory.md` v0.2 komplett umgebaut: keine separaten DBs mehr, Memory bleibt in Companion-DB mit Schema-Erweiterung `scope_kind`/`scope_id`. Notes-System bekommt Workspace-Tag-Filter. Plus neue `17-projekt-struktur.md`. Vereinfacht Welle 4 erheblich. |
| **8** — Token-Disziplin Doppellung | Niedrig | **Keine Action** | Reviewer selbst: "kein Action-Bedarf, gutes Zusammenspiel EN-2 (Diagnose) + Pack-Section 12 (Rezept)." |
| **9** — spec-learning-separation Integration | Niedrig | **Uebernommen** | `14-offene-punkte.md` Sektion zu spec-learning-separation. Memory-Scope-Mapping privat/produkt teilweise abgedeckt; `mux_learning_suggest` als Phase 2. |
| **10** — opusplan als Symbol | Niedrig | **Bereits eingebaut** | `ModelChoice = ... \| 'opusplan'` Type bereits in v0.3. |
| **11** — Refinement-Extended als Abhaengigkeit | Mittel | **Uebernommen** | `05-cyber-factory.md` neue "Abhaengigkeiten"-Sektion mit Verweis auf `08-refinement-extended.md`. |
| **12** — persona-resolver in Migrations-Plan | Niedrig | **Bereits eingebaut** | `12-migration-rebuild.md` Welle 1a listet Persona-Resolver-Modul. |
| **13** — Stuck-Heuristik konfigurierbar | Niedrig | **Uebernommen** | `05-cyber-factory.md` Sektion "Stuck-Heuristik konfigurierbar" mit ConfigStore-Erweiterung. |
| **14** — Risk-Review-Format Schema/Slopsquatting | Niedrig | **Uebernommen** | `05-cyber-factory.md` Sektion "Risk-Review-Format — Erweiterung" mit zwei neuen Pflicht-Sektionen. |
| **15** — Testing → Debugger Dialog-Beispiel | Niedrig | **Uebernommen** | `05-cyber-factory.md` Sektion "Testing → Debugger Routing — Dialog-Beispiel" mit Persona-spezifischen Formulierungen. |
| **16** — Companion-Memory vs. Workspace-Memory Nomenklatur | Niedrig | **Uebernommen** | `02-base-rules.md` Template-Engine-Sektion mit Quellen-Klarstellung: User-Scope vs. Workspace-Scope. |
| **17** — Companion-Sub-Modi in 04 | Niedrig | **Bereits eingebaut** | `04-presets-funktional.md` Companion-Sektion enthaelt Tutor/Berater/Helfer-Modi. |
| **18** — Welle-Plan schemaVersion | Niedrig | **Uebernommen** | `05-cyber-factory.md` Sektion "Welle-Plan schemaVersion" mit YAML-Frontmatter-Erweiterung. |
| **19** — Template-Engine Code-Anker | Niedrig | **Bereits eingebaut** | `02-base-rules.md` nennt `src/main/session/session-injector.ts` schon. |
| **20** — Off-Limits-Konflikt-Regel | Niedrig | **Uebernommen** | `05-cyber-factory.md` Sektion "Off-Limits-Konflikt-Regel": Detail-Spec ueberschreibt Basisregel mit Audit-Trail. |

**Bilanz:** 20 Funde gesamt — 1 begruendet verworfen, 14 uebernommen mit aktiven Patches, 5 bereits in v0.3 vorhanden bzw. ohne Action-Bedarf.

## Strukturelle Aenderungen, die aus diesem Review entstanden sind

1. **Refinement-Rolle scharf gezogen** (Fund 2). RE-Disziplin als Kern-Akzent. ADRs + Scaffolding aus Refinement raus, in Cyber-Factory-Architekt-Phase rein. Cyber Factory hat jetzt 11 Phasen statt 10.

2. **Watchdog komplett ersetzt durch Testing Assistant** (Fund 4). spec-qa-entity SUPERSEDED. Pre-Alpha-Phase erlaubt den scharfen Schnitt.

3. **Memory-Architektur drastisch vereinfacht** (Fund 7). Eine Companion-DB mit Schema-Erweiterung statt drei separate DBs. Notes-System bekommt Tag-basierte Workspace-Filterung. Welle 4 wird operativ kuerzer.

4. **Drei neue Specs entstanden:**
   - `17-projekt-struktur.md` (Standardisierte Projektordner-Struktur, Entity → Ordner-Mapping)
   - `18-bugreport-skill.md` (allgemein verfuegbarer `/bugreport`-Skill mit Mini-Interview)
   - `external-review-v2-integration-2026-04-30.md` (diese Notiz)

5. **EN-2 wird teilweise SUPERSEDED** (Fund 5). Begruendungs-Kontext bleibt lesbar, operative Quelle ist das Pack.

## Versions-Aenderung

Pack ist von v0.3 auf **v0.4** gehoben. INDEX-Update entsprechend.

Vermerk fuer die spaetere v1.0-Releasenotiz:
> "External Review v2 durchgefuehrt am 2026-04-30, 14 Funde uebernommen, 1 begruendet verworfen, 5 bereits adressiert. Schwerpunkte der Aenderungen: Refinement-Rolle scharf gezogen, Watchdog → Testing Assistant kompletter Cut, Memory-Architektur in Companion-DB konsolidiert. Details in `external-review-v2-rueckmeldung-2026-04-30.md` und `external-review-v2-integration-2026-04-30.md`."

## Naechster Schritt

Globale Validierung — Stringenz quer durch das Pack pruefen, weil durch die strukturellen Aenderungen (Refinement-Rolle, CF-Architekt-Phase, Memory-Konsolidierung) potentiell Inkonsistenzen entstehen koennen. Validierung in eigenem Schritt.
