# Notes-Editor Integration — Design Spec

**Datum:** 2026-04-25
**Status:** Approved
**Scope:** Minimalistischer Markdown-Editor als dritte Grid-Cell-Option

## Überblick

cipher-mux bekommt eine Notes-Funktion: Markdown-Notizen, Workspace-gebunden mit Global-Default, editierbar in einer eigenen Grid-Zelle mit CodeMirror 6. Auto-Tagging via Ollama/Gemma4 sorgt für organisch wachsende Verschlagwortung.

## 1. Datenmodell & Storage

### Dateistruktur

```
~/.config/cipher-mux/notes/
├── global/
│   ├── todo.md
│   └── links.md
├── workspace-trading-stack/
│   └── strategie.md
├── .index.json          ← Tag-Index, Metadaten-Cache
└── .tags.json           ← Tag-Repository (alle bekannten Tags + Häufigkeit)
```

- **Ablageort:** `~/.config/cipher-mux/notes/`
- **Ordnerstruktur:** `global/` für workspace-unabhängige Notes, `workspace-<id>/` pro Workspace
- **Format:** Markdown-Dateien mit YAML-Frontmatter
- **Index:** `.index.json` wird beim App-Start aus den Dateien gebaut und bei Änderungen aktualisiert. Die `.md`-Dateien sind autoritativ.
- **Tag-Repository:** `.tags.json` enthält alle je vergebenen Tags mit Nutzungshäufigkeit. Dient als kontrolliertes Vokabular für Auto-Tagging.

### Frontmatter

```markdown
---
title: Strategie Q2
tags: [trading, risk]
created: 2026-04-25T10:00:00Z
modified: 2026-04-25T14:30:00Z
---

# Strategie Q2
...
```

- `title`: Display-Name (Fallback: Dateiname ohne Extension)
- `tags`: Manuell gesetzte + Auto-generierte Tags
- `created` / `modified`: ISO-Timestamps

### Automatische Tags (Kontext-Tags)

- Workspace-Name wird zur Laufzeit als impliziter Tag ergänzt (nicht in Frontmatter gespeichert)
- Explizite Tags in Frontmatter sind manuell oder vom Auto-Tagging gesetzt

## 2. Auto-Tagging via Ollama

### Mechanismus

Bei jedem Save (manuell via Cmd+S) wird der Note-Content an Gemma4 geschickt:

1. **Save schreibt sofort** die Datei — kein Blocker
2. **Async Tagging:** Content + Tag-Repository → Ollama → max 5 Tags zurück
3. **Tags werden in Frontmatter geschrieben**, `NOTES_CHANGED` Event an Renderer
4. **Ollama nicht erreichbar:** Kein Fehler, bestehende Tags bleiben

### Ollama-Integration

- Nutzt vorhandenen `OllamaClient` aus `src/main/bugreport/`
- Model: `gemma4:27b`, `keep_alive: -1`
- Endpoint: `http://127.0.0.1:11433`

### Prompt

Der Prompt wird mit Sorgfalt formuliert — nicht technisch-kalt, sondern so dass das Modell die Notiz wirklich versteht und sinnvoll einordnet. Er bekommt das Tag-Repository als Kontext mit, damit Tags konsistent wiederverwendet werden statt jedes Mal neu erfunden. Max 5 Tags pro Note. Neue Tags nur wenn nichts Bestehendes passt.

### Tag-Repository (`.tags.json`)

```json
{
  "tags": {
    "trading": { "count": 12, "description": "Handelsstrategien, Marktanalyse" },
    "infra": { "count": 8, "description": "Infrastruktur, Server, Netzwerk" },
    "risk": { "count": 5, "description": "Risikomanagement, Position Sizing" }
  }
}
```

- Wächst organisch mit jeder Auto-Tagging-Runde
- Neue Tags vom Modell werden automatisch aufgenommen
- Häufigkeit wird bei jedem Tagging aktualisiert
- **Grundstock:** Wird initial mit einem sinnvollen Tag-Set ausgeliefert, das den Cipher-Kosmos abbildet (Trading, Infra, Coding, Projekte, Personas, Research, etc.). Dieses initiale Set wird in der Implementierung kuratiert.

## 3. Editor — CodeMirror 6

### Setup

- **Library:** CodeMirror 6 (`@codemirror/view`, `@codemirror/state`, `@codemirror/lang-markdown`)
- **Font:** Fira Code (bereits im Projekt)
- **Highlighting:** Obsidian-Style Live-Editing — Headings werden groß/fett, Bold/Italic inline gerendert, Links farbig, List-Marker dezent, Code-Blöcke hervorgehoben
- **Kein Preview-Split:** Starkes Highlighting macht separate Preview überflüssig

### Theme-Integration

- CodeMirror Theme wird aus CSS Custom Properties der 10 App-Themes generiert
- `EditorView.theme()` liest `--color-*` Variablen
- Reagiert auf `data-theme`-Wechsel am `<body>`
- ANSI-Farben aus dem Theme für Syntax-Elemente:
  - Headings: Accent-Farbe
  - Links: Blue
  - Code/Inline-Code: Green
  - Bold/Italic: reguläre Textfarbe mit Styling
  - List-Marker: Accent
- **Ziel:** Der Editor sieht aus als wäre er Teil der App gewachsen — gleiche Fonts, gleiche Farben, gleiche Dichte. Kein "embedded Widget"-Gefühl.

### Keyboard-Shortcuts

| Shortcut | Aktion |
|----------|--------|
| `Cmd+B` | Bold |
| `Cmd+I` | Italic |
| `Cmd+K` | Link einfügen |
| `Cmd+S` | Save (sofort + Tagging) |
| `Cmd+N` | Neue Note in aktiver NotesCell |
| `Cmd+W` | Tab schließen |
| `Cmd+Shift+F` | Suche (fokussiert Sidebar-Suchfeld) |

### Auto-Save

- **Debounce:** 2 Sekunden nach letztem Keystroke
- Auto-Save schreibt nur die Datei, löst **kein** Auto-Tagging aus
- Manuelles `Cmd+S` schreibt sofort + triggert Auto-Tagging

### Frontmatter-Handling

- Frontmatter wird im Editor **ausgeblendet** (CodeMirror Decoration/Folding)
- Beim Save wird Frontmatter mitgeschrieben/aktualisiert
- Tags editierbar über Sidebar-UI, nicht im Raw-Frontmatter

## 4. NotesCell — Grid-Zelle

### Aufbau

```
┌──────────────────────────────────────┐
│ ● NOTES   trading-stack    [+] [×]  │  ← PaneHeader (gleiche Höhe wie SessionCell)
├──────────────────────────────────────┤
│ [strategie.md ×] [risk.md ×] [+]    │  ← Tab-Leiste (offene Notes)
├──────────────────────────────────────┤
│                                      │
│  # Strategie Q2                      │
│                                      │
│  Fokus auf **Momentum** und          │  ← CodeMirror 6 Editor
│  **Mean Reversion**                  │
│                                      │
│  - Entry nur bei Konfluenz           │
│  - Max 2% Risk pro Trade             │
│                                      │
└──────────────────────────────────────┘
```

### Verhalten

- **PaneHeader:** Status-Dot + "NOTES" Label + Workspace-Name + Close-Button. Gleiche Höhe und Styling wie SessionCell PaneHeader.
- **Tab-Leiste:** Horizontal scrollbar bei vielen Tabs. Aktiver Tab hervorgehoben. "×" pro Tab zum Schließen. "+" Button erstellt neue Note (Placeholder-Titel, sofort losschreiben, Titel wird aus erster `# Heading`-Zeile abgeleitet).
- **Editor:** CodeMirror 6 Instance, füllt den Rest der Zelle.
- **Leerer Zustand:** Wenn keine Tabs offen sind: dezenter Hinweis "Doppelklick auf eine Note in der Sidebar" oder "+" zum Erstellen.
- **rowSpan:** Unterstützt vertikales Merging wie SessionCells.

### Grid-Integration

- `GridSlot` bekommt neues Feld: `type: 'session' | 'notes'` (Default: `'session'` für Backward-Compat)
- `SessionGrid.tsx` rendert `NotesCell` wenn `slot.type === 'notes'`, sonst `SessionCell`
- `LauncherCell` bekommt dritten Button: `projekt | session | notes`
- Klick auf "notes" öffnet leere NotesCell + Sidebar klappt auf mit Notes-Tab
- **Kein tmux-Backend** — NotesCell ist rein Frontend + IPC zum NoteManager
- **Max eine NotesCell pro aktivem Grid** (Validierung in useGrid)

## 5. Sidebar — Notes-Tab

### Position

Vierter Reiter in der Unified Sidebar: Messages | Sessions | Requests | **Notes**

### Aufbau

```
┌─────────────────────────┐
│ 🔍 Suche...             │  ← Volltextsuche (Titel + Content)
├─────────────────────────┤
│ [global] [workspace-x]  │  ← Scope-Toggle
├─────────────────────────┤
│ #trading  #risk  #infra │  ← Tag-Filter (Chips, Toggle, AND-Logik)
│ #coding   #idea         │
├─────────────────────────┤
│ ▸ strategie.md          │  ← Note-Liste
│   #trading #risk        │
│   vor 2h bearbeitet     │
│                         │
│ ▸ risk-notes.md         │
│   #trading              │
│   gestern               │
│                         │
│ ▸ links.md              │
│   #global #referenz     │
│   vor 3 Tagen           │
└─────────────────────────┘
```

### Interaktion

| Aktion | Ergebnis |
|--------|----------|
| Einzelklick | Selektiert Note, zeigt Tag-Details |
| Doppelklick | Öffnet als Tab in fokussierter NotesCell (erstellt NotesCell falls keine existiert) |
| Drag & Drop | Note auf bestimmte NotesCell ziehen |
| Tag-Chip klicken | Toggle-Filter (AND bei mehreren) |
| Scope-Toggle | Workspace-Notes / Global / Alle |
| Suche | Echtzeit-Filter über Titel + Content |

### Activity-LED

Sidebar-Button zeigt Aktivität für Notes — z.B. wenn Auto-Tagging abgeschlossen wurde (kurzes Aufleuchten).

## 6. Workspace-Integration

### WorkspaceCell Erweiterung

```typescript
interface WorkspaceCell {
  persona: string           // nur für Session-Zellen relevant
  project: string           // nur für Session-Zellen relevant
  prompt: string            // nur für Session-Zellen relevant
  type?: 'session' | 'notes'  // Default: 'session'
}
```

### Grid-Editor (WorkspacesWindow)

- Cell Inspector bekommt Typ-Auswahl: `Session | Notes`
- Notes-Zelle im Editor zeigt eigenes Icon (Dokument-Symbol)
- Persona/Project/Prompt-Felder werden bei Notes-Typ ausgeblendet

### Workspace Apply

1. Grid resizen (wie bisher)
2. `type: 'session'` → Session spawnen (wie bisher)
3. `type: 'notes'` → NotesCell erstellen, Sidebar öffnet Notes-Tab gefiltert auf Workspace

### Constraint

Max eine NotesCell pro Workspace. Validierung im Grid-Editor und bei Apply.

## 7. IPC-Channels

| Channel | Richtung | Zweck |
|---------|----------|-------|
| `NOTES_LIST` | Renderer → Main | Alle Notes laden (optional: Workspace-Filter) |
| `NOTES_READ` | Renderer → Main | Note-Content lesen (Pfad → Content + Frontmatter) |
| `NOTES_SAVE` | Renderer → Main | Note speichern (+ async Auto-Tagging) |
| `NOTES_CREATE` | Renderer → Main | Neue Note anlegen (Workspace-Scope) |
| `NOTES_DELETE` | Renderer → Main | Note löschen |
| `NOTES_TAGS` | Renderer → Main | Tag-Repository abrufen |
| `NOTES_CHANGED` | Main → Renderer | Broadcast bei Änderung (Save, Tagging, externe Änderung) |

## 8. Backend — NoteManager

### Neues Modul: `src/main/notes/`

| Datei | Zweck |
|-------|-------|
| `NoteManager.ts` | CRUD, Dateisystem-Ops, Index-Pflege, IPC-Handler |
| `NoteTagging.ts` | Ollama-Integration, Prompt-Aufbau, Tag-Repository-Pflege |
| `note-types.ts` | Interfaces (NoteInfo, NoteContent, TagRepository) |

### NoteManager Verantwortlichkeiten

- Verzeichnisstruktur anlegen/pflegen
- Notes lesen/schreiben mit Frontmatter-Parsing (gray-matter oder eigener Parser)
- `.index.json` pflegen (Titel, Tags, Pfad, Timestamps)
- `NOTES_CHANGED` Events emittieren
- Workspace-Ordner anlegen bei Bedarf

### NoteTagging Verantwortlichkeiten

- Prompt-Aufbau mit Note-Content + Tag-Repository
- Ollama-Call via `OllamaClient`
- Tag-Repository (`.tags.json`) lesen/aktualisieren
- Fallback bei Ollama-Ausfall: keine Tags, kein Fehler

## 9. Nicht im Scope

- Markdown-Preview (Split/Toggle) — Highlighting reicht
- Ordner-Struktur in Notes — flat list + Tags
- Mehrere NotesCells pro Grid
- Echtzeit-Kollaboration
- Note-Sharing/Export
- Bilder/Attachments in Notes
