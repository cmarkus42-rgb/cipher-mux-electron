# Website-Update-Vorschlag: cipher-mux.dev und die drei CLIs

**Stand:** 2026-10-01, Tabelle nach dem Merge von `opencode-abnahme` korrigiert · **Anlass:** Der Mux fährt seit dem 2026-10-01 drei Agent-CLIs
(`claude-code` Tier 1, `codex` Tier 2, `opencode` Tier 2). Die öffentliche Website kennt
ausschließlich Claude Code.

**Was dieses Dokument ist:** ein Vorschlag, kein Deployment. `cipher-mux.dev` liegt auf dem VPS,
und das Schreiben dort ist nicht Teil dieser Arbeit. Hier steht pro Stelle: wo sie steht, was
dort jetzt falsch oder unvollständig ist, und ein Text, den man übernehmen kann.

**Wie der Ist-Zustand erhoben wurde — und was das für die Zitate bedeutet:** per `WebFetch`
gegen die öffentlichen URLs am 2026-10-01. Der Abruf liefert eine **zusammengefasste** Fassung
der Seite, nicht den Rohtext. Die Zitate unten sind daher als *Fundstelle* belastbar, im
*Wortlaut* aber nicht garantiert. Wer die Änderungen einträgt, gleicht den bestehenden Satz am
Original ab, bevor er ihn ersetzt.

Abgerufene Seiten: `/` (Redirect auf `/de/`), `/de/`, `/en/`, `/de/features`, `/de/start`,
`/de/docs` (Redirect auf `/de/docs/start`), `/de/docs/start`, `/de/docs/concepts`,
`/de/docs/usage`.

---

## Die Faktenlage, auf die sich alle Vorschläge stützen

Quellen: `src/main/agent/agent-adapter.ts`, `src/main/agent/registry.ts`,
`src/main/agent/adapters/{claude-code,codex,opencode}.ts`, `src/main/agent/entity-adapter-map.ts`,
`src/main/session/entity-runtime.ts`, `src/main/mcp/bound-token.ts`, `CLAUDE.md`.

| | Claude Code | Codex CLI | opencode |
|---|---|---|---|
| Adapter-ID | `claude-code` | `codex` | `opencode` |
| Tier | Tier 1 | Tier 2 | Tier 2 |
| gemessen gegen | v2.1.284 | codex-cli 0.155.1 | opencode 1.18.34 |
| Projektanweisung | `CLAUDE.md` | `AGENTS.md` | `AGENTS.md` |
| `status-line` (Context-Anzeige) | ja | ja (über Usage-Hook) | ja (über Usage-Plugin) |
| `sub-agents` | ja | **nein** | **nein** |
| `mcp-injection`, `skip-permissions`, `project-instructions`, `message-bus-participant`, `companion-mcp` | ja | ja | ja |
| Rollengrenzen | `PreToolUse`-Hook | `PreToolUse`-Hook | Plugin auf `tool.execute.before` |
| Rauchtest gegen die echte CLI | ja | ja | ja |

Ein `false` in dieser Tabelle heißt im Code ausdrücklich **„nicht gemessen"**, nicht „gibt es
nicht". Für den Nutzer läuft es auf dasselbe hinaus: dieses Stück Mux fehlt dort.

**Auswahl:** Feld „CLI" pro Rolle im Preset-Editor, „Standard-CLI" global in den Einstellungen.
Auflösung: `app.entityAdapters[rolle]` > Rollen-Default > `agent.defaultAdapter`. Default bleibt
`claude-code`.

**Config:** `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json`
(`app.getPath('userData')`). Die gleichnamige Datei unter `~/.config/cipher-mux/config.json`
existiert und wird **nicht** gelesen.

**Installation:** Setup-Wizard und Abhängigkeitsprüfung (`src/main/setup/`,
`src/main/util/dependency-check.ts`) kennen nur die Claude Code CLI. Codex und opencode
installiert und authentifiziert der Nutzer selbst.

---

## 1. Startseite `/de/` — Untertitel

**Ist:** „Orchestriert Claude Code zu einem echten Entwicklungsprozess — mit Rollen, Gedächtnis
und Stimme."

**Was daran falsch ist:** Die Aussage ist zu eng. Der Mux orchestriert drei CLIs; Claude Code ist
die Voreinstellung und die einzige, für die jede Fähigkeit gemessen ist.

**Vorschlag (DE):**

> Orchestriert Coding-CLIs zu einem echten Entwicklungsprozess — mit Rollen, Gedächtnis und
> Stimme. Claude Code ist die Voreinstellung; Codex CLI und opencode laufen daneben.

**Vorschlag (EN, `/en/`):**

> Orchestrates coding CLIs into a real development process — with roles, memory, and voice.
> Claude Code is the default; Codex CLI and opencode run alongside it.

---

## 2. Startseite `/de/` und `/en/` — Fußzeile „Key Details" / Systemgrenzen

**Ist (laut Abruf):** „Requires: Claude Code subscription" bzw. „Erfordert Claude Code" und „Kein
Ersatz für die Claude Code CLI — eine grafische Orchestrierungsschicht darüber".

**Was daran falsch ist:** Der zweite Satz bleibt richtig, der erste ist es nicht mehr. Es wird
**eine** der drei CLIs gebraucht, nicht zwingend Claude Code.

**Vorschlag (DE):**

> Erfordert mindestens eine unterstützte Agent-CLI: Claude Code (Tier 1, Voreinstellung,
> Anthropic-Account), Codex CLI oder opencode (beide Tier 2). Kein Ersatz für diese CLIs — eine
> grafische Orchestrierungsschicht darüber. macOS, MIT, Open Beta.

**Vorschlag (EN):**

> Requires at least one supported agent CLI: Claude Code (Tier 1, the default, needs an Anthropic
> account), Codex CLI, or opencode (both Tier 2). Not a replacement for those CLIs — a graphical
> orchestration layer on top. macOS, MIT, open beta.

---

## 3. Neuer Abschnitt auf `/de/features` und `/en/features`: „Drei CLIs, zwei Tiers"

**Was fehlt:** Die Feature-Seite nennt keine CLI-Auswahl. Das ist die auffälligste Lücke — die
Fähigkeit existiert, ist im Preset-Editor sichtbar und steht nirgends auf der Website.

**Vorschlag (DE), als eigener Abschnitt zwischen „Presets" und „Prompt-Architektur":**

> ### Drei Agent-CLIs
>
> Eine Rolle ist nicht an eine CLI gebunden. Pro Rolle wählt das Feld „CLI" im Preset-Editor,
> welche CLI ihre Sessions starten; „Standard-CLI" in den Einstellungen setzt die Vorgabe für
> alle Rollen, die keine eigene nennen.
>
> | CLI | Tier | Projektanweisung | Was fehlt |
> |---|---|---|---|
> | **Claude Code** | Tier 1 | `CLAUDE.md` | — |
> | **Codex CLI** | Tier 2 | `AGENTS.md` | Sub-Agents |
> | **opencode** | Tier 2 | `AGENTS.md` | Context-Anzeige, Sub-Agents, Rollengrenzen |
>
> **Tier 2 heißt: nicht jede Mux-Fähigkeit ist dort gemessen.** Was fehlt, zeigt der
> Preset-Editor beim Umschalten an — vor dem Sessionstart, nicht danach. Grid, Presets, Personas,
> Workspaces, Notes, Voice und der MCP-Server arbeiten unter allen drei.
>
> Claude Code bleibt die Voreinstellung, und zwar nicht aus Gewohnheit: es ist die einzige CLI,
> für die jede Fähigkeit gemessen ist. Codex und opencode installiert und authentifiziert man
> selbst — der Setup-Wizard kennt nur Claude Code.

**Vorschlag (EN):**

> ### Three agent CLIs
>
> A role is not tied to one CLI. The "CLI" field in the preset editor picks which CLI a role's
> sessions launch; "Default CLI" in Settings sets the fallback for every role that names none.
>
> | CLI | Tier | Project instructions | Missing |
> |---|---|---|---|
> | **Claude Code** | Tier 1 | `CLAUDE.md` | — |
> | **Codex CLI** | Tier 2 | `AGENTS.md` | sub-agents |
> | **opencode** | Tier 2 | `AGENTS.md` | context display, sub-agents, role boundaries |
>
> **Tier 2 means not every Mux capability has been measured there.** What is missing is shown in
> the preset editor when you switch — before the session starts, not after. Grid, presets,
> personas, workspaces, notes, voice, and the MCP server work under all three.
>
> Claude Code stays the default because it is the only CLI for which every capability has been
> measured. Codex and opencode are installed and authenticated by you — the setup wizard only
> knows Claude Code.

---

## 4. `/de/features` — „Grid System" und „Session Management"

**Ist:** „Grid mit bis zu 21 Zellen (7×3) für Claude-Code-Sessions und Markdown-Editoren" sowie
„Jede Zelle ein isolierter Claude-Code-Prozess mit eigenem Kontextfenster und eigener Historie".

**Was daran falsch ist:** Beides ist CLI-agnostisch. In einer Zelle kann Codex oder opencode
laufen.

**Vorschlag (DE):**

> Grid mit bis zu 21 Zellen (7×3) für Agent-Sessions und Markdown-Editoren. Jede Zelle ist ein
> eigener CLI-Prozess mit eigenem Kontextfenster und eigener Historie — welche CLI, entscheidet
> die Rolle.

**Vorschlag (EN):**

> A grid of up to 21 cells (7×3) for agent sessions and Markdown editors. Each cell is its own
> CLI process with its own context window and history — which CLI is up to the role.

---

## 5. `/de/start` — Voraussetzungen

**Ist:** „macOS 12 Monterey oder neuer · Anthropic-Account mit Claude Max oder API-Key · ~1 GB
freier Speicher".

**Was daran unvollständig ist:** Der Anthropic-Account ist nur für Claude Code Pflicht. Wer Codex
oder opencode fährt, braucht ihn nicht — und braucht stattdessen etwas, das hier nicht steht.

**Vorschlag (DE):**

> **Voraussetzungen**
>
> - macOS 12 Monterey oder neuer (Apple Silicon oder Intel)
> - Mindestens eine Agent-CLI:
>   - **Claude Code** — Voreinstellung, Tier 1, braucht einen Anthropic-Account (Claude Max oder
>     API-Key). Der Setup-Wizard installiert sie.
>   - **Codex CLI** oder **opencode** — Tier 2. Selbst installieren und anmelden; der
>     Setup-Wizard kennt sie nicht.
> - ~1 GB freier Speicher (App ~140 MB, Sprachmodelle optional ~530 MB)

**Vorschlag (EN):** gleiche Struktur, übersetzt.

---

## 6. `/de/start` — Tabelle des Setup-Wizards

**Ist:** Homebrew (Pflicht), tmux (Pflicht), Node.js (empfohlen), Claude Code CLI (empfohlen),
Whisper-Model (optional), Piper TTS (optional).

**Was daran unvollständig ist:** Die Tabelle ist korrekt — der Wizard kennt wirklich nur diese
sechs. Ihr fehlt ein Satz, der sagt, dass sie nicht vollständig ist.

**Vorschlag, als Satz unter die Tabelle (DE):**

> Codex CLI und opencode stehen nicht in dieser Tabelle, und zwar nicht aus Versehen: der Wizard
> installiert sie nicht und prüft sie nicht. Wer eine Rolle auf Codex oder opencode stellt,
> bringt die CLI selbst mit.

**(EN):**

> Codex CLI and opencode are deliberately absent from this table: the wizard neither installs nor
> checks them. If you point a role at Codex or opencode, you bring the CLI yourself.

---

## 7. `/de/docs/usage` — Abschnitt „Einstellungen (Tab: Allgemein)"

**Ist (laut Abruf):** aufgeführt sind „Skip Permissions", „Keep Working" und „Bugreport".

**Was fehlt:** „Standard-CLI". Die Einstellung existiert, ist im Tab Allgemein sichtbar, wirkt
sofort — und steht in der Referenz nicht.

**Vorschlag, als Listenpunkt (DE):**

> - **Standard-CLI** — welche CLI neue Sessions starten, wenn die Rolle keine eigene nennt.
>   Auswahl aus Claude Code (Tier 1), Codex CLI (Tier 2) und opencode (Tier 2). Die Auswahl wirkt
>   sofort, nicht erst beim nächsten App-Start, und gilt nur für Sessions, die danach starten.
>   Pro Rolle lässt sie sich im Presets-Tab überschreiben. Die Anzeige benennt zu jeder CLI, was
>   unter ihr fehlt.

**(EN):**

> - **Default CLI** — which CLI new sessions launch when the role names none. Pick from Claude
>   Code (Tier 1), Codex CLI (Tier 2), and opencode (Tier 2). The choice takes effect
>   immediately, not at the next app start, and applies to sessions started after it. A role can
>   override it in the Presets tab. The field names what is missing under each CLI.

---

## 8. `/de/docs/usage` — Abschnitt zum Preset-Editor

**Was fehlt:** das Feld „CLI" pro Rolle und die Auflösungsreihenfolge.

**Vorschlag (DE):**

> **Feld „CLI"**
>
> Pro Rolle wählbar, welche CLI ihre Sessions startet. „Default" folgt der globalen Einstellung
> „Standard-CLI"; jeder andere Eintrag schlägt sie. Die Auswahl greift ab dem nächsten
> Sessionstart dieser Rolle — eine laufende Session wechselt die CLI nicht.
>
> Unter dem Feld steht, was unter der gewählten CLI fehlt (z. B. „Unter opencode fehlt:
> Context-Anzeige, Sub-Agents."). Das gehört vor den Sessionstart: es dort zu lesen ist
> billiger, als es in einer laufenden Session herauszufinden.
>
> Die Reihenfolge, in der der Mux auflöst:
>
> 1. Einstellung dieser Rolle im Preset-Editor
> 2. Default der Rolle im Code, falls sie einen trägt
> 3. „Standard-CLI" aus den Einstellungen (Werkseinstellung: Claude Code)

**(EN):** gleiche Struktur, übersetzt.

---

## 9. `/de/docs/usage` — neuer Abschnitt „Wo die Konfiguration liegt"

**Was fehlt:** die Angabe überhaupt. Der falsche Pfad hat bereits Zeit gekostet.

**Vorschlag (DE):**

> ### Wo die Konfiguration liegt
>
> ```
> ~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json
> ```
>
> Dort stehen unter anderem `agent.defaultAdapter` (globale Standard-CLI) und
> `app.entityAdapters` (CLI pro Rolle).
>
> **Es gibt daneben `~/.config/cipher-mux/config.json`. Der Mux liest diese Datei nicht.** Wer
> dort editiert, ändert nichts und sucht lange. Unter `~/.config/cipher-mux/` liegen die
> *Inhalte* — Rollen-Verzeichnisse (`entities/`), Run-Verzeichnisse (`runs/`), Sprachmodelle —,
> aber nicht die App-Einstellungen.
>
> Im Normalfall braucht man die Datei nicht: alles Genannte ist in der UI einstellbar.

**(EN):**

> ### Where the config lives
>
> ```
> ~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json
> ```
>
> It holds, among others, `agent.defaultAdapter` (the global default CLI) and
> `app.entityAdapters` (the CLI per role).
>
> **There is also `~/.config/cipher-mux/config.json`. The Mux does not read that file.** Editing
> it changes nothing and costs you a long search. `~/.config/cipher-mux/` holds *content* — role
> directories (`entities/`), run directories (`runs/`), voice models — but not app settings.
>
> You should not need the file at all: everything above is settable in the UI.

---

## 10. `/de/docs/concepts` — Abschnitt „Ehrlichkeit"

**Ist (laut Abruf):** „Das Kontextfenster ist endlich. Ist es voll, vergisst Claude — und es gibt
kein Undo."

**Was daran unvollständig ist:** Der Satz stimmt für Claude Code und gilt genauso für Codex und
opencode. Der Abschnitt heißt „Ehrlichkeit" und ist die richtige Stelle für das, was an Tier 2
noch nicht belegt ist.

**Vorschlag, als Ergänzung am Ende des Abschnitts (DE):**

> **Tier 2 ist ein Versprechen mit Lücken.** Codex CLI und opencode laufen, aber nicht jede
> Mux-Fähigkeit ist dort gemessen. Konkret: unter Codex fehlen Sub-Agents; unter opencode fehlen
> zusätzlich die Context-Anzeige und die Rollengrenzen — opencode kennt Plugin-Events statt
> Hook-Dateien, und ob damit ein Werkzeugaufruf wirklich abgelehnt werden kann, ist nicht
> gemessen. Eine Grenze, die aussieht wie eine und nicht feuert, wäre schlimmer als keine, also
> steht dort keine. Der opencode-Adapter ist außerdem bisher nur über Unit-Tests belegt, nicht
> über einen Lauf gegen die echte CLI.

**(EN):**

> **Tier 2 is a promise with gaps.** Codex CLI and opencode run, but not every Mux capability has
> been measured there. Concretely: Codex is missing sub-agents; opencode is additionally missing
> the context display and role boundaries — opencode has plugin events instead of hook files, and
> whether those can actually deny a tool call has not been measured. A boundary that looks like
> one and does not fire would be worse than none, so there is none. The opencode adapter is so
> far backed by unit tests only, not by a run against the real CLI.

---

## 11. Was **nicht** geändert werden sollte

- **Der Name „Claude Code" in der Selbstbeschreibung „mit sich selbst gebaut".** Der Mux *wurde*
  mit Claude Code gebaut; das bleibt wahr und ist keine Aussage über unterstützte CLIs.
- **Die vier Säulen auf der Startseite.** Sie sind CLI-neutral formuliert und bleiben richtig.
- **Der Satz „Kein Ersatz für die Claude Code CLI".** Nur um die beiden anderen ergänzen (Punkt
  2), nicht streichen.

---

## Anhang: Drift, die mir nebenbei auffiel

Nicht Teil der CLI-Arbeit, nicht von mir belegt über eine zweite Quelle, und bewusst als
*ungeprüft* markiert — weil die Zahlen auf der Website aus einem Abruf kommen, der
zusammenfasst, und weil mehrere Repo-Dateien untereinander schon nicht einig sind:

| Stelle | Website | Repo |
|---|---|---|
| Version auf `/de/features`, `/de/docs/*` | 0.9.101 | `package.json` 0.9.104 |
| Testzahl auf `/de/` | 1.509 | `CLAUDE.md`: 2150 pass |
| MCP-Werkzeuge auf `/de/features` | 62 in 10 Kategorien | `README.md` 37, `ARCHITECTURE.md` 40+, `CLAUDE.md` ~52 |
| Themes | `/de/features` 13, `/en/` 13 | `README.md` 10, `CLAUDE.md` 10 |

Die Zahlenfrage „wie viele MCP-Werkzeuge" und „wie viele Themes" sollte **einmal** gemessen und
dann an einer Stelle geführt werden, sonst läuft sie wieder auseinander. Ich habe sie hier nicht
beantwortet, weil ich sie nicht gezählt habe.
