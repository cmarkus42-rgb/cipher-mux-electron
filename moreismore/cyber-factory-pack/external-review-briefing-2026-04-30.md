---
title: "External Review Briefing — Cyber-Factory-Pack"
status: review
date: 2026-04-30
zweck: Frische-Session-Pruefung vor v1.0-Sprung
---

# External Review Briefing

## Was ist das

cipher-mux ist eine Electron-App, die als Cockpit fuer Claude-Code-Sessions dient. Mehrere Sessions laufen parallel im Grid, jede mit einer Rolle (Refinement, MPO, Companion, etc.).

Das **Cyber-Factory-Pack** ist ein Spec-Pack, das Claude Code als Adressat bekommt, um das naechste grosse Refactoring im cipher-mux umzusetzen. Es definiert:

1. Eine Phasen-Architektur entlang Software-Lebenszyklus (Ideation Partner → Refinement → Cyber Factory → Testing Assistant → Debugger → Audit), plus Companion und Voice Companion als Querschnittsrollen.
2. Eine Tugenden-Verankerung in zwei Schichten — globale Basisregeln (universell) plus Preset-Akzente (rollenspezifisch).
3. Eine Persona-Architektur mit sechs Charakter-Bausteinen, Default-Zuweisung pro Preset, Editor-Pool als Single Source of Truth.
4. Eine Workspace-Memory-Schicht, die ueber alle Sessions im Workspace-Kontext geteilt wird.
5. Eine Migrations-Strategie als Komplett-Rebuild parallel zur bestehenden Welt mit Cutover.

Adressat des Packs: Claude Code, der das in 6-7 Wellen ueber ca. 40-65 Tage umsetzen soll.

## Was geprueft werden soll (Leit-Fragen)

Drei bis fuenf Punkte, die deine Sicht von aussen beleuchten:

1. **Verstaendlichkeit fuer Claude Code als Adressat.** Wenn Claude Code dieses Pack vorgesetzt bekommt — kann es daraus tatsaechlich Code umsetzen? Sind die Specs operationalisierbar oder bleiben sie auf Konzept-Ebene? Wo sind Stellen, an denen Claude Code raten muesste statt umsetzen?

2. **Innere Kohaerenz.** Widersprechen sich Aussagen zwischen den Spec-Files? Sind Begriffe konsistent verwendet (Persona vs. Preset vs. Akzent vs. Companion)? Sind die Verweise zwischen den Files korrekt? Gibt es Stellen, wo eine Spec etwas anderes sagt als eine andere zum gleichen Thema?

3. **Scope-Realismus.** Pack schaetzt 40-65 Tage Aufwand fuer ein Ein-Personen-Hobby-Projekt. Welle 1a allein hat drei Komponenten (Basisregeln, Audit-Overlay, Persona-Architektur) und ist mit 4-6 Tagen geschaetzt. Stimmt das ungefaehr? Wo sind Stellen, an denen Aufwand unterschaetzt scheint? Gibt es Wellen, die zu fett sind und gesplittet werden sollten?

4. **Persona-Architektur-Klarheit.** Die Resolution-Hierarchie ist: globale Persona > Preset-Persona > Relay-Fallback. Plus: Companion-Sub-Modi (Tutor/Berater/Helfer) wechseln Persona zur Laufzeit. Plus: Worker-Sub-Sessions in Cyber Factory haben eigene Persona. Ist diese Hierarchie eindeutig? Gibt es Konflikt-Faelle, in denen unklar bleibt, welche Persona greift?

5. **Fehlende Stellen.** Was wuerde Claude Code beim Lesen vermissen? Welche offensichtlichen Folge-Fragen bleiben unbeantwortet? Gibt es Schnittstellen zwischen den Phasen (z.B. Refinement → Cyber Factory) die unklar bleiben?

## Was NICHT geprueft werden soll

- *Die Persona-Inhalte selbst.* Cipher, Relay, Wayne, Kyniker, Sokrates, Glitch sind kalibrierte User-Eingaben. Nicht hinterfragen. Stilistische Korrekturen nur, wenn sie eine Inkonsistenz zwischen Personas zeigen.
- *Die Migrations-Strategie (Komplett-Rebuild parallel).* Das ist eine User-Entscheidung gegen Rename-in-place und festgelegt. Nicht erneut diskutieren.
- *Whitepaper-Inhalte.* Das Whitepaper ist Quellen-Material. Wenn Pack-Specs auf Whitepaper-Kapitel verweisen, ist die Referenz Quelle, nicht Behauptung.
- *UI-Detail-Specs.* Bewusst ausserhalb dieses Packs. Wenn eine Spec sagt "UI-Spec folgt nach Welle X", ist das so gewollt.
- *Die sechs Phasen-Trennung selbst.* Ideation Partner / Refinement / Cyber Factory / Testing Assistant / Debugger / Audit ist User-Entscheidung. Nicht reduzieren oder umordnen.

## Artefakte

Lies diese Dateien (Reihenfolge: Index zuerst, dann nach Bedarf):

1. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/00-INDEX.md` — Einstiegspunkt und Strukturuebersicht
2. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/02-base-rules.md` — Globale Basisregeln (Ebene 1)
3. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/03-preset-akzente.md` — Preset-Akzente (Ebene 1)
4. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/04-presets-funktional.md` — Funktionale Prompts pro Preset
5. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/05-cyber-factory.md` — Multi-Session-Architektur
6. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/06-debugger.md` — Bugfixing nach Build-Run
7. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/11-workspace-memory.md` — Workspace-Memory-Integration
8. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/12-migration-rebuild.md` — Wellen-Plan
9. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/16-persona-presets.md` — Persona-Architektur

Optional, falls relevant fuer Leit-Frage: `01-tugenden-mapping.md`, `15-pre-mortem.md`, `14-offene-punkte.md`.

**Nicht** lesen muessen: 07, 08, 09, 10, 13 (Ideation Partner, Refinement Extended, Testing Assistant, Audit, Test-Strategy) — diese sind Detail-Specs, die fuer die Leit-Fragen meist nicht entscheidend sind. Wenn beim Reviewen ein Verweis darauf wichtig wird, dann gezielt nachschauen.

## Format der Rueckmeldung

Strukturierte Markdown-Datei mit Fund-Liste:

```
## Fund N: <Kurztitel>
**Datei:** <pfad>
**Stelle:** <abschnitt oder zeilenrange>
**Schwere:** [hoch | mittel | niedrig]
**Beobachtung:** <was ist auffaellig>
**Empfehlung:** <was wuerdest du aendern oder klaeren>
```

Plus:
- *Executive Summary* (3-5 Saetze) am Anfang
- *Gesamteindruck* (kurz, ehrlich) am Ende — taugt das Pack zur Umsetzung oder fehlt was Substantielles?

Maximum 25 Funde. Wenn mehr im Material zu finden waeren, priorisiere die wichtigsten. Reine Stilkorrekturen weglassen, ausser sie betreffen die Lesbarkeit fuer Claude Code substantiell.

## Wo die Rueckmeldung landen soll

Schreib die Rueckmeldung als Markdown-Datei nach:
`/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/moreismore/cyber-factory-pack/external-review-rueckmeldung-2026-04-30.md`

Oder gib sie direkt zurueck im Antwort-Text — der Main-Agent legt sie dann ab.
