# Testcase-Notes schreiben

Testcase-Notes verwenden `noteType: testcase` und ein spezielles Checkbox-Format, das die
`TestcaseView` (Tri-State-Checkboxen, Kommentare, Screenshots) rendert.

**Normales Markdown wird NICHT gerendert** — der Parser erkennt nur dieses Format:

````markdown
## Sektions-Titel

- [ ] **T-ID.1** Beschreibung des Testcases
- [ ] **T-ID.2** Noch ein Testcase
- [x] **T-ID.3** Bestandener Test
- [-] **T-ID.4** Fehlgeschlagener Test // Kommentar zum Fehler
````

## Wofür Testcases da sind — und wofür nicht

**Testcases sind die manuelle Abnahme: ein Mensch benutzt die App und hakt ab.** Das ist der
Grund, warum die `TestcaseView` existiert und warum sie sich bewährt hat.

**Nicht hierher gehören automatisierte Tests.** Ein Eintrag, der beim Anlegen schon auf `[x]`
steht, hat keine Abnahme durchlaufen — er behauptet eine. Dasselbe gilt für ein `pass`, das mit
`// Code: <datei> verifiziert` begründet wird: das ist Code gelesen, nicht Software benutzt.
Beides nimmt der Liste genau die Eigenschaft, für die sie gebaut wurde.

Gemessen am 2026-09-30 in der Testcase-Note: 380 Einträge auf `pass`, davon **47 mit einer
Code-Begründung** im Kommentar. Bei den übrigen lässt sich von außen nicht unterscheiden, ob
jemand die App benutzt hat.

**Also:**

- Neue Einträge entstehen **offen** (`- [ ]`). Wer sie anlegt, hakt sie nicht selbst ab.
- Was ein automatisierter Test prüft, gehört in `test/`, nicht hierher. Wenn ein Testlauf
  etwas findet, ist das ein **Befund** (`noteType: finding`), kein Testcase.
- `// Kommentar` beschreibt, **was beim Benutzen passiert ist** — nicht, welche Datei man
  gelesen hat.
- Abschnitte nach dem Abnahmegegenstand benennen, nicht nach der Entwicklungswelle. Eine
  Sektion „Welle F3" sagt nichts darüber, was der Mensch ausprobieren soll.

## Regeln

- Sektionen: `## Titel` (H2-Headings)
- Items: `- [ ] **ID** Beschreibung` (Checkbox + Bold-ID + Text)
- Status: `[ ]` = offen, `[x]` = PASS, `[-]` = FAIL
- Kommentare: ` // Kommentartext` nach der Beschreibung
- Screenshots: `![screenshot](pfad)` im Kommentar
- IDs müssen eindeutig sein (z.B. `T-BF.1`, `T-VS.3`)
- **Kein anderes Markdown verwenden** — keine `###`, keine `**bold**` in Beschreibungen,
  keine Tabellen, keine verschachtelten Listen, keine Code-Fences
- Text vor dem ersten H2 ignoriert der Parser — dort dürfen Voraussetzungen in Prosa stehen

**Beim Anlegen via MCP:** `mux_notes_create` mit Tag `testcase` — der Tag setzt
`noteType: testcase` automatisch.

## Konventionen

- Testcases gehören in die Notes-System-Testcase-Note (ID `01KQNBDCH1D4G11PMAEM60TPTX`),
  NICHT in Dateien unter `docs/archiv/`. Die `TestcaseView` rendert nur Notes mit
  `noteType: testcase`.
- Neue Testcases ans Ende anhängen, unter einer neuen `## Section`-Überschrift.

## Bestehende Abnahmelisten

- `docs/superpowers/acceptance/2026-09-20-multi-workspace-sessions-manual.md` — zehn
  Testcases (`T-MWS.1`–`T-MWS.10`) für Multi-Workspace-Sessions, bereit zum Übernehmen,
  **noch nicht durchgeführt**
