---
name: decide
description: "Erstellt Architectural Decision Records (ADRs) für offene Entscheidungspunkte aus docs/SPEC.md (Phase 3). Nutze diesen Skill für jeden offenen Entscheidungspunkt."
---

# Phase 3: Technische Entscheidung treffen

Erstelle einen Architectural Decision Record (ADR) für den nächsten offenen Entscheidungspunkt.

## Vorbereitung

1. Lies `docs/SPEC.md` Abschnitt 6 "Offene Entscheidungspunkte"
2. Identifiziere den nächsten unchecked Punkt (`- [ ]`)
3. Lies relevante ADRs in `docs/decisions/` für Kontext bereits getroffener Entscheidungen

## ADR erstellen

Erstelle `docs/decisions/ADR-NNN-kurztitel.md` mit:

```markdown
# ADR-NNN: [Titel]

**Status:** Vorgeschlagen
**Datum:** [heute]
**Betrifft:** SPEC.md Abschnitt [X]

## Kontext

Warum muss entschieden werden? Welche Rahmenbedingungen gelten?

## Optionen

### Option A: [Name]
- **Vorteile:** ...
- **Nachteile:** ...
- **Risiko:** niedrig/mittel/hoch

### Option B: [Name]
- **Vorteile:** ...
- **Nachteile:** ...
- **Risiko:** niedrig/mittel/hoch

### Option C: [Name] (falls relevant)
- ...

## Empfehlung

[Begründete Empfehlung mit Risikobewertung]

## Entscheidung

_Wartet auf Entscheidung des Auftraggebers._

## Konsequenzen

Was folgt aus der Entscheidung für den weiteren Verlauf?
```

## Ablauf

1. Zeige den ADR dem Auftraggeber
2. Warte auf Entscheidung
3. Nach Entscheidung:
   - Status → `Entschieden`
   - Entscheidung eintragen
   - Checkbox in SPEC.md abhaken: `- [ ]` → `- [x]`
   - Kurzform in CLAUDE.md unter "Architekturentscheidungen" eintragen

## Wenn alle Entscheidungen getroffen

Aktualisiere den Status in `CLAUDE.md`:
```
**Phase: 3 → 4 — Task-Dekomposition**
**Nächster Schritt:** `/decompose` starten
```
