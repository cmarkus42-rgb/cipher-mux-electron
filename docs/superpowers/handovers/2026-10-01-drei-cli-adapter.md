# Übergabe: Drei CLI-Adapter, und was das Messen gekostet hat

**Anker-Commit:** `e921cb9` (der letzte Commit auf `main` vor dieser Arbeit)
**Branch:** `codex-adapter` — nicht nach `main` gemergt
**Von:** der Session, die aus „Übergabe: Tag-Modell steht" die Punkte 1 und 2 abgearbeitet hat
**An:** eine frische Hauptsession
**Status:** offen
**Vorgänger:** `docs/superpowers/handovers/2026-10-01-uebergabe-tag-modell-und-offene-punkte.md`

> **Was dieses Dokument ist.** Messungen, Entscheidungen und Fallen — **keine Bestandsliste.**
> Den Ist-Zustand rechnest du selbst gegen den Anker aus (`git diff e921cb9..codex-adapter`).
> Die Begründungen stehen hier, damit man mit ihnen streiten kann.
>
> **Der wichtigste Teil sind die Messungen.** Sie stehen in keinem Diff, sie gelten für genau
> eine CLI-Version, und sie können mit der nächsten kippen. Wer hier weiterarbeitet, misst nach,
> statt sie zu glauben.

---

## 1. Die Lehre, falls du nur einen Absatz liest

Die Testsuite war bei jedem Schritt grün. Die **manuelle Abnahme in der laufenden App fand vier
Fehler**, von denen drei die Session hochkommen ließen und wie ein Erfolg aussahen:

| Fehler | Symptom für den Nutzer |
|---|---|
| `-C` auf das authored- statt das Run-Verzeichnis | Session läuft, hat aber keine MCP-Werkzeuge, keinen Usage-Hook, keine Rollengrenze |
| Adapter-Auflösung an drei Stellen uneinheitlich | Rolle startet `codex` und bekommt danach `.claude/settings.local.json` |
| Update-Hinweis ist ein blockierender Dialog | Unbeaufsichtigte Session hängt, bis jemand hinsieht |
| Verzeichnis-Vertrauen fehlt | Dialog beim Start; ein nachträgliches „Yes" lädt die Config **nicht** nach |

Dazu kamen beim Messen selbst drei stille Fehlschläge: ein `matcher` auf dem falschen
Werkzeugnamen, ein fehlendes Trust-Flag, und Hook-Einträge, die Codex **gar nicht validiert**
(`{bogus=1}` und ein frei erfundener Eventname gehen anstandslos durch).

**Daraus die Regel, die in `adapters/codex.ts` steht und gelten bleibt: das Feuern nachweisen,
nicht die Datei schreiben.** Ein Rauchtest pro Sessionstart ist hier kein Luxus.

Ich habe mich beim Messen zweimal selbst in die Irre geführt — der falsche Matcher verdeckte,
dass Trust das eigentliche Gatter ist, und ich hielt `enabled = true` kurz für Pflicht. Beides
steht korrigiert weiter unten. Das ist kein Nebensatz: wer hier misst, sollte damit rechnen, dass
zwei Ursachen sich gegenseitig verdecken, und jede einzeln ausschalten.

---

## 2. Was gebaut wurde

Drei Adapter statt einem. `claude-code` bleibt Tier 1 und bleibt Default — er ist der einzige,
für den **jede** Capability gemessen ist.

| | `claude-code` | `codex` | `opencode` |
|---|---|---|---|
| Tier | 1 | 2 | 2 |
| Projektanweisungen | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` |
| Rollengrenzen | PreToolUse-Hook | PreToolUse-Hook | **nicht gebaut** |
| MCP-Bindung | Header | **Token** | Header |
| Context-Usage | Statusline | Rollout-JSONL via Hook | **nicht gebaut** |
| Rauchtest gegen echte CLI | — | ja | **nein** |

Dazu: die Auswahl in der UI (Feld „CLI" pro Rolle im Preset-Editor, „Standard-CLI" global),
`mcp/bound-token.ts`, `adapters/codex-trust.ts`, `agent/entity-adapter-map.ts`, und
`workspaces-window` als neues Ziel für `mux_ui_open`.

---

## 3. Die Messungen — Codex (codex-cli 0.155.1, 2026-10-01)

1. **`AGENTS.md` wird befolgt**, hierarchisch nach Scope; eine direkte Instruktion schlägt sie.
   Damit trägt dieselbe Injektionsmechanik wie `CLAUDE.md` bei Claude Code.
2. **`PreToolUse`-Hooks tragen wortgleich das Claude-Code-Protokoll** —
   `hookSpecificOutput.permissionDecision` mit `allow`/`deny`/`ask`, `permissionDecisionReason`,
   Exit 2 plus stderr. Ein `deny` wirkt auch unter
   `--dangerously-bypass-approvals-and-sandbox`, der Grund erreicht das Modell wörtlich, und das
   Modell meldet die Blockade statt in eine Schleife zu laufen.
3. **Ohne `--dangerously-bypass-hook-trust` feuert ein frisch geschriebener Hook nicht** — ohne
   Warnung, ohne Logzeile, der Aufruf läuft durch.
4. **Der `matcher` trägt den Claude-Code-Werkzeugnamen.** Der Hook-Input meldet
   `tool_name: "Bash"`, obwohl die Ausgabe `exec` und `/bin/zsh -lc` zeigt. `matcher = "shell"`
   passt auf nichts. Der Adapter schreibt deshalb **keinen** Matcher und filtert im Hook-Skript:
   ein Name, der sich mit der nächsten Version ändert, soll nicht entscheiden, ob eine Grenze
   greift.
5. **`enabled = true` ist nicht erforderlich** — gegengetestet mit und ohne, beide feuern.
6. **Projektlokale `.codex/config.toml` greift.** Das ist die architektonisch wichtigste
   Messung: ohne sie müsste der Mux die globale Config des Nutzers anfassen, und zwei Workspaces
   würden sich überschreiben.
7. **Die Einträge werden nicht validiert.** Siehe Abschnitt 1.
8. **Keine freien HTTP-Header für MCP-Server.** Gegen einen Horchposten auf Port 3199 gemessen:
   die Verbindung kommt an, `X-Mux-*` nicht; ein `headers`-Schlüssel wird stillschweigend
   verworfen. Die Konfiguration kennt `url` und `bearer_token_env_var`.
9. **Verzeichnis-Vertrauen ist Pflicht und geht nur global.** Wirkungslos sind
   `-c projects."<pfad>".trust_level="trusted"` (ein Override kann aus dem unvertrauten
   Verzeichnis selbst stammen — die Ablehnung ist plausibel Absicht), `CODEX_NON_INTERACTIVE=1`
   und beide Bypass-Flags. `codex exec` fragt nicht, aber der Mux braucht die TUI im Pane.
10. **`resume --last` ist sicher** — ohne vorherige Unterhaltung im Projekt zeigt es *keinen*
    Picker, sondern landet am Prompt.
11. **Context-Usage ohne Statusline:** `status_line` ist eine TUI-Anzeigeoption, kein Kommando.
    Jeder Hook-Input trägt aber `transcript_path`, und in der Rollout-JSONL steht pro Antwort ein
    `token_usage_record`. `codex debug models --json` nennt `context_window` pro Modell.

## 4. Die Messungen — opencode (1.18.34, 2026-10-01)

- **MCP mit freien Headern funktioniert** — dieselbe Horchposten-Messung, `authorization`,
  `x-mux-workspace` und `x-mux-entity` kamen alle an. **Die Header-Lücke ist also eine
  Eigenschaft von Codex, keine des Adapter-Vertrags.**
- Liest `AGENTS.md` (und `CLAUDE.md` zur Verträglichkeit), Konfiguration `opencode.json`.
- Lifecycle passt direkt: `--session <id>`, `--fork`, `--agent`, `--auto`.
- **Rollengrenzen laufen über ein Plugin-System** (`tool.execute.before`, `tool.execute.after`,
  `permission.ask`) statt über Hook-Dateien. Struktureller Unterschied zu beiden anderen.

---

## 5. Entscheidungen

### 5.1 Die MCP-Bindung reist bei Codex im Token

Format `<apiKey>.<base64url(JSON)>` in `mcp/bound-token.ts`. Drei Eigenschaften tragen es:
rückwärtsverträglich (ein Token ohne Punkt ist der blanke Schlüssel und heißt „ungebunden" —
genau das, was jeder bestehende Client schickt), zustandslos, und kein neues Geheimnis.

`stripBindingFromAuthHeader` läuft **vor** `validateBearer`. Ohne diesen Schritt wäre jede
Codex-Verbindung ein 401 — und zwar erst beim Benutzen, nicht beim Schreiben der Config. Ein
Test hält genau das fest.

**Der Zusatz ist nicht signiert, und das ist eine Entscheidung, keine Lücke.** Wer den Schlüssel
hat, kann ohnehin jedes Werkzeug rufen; der Zusatz erweitert keine Rechte, er benennt den
Anrufer. Bekäme der Schlüssel eine feinere Rechtestruktur, wäre eine Signatur Pflicht.

Verworfen: Workspace und Rolle in den URL-Pfad (`…/mcp/<ws>/<entity>`) — hätte jede header-lose
CLI mitbedient, vermischt aber Transport und Identität. Und eine stdio-Brücke — keine
Serveränderung, dafür ein Prozess mehr pro Session und eine Stelle mehr, die beim Restore hängen
kann.

### 5.2 Der Mux erteilt Codex-Vertrauen für seine eigenen Run-Verzeichnisse

`adapters/codex-trust.ts` schreibt nach `~/.codex/config.toml` — die Datei des Nutzers, in die
der Adapter sonst ausdrücklich **nicht** schreibt. Die Begründung ist nicht Bequemlichkeit:

**Der Dialog schützt vor fremdem Inhalt, und das Run-Verzeichnis hat keinen.** Unter
`runs/<workspaceId>/<entityId>/` liegt ausschließlich, was der Mux selbst erzeugt hat. Einem
Projektverzeichnis des Nutzers automatisch zu vertrauen wäre etwas völlig anderes, und
`trustRunDirectory` weist jeden Pfad ab, der nicht unter dem Run-Basisverzeichnis liegt —
geprüft auf dem aufgelösten Pfad, damit `../` nicht hinausführt, und mit Separator, damit
`runs-woanders` draußen bleibt.

Abschaltbar über `agent.codexTrustRunDirs`. Wer es abschaltet, bestätigt einmal pro
Workspace × Rolle von Hand; Vertrauen hält dauerhaft.

### 5.3 Capability-Gates sagen die Wahrheit, auch wenn sie unbequem ist

`false` heißt bei den Tier-2-Adaptern „nicht gemessen" oder „nicht gebaut" — beides bedeutet für
den Nutzer dasselbe: dieses Stück Mux fehlt in dieser Rolle. Ein Gate, das auf einer Vermutung
`true` sagt, lässt den Mux ein Werkzeug rufen, das ins Leere greift.

Bei opencode sind `getContextUsage` und `attachStatusHook` deshalb **gar nicht implementiert**,
statt leer zu versprechen; ein Test hält fest, dass sie fehlen.

### 5.4 Logik gehört nicht in den IPC-Handler

`agent/entity-adapter-map.ts` trägt die Rollen→CLI-Zuordnung als reine Funktionen, weil eine
Zuordnung, deren Fehler „die Rolle startet still die falsche CLI" heißt, prüfbar sein muss und
nicht nur ansehbar. Die Drei-Zustands-Disziplin steckt dort: ein fehlender Schlüssel ist „keine
Präferenz", ein leerer wäre ein Adapter namens `""`, und der steht in keiner Registry.

---

## 6. Fallen

- **Die Config liegt in `app.getPath('userData')`** —
  `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json`. Daneben existiert
  `~/.config/cipher-mux/config.json`, das der Mux **nicht liest**. Wer dort editiert, ändert
  nichts und sucht lange. (Genau das ist in dieser Session passiert.)
- **`LaunchOpts.projectPath` ist bei einer Entity-Session das *authored*-Verzeichnis**
  (`entities/<id>`), nicht das Arbeitsverzeichnis. Gearbeitet wird im Run-Verzeichnis, und der
  tmux-Pane startet bereits dort. Claude Code fällt das nicht auf, weil es kein cwd-Flag kennt.
- **Die Adapter-Auflösung muss überall dieselbe sein.** Vier Stellen lösen auf: Startkommando,
  `start()` (für MCP-Injektion und Status-Hook), Fork, Keep-Working-Restore. Der Restore muss
  **pro Eintrag** auflösen und `entityId` an `start()` durchreichen.
- **System Events erreicht die Electron-Fenster nicht.** Wer die UI automatisiert abnehmen will,
  braucht einen anderen Weg; blind in laufende Sessions zu klicken ist keiner.
- **Codex' Hook-Skripte brauchen ein Timeout gegen hängendes stdin.** Das erzeugte
  Usage-Skript bricht nach 5 s ab und schreibt, was da ist — ein Hook, der wartet, hält die
  Session auf.
- **`codex exec` liest zusätzlichen Input von stdin.** Im Hintergrund ohne `< /dev/null` bekommt
  es nie EOF und hängt ewig. Das hat hier einen Messlauf gekostet.

---

## 7. Was offen ist

1. **opencode ist nicht abgenommen.** Kein Rauchtest gegen die echte CLI, keine Rollengrenzen.
   Nach Abschnitt 1 ist eine nicht feuernde Grenze schlimmer als keine — deshalb wurde sie
   bewusst nicht gebaut. Der Plugin-Weg (`tool.execute.before`) ist zu messen, bevor er gebaut
   wird.
2. **Das Feld „CLI" im Presets-Reiter ist nicht visuell abgenommen.** Gebaut, typgeprüft, Logik
   unit-getestet; es rendert erst, wenn eine konkrete Rolle ausgewählt ist, und dorthin kam die
   Automatisierung nicht. Ein Klick schließt es.
3. **Vorlagen-Updates erreichen bestehende Rollen nicht** (Punkt 6 der Vorgänger-Übergabe).
   `preset.md` ist write-once. Beim Companion ist es anders: `deployCompanionGuides` und
   Geschwister schreiben bei jedem Start ohne Guard — dort erreicht eine Änderung den Bestand.
4. **Der Renderer-Fehler beim Start** (`reading 'dimensions'`) besteht unverändert. Beobachtung
   aus dieser Session: **einer pro Start**, nicht einer pro wiederhergestellter Session, wie die
   Vorgänger-Übergabe sagt. Vier Sessions, eine Meldung.
5. **`sub-agents` ist bei beiden Tier-2-Adaptern ungemessen.**

---

## 8. Zeiger

| Thema | Datei |
|---|---|
| Die vier Codex-Messungen, kurz | `CLAUDE.md`, Abschnitt „Zweite CLI: Codex" |
| Adapter-Vertrag | `src/main/agent/agent-adapter.ts` |
| Vorlage für einen neuen Adapter | `src/main/agent/adapters/_reference-stub.ts` |
| Token-Bindung samt Begründung | `src/main/mcp/bound-token.ts` |
| Verzeichnis-Vertrauen samt Grenze | `src/main/agent/adapters/codex-trust.ts` |
| Context-Usage für Codex | `src/main/monitoring/codex-usage-hook.ts` |
| Vorgänger, Punkte 3–6 weiterhin offen | `docs/superpowers/handovers/2026-10-01-uebergabe-tag-modell-und-offene-punkte.md` |
