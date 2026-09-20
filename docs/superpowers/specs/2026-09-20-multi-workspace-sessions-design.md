# Multi-Workspace-Sessions — Paket A: "Session trägt Workspace"

**Datum:** 2026-09-20
**Status:** Design abgestimmt, Implementierung ausstehend
**Betrifft:** Session-Lifecycle, Entity-Start, MCP-Server, Launcher-UI

## Problem

cipher-mux kennt genau einen aktiven Workspace (`activeWorkspaceId` im ConfigStore).
Jeder Preset-Start, jede Notiz und jeder Memory-Eintrag bezieht sich implizit auf ihn.
Wer parallel an zwei Projekten arbeiten will, muss den Workspace umschalten — und reißt
damit den Bezug aller bereits laufenden Sessions mit um.

Gebraucht wird: mehrere Sessions in mehreren Workspaces gleichzeitig, mit einer Bindung,
die pro Session gilt statt app-weit.

## Ist-Zustand

Der Workspace wirkt heute an zwei strukturell verschiedenen Stellen.

**Start-Zeit, pro Session.** `workspacePrompt` und `contextPaths` werden beim Start in die
CLAUDE.md geschrieben (`src/main/session/session-manager.ts:1130`). Diese Werte sind bereits
parametrisierbar: `applyWorkspace()` übergibt sie explizit
(`src/main/workspace/workspace-manager.ts:169`). Nur der Launcher-Pfad
(`api.entity.start(entityId)`, `src/main/preload.ts:400`) übergibt nichts und fällt auf
`getActiveWorkspace()` zurück.

**Laufzeit, global.** Diese Stellen lesen `activeWorkspaceId` bei jedem Aufruf neu,
unabhängig davon, welche Session ruft:

- `mux_notes_create` → Tag `workspace:<name>` (`src/main/mcp/mcp-tools.ts:714`)
- `companion_memory_write` / `_recall` / `_search` → Scope (`mcp-tools.ts:1240`, `1296`, `1344`)
- Notes-Speichern und Notes-Filter (`src/main/ipc-hub.ts:1895`, `1952`, `2039`)

Dazu drei Befunde, die den Zuschnitt bestimmen:

1. **`SessionInfo` kennt keinen Workspace.** Das Feld existiert nicht (`src/shared/types.ts:55`).
2. **Entity-Verzeichnisse gelten pro Entity, nicht pro Instanz.** `entity-registry.ts` vergibt feste
   Pfade (`~/.config/cipher-mux/entities/<id>`), und `startEntity()` schreibt dort bei jedem Start
   die CLAUDE.md neu (`session-manager.ts:1148`). Zwei Instanzen desselben Presets teilen sich
   Verzeichnis, CLAUDE.md und `.mcp.json`.
3. **Der MCP-Server kann Aufrufer nicht unterscheiden.** Eine URL, ein Bearer-Token für alle.
   `mux_tts_speak` bekommt seine `sessionId` nur, weil sie beim Start in die CLAUDE.md injiziert
   wird und das Modell sie mitschickt.

Günstig ist die Ausgangslage an zwei Stellen:

- Die Run-Tabellen sind bereits workspace-fähig. `cyber_factory_runs`, `debugger_runs`,
  `testing_runs` und `audit_runs` haben eine `workspace_id`-Spalte, und die Manager reichen sie
  durch (`debugger-manager.ts:129`, `audit-manager.ts:45`). Die Manager sind Datenzugriffs-Layer
  ohne Singleton-Zustand — mehrere parallele Runs sind bereits darstellbar.
- Der MCP-Server baut **pro Client eine eigene `McpServer`-Instanz** samt eigener
  Tool-Registrierung (`mcp-server.ts:137`). Workspace-Kontext lässt sich beim Verbindungsaufbau
  in den Tool-Closure binden.

## Getroffene Entscheidungen

| Frage | Entscheidung |
|---|---|
| Wohin gehen Notes/Memory einer Session in Workspace B? | Nach B — die Session trägt ihren Workspace mit |
| Was heißt `singleInstance` in Multi-Workspace? | Einmal **pro Workspace**, nicht app-weit |
| Woher kennt ein MCP-Tool-Aufruf seinen Workspace? | Aus der Verbindung, nicht aus einem Modell-Parameter |
| Projekt-Sessions aus dem Path-Tab? | Außerhalb dieses Pakets |

Zur dritten Zeile: Identität, die das Modell mitschicken muss, ist keine Identität. Vergisst das
Modell den Parameter, landet die Notiz still im falschen Workspace — ein Fehler, der nicht auffällt.

## Zuschnitt

Zwei Pakete, nacheinander, jedes für sich lauffähig.

**Paket A (dieser Spec) — "Session trägt Workspace".** Presets laufen parallel in mehreren
Workspaces, Launcher-UI, Isolation der Start-Artefakte. Notes und Memory bleiben global.

**Paket B — "Inhalte folgen der Session".** Notes-Tagging und Memory-Scope kommen aus dem
Aufrufkontext statt aus `activeWorkspaceId`.

Der Schnitt ist so gelegt, dass B nichts umbaut, was A gebaut hat: B tauscht nur die Quelle der
Workspace-Auflösung in den Tools aus. Der Kanal dafür entsteht in A.

## Architektur

### 1. Datenmodell

```ts
// src/shared/types.ts
interface SessionInfo {
  // ...
  /** Workspace, in dem die Session gestartet wurde. null = keine Bindung. */
  workspaceId?: string | null
}

interface StartSessionOpts {
  // ...
  workspaceId?: string | null
}

// src/main/session/session-store.ts
interface PersistedSession {
  // ...
  workspaceId: string | null
}
```

`recover()` liest das Feld aus dem Store zurück — dieselbe Stelle, die heute `entityId`
restauriert (`session-manager.ts:553`).

### 2. Run-Verzeichnisse pro (Workspace, Entity)

Das Entity-Verzeichnis `~/.config/cipher-mux/entities/<id>/` bleibt, was es laut Code-Kommentar
sein soll: Heimat der *authored* Artefakte — `preset.md`, Skills, Guides. Write-once, manuelle
Edits überleben.

Neu als Arbeitsverzeichnis der Session:

```
~/.config/cipher-mux/runs/<workspaceId>/<entityId>/
├── CLAUDE.md                    ← generiert (preset.md + Persona + Global Rules
│                                   + Workspace Prompt + Context Paths + Session Identity)
├── .mcp.json                    ← generiert, mit X-Mux-Workspace-Header
└── .claude/
    ├── settings.local.json      ← generiert
    └── skills/                  → Symlink auf <entities>/<id>/.claude/skills
```

Ohne aktiven Workspace: `runs/_global/<entityId>/`.

Bewusst pro Workspace, nicht pro Session: Instanzen im selben Workspace haben identischen
Workspace-Kontext und teilen zu Recht eine CLAUDE.md. Der Pfad ist damit stabil, aus
`sessions.json` ableitbar und in der Anzahl durch Workspaces × Entities begrenzt — kein
vorgenerierter Session-ID nötig, kein Aufräumen verwaister Verzeichnisse im laufenden Betrieb.

Symlinks werden bei jedem Start idempotent gesetzt: existiert der Link, zeigt aber ins Leere,
wird er neu angelegt.

### 3. MCP-Identität über einen Header

`.mcp.json` und `settings.local.json` tragen neben `Authorization` einen zweiten Header:

```json
{
  "mcpServers": {
    "cipher-mux": {
      "type": "http",
      "url": "http://127.0.0.1:<port>/mcp",
      "headers": {
        "Authorization": "Bearer <key>",
        "X-Mux-Workspace": "<workspaceId>"
      }
    }
  }
}
```

`createSession()` liest den Header aus dem `initialize`-Request und übergibt ihn an
`registerTools(server, { ...ctx, workspaceId })`. Die Tools lesen ihn aus dem Closure statt aus
`configStore.get('activeWorkspaceId')`.

Kein neuer Endpoint, kein Token-Mapping, keine Request-Introspektion in den Tool-Handlern.
Das Modell sieht nichts davon und kann nichts vergessen.

In Paket A wird der Kanal aufgebaut und im Tool-Kontext bereitgestellt. Genutzt wird er hier von
den Handoff-Tools (Abschnitt 5) — die brauchen den Workspace des Aufrufers, um das richtige
Ziel-Entity zu finden. Die Notes- und Memory-Tools lesen weiter `activeWorkspaceId`; sie
umzustellen ist Paket B und braucht dann keinen neuen Kanal mehr.

### 4. `singleInstance` pro Workspace

Der Singleton-Check (`session-manager.ts:1009`) filtert zusätzlich nach `workspaceId`.
`getEntitySessionId(entityId)` bekommt eine Workspace-Variante. Die Filterung läuft über
`this.sessions` statt über eine zweite Map-Ebene in `entitySessionIds` — weniger Zustand, der
synchron gehalten werden muss.

Ein zweiter Start desselben `singleInstance`-Presets im selben Workspace bleibt blockiert,
mit der bisherigen Fehlermeldung.

### 5. Handoff-Routing

`resolveTargetSession()` (`src/main/mcp/handoff-kernel.ts:84`) filtert Kandidaten zusätzlich nach
dem Workspace der aufrufenden Session. `startEntitySession()` erbt ihn. Ein Debugger-Handoff aus
Workspace B landet nicht beim Debugger in A. Aufrufer ohne Bindung → Ziel ohne Bindung.

### 6. Renderer-State

`entityStatus` ist heute `Record<entityId, boolean>` — "läuft irgendwo" (`app.tsx:405`). Daneben
liegt `entitySessionMap`: sechs handgepflegte `useState`-Hooks für zehn Entities
(`app.tsx:322–340`). Beides kodiert "ein Preset = eine Session" und ist in einer
Multi-Workspace-Welt falsch.

Beides leitet sich aus `sessions` ab, das nach Paket A `workspaceId` trägt:

- `entityStatus: Record<entityId, string[]>` — IDs der Workspaces, in denen das Preset läuft;
  Sessions ohne Bindung erscheinen als `'_global'`, damit der Typ nicht `(string | null)[]` wird
- die sechs Hooks werden durch eine abgeleitete Lookup-Funktion `(entityId, workspaceId) => sessionId | null` ersetzt

Das ist kein Nebenbei-Refactoring: ohne diesen Schritt kann die UI den Zustand nicht abbilden,
den Paket A erzeugt.

## UI

### Start-Pfad im Launcher

Eine Preset-Zeile ist heute `[Karte: Name + Status]` `[R: Resume]`
(`EntityPickerPopup.tsx:154–187`). Neu:

```
[Karte: Start im aktiven Workspace]  [⤳: Start in anderem Workspace]  [R: Resume]
     └── Klick auf ⤳ klappt unter der Zeile Workspace-Chips auf
         [ CIPHER-MUX ] [ cipher-grow ] [ heimdall ]
             └── Klick startet dort und schließt das Popup
```

Der Default-Pfad bleibt unverändert: ein Klick auf die Karte, aktiver Workspace, keine neue
Entscheidung. Der abweichende Start ist explizit und sichtbar, nie ein Modus, den man im Kopf
halten muss.

Inline statt Popup-in-Popup, weil das die in der CLAUDE.md dokumentierte preact/compat-Falle mit
`stopPropagation` auf verschachtelten Overlays umgeht.

Die Chip-Liste zeigt alle Workspaces **außer dem aktiven** — der ist über die Karte erreichbar.
Gibt es keinen weiteren Workspace, wird der ⤳-Button ausgeblendet statt eine leere Liste zu
öffnen.

### Laufend-Anzeige

Die Karte zeigt statt eines anonymen Punkts die Workspaces, in denen das Preset läuft; bei mehr
als zwei gekürzt mit Tooltip.

Die wichtigere Änderung sitzt dahinter: `effectiveRunning` (`EntityPickerPopup.tsx:152`)
entscheidet, ob ein Klick startet oder nur fokussiert. Das gilt künftig pro Workspace. Debugger
läuft in A, du bist in B, Klick auf die Karte → **startet** in B.

### Session-Kennzeichnung

`PaneHeader` und die Sidebar-Session-Liste zeigen ein Workspace-Badge — **nur wenn
`session.workspaceId !== activeWorkspaceId`**. Im Normalfall bleibt der Header unverändert ruhig;
das Badge ist ein Abweichungs-Signal, keine Dauerdekoration. Eingefärbt in der Workspace-Farbe.

### Unverändert

Der global aktive Workspace bleibt Default für neue Starts, Filter für die Notes-Sidebar und
Bezugspunkt für "ist das hier fremd?". Ein Preset-Start in B wechselt den aktiven Workspace
**nicht** — sonst landet der nächste Start wieder woanders.

### i18n

Neue Keys in `src/renderer/locales/de.json` und `en.json` unter `unified.*`: Button-Titel,
Chip-Label, Badge-Tooltip.

## Fehlerfälle

**Workspace gelöscht, während Sessions darin laufen.** Die Sessions laufen weiter — Beenden wäre
Datenverlust. Das Badge zeigt die ID mit Markierung "gelöscht"; neue Starts in diesem Workspace
sind nicht mehr möglich. Beim nächsten App-Start werden Run-Verzeichnisse gelöschter Workspaces
entfernt, sofern keine laufende Session mehr darauf verweist — das ist die einzige Aufräumregel;
Verzeichnisse existierender Workspaces bleiben dauerhaft liegen und werden wiederverwendet.

**Workspace umbenannt.** Kein Effekt — Run-Pfad und Header nutzen die ID.

**Workspace-Prompt oder Context-Paths ändern sich, während Sessions laufen.** Greift beim nächsten
Start dieses Presets. Entspricht der heutigen Semantik; kein Live-Reload.

**Kein Workspace aktiv.** Run-Verzeichnis `runs/_global/<entityId>/`, `X-Mux-Workspace` entfällt,
Verhalten exakt wie heute. Kein Sonderpfad, nur ein Default.

**Alte `sessions.json` ohne `workspaceId`.** Wird als `null` gelesen — bestehende Sessions gelten
nach dem Update als global. Bewusst nicht geraten: eine Session dem gerade aktiven Workspace
zuzuschlagen wäre eine Erfindung.

**Keep Working Restore.** In der CLAUDE.md als fragile Zone markiert und betroffen: der
`keepWorkingSnapshot` muss `workspaceId` mitschreiben, sonst verlieren wiederhergestellte Sessions
ihre Bindung. Die dort dokumentierten Regeln gelten unverändert — jeder neue Feldzugriff defensiv
(`?? null`), nie annehmen, dass das Feld existiert; ein Crash in der Init-Chain killt sie still und
vollständig. `/tmp/kw-debug.json` bekommt `workspaceId` pro Session in die Diagnose-Ausgabe.

**Fehlender oder unbekannter `X-Mux-Workspace`-Header.** Wird wie `null` behandelt, eine Warnung
ins Log, kein Fehler. Ein MCP-Client, der den Header nicht kennt, muss weiter funktionieren.

**Session-Limits.** `MAX_SESSIONS = 21` (tmux, `constants.ts:18`) liegt unter
`MAX_MCP_SESSIONS = 24` (`mcp-server.ts:14`). Jede Session kann eine MCP-Verbindung halten, auch
wenn alle 21 aus verschiedenen Workspaces stammen. Keine Anpassung nötig.

**Symlinks ins Entity-Verzeichnis.** Bei jedem Start idempotent neu gesetzt, damit sie nicht still
brechen, wenn ein Preset seine Skills neu deployed.

**Handoff ins Leere.** Läuft im Workspace des Aufrufers kein Ziel-Entity, wird es dort gestartet —
nicht im aktiven Workspace gesucht.

## Bekannte Grenzen

**Projekt-Sessions auf demselben Repo-Pfad.** `ClaudeCodeAdapter.postLaunchInjection()`
(`adapters/claude-code.ts:76`) schreibt die MCP-Config in `<repo>/.claude/settings.local.json` —
pro Pfad, nicht pro Session. Zwei Sessions auf demselben Repo in verschiedenen Workspaces: der
spätere Start überschreibt den Header des früheren. Die laufende Session merkt das nicht (Claude
liest beim Start), aber nach `/clear` oder MCP-Reconnect zieht sie den falschen Workspace. Für
Entity-Sessions durch die Run-Verzeichnisse gelöst; für User-Repos nicht lösbar, ohne pro Session
in fremde Verzeichnisse zu schreiben. Dieselbe Klasse wie das in der CLAUDE.md dokumentierte
"Last-Write-Wins bei mehreren Cells auf gleichem Projekt".

**Zwei Instanzen desselben Presets im selben Workspace** teilen weiterhin CLAUDE.md und damit die
injizierte `Session Identity` — die zweite überschreibt die erste. Das ist der heutige Zustand,
wird durch die Run-Verzeichnisse *zwischen* Workspaces behoben, *innerhalb* eines Workspace nicht.
Eigener Fix, nicht Teil dieses Pakets.

**Notes und Memory bleiben in Paket A global.** Eine Session in B schreibt ihre Notizen in den
aktiven Workspace A. Das ist die Trennlinie zu Paket B und muss dort geschlossen werden, sonst
bleibt eine Inkonsistenz stehen, die im Betrieb auffällt.

## Tests

`node:test`, `test/main/`. Verhaltens-Tests, keine Implementierungs-Tests.

| Datei | Prüft |
|---|---|
| `session-workspace-binding.test.ts` | `workspaceId` überlebt `start` → `sessionStore` → `recover`; fehlendes Feld in alter `sessions.json` wird `null` |
| `entity-run-dirs.test.ts` | Run-Pfad pro (Workspace, Entity); zwei Workspaces kollidieren nicht; `_global`-Fallback; Symlinks idempotent |
| `entity-singleinstance-workspace.test.ts` | Zweiter Start im selben Workspace blockt, im anderen nicht |
| `mcp-workspace-header.test.ts` | Header beim `initialize` → Tool-Kontext; fehlender/unbekannter Header → `null` ohne Fehler |
| `handoff-workspace-routing.test.ts` | `resolveTargetSession` wählt nur Kandidaten des eigenen Workspace; Start im Workspace des Aufrufers |

**Erweitert:** `entity-claudemd-assembly.test.ts` um Workspace-Prompt aus explizitem `workspaceId`
statt `getActiveWorkspace()`.

**Manuell:** Keep-Working-Zyklus — zwei Presets in zwei Workspaces starten, Cmd+Q, Neustart,
beide kommen mit korrekter Bindung zurück. Als Testcase-Note im Format `T-MWS.*` in der
Notes-System-Testcase-Note.

**Nicht getestet:** die UI-Komponenten selbst. Das Projekt testet Renderer-Logik nur dort, wo sie
sich von der Darstellung trennen lässt (`notes-tree-view.test.ts`). Die Entscheidungslogik —
welcher Workspace, starten oder fokussieren — sitzt in der Ableitung von `entityStatus` und wird
dort getestet.

## Betroffene Dateien

**Main:**
`src/shared/types.ts`, `src/main/session/session-manager.ts`,
`src/main/session/session-store.ts`, `src/main/session/entity-registry.ts`,
`src/main/mcp/mcp-server.ts`, `src/main/mcp/mcp-tools.ts` (nur Kontext-Signatur),
`src/main/mcp/handoff-kernel.ts`, `src/main/agent/adapters/claude-code.ts`,
`src/main/ipc-hub.ts` (Keep-Working-Snapshot, Entity-Start-Kanal), `src/main/preload.ts`

**Renderer:**
`src/renderer/app.tsx`, `src/renderer/components/EntityPickerPopup.tsx`,
`src/renderer/components/LauncherCell.tsx`, `src/renderer/components/PaneHeader.tsx`,
`src/renderer/components/SidebarPanel.tsx`, `src/renderer/locales/de.json`, `en.json`

**Tests:** fünf neue Dateien plus eine Erweiterung, siehe oben.
