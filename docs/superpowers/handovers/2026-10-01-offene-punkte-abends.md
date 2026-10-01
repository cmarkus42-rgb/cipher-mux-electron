# Stand 2026-10-01, Nacht — was erledigt ist und was bleibt

**Letzter Commit:** `a404dcc` · **Tag:** `v0.11.3` · **Suite:** 2249 pass / 0 fail / 467 Suiten
**Alles gepusht.** Branch `main`, Arbeitsbaum sauber. Website deployt.

Diese Datei ist eine **Arbeitsliste**, keine Dokumentation. Was erklärt werden
muss, steht in `CLAUDE.md` und den Specs; hier steht nur der Stand und was noch
zu tun ist.

---

## Erledigt in der Nachtschicht

### 1. GitHub-Releases — vollständig

`gh release list` endete bei **v0.9.103** (15. Mai). Jetzt hat jeder Tag von
`v0.9.104` bis `v0.11.3` ein Release mit DMG-Asset, Rumpf aus `CHANGELOG.md`,
Titel `cipher-mux vX.Y.Z`. Größen gegen die lokalen Dateien geprüft, alle
`uploaded`. `v0.11.3` ist Latest.

Zwei Dinge dabei aufgefallen:

- **Zwei Draft-Releases** für `v0.11.0` und `v0.11.1` lagen schon da, von heute
  Nachmittag, mit Rumpf und ohne Asset. Das `v0.11.1`-Draft hat `gh release
  create` veröffentlicht, das für `v0.11.0` nicht — dort entstand ein zweiter,
  veröffentlichter Eintrag. Das Duplikat ist gelöscht.
- **Ein Draft vom 2. Mai** für `v0.9.9` („Open Beta") liegt noch da, ohne Asset.
  Nicht angefasst: fünf Monate alt, und ob der veröffentlicht oder gelöscht
  gehört, ist deine Entscheidung. `gh api repos/.../releases/317796627`.

**Für das nächste Release:** `npm run dist` im **Vordergrund** laufen lassen. Ein
Hintergrundlauf wurde heute einmal mitten in der DMG-Erzeugung abgeräumt;
erkennbar daran, dass das Log nach „Creating dmg with APFS" aufhört und keine
`.blockmap`-Zeile folgt. Das Hochladen eines 281-MB-DMGs dauert pro Release
mehrere Minuten — fünf hintereinander sprengen ein 10-Minuten-Timeout.

### 2. README im Website-Stil — neu

Vier Säulen mit Kickern, „Was cipher-mux nicht ist" als eigener Block, Ton von
`cipher-mux-site/src/i18n/en/landing.ts`. Der technische Teil ist geblieben, weil
er der Grund ist, warum jemand die Datei öffnet.

### 3. „Alles kritisch lesen" — die drei Widersprüche sind entschieden

Alle drei gegen den Code geprüft, nicht gegeneinander:

- **Themes: 13.** Maßgeblich ist `ThemeName` in `shared/grid-types.ts`;
  `useTheme.ts` leitet `ALL_THEMES` daraus ab. Unter `styles/` liegen **12**
  `body[data-theme]`-Blöcke, weil `cipher-ivory` der Default ist und kein
  Attribut braucht. Die Website hatte recht, `CLAUDE.md` und README nicht.
  Beide korrigiert, mitsamt der Erklärung, warum das Zählen der Blöcke einen zu
  wenig findet.
- **Einstellungs-Reiter: sieben.** `general`, `sprache`, `themes`, `shortcuts`,
  `remote`, `a11y`, `about` (`InfoSettingsView.tsx:118`). `models` ist ein
  Legacy-Alias, der auf `general` zeigt — kein Reiter. Der Doku fehlte
  **Remote**, obwohl der Reiter seit v0.9.104 dauerhaft sichtbar ist. Jetzt mit
  eigenem Abschnitt in beiden Sprachen.
- **Sprachbefehle sind deutsch.** Bestätigt: `voice-input-router.ts` matcht
  `hoch`, `runter`, `grid links` usw., und `stt-engine.ts:134` fällt ohne
  Konfiguration auf `'de'`. Die englische Doku sagt das jetzt ausdrücklich, statt
  deutsche Wörter unkommentiert zu listen — das sah nach Tippfehlern aus. **Ein
  englisches Befehlsvokabular zu bauen bleibt offen und ist eine
  Produktentscheidung**, siehe unten.

Dabei gefunden und mitkorrigiert:

- **67 MCP-Tools**, nicht 37 (`docs/mcp-tools.md`) und nicht 57 (`CLAUDE.md`,
  README). 31 Tools waren **gar nicht** dokumentiert, `mux_input_request_create`
  war dokumentiert und existiert nicht mehr. Dass ein Grep nach
  `registerMuxTool(` 57 findet, liegt an den zehn Handoffs aus einer Definition —
  steht jetzt dort, wo die 57 herkamen.
- **Die Tag-Doku** nannte „max 5, lowercase" mit einem Beispiel, das der Mux
  heute hart abweist.
- **opencode fehlt nur `sub-agents`** — README nannte zusätzlich Context-Anzeige
  und Rollengrenzen, beide seit 0.11.0 gebaut und gemessen.
- **Website:** CVD-Themes („vier" nannte drei), Teststatistik (zwei Stellen,
  davon eine mit einer dritten Zahl), Version an dreizehn Stellen.

### 4. Vorlagen-Rückstand — gelöst, und es war in zwei Richtungen

- **companion** lag wirklich zurück: die Routing-Tabelle nannte
  `guides/01-first-steps.md` und erklärte Orchestrator und MPO, während
  `grid.md`, `entities.md`, `clis.md` und fünf weitere daneben auf der Platte
  liegen — geschrieben, nie verlinkt. Der Companion hatte einen Leitfaden über
  die drei CLIs und fand ihn nicht.
- **debugger** lag **vorne**: die Reparatur vom Morgen erreichte die Datei, die
  Code-Vorlage nicht. Ein frischer Debugger hätte den alten Text
  zurückbekommen. Vorlage nachgezogen, Marker auf v2.
- **Und eine Lücke vom Morgen:** in der Companion-Datei standen zwei
  Tag-Beispiele **außerhalb** der Sektion — `**tags:** ["bugreport", "open"]`.
  Die weist `mux_notes_create` hart ab. Repariert, Sicherung liegt daneben
  (`preset.md.bak-2026-10-01`). Alle 16 Dateien sind jetzt nachweislich frei von
  abweisbaren Tag-Literalen, und ein vierter Test in
  `code-writes-axis-tags.test.ts` hält es — die drei bestehenden suchen nach
  `klasse:wert` und sind für ein Tag ohne Klasse blind.
- **Der Knopf, der fehlte:** im Preset-Editor steht jetzt **„Vorlage
  übernehmen"** neben dem Hinweis. Rückfrage, Sicherung mit Zeitstempel, dann
  schreiben. Keine Automatik.

**Nicht gemacht und bewusst so:** die große Companion-Datei habe ich **nicht**
aus der Vorlage überschrieben. Das ist der Knopf, einmal drücken — aber es ist
dein Text, und 278 Zeilen blind zu ersetzen ist nicht meine Entscheidung.
Empfehlung: Presets → Companion → „Vorlage übernehmen". Danach kennt der
Companion die drei CLIs und seine acht neuen Leitfäden.

### 5. Terminal-Befund 4 — behoben

Focus Mode und Zellen-Merge töten die Terminals verdeckter Sessions nicht mehr.
Eine verdeckte Session-Zelle rendert mit `display: none` statt `null`. Details,
die drei geprüften Nebenbedingungen und was weiter offen ist: Abschnitt 10 in
`docs/superpowers/specs/2026-10-01-terminal-darstellung.md`.

**Logikseitig belegt** (sechs Tests), **an der laufenden App nicht**. Siehe
Abnahme unten.

---

## Was bleibt

### A. Abnahme am installierten 0.11.3

Das DMG liegt unter `out/cipher-mux-0.11.3-arm64.dmg` und am Release. Drei Dinge
wollen am laufenden Programm gesehen werden:

1. **Verdecktes Terminal behält seinen Scrollback.** Session mit viel Ausgabe,
   hochscrollen, Focus Mode auf eine **andere** Zelle, zurück — der Scrollback
   muss noch da sein, nicht ein neu gezeichneter Bildschirm. Dasselbe mit dem
   Zellen-Merge (Chevron im Header).
2. **Kein `dimensions`-Fehler mehr beim Start.** Mit vier wiederhergestellten
   Sessions: früher standen vier Meldungen im Log, jetzt sollten es null sein.
   Renderer-Fehler nennen seit 0.11.1 Datei und Zeile.
   `/Applications/cipher-mux.app/Contents/MacOS/cipher-mux 2>&1 | tee /tmp/kw-test.log`
3. **„Vorlage übernehmen"** im Preset-Editor für Companion und Debugger.

### B. Resync, Teile 1 und 3 (Terminal-Befund 3)

Vollbild-Schnappschuss gegen cursorrelativen Livestream, und die ungesicherte
Reihenfolge gegen tmux. Braucht die Unterscheidung „TUI im Alternate Screen /
gewöhnliche Shell" — und die braucht eine **Messung am laufenden Programm**, kein
Quelltextlesen.

### C. Zwei Produktentscheidungen

- **Terminal-Befund 5, Rest:** ob statt des Fensters die 640 px Spaltenminimum
  nachgeben sollen.
- **Englisches Befehlsvokabular für die Sprachsteuerung.** Heute sind die
  Befehle deutsch und die Doku sagt es. Ein zweites Vokabular ist Arbeit und
  will gewollt sein.
- **Terminal-Befund 4, Restweg „Grid verkleinern":** das wirft einen Slot
  wirklich weg und blendet ihn nicht aus. Was dort richtig wäre, ist eine Frage
  ans Produkt.

### D. Der `v0.9.9`-Draft vom Mai

Veröffentlichen oder löschen. Siehe oben.

### E. Offene manuelle Abnahme von früher

`docs/superpowers/acceptance/2026-09-20-multi-workspace-sessions-manual.md` —
steht seit dem 20. September.

---

## Fallen, die Zeit gekostet haben

- **Christian arbeitet mit der installierten `/Applications/cipher-mux.app`,
  nicht mit `npm start`.** Beide wollen Port 3100; die zweite Instanz beendet
  sich still. Eine „Verifikation" am nie gestarteten dev-Prozess ist wertlos —
  genau das ist passiert. `pkill` auf `cipher-mux-electron/node_modules/electron`
  trifft die installierte App **nicht**.
- **Die Mux-Config liegt in `app.getPath('userData')`**, also
  `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json`.
  Das gleichnamige `~/.config/cipher-mux/config.json` wird **nicht** gelesen.
- **Das Site-Repo ist ein anderes Repo.** Ein `isolation: worktree` für das
  Mux-Repo isoliert es nicht.
- **Eine `index.html` lag im Repo-Wurzelverzeichnis** — byte-identisch mit
  `dist/renderer/index.html`, nicht getrackt, nicht gebraucht; Zeitstempel eine
  Minute nach dem 0.11.1-DMG. Gelöscht. Was sie erzeugt hat, ist **nicht**
  geklärt: `vite.config.ts` schreibt nach `dist/renderer`, und ein
  `npm run build:renderer` allein legt sie nicht an. Verdacht ist der
  electron-builder-Schritt. Wenn sie wieder auftaucht, ist das der Hinweis —
  harmlos, aber es gehört nicht dorthin.
- **Eine Heuristik im Test ist eine Behauptung wie jede andere.** Zwei Tests
  heute fielen nicht am Code, sondern an meiner Annahme darüber, wie man den
  Fehler erkennt: „kurz" ist nicht „nicht umgebrochen", und eine Tag-Liste
  erkennt man am Wort davor, nicht an ihrem Inhalt. Beide Male hat erst das
  absichtliche Zurückdrehen des Defekts gezeigt, dass der Test ihn fängt.
