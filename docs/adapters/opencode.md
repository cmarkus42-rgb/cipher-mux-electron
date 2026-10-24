# opencode-Adapter

Ausgelagert aus CLAUDE.md am 2026-10-24 (Kontext-Diät). Wer an dem opencode-Adapter arbeitet, liest diese Datei vollständig.

## Dritte CLI: opencode — und der eine Fehler, der wie Erfolg aussah

`adapters/opencode.ts` ist Tier-2 und gemessen an **opencode 1.18.34 (2026-10-01)**, erst gegen
Unit-Tests, dann gegen die laufende CLI mit einem echten Modell. Die zweite Runde ist die, die
zählt.

- **`AGENTS.md`** ist die Projektanweisung, **`CLAUDE.md` nur der Ersatz** — gemessen am
  2026-10-09: liegt eine `AGENTS.md` daneben, liest opencode die `CLAUDE.md` **gar nicht**. Bei
  Ordner-Sessions entscheidet `instructionsTarget` pro Adapter, wohin der Mux schreibt: Claude Code
  `CLAUDE.md`, opencode die vorhandene der beiden (bevorzugt `AGENTS.md`), Codex immer `AGENTS.md`
  — neu angelegt mit Verweis auf die `CLAUDE.md`, sonst verlöre opencode danach die eigentlichen
  Projektanweisungen.
- **Freie MCP-Header kommen an** — `authorization`, `x-mux-workspace`, `x-mux-entity` alle drei,
  unter `user-agent: opencode/1.18.34`, gegen denselben Horchposten wie bei Codex. Deshalb nutzt
  der Adapter `buildMcpServerConfig` aus `mcp/workspace-header.ts` und **nicht** die
  Token-Bindung; die Kopfnamen stehen weiter nur an einer Stelle. Geschrieben wird
  `opencode.json`, **lesen-mergen-schreiben** wie bei `settings.local.json`: Besitz hat der Mux
  an `mcp['cipher-mux']` und an seinen **eigenen zwei** Einträgen im `plugin`-Feld.
- **Die Hülle heißt anders**: `type: "remote"` statt `"http"`, plus ein ausdrückliches
  `enabled: true`. Nur das wird umgeformt, nicht die Köpfe.

**Der Befund der Abnahme: kein positionales Projektargument.** `opencode [project]` nimmt ein
Verzeichnis entgegen, und der Adapter gab `projectPath` dorthin. Gemessen mit tmux-cwd =
Run-Verzeichnis und Argument = authored-Verzeichnis: `pane_current_path` **und** opencodes eigene
Statuszeile zeigten das authored-Verzeichnis, und am Horchposten kam **null** Verbindung an
(gegen zwölf ohne das Argument). Die generierte `opencode.json` lag im Run-Verzeichnis und wurde
nie gelesen — keine MCP-Werkzeuge, keine Grenze, kein Usage, und die Session stand am Prompt und
sah gesund aus. Es ist derselbe Fehler, den Codex' `-C` hatte, aus demselben Grund:
`LaunchOpts.projectPath` ist bei einer Entity-Session das **authored**-Verzeichnis, gearbeitet
wird im **Run**-Verzeichnis. Jetzt wird das cwd des Panes geerbt, wie bei Claude Code.

Der Rest des Startkommandos: `--auto` statt `--dangerously-skip-permissions`, Resume
`--session <id>`, bare Resume `--continue`, Fork `--session <id> --fork` — `--fork` ist allein
ungültig. **Niemals `--pure`**: das lädt die Session ohne Plugins, also ohne Grenze und ohne
Usage.

**Rollengrenzen über ein Plugin — und sie feuern.** opencode hat keine `PreToolUse`-Konfiguration,
sondern Plugin-Module. Von seinen Events kann nur `tool.execute.before` einen Aufruf aufhalten:
ein **Wurf** dort verhindert die Ausführung. Nachgewiesen in `opencode run` *und* in der TUI unter
`--auto`, mit einem echten Modell und dem echten Workshop-Grund aus `entity-boundaries.ts`:

- `src/NOPE.txt` entstand **nicht**, `docs/OK.txt` entstand — selektiv, keine Pauschalsperre.
- Der abgelehnte Aufruf endet als `state.status: "error"` mit dem Grund in `state.error`; das
  Modell zitierte ihn danach wörtlich („Du bist kein Coder, du koordinierst").
- Der Wurf ist pro Werkzeugaufruf eingeschlossen: derselbe Zug lief weiter, die Session blieb.
- `--auto` umgeht ihn nicht. Es beantwortet Permission-Rückfragen automatisch, und das hier ist
  keine — genau deshalb nicht opencodes `permission`-Regelwerk.

**Vier stille Fehlschläge rund um die Plugins**, alle gemessen, alle der Grund für die jetzige
Form:

1. **Ein CommonJS-Plugin lädt nicht.** `module.exports = fn` wird mit „Plugin export is not a
   function" abgewiesen — und diese Zeile steht **nur** unter `--print-logs`. Beide erzeugten
   Plugins sind deshalb ESM mit Default-Export einer Funktion.
2. **Der Hook `permission.ask` feuert nie.** opencodes eigene Hilfe führt ihn auf; im Binary gibt
   es `trigger("…")` für jeden anderen Hooknamen und für diesen keinen. Eine darauf gebaute
   Grenze wäre geschrieben und tot.
3. **`read` trägt auch einen `filePath`.** Eine Grenze auf „irgendein Pfadargument" hätte die
   Rolle blind gemacht statt nur schreibunfähig. Gefiltert wird deshalb nach Werkzeugnamen; die
   drei schreibenden heißen `write`, `edit`, `apply_patch` — abgelesen an
   `GET /experimental/tool/ids`, nicht übersetzt.
4. **`bash` trägt keinen Pfad**, nur `command`. Die Grenze deckt die Shell nicht ab — dieselbe
   Lücke wie bei Claude Code, bewusst gleich gelassen.

**Wo die Plugins liegen und wie sie registriert sind:** `.opencode/plugin/` **und**
`.opencode/plugins/` werden beide gescannt, jede `*.ts` und jede ESM-`*.js` darin wird geladen.
Der Mux schreibt in den Singular *und* trägt die Datei als `file://`-URL im `plugin`-Feld ein —
gemessen lädt das **nicht** doppelt (ein Ladevorgang, ein `plugin_origins`-Eintrag), und der
Eintrag macht die Verdrahtung in `opencode debug config` nachlesbar. Eine Rolle ohne Grenze
verliert Datei *und* Eintrag; ein stehengebliebenes Plugin würde weiter eine Regel erzwingen, die
niemand mehr nennt.

**Context-Usage über denselben Plugin-Weg.** Ein `event`-Hook sieht jedes Bus-Ereignis — Eingabe
ist genau `{ event: { id, type, properties } }` —, und `message.updated` trägt pro
Assistentennachricht `sessionID`, `modelID` und `tokens`. `monitoring/opencode-usage-plugin.ts`
baut daraus genau das JSON, das der `StatusLineMonitor` schon liest: ein weiterer Schreiber, kein
zweiter Leser, wie bei Codex. Das `session_id`-Feld trägt Keep Working (`--session <id>` statt
„die letzte Unterhaltung dieses Verzeichnisses"). Zwei Feinheiten: die **erste** Fassung derselben
Nachricht kommt mit `tokens` auf Null und **ohne** `total` — daran trennt das Plugin „noch nichts
gemessen" von „gemessen", statt 0 % zu behaupten. Und die **Fenstergröße ist geschätzt**: `GET
/api/model` eines laufenden opencode liefert ohne angemeldeten Anbieter eine leere Liste, einen
selbst eingetragenen Anbieter kennt der Katalog nie. Die Tokenzahlen sind gemessen, die
Prozentzahl ist eine Schätzung gegen `OPENCODE_FALLBACK_CONTEXT_WINDOW` — dieselbe Entscheidung
wie bei Codex.

**Bekannt, nicht behoben (2026-10-14, opencode 1.19):** eine opencode-Zelle bleibt nach dem Start
einige Sekunden länger schwarz als eine Claude-Zelle. tmux hat den Bildschirm dann schon (gemessen:
Eingabefeld nach ~5 s im Mux, 2,6 s ohne). Vermutung, nicht belegt: die Zelle verpasst das erste
Bild, eine Session < 10 s holt bewusst keinen Schnappschuss (`isBrandNew` in `useTerminal.ts`), und
opencode zeichnet — anders als Claude Code mit seinem Spinner — erst bei der nächsten Änderung neu.
Der User kann damit leben; Worker-Sessions laufen unbeaufsichtigt und sind nicht betroffen.

**Was weiter `false` steht:** `sub-agents`. `--agent <name>` existiert, belegt aber keine
Unteragenten, die der Mux sieht.

**Kein blockierender Dialog gefunden.** Anders als Codex (Update-Hinweis als Auswahldialog,
Verzeichnis-Vertrauen) kommt opencode direkt an den Prompt — kein Update-Dialog, keine
Vertrauensfrage. Was eine unbeaufsichtigte Session hier aufhält, ist etwas anderes: **ohne
angemeldeten Anbieter** steht sie am Prompt mit dem Hinweis „Run /connect to add an AI provider"
und tut auf jede Eingabe nichts. Das ist kein Dialog, den ein Flag wegnimmt — es ist eine
Voraussetzung, die vor dem Start erfüllt sein muss.
