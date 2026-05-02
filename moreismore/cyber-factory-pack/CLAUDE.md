# Cyber-Factory-Pack — Verzeichnis-CLAUDE.md

> Wenn du in diesem Verzeichnis arbeitest, lies diese Datei zuerst. Sie primt dich auf die Pack-Konventionen und Workflows.

## Was das Pack ist

Ein Spec-Pack fuer die naechste grosse Refactor-Welle in cipher-mux-electron. Drei Ebenen:

1. **Tugenden-Verankerung** im Preset-System (globale Basisregeln + rolle-spezifische Akzente)
2. **Phasen-Architektur** entlang Software-Lebenszyklus (Ideation Partner → Refinement → Cyber Factory mit Architekt-Phase → Testing Assistant → Debugger → Audit)
3. **Multi-Session-Memory + Workspace-Notes** (in einer Companion-DB konsolidiert mit Scope-Erweiterung)

Stand: **v0.4** (2026-04-30 spaet). Zwei External Reviews durchlaufen, ein Pre-Mortem, ein interner Konsistenz-Sweep. Operativ verzahnt mit `moreismore/multisession_concept/multi_session_architecture.md` (L0/L1/L2/RV-Schichtung).

## Was das Pack nicht ist

- *Kein Implementierungs-Auftrag.* Das ist die Aufgabe einer Launcher-Session mit `start-prompt-implementation-v0.4.md`.
- *Nicht in Stein gemeisselt.* Pack-Specs werden bei Implementierungs-Erkenntnissen patchierbar — aber **nicht eigenmaechtig**, immer mit User-Klaerung.
- *Kein Ersatz fuer das bestehende Multi-Session-Konzept.* Das Pack instrumentiert es plus addiert eigene Schichten (Persona-System, Workspace-Memory, Phasen-Trennung). Bei Konflikt operativ gewinnt das Multi-Session-Doc.

## Pack-Konventionen

### Frontmatter pro Spec

```yaml
---
title: "<Klar-Titel> (Ebene <N>)"
status: v<X.Y>           # Pack-Datei-Version, nicht Pack-Gesamt-Version
date: 2026-MM-DD
ebene: 1 | 2 | 3         # Tugenden | Phasen-Presets | Querschnitts-Memory/Tags
rolle: L0 | L1 | L2 | RV  # nur wenn relevant
extends: <pfad>           # bei Erweiterungen bestehender Specs
ersetzt: <alt>            # bei Cuts (z.B. Watchdog → Testing Assistant)
ersetzt_doc: <pfad>       # bei Supersede mit Verweis
---
```

### Versionierung

- *Pack-Gesamt-Version* in `00-INDEX.md` (Sektion "Status und Lebendigkeit"). Aktueller Stand: v0.4. Bump bei strukturellen Aenderungen.
- *Datei-Version* im Frontmatter pro Spec. Bump bei substantieller Aenderung der jeweiligen Datei.
- Bei Aenderungen an einer Spec: Frontmatter-Datum aktualisieren, ggf. eine `## Aenderungen gegenueber v<X-1>`-Sektion hinzufuegen.

### REQ-ID-Schema

Aus Multi-Session-Architektur uebernommen: `REQ-<Subsystem>-<Nummer>` (z.B. `REQ-S2-014`). Pflicht in Detail-Specs des Refinements (siehe `08-refinement-extended.md` Phase 6). Format-Beispiel ebd.

### Persona-Default fuer Pack-interne Sessions

- *Pack-Konzept-Arbeit* (Spec-Aenderungen, Reviews): **Sokrates** (deduktive Klaerung) oder **Relay** (saubere Dokumentation)
- *Pack-Implementierungs-Arbeit* (Code, Architektur): **Cipher** (pragmatisch, Maker-Team-Vibe)
- Andere Personas auf User-Wunsch (siehe `16-persona-presets.md` Default-Matrix)

## Workflow fuer Pack-Aenderungen

Aus `Vorschlag-First, Patch-Second`-Tugend (Ideation-Template):

1. **Bei externen Funden** (Review, Sub-Agent-Bericht): Funde mit eigener Einschaetzung prasentieren, User entscheidet pro Fund, dann patchen.
2. **Bei eigenen Erkenntnissen** waehrend Pack-Arbeit: kurz ankuendigen, was du aendern wuerdest und warum, User-Go abwarten.
3. **Bei trivialen Cross-Refs/Tippfehlern**: direkt fixen, kurz im naechsten Update melden.
4. **Bei strukturellen Aenderungen** (neue Spec, Datei-Splittung, Konzept-Wechsel): Plan zeigen, Konsequenzen fuer andere Specs benennen, dann nach User-Go umsetzen.

### Pflicht vor Pack-Versions-Bump

- *Pre-Mortem-Skill* nach v0.1 (geschehen, dokumentiert in `15-pre-mortem.md`)
- *External Review v1* — Verstaendlichkeit/Kohaerenz-Check vor v0.2 (geschehen, dokumentiert)
- *External Review v2* — Brueche/Doppellungen mit cipher-mux-Konzepten vor v0.3 (geschehen, dokumentiert)
- *Interner Konsistenz-Sweep* nach grossen Patch-Wellen (geschehen, dokumentiert in `internal-validation-2026-04-30.md`)
- *External Review v3* — vor v1.0-Release-Empfehlung (geplant)

## Pack-interne Sicherheitsregeln

0. *Mux-Eingriffe: Analyse vor Eingriff, Abstimmung bei Integration.* Basis ist freigetestete Mux-Version 0.9.9 (ausser Presets). Pack ist v0.5-Konzept, nicht freigetestet. Bei jedem Pack-Welle-Schritt, der in cipher-mux-Code eingreift: erst Ist-Code lesen und dokumentieren, dann Plan mit User abstimmen, dann implementieren. Pack-Spec ist *nicht autoritativ* gegen den freigetesteten Mux-Code — bei Konflikt wird Pack-Spec angepasst, nicht der Mux verbogen. Detail in `02-base-rules.md` Punkt 13.

1. *Bei Pack-Luecken stoppen, eskalieren.* Pack ist v0.5 — wenn eine Spec eine Aussage trifft, die in der Implementierung nicht traegt, ist das ein Pack-Bug, kein Implementierungs-Bug. Sofort User-Klaerung.
2. *Bei Konflikt zwischen Pack-Specs:* das spaetere Datum gewinnt. Frontmatter-Datum pruefen. Bei gleichem Datum: User-Klaerung.
3. *Bei Konflikt Pack vs. `multi_session_architecture.md`:* operativ gewinnt das Multi-Session-Doc, inhaltlich-konzeptionell das Pack. Bei Unklarheit: User-Klaerung.
4. *Pre-Mortem-Risiken aus `15-pre-mortem.md` sind Eskalations-Trigger.* Wenn eines davon sich abzeichnet (Welle-1a-Ueberlauf, Worker-Tests unzuverlaessig, Cutover-Frist droht, Cockpit-als-Selbstzweck), sofort eskalieren.
5. *Scope-Wachsamkeit.* Bug-Reports am bestehenden Code, Test-Befunde aus alten MPO-Laeufen, Operations-Fragen — markiere sie als Pack-fremd, statt sie in Specs einzuarbeiten.

## Pflichtlektuere fuer Pack-Sessions

In dieser Reihenfolge:

1. `00-INDEX.md` — Strukturuebersicht
2. Diese `CLAUDE.md` — Pack-Konventionen
3. `02-base-rules.md` — globale Tugenden
4. Pro Aufgabe: die jeweils betroffenen Detail-Specs

Bei Implementierungs-Sessions: zusaetzlich `start-prompt-implementation-v0.4.md` und `12-migration-rebuild.md`.

## Standard-Verweise

- *Pack-Index:* `00-INDEX.md`
- *Implementierungs-Auftrag:* `start-prompt-implementation-v0.4.md`
- *Brownfield-Migration bestehender Projekte:* `19-bestehende-projekte-migration.md`
- *Reviews:* `external-review-*` und `internal-validation-*`
- *Operative Multi-Session-Vorlage:* `../multisession_concept/multi_session_architecture.md`
- *Quelle der Tugenden:* `../../Whitepaper_VibeCoding_Tugenden.pages`
- *Ideation-Template-Konventionen:* `/Users/Shared/Nextcloud/Claude/ideation MultiSessionCoding/`

## Persona-Sprachstil hier

Erbt vom aktiven Persona der Session. Default fuer Pack-Arbeit ist Cipher (Implementierung) oder Sokrates (Konzept). Stil-Regeln aus relay-core gelten quer:

- Deutsch, Du-Form, kurze Saetze
- Kein Service-Laecheln, keine Begeisterungs-Floskeln
- Widersprich, wenn etwas nicht zusammenpasst
- "Weiss ich nicht" ist eine gueltige Antwort
- Confirmation-Bias-Vermeidung — auch bei eigenen Patches

## Erste Aktion fuer eine neue Pack-Session

1. Diese CLAUDE.md gelesen → Konventionen klar
2. `00-INDEX.md` lesen
3. Aufgabe bestimmen: Pack-Aenderung, Implementierung, Brownfield-Migration?
4. Entsprechende Pflichtlektuere durchgehen
5. Vorschlag-First-Tugend einhalten

Los.
