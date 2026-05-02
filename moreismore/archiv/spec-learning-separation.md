# Spec: Learning-Separation — Privates Gedaechtnis vs. Produkt-Wissen

**Status:** Draft
**Datum:** 2026-04-27
**Kontext:** Alle cipher-mux Entities sammeln operationelle Learnings — in privatem Claude-Memory, in Companion-Memory, in Brain-Notizen, in Entity-CLAUDE.md-Dateien. Vieles davon ist allgemeingueltiges Produkt-Wissen, das bei Neuinstallation oder fuer andere User verloren geht. Dieses Dokument definiert die Trennung und den Migrations-Pfad.

---

## Problem

1. **Learnings verschwinden.** Privates Memory lebt unter `~/.claude/projects/.../memory/` — nicht im Repo, nicht shipped, nicht geteilt. Companion-Memory lebt in einer SQLite-DB pro Instanz.
2. **Kein Routing.** Wenn der Orchestrator lernt "Input Requests nach Antwort aufraeumen" oder der Companion lernt "User versteht Fluglotse-Analogie nicht", ist unklar ob das privat oder Produkt ist.
3. **Andere User starten bei Null.** Monate an operationellem Wissen existieren verteilt ueber 5+ Entities, aber wer cipher-mux installiert bekommt nur die initialen CLAUDE.md-Dateien.
4. **Code-Defizite bleiben verdeckt.** Learnings wie "Requests aufraeumen" oder "Session-Start wartet nicht auf Claude" sollten Code sein, werden aber als Memory-Workaround gespeichert.
5. **Jede Entity hat einen eigenen Speicher.** Orchestrator: Claude-Memory. Companion: companion_memory_write. Refinement: brain/-Notes. Audit: Audit-Reports. Es gibt keinen gemeinsamen Rueckkanal ins Produkt.

---

## Design-Entscheidungen

| Entscheidung | Gewaehlt | Alternativen verworfen |
|---|---|---|
| Klassifikation | Zwei-Klassen-System (privat vs. produkt) | Drei Klassen mit "team" (zu frueh), freie Tags (zu unstrukturiert) |
| Produkt-Ziel | Hybrid: Code wenn automatisierbar, Entity-CLAUDE.md wenn Judgment noetig | Nur Code (nicht alles ist automatisierbar), nur Doku (verschenkt Automatisierung) |
| Rueckkanal | moreismore/ als Sammelstelle fuer alle Entities | Pro-Entity-Ordner (fragmentiert), direktes Repo-Editing (zu riskant) |
| Migration | Einmalig + laufend bei jedem neuen Learning | Nur rueckwirkend (vergisst neue), nur vorwaerts (Altbestand bleibt privat) |

---

## Klassifikation: Zwei Klassen

### Klasse 1: Privat (bleibt beim Entity / User)

Alles was **user-spezifisch**, **instanz-spezifisch** oder **session-spezifisch** ist:

- User-Praeferenzen (Sprache, Tonfall, Arbeitsweise)
- User-Rollen und Kontext ("ist Data Scientist", "arbeitet an Projekt X")
- Instanz-spezifische Pfade und Konfiguration
- Persoenliche Feedback-Praeferenzen ("keine Summaries", "Deutsch")
- User-Lernstand und Companion-Beziehung
- Laufende Ideation-Details im Refinement-Brain

### Klasse 2: Produkt (gehoert ins Repo)

Alles was **jeder cipher-mux User und jede Entity-Instanz wissen sollte**:

- Operationelle Protokolle (Worker-Startup, Monitoring, Kill-Checks)
- Architektur-Constraints (Race Conditions, IPC-Timing)
- Automatisierbare Verhaltensregeln (Cleanup, Validierung)
- Best Practices fuer Entity-Interaktion
- Didaktische Erkenntnisse (welche Analogien funktionieren, welche nicht)
- Testing-Patterns (welche Edge Cases treten wiederholt auf)
- Bugreport-Patterns (haeufige Fehlerquellen)

---

## Routing-Regel fuer neue Learnings

Gilt fuer **alle Entities**, nicht nur den Orchestrator.

Bei jedem neuen Learning stellt die Entity diese Frage:

> "Wuerde ein anderer User mit einer frischen cipher-mux-Installation davon profitieren?"

- **Ja** → Produkt-Learning. Zusaetzlich zum eigenen Speicher:
  1. Ist das automatisierbar? → Spec/Issue nach `moreismore/` als Code-Feature
  2. Ist es ein Judgment-Call? → In die Entity-CLAUDE.md im Repo einpflegen (via moreismore/ als Vorschlag)
  3. Ist es ein Workaround fuer einen Bug? → Bugreport nach `moreismore/`
  4. Ist es eine didaktische Erkenntnis? → In die Companion/Refinement-Guides einpflegen
- **Nein** → Nur eigener Speicher, wie bisher.

---

## Learnings pro Entity-Typ

### Orchestrator

| Speicher | Privat-Beispiel | Produkt-Beispiel |
|----------|----------------|-----------------|
| Claude-Memory | "User will absolute Pfade" | "Worker-Startup-Protokoll: Claude manuell starten" |
| | "User triggert manuell, keine Task-Queue" | "Verify git status before kill" |
| | "Android-Projekt unter /Users/Shared/..." | "Input Requests nach Antwort aufraeumen" |

**Produkt-Ziele:**
- Worker-Startup-Protokoll → Entity-CLAUDE.md + Code (mux_create_session wartet auf Claude)
- Verify before Kill → Code (Kill-Guard)
- Input Request Cleanup → Code (Auto-Cleanup)
- Build before Kill → Entity-CLAUDE.md
- Aktive Orchestrierung → Entity-CLAUDE.md

### Companion (Relay)

| Speicher | Privat-Beispiel | Produkt-Beispiel |
|----------|----------------|-----------------|
| companion_memory | "User baut Trading-App" | "Fluglotse-Analogie funktioniert bei Einsteigern nicht gut" |
| | "User findet Theorie langweilig" | "Workspace-Erklaerung braucht immer ein konkretes Setup-Beispiel" |
| | "Letztes Mal bei Guide 03 aufgehoert" | "Bug: Sidebar-Toggle reagiert nicht wenn 0 Sessions" |

**Produkt-Ziele:**
- Didaktische Erkenntnisse → Guides aktualisieren (guides/*.md)
- Analogie-Feedback → Analogie-Liste in CLAUDE.md anpassen
- UX-Bugs → Bugreport-Outbox
- FAQ-Patterns → Neue Guide-Abschnitte oder FAQ-Dokument

### Refinement

| Speicher | Privat-Beispiel | Produkt-Beispiel |
|----------|----------------|-----------------|
| brain/ Notes | "Users Projekt-Vision fuer App X" | "Scope-Knife-Skill muss frueher greifen, User blaehen Scope immer erst in Phase 4 auf" |
| | "User bevorzugt MVP-first" | "Pre-Mortem findet bei Nicht-Codern immer dieselben 3 Risiken" |

**Produkt-Ziele:**
- Skill-Verbesserungen → Skills aktualisieren
- Phasen-Anpassungen → CLAUDE.md Phasenmodell updaten
- Neue Fragemuster → In Phase-3-Frageboegen einpflegen

### Audit (Wayne Szalinski)

| Speicher | Privat-Beispiel | Produkt-Beispiel |
|----------|----------------|-----------------|
| Audit-Reports | "Projekt X hatte SQL-Injection in Zeile 42" | "Electron-Apps: immer nodeIntegration/contextIsolation pruefen" |
| | "User will keinen Formatter-Check" | "IPC-Handler: Input-Validierung wird systematisch vergessen" |

**Produkt-Ziele:**
- Wiederkehrende Findings → Audit-Checkliste erweitern
- Architektur-Patterns → Code-Templates oder Linting-Rules
- Systematische Schwaechen → Bugreport oder Security-Hardening-Spec

### Watchdog (neu, siehe spec-qa-entity.md)

| Speicher | Privat-Beispiel | Produkt-Beispiel |
|----------|----------------|-----------------|
| Regressions-DB | — | "Highlight-Positioning bricht bei Window-Resize" |
| Testberichte | — | "Theme-Persistenz ist ein wiederkehrendes Problem" |

**Produkt-Ziele:**
- Regressions-Patterns → Automatische Tests (E2E)
- Wiederkehrende Testfehler → Code-Fixes oder Architektur-Aenderungen

---

## Rueckkanal: Wie Learnings ins Produkt fliessen

```
Entity lernt etwas
       |
       v
"Profitiert ein anderer User davon?"
       |
   Ja  |  Nein
   v      v
moreismore/   eigener Speicher
   |
   v
Typ bestimmen:
   |
   ├── Automatisierbar? → moreismore/spec-*.md oder moreismore/bug-*.md
   ├── Judgment-Call?    → moreismore/claude-md-update-*.md (Vorschlag fuer Entity-CLAUDE.md)
   ├── Didaktisch?       → moreismore/guide-update-*.md (Vorschlag fuer Companion-Guides)
   └── Bug/Workaround?   → bugreports/outbox/
```

**Wichtig:** Entities schreiben nicht direkt in die Repo-CLAUDE.md oder Guides. Sie legen Vorschlaege in `moreismore/` ab. Der User (oder ein Review-Prozess) entscheidet was davon uebernommen wird. Das ist der gleiche Flow wie bei Feature-Requests.

### Dateiformat fuer Learning-Vorschlaege

```markdown
# Learning: <Kurzbeschreibung>

**Quelle:** <Entity-Name> (<Datum>)
**Typ:** code-feature | claude-md-update | guide-update | bugreport
**Ziel-Entity:** <welche Entity-CLAUDE.md oder welcher Guide>

## Erkenntnis
<Was gelernt wurde>

## Kontext
<Wie es aufgefallen ist>

## Vorgeschlagene Aenderung
<Konkreter Diff oder Textvorschlag>
```

---

## Migration: Bestehende Learnings

### Orchestrator (14 Eintraege)

| Memory | Klasse | Produkt-Ziel |
|--------|--------|-------------|
| User Profile | privat | — |
| Orchestrator Role | produkt | → Entity-CLAUDE.md (orchestrator) |
| Android-Projekt Pfad | privat | — |
| MCP Race Condition | produkt | → Code: mux_create_session wartet auf Ready |
| Aktive Orchestrierung | produkt | → Entity-CLAUDE.md (orchestrator) |
| Worker-Startup-Protokoll | produkt | → Entity-CLAUDE.md + Code |
| Build before Kill | produkt | → Entity-CLAUDE.md (orchestrator) |
| Absolute Pfade | privat | — |
| Verify before Kill | produkt | → Code: Kill-Guard |
| Moreismore Ablage | produkt | → Contributing Guide |
| Feature-Request Routing | produkt | → Contributing Guide |
| Keine Task-Queue | privat | — |
| Always Self-Improve | produkt | → Entity-CLAUDE.md (alle Entities) |
| Input Requests Cleanup | produkt | → Code: Auto-Cleanup |

**Ergebnis:** 9 produkt, 5 privat.

### Companion (zu inventarisieren)

Companion-Memory durchgehen via `companion_memory_search`. Didaktische Erkenntnisse und UX-Bugs extrahieren.

### Refinement (zu inventarisieren)

Brain-Notes und Skill-Erfahrungen durchgehen. Prozess-Verbesserungen extrahieren.

### Audit (zu inventarisieren)

Bestehende Audit-Reports auf wiederkehrende Patterns pruefen.

---

## Implementierungs-Reihenfolge

### Phase 1: Sofort (kein Code noetig)

1. Routing-Regel in ALLE Entity-CLAUDE.md-Dateien einpflegen (einheitlicher Abschnitt "Learning-Routing")
2. Orchestrator-Produkt-Learnings in die Repo-CLAUDE.md migrieren
3. "Always Self-Improve" + Routing-Regel als Standard-Verhalten fuer alle Entities definieren

### Phase 2: Inventarisierung

4. Companion-Memory durchgehen — didaktische Learnings extrahieren
5. Refinement brain/ durchgehen — Prozess-Learnings extrahieren
6. Audit-Reports durchgehen — Pattern-Learnings extrahieren
7. Produkt-Learnings als moreismore/-Vorschlaege ablegen

### Phase 3: Code-Features (je eigene Spec)

8. **Auto-Cleanup Input Requests** — nach Auswertung automatisch entfernen
9. **Session-Ready-Wait** — mux_create_session Option `waitForReady: true`
10. **Kill-Guard** — git status/log vor Kill pruefen
11. **Learning-Vorschlag-Tool** — MCP-Tool `mux_learning_suggest` das Learnings direkt nach moreismore/ schreibt (alle Entities koennen es nutzen)

### Phase 4: Laufend

12. Jedes neue Learning durchlaeuft die Routing-Regel
13. Regelmaessiger Review der moreismore/-Vorschlaege (manuell oder Refinement-Session)

---

## Abgrenzung

**In Scope:**
- Klassifikation fuer alle Entity-Typen (Orchestrator, Companion, Refinement, Audit, Watchdog)
- Routing-Regel und Rueckkanal-Design
- Migration bestehender Learnings
- Learning-Vorschlag-Format

**Out of Scope:**
- Cross-User Memory-Sharing (kein User-Tracking in V1)
- Automatische Klassifikation durch LLM (manuelles Routing reicht)
- Companion-Memory-Architektur aendern (eigenes System, funktioniert)
- MPO-Learnings (MPO hat aktuell kein persistentes Memory — spaeter)
