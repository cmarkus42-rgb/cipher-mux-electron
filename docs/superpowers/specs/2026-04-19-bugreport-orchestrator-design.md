# Phase 7 — Bugreport-Orchestrator Design

**Datum:** 2026-04-19
**Status:** Approved
**Scope:** Automatische Bug-Bearbeitung für cipher-mux-electron durch den Orchestrator

---

## Zusammenfassung

Der bestehende Orchestrator wird um einen Bugreport-Consumption-Flow erweitert. Wenn ein User einen Bug meldet, wird der Orchestrator per MessageBus benachrichtigt, startet eine Worker-Session im cipher-mux-electron Repo, und Claude debuggt/fixt den Bug auf einem eigenen Branch. Das Ergebnis landet in einer inbox-Datei + Chatroom-Notification. Der User reviewed den Branch und merged manuell.

## Kernanforderung

Bugreports für **cipher-mux-electron selbst** während der Polishing-Phase. Der User testet die App, findet einen Bug, meldet ihn aus der App heraus, und der Orchestrator fixt ihn im selben Repo.

Projektübergreifende Bugreports (andere Projekte) sind eine Erweiterung für später — das Design ist darauf vorbereitet (`projectPath` im Frontmatter), aber Phase 7 fokussiert auf den Self-Fix-Flow.

## Design-Entscheidungen

| Frage | Entscheidung | Begründung |
|-------|-------------|------------|
| Autonomie | Analyse + Branch, kein Push | User behält Kontrolle, Branch ist reversibel |
| Trigger | MCP MessageBus (topic: 'bug') | Infrastruktur existiert, kein Polling/fswatch nötig |
| Projekt-Erkennung | `projectPath` direkt im Frontmatter | App kennt ihr eigenes Repo, kein Lookup nötig |
| Fehlerbehandlung | 1 Retry mit Kontext, dann failed | Konsistent mit ORCHESTRATOR_MAX_RETRIES=2 |
| Debugging | Superpowers (systematic-debugging, TDD) | Skills werden aus Projektverzeichnis geerbt |
| Parallelität | Strikt seriell, Queue-basiert | Ein Repo, parallele Fixes erzeugen Merge-Konflikte |
| Review-Flow | Chatroom-Notification + inbox-File | Live-Kanal + persistente Dokumentation |

## Architektur

### End-to-End Flow

```
1. User meldet Bug       → BugreportDialog → BugreportManager.submit()
2. Outbox + MCP Trigger  → BUG-*.md nach outbox/ + mux_send(topic: 'bug')
3. Orchestrator empfängt → mux_read(topic: 'bug') → liest Bug-ID + projectPath
4. Worker-Session startet → mux_create_session(projectPath) → Branch fix/BUG-xyz
5. Claude debuggt + fixt  → Superpowers → commit auf Branch
6. Ergebnis melden       → mux_bugreport_resolve() → inbox + Chatroom
7. User reviewed          → Branch prüfen → merge → archiv/
```

### Komponenten

#### 1. BugreportManager (erweitern)

Minimaler Eingriff in `submit()`:

- `projectPath` ins Frontmatter schreiben (zusätzlich zum bestehenden `project`)
- Nach outbox-Write: `messageBus.send({ topic: 'bug', sender: 'bugreport-manager', text: JSON.stringify({ bugId, projectPath }) })`
- MessageBus-Referenz über Constructor-Injection

Neues Frontmatter-Format:
```yaml
---
id: BUG-2026-04-19-abc123
status: open
project: cipher-mux-electron
projectPath: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron
created: 2026-04-19T12:00:00.000Z
---
```

#### 2. MCP-Tool `mux_bugreport_resolve` (neu)

Neues Tool in `mcp-tools.ts`:

```typescript
mux_bugreport_resolve({
  bugId:        string,          // "BUG-2026-04-19-abc123"
  status:       "fixed" | "failed",
  summary:      string,          // Was analysiert/geändert wurde
  branchName?:  string,          // "fix/BUG-2026-04-19-abc123" (nur bei fixed)
  filesChanged?: string[]        // Geänderte Dateien (optional)
})
```

Ablauf:
1. Liest `outbox/BUG-{bugId}.md`
2. Erstellt `inbox/BUG-{bugId}.md` mit Original-Report + Ergebnis-Sektion
3. Setzt Frontmatter-Status auf `fixed` oder `failed`
4. Löscht outbox-Datei
5. Sendet Chatroom-Notification via MessageBus (topic: 'chat')
6. Gibt `{ ok: true, inboxPath }` zurück

Inbox-Datei-Format:
```markdown
---
id: BUG-2026-04-19-abc123
status: fixed
project: cipher-mux-electron
projectPath: /path/to/project
created: 2026-04-19T12:00:00.000Z
resolved: 2026-04-19T12:15:00.000Z
branchName: fix/BUG-2026-04-19-abc123
---

## Beschreibung
[Original-Report]

## Diagnostik
[Original-Diagnostik]

## Ergebnis
**Status:** fixed
**Branch:** fix/BUG-2026-04-19-abc123
**Summary:** Off-by-one in tmux-parser.ts Zeile 42...
**Geänderte Dateien:**
- src/main/tmux/tmux-parser.ts
```

#### 3. Orchestrator-Template (erweitern)

Neuer Abschnitt in `generateOrchestratorClaudeMd()`:

```markdown
## Bugreport-Verarbeitung

Du überwachst eingehende Bugreports und bearbeitest sie seriell.

### Ablauf bei neuer Bug-Message (topic: 'bug')

1. mux_read(topic: 'bug') — Bug-ID und projectPath aus Message lesen
2. Prüfe ob bereits ein Worker an einem Bug arbeitet → warte
3. mux_create_session({
     name: "fix-BUG-xyz",
     projectPath: "<projectPath>",
     command: "claude --dangerously-skip-permissions"
   })
4. mux_send an Worker (topic: 'system'):
   "Lies ~/.config/cipher-mux/bugreports/outbox/BUG-xyz.md.
    Erstelle Branch fix/BUG-xyz. Analysiere und fixe den Bug.
    Nutze systematic-debugging und TDD.
    Wenn fertig: mux_bugreport_resolve({bugId, status: 'fixed', summary, branchName}).
    Wenn gescheitert nach 2 Versuchen: mux_bugreport_resolve({bugId, status: 'failed', summary})."
5. Warte auf Worker-Abschluss (mux_read topic: 'status')
6. Nächsten Bug aus Queue verarbeiten
```

## Tests

### Unit-Tests (~9-10 Tests)

1. **mux_bugreport_resolve** (~4-5 Tests)
   - Happy path: status fixed → inbox geschrieben, outbox gelöscht, Chatroom-Message gesendet
   - Happy path: status failed → inbox mit failed-Status
   - Outbox-Datei nicht gefunden → Fehler
   - Frontmatter korrekt geparst und übernommen

2. **BugreportManager.submit() Erweiterung** (~2 Tests)
   - projectPath im Frontmatter vorhanden
   - MessageBus.send() mit topic 'bug' aufgerufen

3. **Orchestrator-Template** (~2-3 Tests)
   - Bugreport-Abschnitt im generierten CLAUDE.md enthalten
   - Outbox-Pfad korrekt eingesetzt
   - Delegation-Instruktionen vollständig

### Manueller E2E-Test

Orchestrator-Flow (Bug melden → Session startet → Fix → inbox) wird manuell in der Polishing-Phase getestet.

## Nicht im Scope

- Projektübergreifende Bugreports (Erweiterung, `projectPath` ist vorbereitet)
- `mux_projects` MCP-Tool (nicht nötig für Self-Fix-Flow)
- Parallele Bug-Bearbeitung
- Automatisches Push/PR-Erstellen
- STT-Input für Bugreport (separates Feature)

## Dateien (geschätzt)

| Datei | Änderung |
|-------|----------|
| `src/main/bugreport/bugreport-manager.ts` | Erweitern: projectPath + MessageBus-Trigger |
| `src/main/mcp/mcp-tools.ts` | Neu: mux_bugreport_resolve Tool |
| `src/main/session/orchestrator-template.ts` | Erweitern: Bugreport-Abschnitt |
| `src/main/ipc-hub.ts` | MessageBus an BugreportManager durchreichen |
| `test/main/bugreport-resolve.test.ts` | Neu: Tests für mux_bugreport_resolve |
| `test/main/bugreport-manager.test.ts` | Erweitern: projectPath + MessageBus Tests |
| `test/main/orchestrator-template.test.ts` | Erweitern: Bugreport-Abschnitt Tests |
