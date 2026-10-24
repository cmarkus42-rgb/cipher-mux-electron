# Adapter-Capabilities und Modellauswahl

Ausgelagert aus CLAUDE.md am 2026-10-24 (Kontext-Diät). Wer an Adapter-Capabilities oder Modellauswahl arbeitet, liest diese Datei vollständig.

## Capabilities: zwei schalten, fünf behaupten

`AdapterCapabilities` hat sieben Flaggen. **Gemessen am 2026-10-01 lesen nur zwei davon
überhaupt jemand:**

| Flagge | Leser | Wirkung |
|---|---|---|
| `status-line` | 5 | Context-Anzeige im PaneHeader, Fork-Knopf in `SessionCell` |
| `mcp-injection` | 1 | ob `postLaunchInjection` überhaupt läuft |
| `skip-permissions` | 0 | — |
| `project-instructions` | 0 | — |
| `message-bus-participant` | 0 | — |
| `companion-mcp` | 0 | — |
| `sub-agents` | 0 | — |

Die fünf unteren sind **Aussagen über die CLI, keine Schalter im Programm.** Ein `false`
dort ändert heute nichts — es dokumentiert nur, dass etwas ungemessen oder nicht gebaut ist.

**Das ist eine Falle für die UI.** Der Preset-Editor nannte zunächst alle vier „interessanten"
Flaggen im Hinweis „Unter X fehlt: …" und kündigte damit Folgen an, die nicht eintreten.
`NAMED_CAPABILITIES` nennt deshalb nur noch die zwei wirksamen. Wer eine der fünf verdrahtet,
trägt sie dort nach.

Und `sub-agents` ist ein eigener Fall: **beide Tier-2-CLIs haben Unteragenten.** Codex kennt
die Hook-Events `SubagentStart` / `SubagentStop` und ein `codex agents`-Unterkommando, opencode
hat `--agent <name>` und `opencode agent`. Das `false` heißt dort „ob der Mux davon etwas
sieht, ist ungeprüft" — nicht „gibt es nicht".

## Modellauswahl pro Rolle

`AgentAdapter.listModels()` ist **optional**, weil die drei CLIs es verschieden gut können
(gemessen 2026-10-01):

| CLI | auflistbar | Quelle | Dauer |
|---|---|---|---|
| Claude Code | **nein** | `--help` nennt `opus`, `sonnet`, `fable` als *Beispiel* | 0 ms |
| Codex | ja | `codex debug models` → `slug`, `display_name`, `context_window` | ~26 ms |
| opencode | ja | `opencode models` → `anbieter/modell` | ~920 ms |

**Drei Dinge, die hier leicht kaputtgehen:**

1. **Der Codex-Modellname steht unter `slug`, nicht unter `id`.** Das Feld `id` gibt es in
   diesen Einträgen gar nicht — wer darauf liest, bekommt eine Liste leerer Namen.
2. **Keine dieser Listen ist vollständig.** Alle drei CLIs nehmen auch einen vollen
   Modellnamen, der nicht darin steht. Deshalb ist das Feld ein Freitextfeld *mit* Vorschlägen
   (`datalist`), nicht ein Dropdown — und `ENTITY_MODEL_SET` prüft bewusst **nicht** gegen die
   Liste.
3. **Bei opencode ist die Liste nicht stabil.** Sie zeigt nur Modelle angemeldeter Anbieter:
   ohne Anmeldung acht freie, mit Anmeldung mehr. Das ist richtig — angezeigt gehört, was
   benutzbar ist — aber es heißt, dass die Liste eine Momentaufnahme ist und kein Katalog.
   Zwischengespeichert wird pro App-Lauf; ein Neustart holt sie neu.
