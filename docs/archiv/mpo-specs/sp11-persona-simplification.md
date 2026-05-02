# SP-11: Persona-Simplification — Detail-Spec

> MPO Sub-Projekt 11 | Wave 3 | Aufwand: ~1d
> Betrifft: WorkspaceManager, persona-skill-sync, PersonasTab, WorkspacePopup, Sidebar, Entity-Templates

---

## Ziel

Per-Workspace-Persona-System entfernen. Ersetzen durch EINE App-weite Companion-Persona mit Charakter-Verwaltung und schoener Edit-Oberflaeche.

## Kontext & Entscheidungen

- **Entscheidung vom 2026-04-25:** Per-Cell/per-Workspace Persona-System ist zu komplex, wird kaum genutzt.
- **Neues Modell:** Eine Persona fuer die gesamte App-Instanz, injiziert in alle Preset-Sessions.
- **Relay = Default-Charakter** fuer Release. Wayne Szalinski = gespeicherter Alternativ-Charakter.
- Persona-Prompt-Drafts liegen bereits unter `docs/mpo-specs/persona-drafts/` (Wave 2 SP-9 Output).

## Was wegfaellt (entfernen)

1. **`PersonasTab.tsx`** — komplette Datei loeschen
2. **`WorkspacePopup.tsx`** — Persona-Felder aus dem Workspace-Popup entfernen
3. **`WorkspacesTab.tsx`** — Persona-Badge/Anzeige pro Cell entfernen
4. **`persona-types.ts`** — per-Workspace Persona-Zuordnung entfernen (Typ vereinfachen)
5. **`workspace-manager.ts`** — `persona`-Feld aus WorkspaceCell entfernen, persona-Assignment-Logik raus
6. **`persona-skill-sync.ts`** — von "pro Workspace ein SKILL.md" auf "ein App-weites SKILL.md fuer den aktiven Charakter" umbauen
7. **Sidebar/WorkspacesWindow** — PersonasTab-Link aus dem Tab-Switcher entfernen

## Was neu kommt

### A1: Charakter-Datenmodell (main)
- `src/main/config/config-store.ts`: Neues Feld `activeCharacterId: string` + `characters: Character[]`
- Character-Interface:
  ```ts
  interface Character {
    id: string           // z.B. 'relay', 'wayne'
    name: string         // Anzeigename
    prompt: string       // Der volle Persona-Prompt-Text
    isDefault: boolean   // Relay = true
    createdAt: string
    updatedAt: string
  }
  ```
- Default-Charakter "Relay" beim ersten Start anlegen (Prompt aus `docs/mpo-specs/persona-drafts/relay-core.md`)
- Wayne als zweiten Charakter anlegen (aus bestehenden Persona-Drafts)

### A2: persona-skill-sync umbauen (main)
- Statt pro Workspace: den **aktiven Charakter** als SKILL.md in alle laufenden Sessions injizieren
- Bei Charakter-Wechsel: alle aktiven Sessions neu-syncen
- IPC-Channel: `persona:switch-character` (renderer → main)
- IPC-Channel: `persona:get-characters` (renderer → main)
- IPC-Channel: `persona:save-character` (renderer → main)

### A3: Charakter-Editor UI (renderer)
- Neuer Tab in WorkspacesWindow (ersetzt PersonasTab): **"Companion"**
- Layout:
  - Linke Spalte: Liste der Charaktere (Name, aktiv-Badge, Delete-Button)
  - Rechte Spalte: Editor fuer den ausgewaehlten Charakter
    - Name-Feld (Input)
    - Prompt-Feld (Textarea, monospace, gross)
    - "Activate"-Button wenn nicht aktiver Charakter
    - "Save"-Button
    - "New Character"-Button in der Liste
- Styling: konsistent mit InfoSettingsView (gleiche Farben, Abstande, Schrift)

### A4: Entity-Template-Injection
- Beim `startEntity()`: den aktiven Charakter-Prompt als Section in CLAUDE.md injizieren
- Format: `## Companion-Persona\n\n<charakter-prompt>`
- Betrifft: `orchestrator-template.ts`, `mpo-template.ts`, `audit-template.ts`, und die Asset-deployed CLAUDE.md Dateien
- Companion/Refinement: Charakter-Prompt als Praefix vor dem Entity-spezifischen Prompt

## Reihenfolge

1. A1 (Datenmodell) → A2 (Sync-Umbau) → A4 (Injection) → A3 (UI)
2. Alte Persona-Dateien erst loeschen NACHDEM neues System funktioniert

## Quality Gate

| # | Kriterium | Pruefung |
|---|---|---|
| Q1 | Alte PersonasTab geloescht | `PersonasTab.tsx` existiert nicht mehr |
| Q2 | Workspace hat kein `persona`-Feld | Keine Persona-Referenz in `WorkspaceCell` |
| Q3 | Charakter-Editor funktional | Neuer Character anlegen, editieren, wechseln |
| Q4 | Aktiver Charakter wird injiziert | `startEntity()` setzt Charakter-Prompt in CLAUDE.md |
| Q5 | Wechsel synct Sessions | `persona:switch-character` aktualisiert alle laufenden Sessions |
| Q6 | Tests passen | `npm run test` — alle bestehenden Tests gruen, ggf. neue fuer Character-Store |
| Q7 | Build sauber | `npm run build` ohne Fehler |
| Q8 | Lint sauber | Keine neuen Lint-Fehler |

## Testcases

1. App starten → Relay ist aktiver Charakter → Companion-Session starten → CLAUDE.md enthaelt Relay-Prompt
2. Wayne aktivieren → alle laufenden Sessions bekommen neuen Prompt
3. Neuen Charakter "Testbot" erstellen → erscheint in Liste → aktivieren → funktioniert
4. Charakter loeschen (nicht-Default) → verschwindet aus Liste → aktiver Charakter wechselt nicht
5. Default-Charakter kann nicht geloescht werden

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- Persona-Drafts: `docs/mpo-specs/persona-drafts/`
- Alte PersonasTab: `src/renderer/components/PersonasTab.tsx`
- persona-skill-sync: `src/main/workspace/persona-skill-sync.ts`
- persona-types: `src/shared/persona-types.ts`
- config-store: `src/main/config/config-store.ts`
