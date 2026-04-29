---
title: "FEATURE: Notes-Verwaltungssystem mit Tag-Hierarchie"
tags:
  - feature-request
  - open
  - notes
  - ui
scope: global
---

# Notes-Verwaltungssystem

## Ueberblick

Die Notes brauchen eine Verwaltungs-UI, die mit hunderten Eintraegen skaliert. Aktuell gibt es nur eine flache Liste. Ziel: hierarchische Tag-basierte Navigation + Volltextsuche.

## Kernkonzept: Slash-Tags als virtuelles Ordnersystem

Tags werden hierarchisch via Slash-Notation: `bugs/ui/grid`, `status/open`, `prompts/orchestrator`.

Die UI rendert das als aufklappbaren Baum (links), gefilterte Liste (rechts).

### Beispiel-Baum

```
▼ bugs
  ▼ ui
      grid (3)
      notes-editor (1)
    mcp (2)
▼ features
    demo-mode (4)
▼ status
    open (12)
    done (8)
▼ prompts
    orchestrator (3)
```

## Tag-Verwaltung

- Eigene UI zum Verwalten der Tag-Hierarchie
- Festlegen auf welchem Level welches Tag sein soll
- LLM-gestuetzte Reorganisation wenn zu viele Tags entstehen (Auto-Vorschlaege fuer Umstrukturierung, Zusammenfuehrung, Aufteilung)

## Drei Textlevel pro Note in der Liste

| Level | Inhalt | Sichtbarkeit |
|---|---|---|
| Titel | Fett, immer sichtbar | Immer |
| Tags | Kleine Chips unter dem Titel | Immer (kompakt) |
| Preview | Erste Zeile des Body, grau | Hover oder erweiterter Modus |

## Interaktion

- Baumnavigation links filtert die Liste
- Suchfeld oben: FlexSearch ueber Titel, Tags, Body
- Einfacher Klick: Note auswaehlen / Preview
- Doppelklick: Note im Editor oeffnen
- Mehrfachselektion fuer Bulk-Tagging, Bulk-Delete

## Technische Basis

- **Files bleiben MD mit YAML-Frontmatter** (kein DB-Lock-in)
- **FlexSearch** (MIT, ~12k Stars) fuer Volltextsuche im Browser
- **Tag-Index** wird beim Start aus den Frontmatter-Daten gebaut
- Alte flache Tags (ohne Slash) landen auf oberster Ebene — abwaertskompatibel

## Abgrenzung

- Editor bleibt CodeMirror 6 (kein Wechsel)
- Dieses Feature betrifft nur die Verwaltungs-/Navigationsschicht

## Gemeldet

- Von: Christian via Companion Session
- Datum: 2026-04-28
