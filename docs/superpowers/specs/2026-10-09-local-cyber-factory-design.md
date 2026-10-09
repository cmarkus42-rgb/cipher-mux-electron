# Local Cyber Factory — Claude schneidet zu und prüft, ein lokales Modell codet

**Stand:** 2026-10-09 · Design abgestimmt im Gespräch, noch nicht gebaut
**Anlass:** Mac Studio M5 Ultra (256 GB) kommt. Ziel ist, Claude-Kontingent für das reine Coden
zu sparen, ohne einen eigenen Harness zu bauen.

## 1. Ziel und Reihenfolge

Eine Rolle **Local Cyber Factory** zerlegt Arbeit in Häppchen, öffnet pro Häppchen eine
sichtbare Mux-Session mit **opencode und einem lokalen Modell dahinter**, gibt ihr einen
zugeschnittenen Auftrag und prüft das Ergebnis. Eine zweite Rolle **Local Worker** arbeitet die
Aufträge ab.

Die Ziele in dieser Reihenfolge:

1. **(a) Kontingent sparen** — Claude ist Architekt und Prüfer, lokal läuft das Coden. *Dieses
   Dokument.*
2. **(c) Autonomie** — Läufe über Nacht ohne Kontingentgrenze. Folgt aus (a), wenn es trägt.
3. **(b) Daten bleiben im Haus** — auch der Architekt lokal. Erst mit stärkeren Open-Weights.

Erfolgskriterium für (a): Ein Lauf über mehrere Häppchen kommt durch, und die Zählung zeigt,
wie viel der Worker allein geschafft hat und wie oft eskaliert wurde.

## 2. Verhältnis zum Strategiepapier

`2026-09-29-prozess-substrat-strategie.md` sagt in Abschnitt 3: Orchestrierung kann Claude Code,
abgeben. Das gilt hier nicht, und zwar aus dem Grund, den dasselbe Papier nennt: Gebraucht werden
Peers **mit eigenem Modell**. Ein Claude-Subagent kann nicht auf einem lokalen Modell laufen. Die
Orchestrierung, die der Mux hier übernimmt, ist die über CLI- und Modellgrenzen hinweg — nicht
ein Nachbau dessen, was Claude Code schon kann.

Nebenbefund: Die Vorgabe der normalen Cyber Factory (`cyber-factory-template.ts`, `preset.md`)
beschreibt weiter Worker-Sessions per `tmux send-keys`. Abgegeben ist die Orchestrierung bisher
nur im Strategiepapier, nicht im Rollentext. Nicht Gegenstand dieser Spec.

## 3. Was aus Keel übernommen wird

cipher-keel hat einen eigenen Harness mit Architekt-/Worker-Split vollständig durchgemessen
(`cipher-keel-electron/docs/superpowers/befunde/2026-09-20-die-kette-faehrt.md`,
`…/2026-09-25-bis-es-durchlaeuft.md`). Das Coding-Ergebnis war brauchbar, der Architekt zu teuer.

**Warum er teuer war:** Der Architekt (qwen3-coder über OpenRouter, nicht Claude) wurde pro
Wecken neu gestartet und las seinen Verlauf jede Runde ohne Prompt-Cache neu — 3,3 Mio. Eingabe-
gegen 29 k Ausgabe-Tokens in einer Welle. Dazu Erkundung bekannter Bäume, Schema-Ablehnungen,
selbst programmieren per Shell (33 von 60 Aufrufen), Nachbesserungen für grüne Stände.

**Warum es hier anders sein sollte:** Der Architekt ist eine **durchlaufende** Claude-Code-Session
mit Prompt-Cache, geweckt per `send-keys`, nicht neu gestartet. Warten kostet keine Züge, weil der
Mux wartet.

**Übernommene Lehren, als Mechanismus statt als Bitte:**

| Keel-Befund | Hier |
|---|---|
| Regeln hielten nur im Schema und im Code | Auftrag als Pflichtfelder; „Claude coded nie“ als Rollengrenze |
| Nacherzählte Diagnosen verloren den Fehlerort | Gate-Ausgabe geht wörtlich in den nächsten Auftrag |
| Worker schwächten Tests ab | geschützte Abnahmetests, Prüfsumme und Diff-Prüfung im Gate |
| Rücknahme war mühsam | Commit pro grünem Häppchen, Reset auf Basis bei rot |
| Veraltete Aufträge zerstörten grüne Stände | Vorprüfung gegen den aktuellen Stand vor jedem Start |
| Ausgabelimit schnitt Werkzeugargumente ab, gemeldet als normaler Aufruf | Rauchtest misst es; Gate fängt es als rot |
| Grün hieß nicht „Spec erfüllt“ | Architekt liest jeden grünen Commit gegen die Spec |

## 4. Entscheidungen

| # | Frage | Entscheidung |
|---|---|---|
| E1 | Warum lokal | (a) Kontingent, dann (c), dann (b) |
| E2 | Parallel oder nacheinander | **Nacheinander.** Parallelität erst nach Messung auf der Hardware |
| E3 | Prüfung fällt durch | Präziserer Auftrag an einen **frischen** Worker; nach 2 Fehlschlägen Eskalation an den User. **Claude coded nie selbst.** Jeder Versuch wird gezählt |
| E4 | Weg zum Modell | **Direkt:** opencode spricht den lokalen OpenAI-kompatiblen Endpunkt an, kein Gateway dazwischen |
| E5 | Wer schreibt Tests | Architekt schreibt den Abnahmetest des Kriteriums (geschützt), Worker ergänzt eigene Unit-Tests (frei) |
| E6 | Wer merkt „fertig“ | Ein **Läufer im Mux** ohne Modell — nicht der Architekt per Polling |
| E7 | Worker-CLI | **opencode** (abgenommen). Der Worker-Vertrag ist CLI-neutral, pi kommt später als zweiter Adapter für einen direkten Vergleich |

Zu E3, die Gegenstimme aus Keel: Bei einer schon diagnostizierten Kleinstkorrektur war der
Orchestrator selbst billiger als zwei weitere Worker-Runden. E3 bleibt trotzdem, weil die erste
Phase messen soll, was das lokale Modell kann — jede stille Rettung durch Claude verfälscht das.
Lockern nach Zahlen.

Zu E7: pi hat einen System-Prompt unter 1000 Tokens und vier Werkzeuge. Auf Apple Silicon ist
Prefill der Engpass, ein kleiner Harness kann deshalb spürbar schneller sein. Ungemessen. pi wäre
der vierte Adapter mit allen Messungen, die Codex und opencode gebraucht haben.

## 5. Rollen

Zwei neue Einträge in `src/main/session/entity-registry.ts`:

| Rolle | CLI | darf schreiben | darf nicht schreiben |
|---|---|---|---|
| `local-factory` | Claude Code | Aufträge, Abnahmetests | Produktionscode |
| `local-worker` | opencode, lokales Modell | Code, eigene Unit-Tests | geschützte Abnahmetests |

- Beide Grenzen in `entity-boundaries.ts`. Die Grenze des Architekten setzt E3 durch — in Keel
  hat der Architekt trotz Prompt selbst programmiert.
- Die geschützten Pfade des Workers wechseln pro Häppchen. Weil jeder Versuch eine frische
  Session startet, schreibt der Läufer sie beim Start in die Plugin-Grenze des Workers. Das ist
  eine Leitplanke; durchgesetzt wird der Testschutz im Gate (Abschnitt 7), das auch Änderungen
  über die Shell sieht.
- `local-worker` ist `singleInstance` — pro Workspace läuft höchstens einer. Das macht E2 zur
  Eigenschaft der Registry statt zur Disziplin des Architekten.
- `local-worker` hat als Rollen-Default den Adapter `opencode`.
- `mux_create_session` startet fest `claude` und kennt keine Adapter. Der Worker läuft deshalb
  als Entity, nicht als freie Session.

## 6. Konfiguration des lokalen Modells

In der Mux-Config (`app.getPath('userData')/cipher-mux-config.json`) unter `agent.localWorker`:

```json
{ "baseUrl": "http://…/v1", "model": "…", "contextWindow": 131072, "maxOutputTokens": 16384 }
```

- Der opencode-Adapter schreibt daraus einen eigenen Anbieter in die `opencode.json` des
  Run-Verzeichnisses (lesen-mergen-schreiben wie bisher; Besitz des Mux nur an seinem
  Anbieter-Eintrag).
- `contextWindow` ersetzt bei diesem Anbieter `OPENCODE_FALLBACK_CONTEXT_WINDOW` — die
  Prozentanzeige ist dann gemessen gegen eine bekannte Größe, nicht geschätzt.
- Kein Schlüssel in der Config. Braucht ein Endpunkt einen, kommt er aus einer Datei in `$HOME`,
  wie beim Gateway.
- **Bis der Mac Studio da ist:** das vLLM auf dem DGX Spark (Qwen 27B, OpenAI-kompatibel), das
  Keel schon benutzt hat. Später ändert sich nur `baseUrl` und `model`. Vorbehalt: Mit dem 27B kam
  Keels Fix-Welle 5 Stunden lang nicht voran. Für den Ablauf reicht es, über die Arbeitsqualität
  sagt es wenig.

## 7. Ablauf eines Häppchens

„Mux“ heißt in diesem Abschnitt: Code ohne Modell, keine Tokens.

1. **Zuschnitt (Claude).** Der Architekt schreibt den Abnahmetest für das Kriterium und ruft
   `mux_local_worker_dispatch` mit Pflichtfeldern:
   `ziel`, `dateien`, `akzeptanzkriterium`, `geschuetzteTests` (Pfade), `testBefehl`,
   `nichtZiele`, optional `vorherigesGate` (Pfad, bei einem neuen Versuch).
2. **Vorprüfung (Mux).**
   - Endpunkt erreichbar (`GET <baseUrl>/models`). Sonst: Architekt mit „Endpunkt weg“ wecken,
     kein Versuch gezählt.
   - Arbeitsbaum sauber. Sonst Ablehnung mit Begründung.
   - Geschützte Tests existieren und der Testbefehl ist **rot**. Ein Abnahmetest, der vor der
     Arbeit grün ist, prüft nichts.
   - Basis-Commit und Prüfsummen der geschützten Tests werden festgehalten.
3. **Start (Mux).** Eine bestehende `local-worker`-Session wird beendet, eine frische gestartet —
   kein Kontext aus früheren Häppchen. Der Auftrag wird als `AUFTRAG.md` ins Run-Verzeichnis des
   Workers geschrieben (bei neuem Versuch mit der Gate-Ausgabe im Wortlaut). Nach der Startwartezeit
   geht per `send-keys` eine kurze Zeile: „Lies AUFTRAG.md, arbeite ihn ab, schreib REPORT.md."
4. **Arbeit (lokal).** Der Worker codet im Projekt und schreibt zum Schluss `REPORT.md` ins
   Run-Verzeichnis.
5. **Ende erkennen (Mux).** Fertig = `REPORT.md` existiert **und** die opencode-Session ist
   untätig (Ereignis über das vorhandene Plugin). Hänger: Stuck-Erkennung aus
   `cyber-factory/worker-monitor.ts` oder harter Timeout.
6. **Gate (Mux).**
   - Testbefehl ausführen, Ausgabe festhalten.
   - Prüfsummen der geschützten Tests vergleichen.
   - `git diff --name-only <basis>` gegen die geschützten Pfade — gleichgültig, über welches
     Werkzeug die Änderung kam.
   - Grün: Commit `lf: <ziel>`. Rot oder hängt: Diff als Patch sichern, Baum auf die Basis
     zurücksetzen.
   - Ergebnis nach `gate.json`.
7. **Wecken (Mux → Claude).** Eine Zeile per `send-keys`, z. B.
   `[local-factory] #3 „Login-Formular": ROT, Versuch 1/2, Gate: <pfad>/gate.json`.
8. **Prüfung (Claude).** Grün: Commit gegen die Spec lesen, abnehmen oder nachfordern. Rot: neu
   dispatchen mit `vorherigesGate`. Nach 2 Fehlschlägen an den User eskalieren.

`mux_local_worker_dispatch` ist nur für die Rolle `local-factory` registriert — derselbe
Mechanismus wie bei den Companion-Memory-Werkzeugen. Der Aufruf kehrt sofort zurück; das Ergebnis
kommt über das Wecken.

## 8. Zählung

Pro Lauf eine `lauf.json` im Run-Verzeichnis von `local-factory`, pro Häppchen:

- Nummer, Ziel, Versuche, Ergebnis (`abgenommen` / `eskaliert` / `hängt` / `abgebrochen`)
- Worker-Laufzeit, lokale Tokens (aus dem Usage-Plugin), Gate-Dauer
- Pfade zu `gate.json` und gesicherten Patches
- Weckrufe des Architekten und seine Kontextnutzung beim Wecken

**Keine neuen Spalten in den SQLite-Tabellen** der Cyber Factory — das wäre eine Migration. Die
JSON-Datei ist zudem direkt lesbar. Am Laufende fasst der Architekt sie als Note zusammen.

**Ehrliche Lücke:** Was der Architekt im Abo kostet, misst der Mux nicht. Weckrufe und
Kontextnutzung sind eine Näherung — genug für einen Trend, kein Euro-Betrag.

## 9. Fehlerfälle

| Fall | Reaktion |
|---|---|
| Endpunkt nicht erreichbar | Vorprüfung schlägt fehl, Wecken mit „Endpunkt weg“, kein Versuch gezählt |
| Worker hängt / Timeout | Session beenden, Patch sichern, Reset, zählt als Fehlversuch „hängt“ |
| Abgeschnittene Ausgabe | erscheint als kaputter Edit, Gate rot, Versuch gezählt |
| Baum beim Dispatch nicht sauber | Ablehnung mit Begründung |
| Abnahmetest vor der Arbeit grün | Ablehnung: der Test prüft nichts |
| Mux-Neustart im Lauf | laufendes Häppchen in `lauf.json` als `abgebrochen`; keine Wiederaufnahme in v1 |
| Wecken trifft beschäftigten Architekten | Annahme: Claude Code reiht die Eingabe ein. **Im Rauchtest prüfen** |

**Fragile Zone:** Der Läufer hängt sich **nicht** in die Init-Kette von Keep Working. Alles, was
er beim Start liest, ist defensiv und in `try`/`catch` — ein Fehler dort darf den Session-Restore
nicht mitreißen.

## 10. Rauchtest zuerst

Vor dem Läufer, gegen den Spark, von Hand. Drei Messungen, die das Design kippen können:

1. **Edits außerhalb des cwd.** Entity-Sessions laufen im Run-Verzeichnis, das Projekt ist nur
   Kontextpfad. opencode hat eine eigene Berechtigung für externe Verzeichnisse. Beantwortet
   `--auto` sie still, oder hängt die Session in einem Dialog? Hängt sie, muss der Worker im
   Projekt laufen und seine Config anders bekommen — dann wird Abschnitt 5/6 überarbeitet,
   bevor gebaut wird.
2. **Ausgabelimit.** Was passiert bei einem großen Edit am `maxOutputTokens`-Limit — Fehler,
   abgeschnittener Aufruf, still?
3. **Wecken in eine laufende Claude-Session.** Wird eine `send-keys`-Zeile während eines Zugs
   eingereiht, verschluckt oder als Unterbrechung behandelt?

Dazu: Kommt das „untätig"-Ereignis über das opencode-Plugin zuverlässig, und unter welchem Namen?

## 10a. Messergebnis (2026-10-09, opencode 1.18.35, `qwen3.8-27b` auf vLLM/DGX Spark)

1. **Edits außerhalb des cwd: tragen.** opencode im Run-Verzeichnis änderte eine Datei im Projekt
   per absolutem Pfad. Es kamen zwei `permission.asked`-Ereignisse, `--auto` beantwortete beide
   still (`permission.replied`). Kein Dialog, kein zusätzlicher Config-Schlüssel nötig. §5/§6
   bleiben wie geschrieben.
2. **Ausgabelimit: stiller Abbruch.** Mit `limit.output = 4000` und einem großen Schreibauftrag
   dachte das Modell 2 min 35 s nach und endete dann **ohne Werkzeugaufruf, ohne Text, ohne
   Fehler** — die Datei entstand nicht, die Session wurde untätig (`session.idle`). Das
   Denkbudget frisst das Ausgabebudget. Folgen: `maxOutputTokens` großzügig setzen (≥ 16384);
   und der Läufer wertet „untätig ohne `REPORT.md`" nach der Ruhezeit sofort als Fehlversuch,
   statt bis zur Stillstandsgrenze zu warten.
3. **Idle-Ereignis heißt `session.idle`** und kommt genau einmal am Zugende. Sonst gesehen:
   `message.updated`, `session.status`, `session.diff`, `file.edited`, `permission.asked`.
4. **Wecken in eine laufende Claude-Session: wird eingereiht.** Die laufende Antwort lief
   vollständig zu Ende, danach wurde die Weckzeile als nächste Eingabe verarbeitet.

Nebenbefunde:
- **Grundlast von opencode: 14,9 k Tokens** Kontext für einen Ein-Zeilen-Auftrag — System-Prompt
  und Werkzeugdefinitionen. Auf Apple Silicon ist das Prefill bei jedem Auftrag. Argument für den
  späteren Vergleich mit pi (E7).
- **Startwartezeit ist nötig:** Ein `send-keys` direkt nach dem Start ging verloren, die TUI war
  noch nicht bereit.
- Claude Code fragt in einem neuen Verzeichnis nach Vertrauen — betrifft den Architekten nicht,
  er läuft in seinem Run-Verzeichnis wie jede Entity.

Nachträge aus der Planung: Der Läufer committet den frisch geschriebenen Abnahmetest selbst als
Basis (§7 Schritt 2 verlangt sonst einen Baum, den der Architekt nicht liefern kann), und
`mux_local_worker_dispatch` nimmt mit `accept: true` ein grünes Häppchen ab (§7 Schritt 8).

## 11. Tests

- **Test-first, reine Funktionen:** Pfadabgleich geschützter Tests, Prüfsummenvergleich,
  Gate-Entscheidung (grün / rot / hängt), Validierung der Pflichtfelder, Zustandsübergänge in
  `lauf.json`, Aufbau von `AUFTRAG.md` inklusive wörtlicher Gate-Ausgabe.
- **Läufer gegen einen Fake-Worker:** ein Shell-Skript als Worker, das Dateien ändert und
  `REPORT.md` schreibt — einmal regelkonform, einmal mit verändertem Abnahmetest, einmal hängend.
- **Echter Lauf:** ein kleines Projekt, drei bis fünf Häppchen, gegen den Spark. Abnahme als
  Testcase-Note, offen, von Hand abzuhaken.

## 12. Nicht in v1

- Parallele Worker (E2)
- pi als zweiter Worker-Adapter (E7)
- Wiederaufnahme eines unterbrochenen Laufs
- Lokaler Architekt (Ziel b)
- Selbstkorrektur durch den Architekten (E3, lockern nach Zahlen)
- Bereinigung der Vorgabe der normalen Cyber Factory (Abschnitt 2)
