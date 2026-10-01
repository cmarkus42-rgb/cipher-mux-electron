# Stand 2026-10-01 abends — was offen ist

**Letzter Commit:** `806e10e` · **Tag:** `v0.11.2` · **Suite:** 2239 pass / 0 fail
**Alles gepusht.** Branch `main`, Arbeitsbaum sauber.

Diese Datei ist eine **Arbeitsliste**, keine Dokumentation. Was erklärt werden
muss, steht in `CLAUDE.md` und den Specs; hier steht nur, was noch zu tun ist.

---

## 1. GitHub-Releases fehlen für fünf Tags — angefangen, nicht fertig

`gh release list` endet bei **v0.9.103** (15. Mai). Ohne Release:
`v0.9.104`, `v0.10.0`, `v0.11.0`, `v0.11.1`, `v0.11.2`.

Das ist nicht kosmetisch: der README-Badge und die Website verlinken auf
`/releases` als Download-Weg. Dort liegt nichts von heute.

**Muster der bestehenden Releases** (an `v0.9.103` abgelesen):

- Titel: `cipher-mux vX.Y.Z`
- Rumpf: der passende Abschnitt aus `CHANGELOG.md`
- Asset: das DMG, `cipher-mux-X.Y.Z-arm64.dmg`

**DMGs liegen in `out/`** für 0.9.104, 0.10.0, 0.11.0, 0.11.1 — **für 0.11.2
noch nicht gebaut** (`npm run dist`, dauert ein paar Minuten, läuft im
Vordergrund zuverlässiger als im Hintergrund: ein Hintergrundlauf wurde heute
einmal mitten in der DMG-Erzeugung abgeräumt, erkennbar daran, dass das Log nach
„Creating dmg with APFS" aufhört und keine `.blockmap`-Zeile folgt).

## 2. README im Stil der Website — Auftrag des Nutzers, noch nicht begonnen

„mach readme mal etwas schöner im stil der website". Vorlage ist
`CIPHER-MUX/projects/cipher-mux-site` — dort `src/i18n/en/landing.ts` und
`features.ts` für Ton und Gliederung. Das README ist inhaltlich auf Stand (drei
CLIs, v0.11.2), aber gestalterisch nicht an der Website orientiert.

## 3. „Alles kritisch lesen und auf Stand bringen" — Auftrag des Nutzers

Offen. Dabei sind diese bekannten Widersprüche zu klären, **keiner davon
geprüft**:

- **Theme-Zahl:** Website sagt 13, die Styles des Mux zählen 12, `CLAUDE.md`
  sagt 10. Drei Quellen, drei Zahlen. Einmal richtig nachzählen.
- **Einstellungs-Reiter:** die Doku nennt sechs, darunter `A11y` — in
  `src/renderer/locales/en.json` gibt es dafür keinen Schlüssel, dafür einen
  `models`-Reiter, den die Doku nicht kennt. Vermutlich in beiden Sprachen
  veraltet.
- **Sprachbefehle sind deutsch-only.** `voice-input-router.ts` matcht nur
  `hoch`, `runter`, `grid links` usw. Die englische Doku nennt sie jetzt wörtlich
  — sachlich richtig, aber ein englischer Leser soll deutsche Wörter sagen.
  Produktentscheidung, keine Übersetzungsfrage.

## 4. Terminal: vier der sieben Befunde bleiben

Diagnose vollständig in `docs/superpowers/specs/2026-10-01-terminal-darstellung.md`.

- **Resync, Teile 1 und 3:** Vollbild-Schnappschuss gegen cursorrelativen
  Livestream, und die ungesicherte Reihenfolge gegen tmux. Braucht die
  Unterscheidung „TUI im Alternate-Screen / gewöhnliche Shell" — und die braucht
  eine **Messung am laufenden Programm**.
- **Befund 4:** Focus Mode und Zellen-Merge blenden Slots mit `return null` aus
  und töten damit die Terminals der verdeckten Sessions. Der Umbau auf
  „versteckt statt entfernt" ist eine UI-Verhaltensänderung; ein verstecktes
  xterm mit WebGL-Renderer verhält sich möglicherweise anders als eines mit
  Größe. **Vor dem Ausliefern laufen sehen.**
- **Befund 5, Rest:** ob statt des Fensters die 640 px Spaltenminimum nachgeben
  sollen, ist eine Produktentscheidung.
- **Befund 7:** die 15 px rechts sind eine xterm-Eigenschaft, kein Mux-Fehler.
  Nur als Erklärung vermerkt.

## 5. Vorlagen-Rückstand: zwei Rollen liegen zurück

`companion` und `debugger` tragen ältere `preset.md` als ihre Code-Vorlage. Der
Preset-Editor zeigt das jetzt an (`entity-content/preset-version.ts`), **behebt
es aber nicht** — write-once ist Absicht. Wer die Vorlage übernehmen will, tut
es von Hand.

---

## Fallen, die heute Zeit gekostet haben

- **Christian arbeitet mit der installierten `/Applications/cipher-mux.app`,
  nicht mit `npm start`.** Beide wollen Port 3100; die zweite Instanz beendet
  sich still. Eine „Verifikation" am nie gestarteten dev-Prozess ist wertlos —
  genau das ist passiert. `pkill` auf `cipher-mux-electron/node_modules/electron`
  trifft die installierte App **nicht**.
- **Die Mux-Config liegt in `app.getPath('userData')`**, also
  `~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json`.
  Das gleichnamige `~/.config/cipher-mux/config.json` wird **nicht** gelesen.
- **Das Site-Repo ist ein anderes Repo.** Ein `isolation: worktree` für das
  Mux-Repo isoliert es nicht. Drei Agenten teilten sich heute eine Arbeitskopie;
  gutgegangen, weil sie verschiedene Dateien anfassten.
