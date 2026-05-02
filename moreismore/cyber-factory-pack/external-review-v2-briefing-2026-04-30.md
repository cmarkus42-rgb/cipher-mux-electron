---
title: "External Review v2 Briefing — Brueche und Doppellungen"
status: review
date: 2026-04-30
zweck: Pruefung der Verzahnung mit existierenden cipher-mux-Konzepten
fokus: Brueche, Doppellungen, Inkonsistenzen
---

# External Review v2 Briefing

## Was ist das

cipher-mux ist eine Electron-App, die als Cockpit fuer Claude-Code-Sessions dient. Im Repository existieren mehrere Konzept-Dokumente, die ueber Zeit gewachsen sind:

- `moreismore/multisession_concept/multi_session_architecture.md` — operative Multi-Session-Architektur (L0/L1/L2/RV-Schichtung, Spec mit REQ-IDs, Reviewer-Checkliste)
- `moreismore/EN-2__globale-basisregeln-persona-system.md` — Spec fuer globale Basisregeln + Persona-System (920 Zeilen)
- `moreismore/spec-entity-persona-integration.md` — Spec fuer Persona-Konsistenz und Preset-Dynamik
- `moreismore/spec-qa-entity.md` — Watchdog/QA-Entity-Spec
- `moreismore/spec-learning-separation.md` — privat vs. produkt-Wissen
- `moreismore/konzept-projekt-workspace-struktur.md` — Tags + Workspace = Projekt
- `moreismore/MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md` und `MPO-IMPLEMENTIERUNGSPLAN-2026-04-28.md` — MPO-Auftrag und Plan
- `moreismore/handoff-mpo-session-2026-04-29.md` — letzter MPO-Handoff
- `moreismore/CompanionPrompt.md` — Companion-Prompt-Vorarbeit
- `moreismore/NEU__more-as-more.md` — Feature-Requests EN-1, EN-2, EN-3, WS-*
- `docs/mpo-specs/persona-drafts/relay-core.md` und `overlay-*.md` — Persona-Drafts (Relay, Companion, MPO, Launcher, Refinement, Voice-Relay, Orchestrator)

Plus: das **Cyber-Factory-Pack** (`moreismore/cyber-factory-pack/`, Stand v0.3) — mein neues Spec-Pack, das eine Phasen-Architektur (Ideation Partner → Refinement → Cyber Factory → Testing Assistant → Debugger → Audit) plus Persona-Default-Matrix plus Workspace-Memory plus Token-Budget plus Model-Routing definiert.

## Was geprueft werden soll (Leit-Fragen)

**Erstrangige Fokus-Frage:** Wo bricht oder doppelt das Cyber-Factory-Pack mit den vorhandenen Konzept-Dokumenten? Konkret:

1. **Multi-Session-Architektur ↔ Cyber Factory.** Pack sagt "instrumentiert" und "ergaenzt additiv". Stimmt das in der Praxis? Wo widersprechen sich die Texte? Wo erfindet das Pack etwas, das schon im Multi-Session-Konzept steht?

2. **EN-2 globale Basisregeln ↔ Pack-Basisregeln (`02-base-rules.md`).** Pack sagt, EN-2d (Persona-Toggle in PresetEditor) wird durch neue Architektur ersetzt. Aber EN-2a/b/c (globale Regeln, Worker-Phasenmodell, PersonaLevel) — sind die im Pack vollstaendig aufgenommen, teilweise dupliziert, oder gibt es Luecken?

3. **MPO-Auftrag und MPO-Implementierungsplan ↔ Cyber-Factory-Migration.** Es gibt offenbar einen laufenden MPO-Auftrag von Ende April 2026. Bricht das Pack mit dem? Doppelt es Aufgaben? Was ist mit dem MPO-Handoff vom 29. April — laeuft der ins Leere, wenn jetzt das Pack uebernommen wird?

4. **Persona-Drafts (relay-core, overlay-*) ↔ Pack-Persona-Architektur.** Pack erweitert von 2 auf 6 Personas und macht Resolution-Hierarchie. Alte Persona-Drafts (Companion, Refinement, MPO, Launcher, Voice-Relay) — bleiben sie gueltig? Werden sie ersetzt? Doppelt das Pack die Inhalte?

5. **Workspace-Memory ↔ konzept-projekt-workspace-struktur.** Pack hat ein Workspace-Memory-Konzept. Existierendes Konzept hat Tags + Workspace. Brueche bei Tag-Definition, Memory-Scoping, Datenmodell?

6. **Watchdog ↔ Testing Assistant.** Spec-qa-entity definiert Watchdog. Pack definiert Testing Assistant als Umbenennung. Inhaltlich gleich, oder doppeln/widersprechen sich Lifecycles, Findings-Format, Eskalations-Regeln?

7. **Companion-Konzepte.** CompanionPrompt.md und konzept-companion-preset-system.md sind beide Vorarbeiten. Pack-Companion (`04-presets-funktional.md`, Sektion "Companion") — bricht oder doppelt es?

8. **Spec-Learning-Separation ↔ Workspace-Memory.** Ist die "privat vs. produkt"-Trennung im Pack-Workspace-Memory adressiert oder ignoriert?

9. **Pack-Reihenfolge ↔ MPO-Implementierungsplan-Wellen.** Beide haben Wellen-Plaene. Konflikte?

## Was NICHT geprueft werden soll

- *Persona-Inhalte (Cipher, Relay, Wayne, Kyniker, Sokrates, Glitch) selbst.* User-Eingabe.
- *Migrations-Strategie (Komplett-Rebuild parallel mit Cutover).* User-Entscheidung.
- *Whitepaper-Inhalte.* Quellen-Material.
- *Die sechs Phasen-Trennung (Ideation/Refinement/Cyber Factory/Testing/Debugger/Audit).* User-Entscheidung.
- *Die Pack-Datei-Struktur (00-INDEX, 01-tugenden-mapping, ...).* Akzeptiert.

## Artefakte

**Pflicht zu lesen:**

1. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/00-INDEX.md` — Pack-Einstiegspunkt
2. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/05-cyber-factory.md` — Cyber Factory mit Multi-Session-Verzahnung
3. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/02-base-rules.md` — Pack-Basisregeln
4. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/16-persona-presets.md` — Pack-Persona-System

**Existierende cipher-mux-Konzepte (zum Vergleich):**

5. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/multisession_concept/multi_session_architecture.md` — operative Vorlage
6. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/EN-2__globale-basisregeln-persona-system.md` — bestehende globale Regeln
7. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md` — laufender MPO-Auftrag
8. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/MPO-IMPLEMENTIERUNGSPLAN-2026-04-28.md` — MPO-Plan
9. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/handoff-mpo-session-2026-04-29.md` — letzter Handoff
10. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/spec-qa-entity.md` — Watchdog/QA
11. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/konzept-projekt-workspace-struktur.md` — Workspace + Tags

**Optional (bei Bedarf, falls Leit-Fragen darauf zielen):**

- Pack-Datei `08-refinement-extended.md` — fuer REQ-ID-Frage
- Pack-Datei `09-testing-assistant.md` — fuer Watchdog-Frage
- Pack-Datei `11-workspace-memory.md` — fuer Workspace-Konzept-Frage
- Pack-Datei `04-presets-funktional.md` — fuer Companion-Frage
- `moreismore/spec-entity-persona-integration.md` — fuer Persona-Frage
- `moreismore/spec-learning-separation.md` — fuer Memory-Frage
- `moreismore/CompanionPrompt.md` — fuer Companion-Frage
- `docs/mpo-specs/persona-drafts/*.md` — fuer Persona-Drafts-Frage

## Format der Rueckmeldung

Strukturierte Markdown-Datei mit Fund-Liste. Pro Fund:

```
## Fund N: <Kurztitel>
**Pack-Datei:** <pfad>
**Bestehendes Dokument:** <pfad>
**Art:** [Bruch | Doppellung | Inkonsistenz | Luecke]
**Schwere:** [hoch | mittel | niedrig]
**Beobachtung:** <was steht wo, was matcht nicht>
**Empfehlung:** <was soll wo geaendert werden>
```

Plus:
- *Executive Summary* (5 Saetze) am Anfang — Gesamteindruck der Verzahnung
- *Welche Konzept-Beziehungen sind sauber* — kurze Liste am Ende
- *Welche brauchen Aufraeumung* — kurze Liste am Ende

Maximum 20 Funde. Wenn mehr im Material steht, priorisiere nach Schwere.

**Tonfall:** sachlich, knapp, kein Service-Laecheln. Findings ehrlich. Bei Unsicherheit als Annahme markieren.

## Wo die Rueckmeldung landen soll

`/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/external-review-v2-rueckmeldung-2026-04-30.md`

Schreib direkt dorthin und melde mit Pfad + 3-Satz-Zusammenfassung deiner wichtigsten Funde zurueck.
