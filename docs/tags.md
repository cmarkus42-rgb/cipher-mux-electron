# Tags

Ausgelagert aus CLAUDE.md am 2026-10-24 (Kontext-Diät). Wer an Tags arbeitet, liest diese Datei vollständig.

## Tags: fünf Achsen, zwei editierbare Klassen

Die Quelle ist `src/shared/tag-axes.ts` — unter `shared/`, weil Main und Renderer sie beide
brauchen. **Jede andere Stelle leitet ab**, statt dieselbe Tatsache ein zweites Mal
aufzuschreiben: `EXCLUSIVE_TAG_CLASSES` in `shared/constants.ts`, `SEED_CLASSES` in
`tag-repository.ts`, `SEED_TAGS` in `note-tagging.ts`, die Erhaltungsliste in
`note-type-tags.ts`.

**Tatsachen, vom Prozess gesetzt** (`PROCESS_SET_AXES`) — angezeigt, nicht zur Auswahl:

| Achse | Herkunft |
|---|---|
| `workspace` | die aktive Workspace-**ID**, nicht der Anzeigename |
| `entity` | der Verbindungskopf `X-Mux-Entity`, beim `initialize` gebunden |

**Entscheidungen, hart zur Auswahl** (`PICK_ROWS`) — drei Reihen mit Knöpfen im TagBar:

| Klasse | Werte aus | ausschließend |
|---|---|---|
| `kind` | Code (`KIND_VALUES`, 14) | ja |
| `phase` | Code (`PHASE_VALUES`, 7) | nein |
| `status` | Code (`STATUS_VALUES`, 6) | ja |
| `severity` | **Registry**, editierbar; Startbelegung `low mid hi now` | ja |
| `component` | **Registry**, editierbar; keine Startbelegung | nein |

Der Unterschied zwischen `source: 'axis'` und `source: 'registry'` ist die **Herkunft der
Werte**, nicht ihre Verbindlichkeit. Beide erscheinen als Knopf — ein editierbarer Wert, der
nirgends zur Auswahl steht, ist eine Einstellung ohne Wirkung.

**Drei Dinge, die hier leicht kaputtgehen:**

1. **`SEED_CLASSES` wird bei jedem Start eingemischt, `REGISTRY_SEED_CLASSES` nur, wenn die
   Klasse fehlt.** Vertauscht man das, kommt ein im TagManager entfernter `severity`-Wert beim
   nächsten Start zurück — ein Knopf, dessen Wirkung ein Neustart aufhebt.
2. **Der Code darf nur vergebbare Tags nennen.** `mux_notes_create` weist unbekannte Tags hart
   ab, und das trifft auch Tags, die eine Rolle aus ihrer **eigenen** Anweisung nimmt. Am
   2026-10-01 standen 62 solche Stellen in zwölf Dateien (`kind:lueckenanalyse`,
   `status:closed`, `category:owasp`, `skill:pre-mortem`). `test/main/code-writes-axis-tags.test.ts`
   liest dafür den Quelltext von `src/main` — die Handoff-Definitionen stehen inline in
   `registerAllHandoffTools` und lassen sich nicht als Daten durchlaufen.
3. **Auto-Tagging filtert, es bittet nicht.** `filterToAxes` stutzt das Modellergebnis zurecht;
   der Prompt nennt die Achsen zusätzlich. Eine Bitte allein kann ein Modell überhören — genau
   so sind 14 Klassen und 29 `kind`-Werte entstanden.

**Der Umzug der Bestands-Tags** läuft einmalig beim Start (`runTagMigrationOnce`, Marker
`.tag-axes-migration-done`) und ist nachweislich wiederholbar. Die Abbildung samt Begründung
pro Wert steht in `src/main/notes/tag-migration.ts`; `DISSOLVED_CLASSES` nennt die neun
aufgelösten Klassen und **warum** jede ging. Gemessen am 2026-09-30 über 958 Notes:
`kind` 29 → 13 Werte, `phase` von 49 Vergaben (überwiegend Wellennummern) auf 607 echte,
`workspace` 13 Schreibweisen → 8 IDs, klassenlose Tags 269 → 117.

**Offen:** 16 `preset.md` unter `~/.config/cipher-mux/entities/` tragen die alten
Tag-Anweisungen noch. Diese Dateien sind **write-once** (`session-manager.ts:1097`), damit
Handarbeit überlebt — ein Vorlagen-Fix im Code erreicht sie also nicht. Nur `audit` und
`voice-relay` werden bei jedem Sessionstart neu geschrieben.
