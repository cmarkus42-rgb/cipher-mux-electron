# SP-3: Entity Framework + Visual Highlighting — Detail-Spec

> MPO Sub-Projekt 3 | Wave 2 | Aufwand: ~1.75d
> Plan-Phasen: 3a, 5a | Tickets: ZETVTX, 1QW09A, YG4ZD7, D6HWB7

---

## Ziel

Generalisiertes Entity-System fuer Funktions-Sessions. Companion + Refinement als neue direkt startbare Entities. Entity-spezifische Farben/Badges. Handoff-Auto-Read.

## Vorbereitung

**LIES ZUERST:**
1. `CLAUDE.md` im Repo-Root
2. `src/main/session/session-manager.ts` — wie Orchestrator/MPO aktuell gestartet werden (startOrchestrator, startMpo)
3. `src/renderer/components/StatusBar.tsx` — wie Entity-Buttons gerendert werden
4. `src/renderer/components/LauncherCell.tsx` — Linkliste fuer direkt startbare Sessions
5. `src/renderer/components/PaneHeader.tsx` — Entity-spezifisches Styling
6. `the how-to-session/CLAUDE.md` — Companion-Persona + Guides-Verzeichnisstruktur
7. `the refinement session/CLAUDE.md` — Refinement-Persona + Skills-Verzeichnisstruktur
8. `src/renderer/i18n.ts` + `src/renderer/locales/en.json` — i18n-Setup (alle neuen Strings i18n-konform!)

## Funktionale Anforderungen

### Entity Framework (Kern)

#### FR-1: EntityConfig Interface
```typescript
interface EntityConfig {
  id: string                    // 'orchestrator' | 'mpo' | 'launcher' | 'companion' | 'refinement'
  displayName: string           // 'Orchestrator' | 'MPO' | 'Coding Companion' | 'Refinement'
  icon?: string                 // Emoji oder Icon-Key fuer StatusBar/Sidebar
  color: string                 // CSS-Farbe fuer PaneHeader-Highlighting + Badge
  projectPath: string           // Arbeitsverzeichnis der Entity
  templatePath?: string         // Pfad zu CLAUDE.md + Assets
  startupGreeting?: string      // Pre-filled Greeting Message
  features: string[]            // Enabled Features: ['mcp', 'resume', 'memory', ...]
  visible?: boolean             // In Grid sichtbar (default true, false = background)
  autoResume?: boolean          // --resume beim Start (default true fuer Entities)
}
```

#### FR-2: Entity-Registry
`src/main/session/entity-registry.ts`:
```typescript
class EntityRegistry {
  register(config: EntityConfig): void
  get(entityId: string): EntityConfig | undefined
  list(): EntityConfig[]
  getBySessionId(sessionId: string): EntityConfig | undefined
}
```
- Builtin-Entities bei App-Start registrieren:
  - **Orchestrator:** Bestehende Config migrieren
  - **MPO:** Bestehende Config migrieren
  - **Launcher:** Bestehende Config migrieren
  - **Companion (NEU):** projectPath = `~/.config/cipher-mux/entities/companion/`, displayName = "Coding Companion"
  - **Refinement (NEU):** projectPath = `~/.config/cipher-mux/entities/refinement/`, displayName = "Refinement"

#### FR-3: SessionManager.startEntity()
Generalisierte Methode die bestehende `startOrchestrator()` und `startMpo()` ersetzt:
```typescript
async startEntity(entityId: string, opts?: Partial<StartSessionOpts>): Promise<Session>
```
- Liest EntityConfig aus Registry
- Erstellt Session mit Entity-spezifischen Defaults (projectPath, resume, visible, etc.)
- Setzt Entity-Referenz auf Session (session.entityId = entityId)
- Bestehende startOrchestrator/startMpo koennen als Wrapper bleiben oder migriert werden

#### FR-4: Entity-Assets deployen
Beim ersten Start (oder wenn fehlend):
- **Companion:** `the how-to-session/CLAUDE.md` + `guides/` + `ref/` → `~/.config/cipher-mux/entities/companion/`
- **Refinement:** `the refinement session/CLAUDE.md` + `skills/` + `brain/` → `~/.config/cipher-mux/entities/refinement/`
- Nicht ueberschreiben wenn User Aenderungen gemacht hat (Timestamp-Check oder .user-modified Marker)

### UI-Integration

#### FR-5: Linkliste + StatusBar
- **LauncherCell:** Companion + Refinement als neue Eintraege in der Linkliste (gleichrangig mit Orchestrator/MPO)
- **StatusBar:** Entity-Buttons fuer Companion + Refinement (neben bestehenden)
- Click → `sessionManager.startEntity('companion')` / `sessionManager.startEntity('refinement')`
- i18n-Keys fuer Button-Labels

#### FR-6: Entity-spezifische PaneHeader-Farben
- Jede Entity bekommt eine eigene Farbe (aus EntityConfig.color)
- PaneHeader: Farbiger Rand oder Badge neben dem Session-Namen
- Generalisieren: ALLE Entity-Sessions (inkl. bestehendem Orchestrator/MPO) bekommen Entity-Styling
- MPO bekommt gleichen Highlight-Style wie Orchestrator (Ticket D6HWB7)

#### FR-7: Companion-Spezifika
- Rename: "Coding Companion" ueberall im UI
- Pre-filled Greeting: "Hey, kannst du mir was erklaeren?" (aus EntityConfig.startupGreeting)
- CLAUDE.md der Companion-Session referenziert Guides + Refs

#### FR-8: Refinement-Spezifika
- CLAUDE.md + Skills + Brain aus `the refinement session/` integriert
- Startup-Greeting aus User-Profil (wie in Refinement-CLAUDE.md definiert)

### Handoff-Integration

#### FR-9: Auto-Read Handoff-Notes beim Entity-Start
- Wenn eine Entity-Session startet, prueft sie auf pending Handoff-Notes:
  - `NoteManager.search()` mit Tag-Filter `handoff` + `to_entity` match
  - Oder Handoff-Search MCP-Tool aufrufen
- Gefundene Handoff-Notes werden als initialer Kontext in die Session injiziert (via tmux send-keys nach dem Greeting)
- Nach Verarbeitung: Handoff-Note als `consumed` taggen (via mux_notes_update)

#### FR-10: Recovery-Support
- Entity-Sessions koennen nach Crash/Restart wiederhergestellt werden
- SessionManager speichert entityId pro Session
- Bei Recovery: Entity-Config aus Registry laden, Session mit passenden Parametern neu starten

## Abgrenzung

- Kein Voice Relay Entity (SP-7, Wave 3)
- Keine Persona-Prompt-Optimierung (SP-9 macht das separat)
- Kein Memory-Tab in Sidebar (SP-4 macht das)

## Meta-Requirements

- **i18n:** ALLE neuen UI-Strings via t(). Keys zu en.json + de.json.
- **Migration:** Bestehende Orchestrator/MPO-Logik NICHT brechen. startEntity() als Generalisierung, alte Methoden koennen als Wrapper bleiben.
- **Kompatibilitaet:** SP-4 baut auf EntityConfig auf (Memory-Tab braucht Entity-System). SP-5 baut auf startEntity() auf (Resume/Fork).
- **Asset-Deployment:** Defensiv — nie User-Dateien ueberschreiben.

## Quality Gate

### Testcases

| # | Test | Erwartetes Ergebnis |
|---|---|---|
| T1 | EntityRegistry.register() + get() | Config gespeichert und abrufbar |
| T2 | EntityRegistry.list() | Alle 5 Builtin-Entities |
| T3 | startEntity('companion') | Companion-Session startet mit korrektem projectPath |
| T4 | startEntity('refinement') | Refinement-Session startet |
| T5 | startEntity('orchestrator') | Bestehende Funktionalitaet intakt |
| T6 | Companion-Button in StatusBar | Button sichtbar, klickbar |
| T7 | Companion in LauncherCell-Linkliste | Eintrag sichtbar, klickbar |
| T8 | PaneHeader mit Entity-Farbe | Farbiger Rand/Badge sichtbar |
| T9 | Entity-Assets bei erstem Start deployen | CLAUDE.md + Guides/Skills kopiert |
| T10 | Entity-Assets nicht ueberschreiben | User-Aenderungen bleiben erhalten |
| T11 | Handoff-Note Auto-Read beim Start | Pending Handoff wird geladen + consumed |
| T12 | Recovery: Entity-Session wiederherstellen | Session mit Entity-Config neu gestartet |
| T13 | npm run build | Erfolgreich |

### Code-Qualitaet
- `npm run lint` ohne neue Errors
- `npm run test` gruen
- EntityConfig als sauberes Interface exportiert (fuer SP-4, SP-5)
- Kein Breaking Change an bestehender Orchestrator/MPO-Funktionalitaet

### Dokumentation
- CHANGELOG.md aktualisieren
- docs/todo.md aktualisieren
- JSDoc auf EntityConfig, EntityRegistry, startEntity()

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- SessionManager: `src/main/session/session-manager.ts`
- StatusBar: `src/renderer/components/StatusBar.tsx`
- LauncherCell: `src/renderer/components/LauncherCell.tsx`
- PaneHeader: `src/renderer/components/PaneHeader.tsx`
- Companion Assets: `the how-to-session/`
- Refinement Assets: `the refinement session/`
- i18n: `src/renderer/i18n.ts`, `src/renderer/locales/en.json`, `src/renderer/locales/de.json`
