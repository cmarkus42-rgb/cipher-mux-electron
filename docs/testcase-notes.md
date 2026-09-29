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
