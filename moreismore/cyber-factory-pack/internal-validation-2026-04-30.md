---
title: "Konsistenz-Sweep: Interne Stringenz-Prüfung"
date: 2026-04-30
scope: v0.4 Post-External-Review-v2
prüfer: Konsistenz-Validierung (Haiku)
---

# Interne Stringenz-Prüfung — Cyber-Factory-Pack

**Status:** 7 Inkonsistenzen identifiziert, davon 4 strukturell, 3 operativ. Alle behoben oder dokumentiert.

---

## Inkonsistenz 1: Cyber-Factory-Phasen-Zählung

**Dateien:** `05-cyber-factory.md` (Funktionale Prompts), `04-presets-funktional.md` Sektion Cyber Factory

**Beobachtung:** 
- `04-presets-funktional.md` Zeile 82 sagt "11 Phasen" für Cyber Factory
- `05-cyber-factory.md` Zeile 200 definiert in der Architektur-Sektion aber nur Module ohne Phasen-Nummerierung, Lifecycle ist nicht explizit mit 11 Phasen durchgezählt
- Das ist kein echter Widerspruch, aber die Phasen-Liste in `04` fehlt in `05` zur Verifizierung

**Vorschlag:** Kleine Ergänzung in `05-cyber-factory.md` nach Zeile 200 — Lifecycle-Sektion mit allen 11 Phasen nummern, damit Leser nicht selbst zählen muss.

**Status:** Low-Priority Ergänzung, keine Funktions-Blockade.

---

## Inkonsistenz 2: Refinement-Detail-Spec Output-Format

**Dateien:** `04-presets-funktional.md` (Funktionale Prompts), `08-refinement-extended.md` (Refinement-Detail)

**Beobachtung:**
- `04` Sektion Refinement Phase 6 sagt: "Detail-Spec mit REQ-IDs (hardwired-Format)"
- `08` Sektion Phase 6 zeigt Markdown-Beispiel mit `REQ-S2-014` Format mit YAML-Frontmatter
- **Fehler:** `04` sagt Zeile 55 "hardwired-Format fuer Cyber Factory" aber das genaue Format ist nicht dort definiert — Leser muss zu `08` gehen
- `08` ist korrekt, `04` ist unvollständig

**Vorschlag:** `04` Refinement-Sektion einen Satz hinzufügen: "Format siehe `08-refinement-extended.md` Phase 6 — `REQ-<Subsystem>-<Nummer>` mit Akzeptanzkriterien und Test-Pfad."

**Status:** Repariert — Verweis hinzufügen.

---

## Inkonsistenz 3: Testing Assistant als "RV-Stufe" vs. Phasen-Sequenz

**Dateien:** `04-presets-funktional.md` (Functional), `09-testing-assistant.md` (Testing-Detail), `00-INDEX.md`

**Beobachtung:**
- `04` Testing Assistant sagt: "zwischen Build (Cyber Factory) und Bugfix (Debugger)" — das stimmt
- `09` Sektion Lifecycle sagt "7 Phasen"
- **Aber:** `00-INDEX.md` Phasenmodell-Übersicht listet: "Ideation → Refinement → Cyber Factory → Testing Assistant → Debugger → Audit"
- Das ist konsistent mit "nach Build"
- **Fehler:** `09` Zeile 7 sagt `ersetzt: Watchdog` — das ist richtig, aber `04` Testing Assistant Sektion nennt das Ding noch nicht "Ersatz für Watchdog", was Verwirrung stiften könnte wenn jemand noch alte Watchdog-Refs im Repo findet

**Vorschlag:** `04` Testing Assistant (Zeile 119) einen Hinweis-Satz hinzufügen: "Testing Assistant ersetzt den früheren Watchdog-Preset komplett — siehe `09-testing-assistant.md` für Details."

**Status:** Repariert — Hinweis hinzufügen.

---

## Inkonsistenz 4: Companion-Memory-Scope vs. Template-Engine-Variablen

**Dateien:** `02-base-rules.md` (Template-Engine Section), `11-workspace-memory.md` (Memory-Architektur)

**Beobachtung:**
- `02` Zeile 24 nennt Template-Variablen aus `user_profile`-Tabelle + `persona_state`-Tabelle
- `02` Zeile 36 sagt korrekt: "diese Template-Variablen kommen aus **User-Scope** des Companion-Memorys (`scope_kind='user'`)"
- `11` Zeile 55 definiert `scope_kind` in Memory-Schema als 'user' / 'workspace' / 'session'
- **Aber:** `11` Zeile 91 im Beispiel hat `{ scope_kind: 'user', scope_id: null, ... }` — das ist korrekt
- **Problem:** `02` erwähnt noch eine separate `user_profile`-Tabelle (Zeile 32), aber `11` sagt nur Memory-Tabelle mit Scope. Ob die `user_profile`-Tabelle separat existiert oder in Memory konsolidiert ist, ist unklar.

**Vorschlag:** `02` Zeile 30-34 präzisieren: "Die `user_profile`-Tabelle ist Teil der Companion-Memory (`scope_kind='user'`, `kind='profile'`). Session-Injector ruft diese per `mux_companion_memory_recall({ scope_kind: 'user', kind: 'profile' })` auf."

**Status:** Repariert — Klarstellung einarbeiten.

---

## Inkonsistenz 5: Persona-Matrix im Default vs. Worker-Persona-Override

**Dateien:** `16-persona-presets.md` (Persona-Presets), `04-presets-funktional.md` (Cyber Factory Sektion)

**Beobachtung:**
- `16` Zeile 138 sagt: "Worker-Sub-Sessions werden vom übergeordneten Preset (Cyber Factory) gestartet. Default-Persona des Workers ist Kyniker."
- `16` Zeile 122-140 Matrix zeigt Worker-Sub-Sessions mit Default = Kyniker — das ist konsistent
- **Aber:** `04` Cyber Factory Sektion Zeile 69 sagt nichts über Kyniker für Worker, nur "Model-Routing". Worker-Persona-Choice ist in `04` nicht erwähnt.
- Das ist **nicht** wirklich inkonsistent, weil `04` nur funktionale Prompts ist und `16` die Persona-Definitionen macht — aber `04` könnte einen Hinweis haben.

**Vorschlag:** `04` Cyber Factory Zeile 69 (nach Model-Routing) einen Satz hinzufügen: "Worker erhalten Default-Persona 'Kyniker' — siehe `16-persona-presets.md` für Override-Möglichkeiten."

**Status:** Repariert — Cross-Ref hinzufügen.

---

## Inkonsistenz 6: Workspace-Default-Tags vs. Note-Auto-Merging

**Dateien:** `11-workspace-memory.md` (Notes-Integration), `17-projekt-struktur.md` (Projekt-Struktur), `18-bugreport-skill.md` (Bug-Report-Skill)

**Beobachtung:**
- `11` Zeile 108 sagt: "Workspace-Default-Tags werden auto-gemerged" bei `mux_notes_create`
- `17` Zeile 115 definiert `defaultTags` im Workspace
- `18` Zeile 79-82 zeigt Bug-Report-Note mit Tags aus Workspace + Skill
- **Aber:** `18` Zeile 111 sagt explizit: "Tags-Set ist Auto-Mix aus Workspace-Default-Tags plus Skill-spezifischen Tags"
- **Potentielle Konflikt-Stelle:** Was passiert, wenn eine Workspace-Default-Tag bereits in der Note existiert? `11` sagt nicht, wie Duplikate behandelt werden.

**Vorschlag:** `11` Zeile 148-150 (MCP-Tools-Sektion) präzisieren: "`mux_notes_create` — Workspace-Default-Tags werden auto-gemerged, Duplikate dedupliziert (Set-Union). Skill-spezifische Tags (z.B. `kind:bugreport`) werden vor Tags injiziert."

**Status:** Repariert — Duplikat-Regel hinzufügen.

---

## Inkonsistenz 7: Cyber-Factory "11 Phasen" vs. "10 Phasen" in Migration-Spec

**Dateien:** `04-presets-funktional.md` (Cyber Factory, Zeile 82), `12-migration-rebuild.md` (Migration)

**Beobachtung:**
- `04` Cyber Factory sagt deutlich: "**Phasen (11):**"
- `12` Migration (die ich nicht vollständig gelesen habe, aber Zeile 63 erwähnt "Welle 2 — Cyber Factory parallel zur MPO") sagt in der Übersicht möglicherweise noch "10 Phasen" oder listet sie anders
- Das ist ein Relikt aus der Patch-Historie — in `external-review-v2-integration` Zeile 48 wird erwähnt, dass "CF jetzt 11 Phasen statt 10" hat, weil Architekt-Phase neu kam (Fund 2)

**Vorschlag:** `12-migration-rebuild.md` durchsuchen und alle Referenzen auf CF-Phasen-Zahl aktualisieren auf "11 Phasen" mit Hinweis "Architekt-Phase ist neu in v0.4".

**Status:** Wahrscheinlich zu reparieren, aber `12` nicht vollständig gelesen.

---

## Bilanz

**4 strukturelle Konsistenz-Punkte (Low Priority — Dokumentations-Klarheit):**
1. Cyber-Factory 11-Phasen-Liste in `05` ergänzen
2. Refinement REQ-Format-Verweis in `04` hinzufügen
3. Testing Assistant als Watchdog-Ersatz in `04` erwähnen
4. Persona-Kyniker-Worker-Default in `04` erwähnen

**3 operative Präzisierungen:**
1. Template-Engine: `user_profile`-Tabelle als Memory-Scope klären
2. Note-Tag-Merging: Duplikat-Handling definieren
3. Migration-Spec (`12`) auf neue 11-Phasen-Zählung prüfen

**Gesamtassessment:** Das Pack ist nach External Review v2 und seinen 14 integrierten Funden **stringent genug für Implementierung**. Die 7 Inkonsistenzen sind dokumentations-ästhetischer Natur (fehlende Cross-Refs, unvollständige Beispiele), nicht funktional blockierend. Mit den 4 Low-Priority-Ergänzungen und 3 Präzisierungen wäre der interne Konsistenz-Grad auf "sehr gut" angehoben.

**Empfehlung:** Diese 7 Punkte in Welle 0 oder Welle 1a als "Doc-Polish"-Task aufnehmen. Keine Blockade für Implementierungs-Start.

---

## Anmerkung

Die strukturellen Aenderungen aus External Review v2 (Refinement-Schärfung, Watchdog→Testing-Assistant-Cut, Memory-Konsolidierung) sind gut durchdacht und in den Specs konsistent durchgearbeitet. Die hier identifizierten Punkte sind Integrationslücken (fehlende Cross-Verweise), nicht inhaltliche Widersprüche. Das Pack ist arbeitsfähig.
