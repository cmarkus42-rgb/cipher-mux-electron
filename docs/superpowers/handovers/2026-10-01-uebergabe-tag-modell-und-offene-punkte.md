# Übergabe: Tag-Modell steht, fünf Punkte offen

**Anker-Commit:** `8024a95` (2026-10-01) — der letzte Code-Commit, nicht der dieser Datei
**Von:** einer langen Session, die aus den Übergabe-Notes heraus das Tag-Modell gebaut hat
**An:** eine frische Hauptsession
**Status:** offen
**Vorgänger:** `docs/superpowers/handovers/2026-09-29-uebergabe-an-frische-session.md`

> **Was dieses Dokument ist.** Entscheidungen, Fallen und Zeiger — **keine Bestandsliste.**
> Berechne den Ist-Zustand selbst gegen den Anker-Commit (`git diff 8024a95..HEAD`). Die
> Begründungen stehen hier, damit man mit ihnen streiten kann, nicht damit man ihnen folgt.
>
> Es gibt eine Note dazu im Mux, die diese Datei spiegelt. Die Datei ist die Wahrheit, die Note
> ist die Arbeitsfläche — Korrekturen dort hineinschreiben ist der vorgesehene Weg.

---

## 1. Was fertig ist

Der Suchbegriff für den Diff ist `shared/tag-axes.ts` — dort steht das Modell, alles andere
leitet ab.

**Tags haben jetzt fünf Achsen und zwei editierbare Klassen.** Die Trennlinie ist nicht
Verbindlichkeit, sondern **Herkunft**:

| | Klassen | woher der Wert kommt |
|---|---|---|
| **Tatsachen** (`PROCESS_SET_AXES`) | `workspace`, `entity` | aus der Verbindung — angezeigt, nie zur Auswahl |
| **Entscheidungen, Code-Werte** | `kind`, `phase`, `status` | `AXIS_VALUES`, geschlossen |
| **Entscheidungen, Registry-Werte** | `severity`, `component` | `.tags.json`, im Tag-Manager editierbar |

Dazu: Bestands-Umzug über 958 Notes (`tag-migration.ts`, läuft einmalig beim Start),
`handoff` als registrierter flacher Marker, und ein Test, der den **Quelltext** von `src/main`
daraufhin liest, dass der Code keine Tags nennt, die die Registry abweist
(`test/main/code-writes-axis-tags.test.ts`).

Vollständig in `CLAUDE.md`, Sektion „Tags: fünf Achsen, zwei editierbare Klassen". **Lies die
zuerst**, bevor du hier etwas anfasst — insbesondere die drei Stellen, die leicht kaputtgehen.

Zuletzt kam noch ein Mangel heraus, der beim Anlegen *dieser* Übergabe auffiel: eine
Handoff-Note trug genau einen Tag, `handoff` — keinen Typ, keinen Workspace. Behoben, samt der
Ursache dahinter: `mux_notes_create` nahm den **aktiven** Workspace und ignorierte die Bindung
der Verbindung, `mux_notes_handoff_create` genau umgekehrt. Beide halb richtig. Die Regel steht
jetzt an einer Stelle: `resolveNoteWorkspaceId` in `src/main/notes/note-workspace.ts` — Bindung
schlägt Ansicht, ohne Bindung die Ansicht.

**Suite: 2019 Tests, 0 fail.** Ein roter Lauf ist eine Regression.

---

## 2. Die offenen Punkte

### 2.1 Sechzehn `preset.md` tragen veraltete Tag-Anweisungen — **wartet auf ein Go des Nutzers**

Das ist der Punkt, an dem das Ergebnis heute unvollständig bleibt, und er ist nicht technisch
schwierig, sondern eine Freigabefrage: Schreiben nach `~/.config/` braucht pro Datei ein
ausdrückliches Go (siehe `~/.claude/CLAUDE.md`, „Scope-Disziplin").

**Warum der Code-Fix nicht reicht:** `session-manager.ts:1097–1134` schreibt `preset.md`
**write-once**, damit Handarbeit überlebt. Nur `audit` und `voice-relay` werden bei jedem
Sessionstart neu geschrieben. Für alle anderen Rollen erreicht ein Vorlagen-Fix im Code die
bestehende Datei nie.

**Warum es wehtut:** `mux_notes_create` weist unbekannte Tags **hart** ab. Eine Rolle, die einen
Tag aus ihrer eigenen Anweisung vergibt, bekommt dann eine Fehlermeldung statt einer Note.

Betroffen, mit den Werten, die abgewiesen würden:

```
refinement, refinement-custom-1778309361228,     kind:lueckenanalyse, phase:1, phase:7,
refinement-custom-1778309364283                  req-status:draft, req-status:final, status:closed
testing-assistant                                category:adversarial, category:owasp,
                                                 category:off-limits, kind:findings-report,
                                                 severity:high, severity:medium
debugger, debugger-custom-1778309350836,         kind:fix-plan, kind:walkthrough,
debugger-custom-1778429586434,                   severity:high, severity:medium
debugger-custom-1778309356451
cyber-factory                                    kind:abschlussbericht, kind:architektur,
                                                 kind:wellenplan
ideation-partner                                 kind:anforderungspaket, kind:brain, phase:0,
                                                 phase:4, skill:* (vier Werte)
companion                                        kind:feature-request
workshop                                         kind:workshop-run
voice-relay                                      status:closed
mpo, projectlauncher, watchdog                   scope:trading
```

Die Abbildung steht fertig in `src/main/notes/tag-migration.ts` (`KIND_MAP`, `STATUS_MAP`,
`SEVERITY_MAP`, `DISSOLVED_CLASSES`) — die Entsprechungen im Code sind in dieser Session schon
gezogen worden, du kannst sie aus den Vorlagen übernehmen. `voice-relay` löst sich von selbst,
weil es bei jedem Start neu geschrieben wird.

**Bevor du schreibst:** Prüfe, ob die Datei Handarbeit trägt, die verloren gehen würde. Einen
Diff gegen die generierte Vorlage zu ziehen ist der ehrliche Weg — write-once existiert aus
einem Grund.

**Struktureller Punkt dahinter, der eine Entscheidung braucht:** Vorlagen-Updates erreichen
bestehende Rollen grundsätzlich nicht. Gemessen: 16 von 16 Presets waren stale. Das wird beim
nächsten Prompt-Update wieder passieren. Eine Teil-Aktualisierung (nur die Tag-Abschnitte, nicht
die Handarbeit) wäre die eigentliche Lösung — das ist ein eigenes Thema und keine Nebenaufgabe.

### 2.2 CLI-Switcher — die Reihenfolge ist zweiter Adapter zuerst

Der Nutzer hat danach gefragt („mir fehlt nämlich der switcher"). Der Ist-Zustand:

| Stück | Ort | Zustand |
|---|---|---|
| Adapter-Abstraktion | `src/main/agent/agent-adapter.ts` | fertig |
| Registry mit `register()` / `setDefault()` | `src/main/agent/registry.ts` | fertig, `setDefault()` wird **von nirgends** aufgerufen |
| Implementierungen | `src/main/agent/adapters/` | **eine**: `claude-code.ts`. `_reference-stub.ts` ist eine Vorlage |
| Zuordnung pro Rolle | `entity-runtime.ts` → `entityAdapters[entityId]` | verdrahtet, fällt mit Warnung auf den Default |
| Auswahl in der UI | — | fehlt |
| Reines Terminal | `app.tsx:1047` | da — ohne CLI startet `cd '<projekt>' && clear` |

**Es fehlt also nicht nur der Switcher, sondern auch das, worauf er zeigen würde.** Ein Switcher
mit einem Eintrag ist keiner. Die Rollen-Zuordnung wartet schon.

**Offene Entscheidung für den Nutzer:** welche CLI der zweite Adapter sein soll (Codex, Gemini,
Aider, …). Ohne diese Antwort nicht anfangen — der Adapter-Vertrag (`buildLaunchCommand`,
`sendPrompt`, `getCapabilities`, `readProjectInstructions`, drei Prompt-Fragmente) ist stark an
den gemessenen Eigenschaften der Claude-CLI entlang gewachsen, und welche davon tragen, hängt am
Zielwerkzeug.

### 2.3 Renderer-Fehler beim Start — offen, nicht aus dieser Arbeit

`Uncaught TypeError: Cannot read properties of undefined (reading 'dimensions')`, einmal pro
wiederhergestellter Session, gleich nach `keepWorking: poll-based restore`.

Was gemessen ist: Alle drei `fitAddon.fit()`-Aufrufe im Projekt (`useTerminal.ts:125`, `:163`,
`:287`) sind in `try`/`catch`. Der Wurf passiert also in xterms eigenem asynchronen Pfad —
`_renderService.dimensions`, typisch für `fit()` vor `open()` oder nach `dispose()`. Die
Änderungen dieser Session an `useTerminal.ts`, `useGrid.ts` und `SessionGrid.tsx` waren **rein
Typebene** (`any` → typisiert), nachgeprüft per Diff.

Nicht nachgewiesen: dass der Fehler lange besteht. Wer ihn angeht, baut zuerst den Stand vor dem
29.09. und schaut, ob er dort schon auftritt.

### 2.4 Der Workspace einer Handoff-Note sollte aus `anchor_repo` kommen

Gefunden beim Anlegen dieser Übergabe: die Note landete in **Cipher Grow KIT**, weil der
Workspace gerade aktiv war — obwohl sie über cipher-mux geht. Die Regel
(`resolveNoteWorkspaceId`) hat korrekt gearbeitet, das Ergebnis war trotzdem falsch.

Der Grund: „welchen Workspace sieht der Mensch gerade an" ist ein schwaches Signal für eine Note,
die zu einem bestimmten Repository gehört. Bei einer Handoff-Note ist das **starke** Signal
vorhanden und wird nicht genutzt: `anchor_repo` ist der absolute Pfad des Repositories. Daraus
den Workspace zu bestimmen — über die `projectPath`-Zuweisungen der Workspace-Cells — wäre
richtiger als die Ansicht.

Nicht gebaut, weil es die Workspace→Projekt-Zuordnung aufziehen muss und damit ein eigener
Schnitt ist. Die Reihenfolge wäre: `anchor_repo` → Workspace, dann Verbindungsbindung, dann
Ansicht. Die betroffene Note ist von Hand korrigiert.

### 2.5 Manuelle Abnahme — vom Nutzer auf „ab Freitag" gelegt

- `docs/superpowers/acceptance/2026-09-20-multi-workspace-sessions-manual.md` (10 Testfälle)
- Handoff-Dispatch, Rollengrenzen, Spiegelung — end-to-end belegt, aber nicht vom Nutzer
  abgenommen
- Testfälle gehören in die Notes-System-Testcase-Note (`noteType: testcase`), **nicht** in
  Dateien unter `docs/archiv/`. Format: `- [ ] **T-PREFIX.N** Beschreibung`

---

## 3. Entscheidungen, die gefallen sind

Nicht zur Disposition, es sei denn du findest einen Fehler in der Begründung.

### 3.1 Tags werden ausgewählt oder kommen aus dem Prozess — nicht getippt

Wörtlich: *„tags müssen glaub ich schlicht hart zur auswahl angebiten werden bzw aus dem
prozess kommen"*, und *„halt über das editieren auch fest als auswahl vorgeben"*.

Daraus folgt die Zweiteilung aus Abschnitt 1. **Ein editierbarer Wert, der nirgends zur Auswahl
steht, ist eine Einstellung ohne Wirkung** — deshalb erscheinen Registry-Klassen als Knopfreihe
wie die Achsen.

Der Gegenbeweis für Freitext steht in der Messung: 958 Notes, 14 Tag-Klassen, `kind` mit 29
Werten, 269 Tags ganz ohne Klasse, `workspace` als Anzeigename in 13 Schreibweisen — darunter
„Cipher Grow KIT" neben „cipher grow kit".

### 3.2 `entity` ist eine Tatsache, die Phase eine Ableitung daraus

Auf den Einwand *„ideation refinement audit und testing tragen es ja quasi im namen … phase und
entity korrelieren im projektlauf stark, wobei nicht identisch"*.

`ENTITY_PHASE_DEFAULT` leitet die Phase aus der Rolle ab, **als Vorschlag**. Wo die Zuordnung
nicht eindeutig ist (`launcher`, `companion`, `voice-relay`), wird keine vorgeschlagen: eine
falsche Phase ist schlechter als keine. Vorhandenes gewinnt immer gegen die Ableitung.

### 3.3 Startbelegung ist nicht Vorschrift

`SEED_CLASSES` (die Achsen) wird bei **jedem** Start eingemischt — die Werte gehören dem Code,
Ansichten hängen daran. `REGISTRY_SEED_CLASSES` (`severity`, `component`) nur, wenn die Klasse
noch **gar nicht** existiert.

Vertauscht man das, kommt ein im Tag-Manager entfernter Wert beim nächsten Start zurück. **Ein
Knopf, dessen Wirkung ein Neustart aufhebt, ist eine Irreführung** — und damit wäre „editierbar"
nicht wahr.

### 3.4 Abgeleiten statt aufzählen

Dieselbe Falle ist in dieser Session **dreimal** zugeschnappt, jedes Mal als Aufzählung in
`preserveTypeTags`:

1. Die Erhaltungsliste nannte nur `kind:testcase` — jeder andere Notentyp ging beim
   Auto-Tagging verloren.
2. Sie nannte `workspace:`, und mit `entity` als neuer Achse hätte das Tagging die Herkunft
   überschrieben.
3. Sie nannte die Prozess-Achsen, und `severity` und `component` fehlten — also genau die
   Werte, die ein Mensch von Hand wählt.

Die Regel ist deshalb **umgedreht**: erhalten wird, was das Auto-Tagging nicht *vorschlagen*
kann. Das entscheidet `filterToAxes`, und damit ist es keine Liste, die jemand pflegen müsste.
Eine neue Klasse ist automatisch erhalten, eine neue Achse automatisch ersetzbar.

Dasselbe Muster an vier weiteren Stellen: `EXCLUSIVE_TAG_CLASSES` leitet aus `EXCLUSIVE_AXES` ab,
`SEED_CLASSES` aus `AXIS_VALUES`, `SEED_TAGS` ebenso, `FLAT_MARKERS` steht einmal.

### 3.5 Nichts verschwindet stillschweigend

Der Umzug lässt stehen, was er nicht abbilden kann, und berichtet es. Zwei Tags hatten keine
Abbildung: `workspace:NEW WORKSPACE` und `workspace:Testinng Workspace` — gelöschte Workspaces.
Der Tag bleibt, **wenn er der einzige ist**: ihn zu entfernen würde die Note in *jeden*
Workspace heben, und das ist schlimmer als ein Tag, der ins Leere zeigt.

Die 117 freien Schlagworte ohne Klasse (`raspberry-pi`, `bluetooth`, `a11y`) bleiben ebenfalls:
sie erzeugen keine Filterebene und stehen nirgends sonst. Der Nutzer hat dem nicht widersprochen,
es aber auch nicht ausdrücklich bestätigt — wenn er sie weghaben will, ist es ein Einzeiler in
`DISSOLVED_CLASSES`.

---

## 4. Fallen

### 4.1 Aus dieser Session

- **Jede Tag-Klasse, die der Code nennt, muss die Registry akzeptieren.** `isKnownTag` entscheidet
  das, `mux_notes_create` weist hart ab. `test/main/code-writes-axis-tags.test.ts` liest dafür den
  Quelltext — stumpf, aber es deckt auch die Vorlagen ab, die nur Text an eine Rolle geben und
  trotzdem bestimmen, was die Rolle tut.
- **`component:<neuer-wert>` wird abgewiesen.** Bewusst: Werte pflegt der Mensch im Tag-Manager.
  Eine Rolle, die ein neues Bauteil entdeckt, kann es nicht taggen. Das ist der Preis gegen
  Wildwuchs und kann sich als zu streng erweisen.
- **Zwei Bedeutungen von „Wert löschen".** `NOTES_TAG_CLASS_REMOVE_VALUE` nimmt ihn aus dem
  Angebot, `NOTES_TAG_DELETE` streicht ihn aus **jeder** Note. Im Tag-Manager zwei Knöpfe.
- **Der Umzug ist wiederholbar und durch eine Markerdatei gebremst**
  (`.tag-axes-migration-done` im Notes-Verzeichnis). Zum erneuten Lauf den Marker löschen; ein
  zweiter Lauf schreibt null Dateien.

### 4.2 Aus der Vorgänger-Übergabe, weiterhin gültig

- **Tests brauchen Node 22.** `export PATH="/opt/homebrew/opt/node@22/bin:$PATH"` vor jedem
  Test- und Typecheck-Befehl. Ohne das führt `npm run test` **null** Tests aus und sieht wie ein
  sauberer Lauf aus. Keine Testausgabe heißt: PATH vergessen.
- **`npm run test`, nicht `node --test`** — ohne den vorgeschalteten `rebuild:node` fallen über
  150 Tests in den SQLite-gestützten Suiten.
- **`npm run lint` ist projektweit rot** und war es vorher. Das Gate ist: keine neuen Probleme in
  den geänderten Dateien, per `npx eslint <dateien>`.
- **Drei gemessene Eigenschaften der Claude-CLI** (CLAUDE.md, „Rollen als Constraint"):
  `--dangerously-skip-permissions` umgeht `permissions.deny` vollständig; ein PreToolUse-Hook
  feuert trotzdem; nur `Edit(glob)` greift bei Dateiedits. Jede davon kann mit der nächsten
  CLI-Version kippen — **nachmessen, nicht glauben.**
- **Keep Working Restore ist eine fragile Zone.** Drei Regeln in CLAUDE.md, darunter: ein
  geworfener Fehler in der Init-Kette killt den Session-Restore **still**.

### 4.3 Kleinigkeit, aber nervig

`src/shared/version.ts` ist ein Build-Artefakt und soll laut Konvention nicht committet werden —
hat aber 32 Commits Vorgeschichte und ändert sich bei jedem `npm run build`. Ein `git add -A`
nimmt es mit. In dieser Session ist das sechsmal passiert. Entweder gezielt adden oder die
Konvention korrigieren; der Widerspruch steht seit Monaten.

---

## 5. Zeiger

| Thema | Datei |
|---|---|
| Tag-Modell, die drei Bruchstellen | `CLAUDE.md`, Sektion „Tags: fünf Achsen…" |
| Die Quelle des Modells | `src/shared/tag-axes.ts` |
| Umzug samt Begründung pro Wert | `src/main/notes/tag-migration.ts` |
| Zielbild, Strategie, offene Entscheidungen | `docs/superpowers/specs/2026-09-29-prozess-substrat-strategie.md` |
| Notes als Projektgedächtnis | `docs/superpowers/specs/2026-09-30-notes-als-projektgedaechtnis.md` |
| Bestandsaufnahme offener Entscheidungen | `docs/superpowers/specs/2026-09-30-bestandsaufnahme-offene-entscheidungen.md` |
| Vorgänger-Übergabe | `docs/superpowers/handovers/2026-09-29-uebergabe-an-frische-session.md` |
| Architekturentscheidungen | `docs/decisions/` (9 ADRs) |

**Sicherungen der Notes vor den Umzügen** (nicht in git, auf dieser Maschine):
`~/.config/cipher-mux/notes-backup-2026-09-30` und `…-2026-10-01-schritt2`, je 959 Dateien.

---

## 6. Arbeitsteilung mit dem Nutzer

In seinen Worten: *„ich bin ein maker - kein entwickler … ich bin da für anforderungen,
zielsetzungen und UX entscheidungen"*.

Daraus folgt konkret:

- **Technische Schuld nicht vorlegen.** *„geh damit nach best practice um und frag mich nicht mehr
  danach."* Die 136 verbleibenden `no-explicit-any`-Warnungen gehören dazu.
- **Kleine Fragen sammeln, nicht anhalten.** *„halt nicht wegen den kleinen fragen an - sammel
  sie"* — und am Ende gebündelt vorlegen.
- **Neustart selbst machen.** `npm start` aus dem Repo, **nicht** `/Applications/cipher-mux.app`
  (die ist alt). Nach einem Testlauf ist `better-sqlite3` auf der Node-ABI; der prestart-Hook von
  `npm start` stellt die Electron-ABI wieder her. tmux hält die Sessions über einen Neustart.
- **Notes beim Titel nennen, nie bei der ID.** ULIDs sind interne Handles.
