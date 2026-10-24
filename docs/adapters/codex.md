# Codex-Adapter

Ausgelagert aus CLAUDE.md am 2026-10-24 (Kontext-Diät). Wer an dem Codex-Adapter arbeitet, liest diese Datei vollständig.

## Zweite CLI: Codex — und die vier Messungen, die den Adapter bestimmen

`adapters/codex.ts` ist Tier-2 und gemessen an **codex-cli 0.155.1 (2026-10-01)**. Dieselbe
Disziplin wie oben: das hier steht in keinem Diff und kann mit der nächsten CLI-Version kippen.

1. **`AGENTS.md` wird befolgt**, hierarchisch nach Scope, und eine direkte Instruktion schlägt
   sie. Damit trägt dieselbe Injektionsmechanik wie CLAUDE.md bei Claude Code.
2. **`PreToolUse`-Hooks tragen wortgleich das Claude-Code-Protokoll** —
   `hookSpecificOutput.permissionDecision` mit `allow`/`deny`/`ask`, `permissionDecisionReason`,
   Exit 2 plus stderr. Ein `deny` wirkt auch unter
   `--dangerously-bypass-approvals-and-sandbox`, und der Grund erreicht das Modell wörtlich.
3. **Ohne `--dangerously-bypass-hook-trust` feuert ein frisch geschriebener Hook nicht — still.**
   Keine Warnung, keine Logzeile, der Aufruf läuft durch. Deshalb setzt der Adapter beide Flags
   gemeinsam. Eine geschriebene und nicht feuernde Grenze ist schlimmer als keine.
4. **Der `matcher` trägt den Claude-Code-Werkzeugnamen.** Der Hook-Input meldet
   `tool_name: "Bash"`, obwohl die Ausgabe `exec` und `/bin/zsh -lc` zeigt. `matcher = "shell"`
   passt auf nichts und überspringt den Hook — wieder still. Der Adapter schreibt deshalb
   **keinen** Matcher und filtert im Hook-Skript.

Dazu zwei Eigenschaften, die den Bau erst möglich machen: eine **projektlokale
`.codex/config.toml`** greift (sonst müsste der Mux die globale Config des Nutzers anfassen, und
zwei Workspaces würden sich überschreiben), und `hooks.<Event>`-Einträge werden **nicht
validiert** — `{bogus=1}` und ein erfundener Eventname gehen durch. Zusammen mit den zwei
stillen Fehlschlägen heißt das: **das Feuern nachweisen, nicht die Datei schreiben.**

**Die Rollengrenze hat einen eigenen Pfadbegriff** (`adapters/codex-boundary.ts`), und das ist
kein Beiwerk: das generische Skript aus `entity-boundaries.ts` liest `tool_input.file_path`, und
**Codex liefert das nicht**. Sein Datei-Werkzeug heißt `apply_patch`, der Input ist
`{"command": "*** Begin Patch\n*** Add File: /abs/pfad\n…"}` — der Pfad steckt in einem
Patch-Umschlag. Das generische Skript hätte einen leeren String gelesen und **jeden** Dateizugriff
durchgelassen. Gezogen werden die Pfade aus allen vier Patch-Köpfen (Add/Update/Delete/Move to);
eine verbotene Datei verbietet den ganzen Aufruf, denn ein Patch lässt sich nicht zur Hälfte
anwenden. Die Regeln selbst bleiben die aus `entity-boundaries.ts` — neu ist nur die Antwort auf
die Frage, **wo der Pfad steht**.

Erzeugt wird sie in `postLaunchInjection`, also dort, wo auch die `.codex/config.toml` entsteht,
die sie registriert. Das ist Absicht: bis zum 2026-10-01 schrieb der SessionManager seine
`role-boundary.js` unbedingt nach `.claude/settings.local.json` — eine Datei, die Codex nicht
liest — und `buildCodexProjectConfig` bekam seinen `boundaryHookPath` von niemandem. Eine
Codex-Session lief ohne Grenze, obwohl der Mechanismus gemessen und der Parameter vorhanden war.
Gefunden bei der opencode-Abnahme. **Wer einen Adapter baut, erzeugt seine Grenze dort, wo die
Datei entsteht, die sie trägt.**

> **Die Shell-Lücke bleibt.** `Bash` trägt keinen Pfad, nur ein Kommando — eine Datei lässt sich
> darüber weiterhin ändern. Dieselbe Lücke hat Claude Code. Sie zu schließen hieße Shell-Syntax
> zu parsen, und ein halbherziger Parser wäre wieder eine Grenze, die nur so aussieht. Die Grenze
> ist eine Leitplanke gegen Versehen, kein Sandkasten.

**Context-Usage ohne Statusline:** Codex' `status_line` ist eine TUI-Anzeigeoption, kein
Kommando. Stattdessen trägt jeder Hook-Input `transcript_path`, und in der Rollout-JSONL steht
pro Antwort ein `token_usage_record`. `monitoring/codex-usage-hook.ts` erzeugt daraus genau das
JSON, das der bestehende `StatusLineMonitor` schon liest — ein weiterer Schreiber, kein zweiter
Leser. Das `session_id`-Feld darin ist nicht Beiwerk: Keep Working braucht es für
`codex resume <id>` statt des interaktiven Pickers.

**Drei Dinge halten eine unbeaufsichtigte Codex-Session auf, und alle drei sind stumm oder
blockierend.** Zwei nimmt der Adapter weg, das dritte braucht einen Eintrag außerhalb:

1. **Verzeichnis-Vertrauen.** Codex lädt projektlokale Config, Hooks und exec-Policies **nur**
   aus einem vertrauten Verzeichnis und fragt sonst in einem blockierenden Dialog. Ein
   nachträgliches „Yes" lädt sie **nicht nach** — die Session steht dann am Prompt und hat
   trotzdem keine MCP-Werkzeuge, keinen Usage-Hook und keine Rollengrenze. Gemessen und
   wirkungslos: `-c projects."<pfad>".trust_level`, `CODEX_NON_INTERACTIVE=1`, beide
   Bypass-Flags. Es geht nur über `~/.codex/config.toml`. `adapters/codex-trust.ts` trägt das
   Run-Verzeichnis dort ein — und **nur** das: der Dialog schützt vor fremdem Inhalt, und unter
   `runs/<workspaceId>/<entityId>/` liegt ausschließlich Mux-Erzeugtes. Jeder andere Pfad wird
   abgewiesen, auf dem aufgelösten Pfad geprüft. Abschaltbar über `agent.codexTrustRunDirs`.
2. **Der Update-Hinweis** ist ein Auswahldialog, kein Banner →
   `-c check_for_update_on_startup=false`.
3. **`-C` auf das falsche Verzeichnis** — siehe `buildLaunchCommand`, der Adapter setzt es
   bewusst nicht.

**Die CLI pro Rolle wählt man in der UI**, seit dem 2026-10-01: Feld „CLI" im Preset-Editor,
„Standard-CLI" in den Einstellungen. Die Auflösung ist älter (`entityAdapters` > Rollen-Default
> `agent.defaultAdapter`); neu ist nur der Weg, sie zu setzen. Die Logik dahinter steht als
reine Funktionen in `agent/entity-adapter-map.ts`, nicht im IPC-Handler — ein fehlender
Schlüssel ist „keine Präferenz", ein leerer wäre ein Adapter namens `""`.

**Die Config liegt in `app.getPath('userData')`**, also
`~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json` — **nicht** in
`~/.config/cipher-mux/config.json`. Diese zweite Datei existiert und wird vom Mux **nicht**
gelesen; wer dort editiert, ändert nichts und sucht lange.

**MCP-Bindung ohne Header: das Token trägt sie.** Codex sendet dem MCP-Server **keine freien
Header** (gemessen gegen einen Horchposten: Verbindung ja, `X-Mux-*` nein; der
`headers`-Schlüssel wird stillschweigend verworfen). Workspace und Rolle reisen deshalb im
Bearer-Token mit — `mcp/bound-token.ts`, Format `<apiKey>.<base64url(JSON)>`:

- Ein Token **ohne Punkt** ist der blanke Schlüssel und heißt „ungebunden" — also exakt das,
  was jeder bestehende Client schickt. Zustandslos, keine Tokenverwaltung.
- `stripBindingFromAuthHeader` läuft **vor** `validateBearer`. Ohne diesen Schritt wäre jede
  Codex-Verbindung ein 401 — und zwar erst beim Benutzen, nicht beim Schreiben der Config.
- Am `initialize` hat der **Kopf Vorrang**, das Token fällt pro Feld ein. Beide werden gegen die
  bekannten IDs geprüft; eine Bindung aus dem Token ist eine Behauptung wie die aus dem Kopf.
- **Der Zusatz ist nicht signiert, und das ist eine Entscheidung.** Wer den Schlüssel hat, kann
  ohnehin jedes Werkzeug rufen — der Zusatz erweitert keine Rechte, er benennt den Anrufer.
  Bekäme der Schlüssel eine feinere Rechtestruktur, wäre eine Signatur Pflicht.
- Das Token steht in der tmux-Umgebung (`CIPHER_MUX_MCP_TOKEN`), **nicht** in der generierten
  `.codex/config.toml`. `CIPHER_MUX_MCP_KEY` bleibt unverändert daneben stehen.

**opencode braucht das nicht** — dieselbe Messung, alle drei Header kamen an. Die Lücke ist
codex-spezifisch, nicht eine des Adapter-Vertrags.

**Companion Memory nur für Companion:** Der MCP-Server bindet die Rolle über `X-Mux-Entity` an
die Verbindung (`src/main/mcp/entity-header.ts`) und registriert die vier `companion_memory_*`
nur für Companion — oder für Verbindungen ohne Rolle, das ist die App selbst. Eine Permission
zu entfernen hätte nicht gereicht: sie erzeugt eine Rückfrage, sie hält kein Werkzeug zurück.
