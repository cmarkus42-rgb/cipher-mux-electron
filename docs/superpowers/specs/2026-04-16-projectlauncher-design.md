# Design — Projektlauncher-Integration in cipher-mux-electron

**Datum:** 2026-04-16
**Status:** Design (nach Brainstorming approved)
**Bezug:** `docs/issues/ISSUE-projectlauncher-missing.md`
**Folge-Phase:** Launcher-Qualitäts-Audit (siehe `memory/project_launcher_quality_audit.md`)

---

## Problem

Der heutige Kickoff-Dialog in cipher-mux-electron ist eine mechanische Skeleton-Generierung: Verzeichnis anlegen, Requirements kopieren, Stub-`CLAUDE.md` schreiben, Skills kopieren. Er füllt den Launcher-Anspruch aus `projectlauncher/CLAUDE.md` nicht — keine LLM-Analyse, kein Template-Merge mit Platzhalter-Ersetzung, kein Stack-Detect, kein Git, kein Requirements-Entwurf, kein Next-Step.

## Ziel dieser Iteration

Die cipher-mux-electron-App wird **Orchestrator** des vorhandenen `/launch`-Skills. Der eigentliche Launcher-Flow (inkl. LLM-Schritte) läuft in einer Claude-Session im `projectlauncher/`-Verzeichnis und wird von der App gestartet und überwacht.

Die inhaltliche Qualität des `/launch`-Skills wird in einer **separaten Folgephase** auditiert und verbessert (cipher-boox dient dort als Qualitäts-Baseline).

## Primärer Use-Case

1. cipher bereitet in Obsidian (= Nextcloud-Ordner) ein Verzeichnis für ein neues Projekt vor und legt dort das Konzept als Anforderungsdatei ab.
2. In cipher-mux-electron drückt er `Cmd+N`, pastet den Verzeichnis-Pfad, optional eine externe Anforderungsdatei (beliebiges Format) und optional zusätzlichen Kontext.
3. Die App startet eine Launcher-Session im `projectlauncher/`, die `/launch` im Merge-Modus gegen das existierende Verzeichnis ausführt.
4. Wenn `/launch` fertig ist, öffnet die App automatisch eine neue Session im Projekt-Verzeichnis, fokussiert sie und injiziert `/interview` als ersten Prompt.

## Scope

**In Scope:**
- Neuer Kickoff-Dialog (3 Felder, kein Projektname-Feld, kein Auto-Interview-Toggle)
- `KickoffOrchestrator` ersetzt `KickoffManager`
- Launcher-Session als normale, sichtbare tmux-Session
- `/launch`-Skill wird generalisiert: Merge-Modus für existierende Verzeichnisse
- MCP-Tool `kickoff_complete` als strukturiertes Completion-Signal
- Marker-Datei als Fallback
- Folge-Session mit `/interview`-Prompt

**Out of Scope (Folgephase "Launcher-Qualitäts-Audit"):**
- Inhaltliche Audit des `/launch`-Skills gegen cipher-boox als Baseline
- Stärkere Subagent-Nutzung im Skill (parallele Analyse)
- Template-Verbesserung (`CLAUDE.md.template`, `SPEC.md`-Skelett detaillierter)
- `.claude/commands/` und `.claude/worktrees/` ins Template übernehmen
- Systematischer Vergleich mehrerer Launcher-Outputs

## UI — Kickoff-Dialog

Titel: **„Neues Projekt aus Konzept"**

Drei Felder:

1. **Projekt-Verzeichnis** (Pflicht)
   - Textfeld + `…`-Button für Verzeichnis-Picker
   - Placeholder: `/Users/cipher/Nextcloud/…`
   - Validierung: existiert, ist Verzeichnis, ist schreibbar
   - Hinweis: „Das ist der Obsidian-Ordner, in dem dein Konzept liegt."

2. **Externe Anforderungsdatei** (optional)
   - Textfeld + `…`-Button für Datei-Picker
   - **Keine Extension-Filter** — jedes Format erlaubt (`.md`, `.txt`, `.docx`, `.yaml`, `.pdf`, …)
   - Wenn angegeben: wird als `docs/requirements.<ext>` ins Projekt-Verzeichnis kopiert (Extension bleibt erhalten)

3. **Zusätzlicher Kontext** (optional)
   - Multi-Line-Textarea (5–8 Zeilen, monospace)
   - Placeholder: „Alles, was Claude zusätzlich wissen soll: Stack-Präferenzen, Referenz-Projekte, Miro-URLs, …"

Submit-Button: **„Projekt aufsetzen"**

Entfernt ggü. heute: Projektname-Feld, Auto-Interview-Toggle.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│ Renderer: KickoffDialog.tsx (überarbeitet)                  │
│   3 Felder → ipc.kickoff({ projectDir, requirementsFile?,   │
│                             extraContext? })                │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC: 'project:kickoff'
┌──────────────────────▼──────────────────────────────────────┐
│ Main: IpcHub → KickoffOrchestrator                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
       ┌───────────────┼──────────────────┐
       ▼               ▼                  ▼
  [validate]     [prep target dir]   [start launcher session]
                                          │
                                          ▼
                                   SessionManager.create({
                                     cwd: projectlauncher/,
                                     label: "Launcher: <name>",
                                     autoStartPrompt: <launcherPrompt>
                                   })
                                          │
                                          ▼
                             [tmux session läuft /launch]
                                          │
                                          ▼
                       [MCP: kickoff_complete(...) aufgerufen]
                                          │
                                          ▼
                    [Orchestrator öffnet Projekt-Session + focus]
```

## Komponenten

### Neu: `src/main/project/kickoff-orchestrator.ts`

**Verantwortung:** Gesamten Kickoff-Flow orchestrieren.

**API:**

```ts
interface KickoffRequest {
  projectDir: string            // absoluter Pfad zum existierenden Verzeichnis
  requirementsFile?: string     // optional, absoluter Pfad zur externen Anforderungsdatei
  extraContext?: string         // optional, Freitext
}

interface KickoffHandle {
  launcherSessionId: string     // ID der sichtbaren Launcher-Session
  projectDir: string            // der absolute Projekt-Pfad (normalisiert)
}

interface KickoffResult {
  projectName: string           // aus Verzeichnisnamen abgeleitet
  detectedStack?: string        // vom /launch-Skill gemeldet (optional)
  followupSessionId: string     // ID der neuen Projekt-Session
}

class KickoffOrchestrator {
  constructor(deps: { sessionManager, mcpServer, configStore, logger })

  async start(req: KickoffRequest): Promise<KickoffHandle>
  // Emittiert Events:
  //   'kickoff:complete' → { handle, result }
  //   'kickoff:error'    → { handle, error }
  //   'kickoff:timeout'  → { handle }
}
```

**Flow in `start()`:**

1. Validieren: `projectDir` existiert, ist Verzeichnis, ist schreibbar.
2. Requirements-Datei (falls angegeben) nach `projectDir/docs/requirements.<ext>` kopieren. `docs/` bei Bedarf anlegen.
3. Launcher-Prompt bauen (siehe unten).
4. Via `SessionManager.create()` eine neue tmux-Session starten: `cwd = projectlauncherPath`, `label = "Launcher: <basename>"`, `autoStartPrompt = launcherPrompt`. (Gleicher Mechanismus wie heutiger Auto-Interview-Flow.)
5. Handle-Objekt merken, Completion-Watch registrieren (MCP-Tool-Callback + Timeout + Marker-Datei-Fallback).
6. Handle zurückgeben.

**Completion-Handling:**
- Bei MCP-Call `kickoff_complete({ projectPath, projectName, detectedStack })` → neue Session im Projekt öffnen, `/interview` injizieren, Renderer fokussiert. `'kickoff:complete'`-Event.
- Bei Marker-Datei `.kickoff-complete` (Fallback): gleicher Pfad.
- Bei Timeout (Default 15 min): `'kickoff:timeout'`-Event. Renderer zeigt Toast „Launcher dauert ungewöhnlich lange — jetzt schauen?"
- Bei Launcher-Session-Exit ohne Completion: `'kickoff:error'`-Event mit Grund.

### Neu: `src/main/mcp/tools/kickoff-complete.ts`

MCP-Tool, das der `/launch`-Skill am Ende aufruft.

```ts
// Tool-Schema
{
  name: "kickoff_complete",
  description: "Signal, dass der Launcher das Projekt-Scaffolding abgeschlossen hat",
  inputSchema: {
    projectPath: string,    // absoluter Pfad zum Projekt-Verzeichnis
    projectName: string,    // aus Verzeichnisnamen abgeleitet
    detectedStack?: string, // z.B. "kotlin-android", "electron-ts", "python"
  }
}
```

Tool leitet an `KickoffOrchestrator` weiter.

### Überarbeitet: `src/renderer/components/KickoffDialog.tsx`

Felder-Layout wie oben. Submit ruft `api.project.kickoff({ projectDir, requirementsFile, extraContext })`.

### Entfernt: `src/main/project/kickoff-manager.ts`

Alter Manager wird durch Orchestrator ersetzt. Der alte Flow (Stub-`CLAUDE.md`, Skill-Copy) ist nicht mehr nötig, weil der `/launch`-Skill das alles macht.

**Folgen für bestehende Tests:**
- `test/main/kickoff-manager.test.ts` → umschreiben auf `kickoff-orchestrator.test.ts`

### Änderungen am `/launch`-Skill (`projectlauncher/.claude/skills/launch/SKILL.md`)

**Modus-Erkennung:** Automatisch — wenn der Input einen existierenden Verzeichnispfad enthält → *Merge-Modus*, sonst *Create-Modus*.

**Merge-Modus:**
- Template-Dateien nur anlegen, wenn nicht vorhanden (User-Content bleibt)
- `CLAUDE.md` neu generieren (mit aus Projektinhalt abgeleiteten Daten), vorhandene ignorieren oder mergen — offene Frage für Folgephase
- `git init` nur, wenn `.git/` nicht existiert
- Am Ende: MCP-Tool `kickoff_complete(...)` aufrufen; zusätzlich `.kickoff-complete` als Fallback schreiben

Der Skill bleibt inhaltlich der Chef — wir duplizieren in cipher-mux **keine** Launcher-Logik in TypeScript. Das erlaubt spätere Qualitätsverbesserungen am Skill ohne App-Code-Änderung.

## Launcher-Prompt (Template)

Der Prompt wird bewusst im natürlichen, engagierenden Stil formuliert (siehe `memory/feedback_prompt_style.md`):

```
Hey, cipher setzt ein neues Projekt auf. In Obsidian hat er schon
ein Verzeichnis angelegt und das Konzept dort als Anforderungsdatei
abgelegt:

    {projectDir}

Lies die Anforderungen gründlich — nicht oberflächlich — und versteh,
worum es wirklich geht, bevor du scaffoldest.

Das Verzeichnis existiert schon, also merge das Template rein statt
neu anzulegen: vorhandene Dateien bleiben, .claude/, docs/SPEC.md-
Skelett, .gitignore, Platzhalter etc. kommen dazu.

Qualitäts-Baseline: /Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-boox
Schau dir an, wie tief die ADRs, die Modulstruktur und die Referenzen
dort sind. Der Launcher-Output muss dieses Niveau anstreben. Nutz
Subagenten parallel — einer für Requirements-Tiefenanalyse, einer für
Tech-Stack + Referenz-Projekt-Matching, einer für ADR-Ableitung.

{if extraContext}
Zusätzlicher Kontext von cipher:

{extraContext}
{/if}

Wenn du fertig bist, ruf das MCP-Tool `kickoff_complete` auf mit
{ projectPath, projectName, detectedStack }. Als Fallback: schreib
eine leere Datei `.kickoff-complete` ins Projekt-Verzeichnis.

Los, /launch.
```

Der exakte Wortlaut wird ggf. in der Folgephase iteriert.

## Completion-Signal — Entscheidung

**Primär:** MCP-Tool `kickoff_complete` — strukturiert, typisiert, erlaubt Metadaten-Übergabe (z.B. `detectedStack` für Session-Label-Badge).

**Fallback:** Marker-Datei `.kickoff-complete` im Projekt-Verzeichnis — deckt den Fall ab, dass ein zukünftiges Skill-Update vergisst, das MCP-Tool zu callen.

**Timeout:** 15 min (konfigurierbar via `ConfigStore.kickoffTimeoutMinutes`). Bei Ablauf → Toast im Renderer, Launcher-Session bleibt sichtbar.

## Folge-Session

Nach Completion:
1. Orchestrator ruft `SessionManager.create({ cwd: projectDir, label: projectName, autoStartPrompt: '/interview' })`.
2. Renderer erhält `session:focus` für die neue Session → UI wechselt.
3. Launcher-Session bleibt in der Session-Liste (zum Nachlesen).
4. Toast: „Projekt aufgesetzt: `<Name>` — erkannter Stack: `<Stack>`".

## Konfiguration (ConfigStore)

Neu:
- `projectlauncherPath` (String, Default: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/`)
- `kickoffTimeoutMinutes` (Number, Default: 15)

## Fehlerfälle

| Fall | Verhalten |
|------|-----------|
| `projectDir` existiert nicht | Dialog zeigt Fehler, Submit blockiert |
| `projectDir` nicht schreibbar | Dialog zeigt Fehler, Submit blockiert |
| Requirements-Datei nicht lesbar | Dialog zeigt Fehler |
| Launcher-Session exitet ohne Completion | Toast „Launcher wurde beendet, aber kein Abschluss gemeldet. Projekt-Session trotzdem öffnen?" |
| Timeout | Toast „Launcher dauert ungewöhnlich lange — jetzt schauen?" (Link auf Session) |
| Nach Completion: `CLAUDE.md` fehlt im Projekt | Toast mit Warnung, Folge-Session trotzdem öffnen |
| MCP-Tool wird mit falschem `projectPath` gerufen (≠ Handle-projectDir) | Log Warning, aber Handle-projectDir nutzen |

## Tests

**Unit-Tests (Node test runner, mit Temp-Verzeichnissen):**
- `KickoffOrchestrator.validate()`: fehlendes Dir, Datei statt Dir, nicht-schreibbares Dir
- Requirements-Datei-Kopie: `.md`, `.txt`, `.docx`, ohne Extension — Dest-Extension bleibt erhalten
- Prompt-Building: projectDir, requirements (mit/ohne), extraContext (mit/ohne) werden korrekt eingebaut
- Completion-Handling: MCP-Call, Marker-Datei-Fallback, Timeout
- Conflicting completion signals (MCP + Marker beide) → nur einmal getriggert

**Integrationstests (opt-in, real tmux):**
- Kompletter Flow bis Session-Start — Mock-Launcher-Skript, das das MCP-Tool aufruft
- Verifiziere: Launcher-Session existiert, neue Projekt-Session wird geöffnet, Focus-Event kommt an

**Manuelle Tests (`docs/TESTCASE.md` erweitern):**
- Test 11: Kickoff mit Obsidian-Verzeichnis, `requirements.md` drin
- Test 12: Kickoff mit externer `.docx`-Anforderungsdatei
- Test 13: Kickoff-Fehlerfall — Pfad existiert nicht

## Risiken & Mitigationen

- **`/launch`-Skill ist heute qualitativ nicht auf cipher-boox-Niveau** → Folgephase adressiert das; das Integrations-Design erlaubt Iteration am Skill ohne App-Änderung.
- **Nextcloud-Sync + `fs.watch`** könnte unzuverlässig sein → Marker-Datei ist nur Fallback, primäres Signal ist MCP-Call (kein File-Watch).
- **Launcher-Session hängt (Claude-Rückfrage)** → Timeout-Toast, User kann Session sichtbar in der Liste finden.
- **User wählt versehentlich ein Dir ohne Anforderungen** → `/launch` erkennt das und fragt zurück (Skill-Verantwortung, nicht Orchestrator).

## Migration & Abwärtskompatibilität

Der alte Kickoff-Flow hat keine persistenten Artefakte, die mitgenommen werden müssten. Einmal Replace-in-Place:
- `KickoffManager` entfernen
- `KickoffDialog` ersetzen
- IPC-Payload `project:kickoff` anpassen (Channel-Name bleibt)
- Alte Tests umschreiben

## Offene Punkte (für Folgephase)

- Audit-Kriterien für „Launcher-Qualität" definieren (siehe `memory/project_launcher_quality_audit.md`)
- Subagent-Nutzung im `/launch`-Skill systematisch einbauen
- `_template/` inhaltlich aufwerten (`CLAUDE.md.template`, `SPEC.md`-Skelett, `.claude/commands/`, `.claude/worktrees/`)
- Klären: wenn im Merge-Modus bereits eine `CLAUDE.md` im Projekt-Verzeichnis existiert — merge-Strategie (behalten? ergänzen? ersetzen mit Rückfrage?)
