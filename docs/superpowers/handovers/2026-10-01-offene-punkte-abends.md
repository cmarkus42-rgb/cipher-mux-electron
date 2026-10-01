# Stand 2026-10-01, Nacht — was erledigt ist und was bleibt

**Tag:** `v0.11.3` · **Suite:** 2249 pass / 0 fail / 467 Suiten
**CI: grün** — alle sieben Jobs, erstmals seit dem 14. Mai.
**Alles gepusht.** Branch `main`, Arbeitsbaum sauber. Website deployt.

Diese Datei ist eine **Arbeitsliste**, keine Dokumentation. Was erklärt werden muss, steht in
`CLAUDE.md` und den Specs; hier steht der Stand und was noch zu tun ist.

---

## Erledigt in der Nachtschicht

### 1. GitHub-Releases — vollständig

Die Liste endete bei **v0.9.103** (15. Mai). Jetzt hat jeder Tag von `v0.9.104` bis `v0.11.3`
ein Release mit DMG, Rumpf aus `CHANGELOG.md`, Titel `cipher-mux vX.Y.Z`. Größen gegen die
lokalen Dateien geprüft, alle `uploaded`, `v0.11.3` ist Latest.

- **Zwei Draft-Releases** für `v0.11.0` und `v0.11.1` lagen schon da, von heute Nachmittag, mit
  Rumpf und ohne Asset. Das `v0.11.1`-Draft hat `gh release create` veröffentlicht, das für
  `v0.11.0` nicht — dort entstand ein zweiter Eintrag. Das Duplikat ist gelöscht.
- **Ein Draft vom 2. Mai** für `v0.9.9` („Open Beta") liegt noch da, ohne Asset. Nicht
  angefasst: fünf Monate alt, und ob der veröffentlicht oder gelöscht gehört, ist deine
  Entscheidung. `gh api repos/.../releases/317796627`.
- **Für das nächste Release:** `npm run dist` im **Vordergrund**. Ein Hintergrundlauf wurde
  heute einmal mitten in der DMG-Erzeugung abgeräumt — erkennbar daran, dass das Log nach
  „Creating dmg with APFS" aufhört und keine `.blockmap`-Zeile folgt. Das Hochladen eines
  281-MB-DMGs dauert Minuten; fünf hintereinander sprengen ein 10-Minuten-Timeout.

### 2. Die CI war seit Mai rot — drei Gründe, und der erste verdeckte die zwei anderen

Das war der größte Einzelbefund der Nacht, und er stand niemandem im Weg, weil ein dauerhaft
rotes Abzeichen keine Information mehr trägt.

1. **Der Lint-Job führte `npm run lint` aus.** Projektweit rot, 830 Probleme, 478 Fehler, und
   vorher schon. Ein Job, der nicht grün werden kann, hält das Abzeichen bei jedem Commit rot.
   Jetzt prüft er **die geänderten Dateien** aus dem Diff — das dokumentierte Gate des
   Projekts, maschinell.
2. **Die CI lief auf Node 20**, obwohl `engines.node` `>=22 <23` sagt. npm wertet das nicht
   aus, also muss die Workflow-Datei es sagen.
3. **Der Rebuild-Schritt rief `npm run rebuild:node`**, und das Skript hängt `2>/dev/null` an.
   Der Fehlschlag war monatelang eine nackte Exit-1. Ohne die Umleitung stand der Grund im
   ersten Lauf da: **`ModuleNotFoundError: No module named 'distutils'`** — node-gyp 9.4.1
   importiert `distutils`, und aus Python 3.12 ist es entfernt. Der macOS-Runner bringt 3.12+
   mit, der Linux-Runner 3.10; deshalb fiel genau ein Feld der Matrix um. Gelöst durch
   `actions/setup-python` auf 3.11, nicht durch einen node-gyp-Tausch: so baut die CI mit
   demselben node-gyp wie die Entwicklung.

Dazu: **der macOS-Runner bringt kein tmux mit** — gezeigt von einem neuen `tmux -V`-Schritt in
einer Zeile, nachdem der Job jahrelang vorher umfiel. Und ein **Typecheck-Job** ist dazu
gekommen; beide Configs sind grün und niemand hat hingesehen.

### 3. README im Website-Stil — neu

Vier Säulen mit Kickern, „Was cipher-mux nicht ist" als eigener Block, Ton von
`cipher-mux-site/src/i18n/en/landing.ts`. Der technische Teil ist geblieben, weil er der Grund
ist, warum jemand die Datei öffnet.

### 4. „Alles kritisch lesen" — 25 Behauptungen, die dem Code nicht standhielten

Die drei bekannten Widersprüche sind entschieden, und beim Prüfen kamen 22 weitere dazu. Alle
gegen den Quelltext, nicht gegeneinander:

**Zahlen**

- **Themes: 13.** Maßgeblich `ThemeName` in `shared/grid-types.ts`. Unter `styles/` liegen 12
  `body[data-theme]`-Blöcke, weil `cipher-ivory` der Default ist und kein Attribut braucht —
  wer die Blöcke zählt, zählt einen zu wenig. Die Website hatte recht, `CLAUDE.md` und README
  nicht.
- **MCP-Tools: 67**, nicht 37 (`docs/mcp-tools.md`) und nicht 57 (`CLAUDE.md`, README,
  `ARCHITECTURE.md`). **31 Tools waren gar nicht dokumentiert**,
  `mux_input_request_create` war dokumentiert und existiert nicht mehr. Der Grep nach
  `registerMuxTool(` findet 57, weil die zehn Handoffs aus einer Definition entstehen.
- **Einstellungs-Reiter: sieben**, nicht sechs — **Remote** fehlte in der Doku, obwohl der
  Reiter seit v0.9.104 dauerhaft sichtbar ist. Jetzt mit eigenem Abschnitt in beiden Sprachen.
- **Entities: zehn.** `ARCHITECTURE.md` widersprach sich selbst: oben zehn mit der richtigen
  Liste, 150 Zeilen weiter eine Tabelle mit elf — darin ein `Orchestrator` und ein
  `Bugreport`, der ein Dialog ist.
- **CVD-Themes: drei.** Die Website sagte „vier" und nannte drei.
- **Testzahl 2249**, in vier Dateien und auf der Website.
- **Auto-Tagging-Modell `gemma4:26b`**, nicht `gemma3:4b`.

**Dinge, die es nicht gibt**

- **`cipher-mux --version`** — SECURITY.md und die Bugreport-Vorlage schickten Melder an ein
  Flag, das ins Leere läuft. Es ist eine GUI-Anwendung.
- **`Cmd+1–5` für Grid-Navigation** (Companion-Referenz) und **`Cmd+→/←` für die Gridgröße**
  (Website) — beides kein Handler im Renderer.
- **`Cmd+Enter` für „Input Requests"** — das Feature ist weg.
- **Ein Linux-Build.** `docs/linux-notes.md` begann mit „cipher-mux runs on Linux as an
  AppImage"; `electron-builder.yml` baut `--mac dmg` und sonst nichts. CONTRIBUTING versprach
  dasselbe.
- **Vier Links auf eine GitHub-Org**, die nicht existiert (`cmarkus42` statt `cmarkus42-rgb`):
  Clone-Befehl, Issue-Link, Vergleichslink, Download.

**Dinge, die anders sind, als sie dastanden**

- **`Ctrl+Shift+Space` schaltet Voice nicht ein.** Es ist Push-to-talk und kehrt sofort zurück,
  wenn Voice aus ist (`if (!active) return`). Stand an fünf Stellen als „ein/aus" — in der
  Companion-Referenz, im Info-Popup-Text und dreimal auf der Website. Wer sagt „das Kürzel tut
  nichts", hat vermutlich Voice aus.
- **Sprachbefehle sind deutsch**, und die Transkription steht auf `'de'`. Bestätigt an
  `voice-input-router.ts` und `stt-engine.ts:134`. Die englische Doku sagt das jetzt, statt
  deutsche Wörter unkommentiert zu listen — das sah nach Tippfehlern aus.
- **`docs/HOWTO.md` lehrte eine Rolle, die es nicht gibt.** Die README verlinkt die Datei als
  **den** Einstieg, und ihr zentrales Kapitel hieß „Start the orchestrator". Dazu: Aider als
  Adapter, Node ≥ 18, Config im falschen Verzeichnis, Ollama auf dem falschen Port, der
  Message-Bus als Weg zu einer Session, eine erfundene Task-Zustandsmaschine und eine
  Shortcut-Tabelle mit vier Einträgen, von denen zwei falsch waren. Gegen den Code neu
  geschrieben, mit einem Hinweis oben, was vorher falsch war.
- **Die Tag-Doku** nannte „max 5, lowercase" mit einem Beispiel, das der Mux hart abweist.
- **ADR-008** beschreibt das Orchestrator-Template. Ein ADR ist ein Protokoll, der Text bleibt
  — oben steht jetzt ein Nachtrag mit einer Tabelle alt/heute.

### 5. Vorlagen-Rückstand — gelöst, und es war in zwei Richtungen

- **companion** lag zurück: die Routing-Tabelle nannte `guides/01-first-steps.md` und erklärte
  Orchestrator und MPO, während `grid.md`, `entities.md`, `clis.md` und fünf weitere daneben auf
  der Platte liegen — geschrieben, nie verlinkt. Der Companion hatte einen Leitfaden über die
  drei CLIs und fand ihn nicht.
- **debugger** lag **vorne**: die Reparatur vom Morgen erreichte die Datei, die Code-Vorlage
  nicht. Ein frischer Debugger hätte den alten Text zurückbekommen. Vorlage nachgezogen,
  Marker auf v2.
- **Eine Lücke vom Morgen:** in der Companion-Datei standen zwei Tag-Beispiele **außerhalb** der
  Sektion — `**tags:** ["bugreport", "open"]`, was `mux_notes_create` hart abweist. Repariert,
  Sicherung liegt daneben (`preset.md.bak-2026-10-01`). Alle 16 Dateien sind jetzt nachweislich
  frei von abweisbaren Tag-Literalen, und ein vierter Test in `code-writes-axis-tags.test.ts`
  hält es — die drei bestehenden suchen nach `klasse:wert` und sind für ein Tag ohne Klasse
  blind.
- **Der Knopf, der fehlte:** im Preset-Editor steht jetzt **„Vorlage übernehmen"**. Rückfrage,
  Sicherung mit Zeitstempel, dann schreiben. Keine Automatik.

**Bewusst nicht gemacht:** die große Companion-Datei habe ich **nicht** aus der Vorlage
überschrieben. Das ist der Knopf, einmal drücken — aber es ist dein Text, und 278 Zeilen blind
zu ersetzen ist nicht meine Entscheidung. **Empfehlung: Presets → Companion → „Vorlage
übernehmen".** Danach kennt der Companion die drei CLIs und seine acht neuen Leitfäden.

### 6. Terminal-Befund 4 — behoben

Focus Mode und Zellen-Merge töten die Terminals verdeckter Sessions nicht mehr: eine verdeckte
Session-Zelle rendert mit `display: none` statt `null`. Details und die drei geprüften
Nebenbedingungen in Abschnitt 10 von
`docs/superpowers/specs/2026-10-01-terminal-darstellung.md`.

**Logikseitig belegt** (sechs Tests), **an der laufenden App nicht**. Siehe Abnahme.

---

## Was bleibt

### A. Abnahme am installierten 0.11.3

Das DMG liegt unter `out/cipher-mux-0.11.3-arm64.dmg` und am Release. Drei Dinge wollen am
laufenden Programm gesehen werden:

1. **Verdecktes Terminal behält seinen Scrollback.** Session mit viel Ausgabe, hochscrollen,
   Focus Mode auf eine **andere** Zelle, zurück — der Scrollback muss noch da sein, nicht ein
   neu gezeichneter Bildschirm. Dasselbe mit dem Zellen-Merge (Chevron im Header).
2. **Kein `dimensions`-Fehler mehr beim Start.** Mit vier wiederhergestellten Sessions standen
   früher vier Meldungen im Log, jetzt sollten es null sein. Renderer-Fehler nennen seit 0.11.1
   Datei und Zeile.
   `/Applications/cipher-mux.app/Contents/MacOS/cipher-mux 2>&1 | tee /tmp/kw-test.log`
3. **„Vorlage übernehmen"** im Preset-Editor für Companion und Debugger.

### B. Resync, Teile 1 und 3 (Terminal-Befund 3)

Vollbild-Schnappschuss gegen cursorrelativen Livestream, und die ungesicherte Reihenfolge gegen
tmux. Braucht die Unterscheidung „TUI im Alternate Screen / gewöhnliche Shell" — und die braucht
eine **Messung am laufenden Programm**, kein Quelltextlesen.

### C. Drei Produktentscheidungen

- **Terminal-Befund 5, Rest:** ob statt des Fensters die 640 px Spaltenminimum nachgeben sollen.
- **Englisches Befehlsvokabular für die Sprachsteuerung.** Heute sind die Befehle deutsch und
  die Doku sagt es. Ein zweites Vokabular ist Arbeit und will gewollt sein.
- **Terminal-Befund 4, Restweg „Grid verkleinern":** das wirft einen Slot wirklich weg und
  blendet ihn nicht aus. Was dort richtig wäre, ist eine Frage ans Produkt.

### D. Der `v0.9.9`-Draft vom Mai

Veröffentlichen oder löschen. Siehe oben.

### E. Offene manuelle Abnahme von früher

`docs/superpowers/acceptance/2026-09-20-multi-workspace-sessions-manual.md` — steht seit dem
20. September.

### F. Das projektweite Lint

830 Probleme, 478 Fehler. Die CI prüft jetzt nur die geänderten Dateien, und das ist das
dokumentierte Gate — aber der Bestand bleibt. Wenn der je grün werden soll, ist das ein eigenes
Paket und keine Nebenarbeit.

---

## Fallen, die Zeit gekostet haben

- **Christian arbeitet mit der installierten `/Applications/cipher-mux.app`, nicht mit
  `npm start`.** Beide wollen Port 3100; die zweite Instanz beendet sich still. Eine
  „Verifikation" am nie gestarteten dev-Prozess ist wertlos — genau das ist passiert. `pkill`
  auf `cipher-mux-electron/node_modules/electron` trifft die installierte App **nicht**.
- **Die Mux-Config liegt in `app.getPath('userData')`**, also
  `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json`. Das gleichnamige
  `~/.config/cipher-mux/config.json` wird **nicht** gelesen.
- **Das Site-Repo ist ein anderes Repo.** Ein `isolation: worktree` für das Mux-Repo isoliert es
  nicht.
- **Eine `index.html` lag im Repo-Wurzelverzeichnis** — byte-identisch mit
  `dist/renderer/index.html`, nicht getrackt, Zeitstempel eine Minute nach dem 0.11.1-DMG.
  Gelöscht. Was sie erzeugt, ist **nicht** geklärt: `vite.config.ts` schreibt nach
  `dist/renderer`, und `npm run build:renderer` allein legt sie nicht an. Verdacht ist der
  electron-builder-Schritt. Taucht sie wieder auf, ist das der Hinweis.
- **Eine Heuristik im Test ist eine Behauptung wie jede andere.** Drei Tests fielen heute nicht
  am Code, sondern an meiner Annahme darüber, wie man den Fehler erkennt: „kurz" ist nicht
  „nicht umgebrochen"; eine Tag-Liste erkennt man am Wort davor, nicht an ihrem Inhalt; und
  `capture-pane -J` sagt **nicht** zu, dass eine nie umgebrochene Zeile Zeichen für Zeichen
  gleich bleibt (tmux 3.7c ja, 3.2a nein — gefunden vom Linux-Runner). Jedes Mal hat erst das
  absichtliche Zurückdrehen des Defekts gezeigt, dass der Test ihn wirklich fängt. **Das ist
  der Schritt, der sich lohnt.**
- **Ein dauerhaft rotes CI-Abzeichen ist schlimmer als keines.** Vier Monate lang hat niemand
  hingesehen, weil Rot der Normalzustand war — und darin steckten zwei echte Befunde.
