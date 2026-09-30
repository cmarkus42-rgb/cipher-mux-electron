# Bestandsaufnahme: was noch offen ist

**Datum:** 2026-09-30
**Zweck:** Zusammenstellung für den Menschen. Was an Zielsetzung, Anforderungen und Bedienung
offen ist — nicht, was an Code offen ist.
**Stand:** Am 2026-09-30 durchgesprochen. Die Kommentare kamen als Korrekturen in der
gespiegelten Note und wurden von hier aus eingearbeitet — der Weg aus
`2026-09-30-notes-als-projektgedaechtnis.md` Abschnitt 3.2, zum zweiten Mal gegangen und
diesmal von dem, für den er gedacht ist.
**Grundlage:** die beiden Strategiepapiere, die Befund-Note, die Abnahme-Dokumente und was
sich beim Bauen am 2026-09-29/30 gezeigt hat.

---

## 0. Was nicht mehr offen ist

Damit die Liste ehrlich bleibt: Die Reihenfolge aus dem Strategiepapier (Abschnitt 7.5) ist
**vollständig abgearbeitet**. Anker und Delta, Memory als Zeiger-Index, Rolle → Modell,
Rollengrenzen als Constraint, und Abschnitt 7.1 „Befunde — wohin" ist mit `noteType: finding`
beantwortet. Details in `2026-09-29-prozess-substrat-strategie.md` Abschnitt 7a.

Offen ist damit nicht mehr *der Plan*, sondern was nach ihm kommt.

---

## 1. Entscheidungen, die Geld und Qualität steuern

### 1.1 Welche Rolle läuft auf welchem Modell?

**Gebaut, aber leer.** Der Mux kann jetzt pro Rolle ein Modell setzen
(`entityModels` in der Config, aufgelöst über `entity-runtime.ts`). Bewusst trägt **keine**
Rolle einen Vorgabewert, weil das eine Kostenentscheidung ist.

Solange nichts gesetzt ist, läuft jede Rolle auf dem CLI-Standard — also alle gleich teuer.

**Entschieden (2026-09-30):** Vorerst läuft alles auf Claude Opus latest; die Zuordnung
passiert bei Bedarf von Hand. Der Grund, warum das kein dringender Hebel ist, steht unter
1.2: das Abo hat keine Grenzkosten, also ist die Modellwahl eine Frage von Tempo und
Qualität, nicht von Geld.

Die Mechanik bleibt und wartet — `entityModels` in der Config, sobald eine Rolle erkennbar
mit weniger auskommt.

### 1.2 Was aus keel geholt wird

Das Strategiepapier listet unter 6 als „graph-frei, also mitnehmbar": `budget.ts` und
`preise.ts` (Ökonomie, ~377 Zeilen), `pfadwache.ts` und `netzwache.ts` (~890),
`faehigkeiten.ts` und `fortsetzbarkeit.ts` (~380), sowie `model/` komplett.

Von diesen ist bisher **nichts** portiert. Die Rolle-→-Modell-Mechanik ist eigenständig
entstanden, nicht aus keel übernommen.

**Entschieden (2026-09-30): wird nicht geholt.** Kostenkontrolle läuft über das Abo — dort
sind die Grenzkosten null — und ansonsten über die CLI selbst. keels Ökonomie-Schiene
existierte, um Vergleichsstrecken zu fahren; das ist hier kein Zweck. Der Mux soll an dieser
Stelle schlank bleiben.

`pfadwache`/`netzwache` sind mit den Rollengrenzen vom 2026-09-30 ohnehin abgedeckt.

---

## 2. Anforderungen an die Spiegelung

Aus `2026-09-30-notes-als-projektgedaechtnis.md` Abschnitt 7, jeweils mit dem, was sich beim
ersten Durchlauf gezeigt hat.

### 2.1 Wer legt den Spiegel an?

Heute: von Hand. Eine Rolle, die eine Spec schreibt, legt die Datei an — die Note nicht.

**Entschieden (2026-09-30): der Mux spiegelt, deterministisch.** Nicht die Rolle, weil eine
Rolle es vergessen kann und die Spiegelung dann davon abhängt, ob jemand daran gedacht hat.
Der Mux erkennt Dateien in den dafür vorgesehenen Verzeichnissen und legt die Note an.

Offen bleibt damit nur das Wie: welche Verzeichnisse, und wie die Zuordnung Datei → Note
gehalten wird, damit eine zweite Spiegelung keine zweite Note erzeugt.

### 2.2 Erbt ein Spiegel den Workspace?

Heute wird eine gespiegelte Note **global**. Das ist der Grund, warum sie beim ersten Versuch
in der Sidebar nicht auffindbar war (inzwischen behoben).

**Entschieden (2026-09-30): die Note erbt den Workspace.** Der Workspace ist der Idee nach
die Heimat eines Projekts und damit die höchste Filterebene — eine Spec, die zu einem Projekt
gehört, gehört in dessen Workspace. Global bleibt der Sonderfall, nicht der Normalfall.

### 2.3 Umbenennen und Löschen

Wenn die gespiegelte Datei verschwindet, sagt der Drift-Block das („das Original ist nicht
mehr im Repository"). Bei **Umbenennung** sagt er dasselbe, obwohl die Datei nur umgezogen ist.

**Entschieden (2026-09-30): die Warnung reicht.** Einer Umbenennung zu folgen hieße
`git log --follow` auszuwerten, und das ist ein Schritt Richtung Versionsverwaltung, den der
Nutzen nicht trägt. Der Mensch sieht die Warnung und entscheidet.

### 2.4 Historie einer Spec

Idee aus dem Papier: „Historie" ist `git log --follow` auf die Datei, im Mux gerendert, statt
einer gepflegten Notes-Historie.

**Entschieden (2026-09-30):** Die Grenze liegt bei mir, mit einer klaren Leitplanke — kein
git-Nachbau, es soll sich nicht selbst im Weg stehen, funktionieren, und im Mux eine
intuitive Bedienung ergeben.

**Auslegung:** Eine Liste von Commits mit Betreff, Datum und Kurz-Hash, die zur Datei gehören.
Das ist Nachvollziehen und beantwortet „wer hat wann was an dieser Spec geändert". Kein
Diff-Betrachter, keine Branch-Ansicht, kein Blame — dafür gibt es bessere Werkzeuge, und es
wäre dieselbe Falle wie die nachgebaute Orchestrierung.

---

## 3. Bedienung

### 3.1 Brauchen weitere Note-Typen eigene Ansichten?

Es gibt jetzt drei typisierte Notes: `testcase` (bewährt), `finding` (neu), `spec` (gespiegelt,
aber ohne eigene Ansicht — wird als Text gerendert).

**Entschieden (2026-09-30):**

- **Die Lücke wird geschlossen.** Der Drift-Block gehört in die Oberfläche: eine gespiegelte
  Note muss zeigen, dass sie veraltet ist, ohne dass jemand sie weiterreicht. Heute entsteht
  er nur beim Dispatch — das ist die größte Lücke zwischen Konzept und Bedienung.
- **`spec` bekommt eine eigene Ansicht**, mit dem Drift-Block als Kopfzeile.
- **`requirements` bekommt einen Typ mit Struktur.** Anforderungen dürfen nach RE-Methoden
  mit Schema erfasst werden statt als Fließtext. Zwei Bedingungen: gut lesbar und gut
  kommentierbar. Requirements sind das interne Dokument, aus dem die offiziellen Specs
  hervorgehen — die Spec ist das Ergebnis, nicht die Quelle.
- **`research` braucht keinen eigenen Typ.** Es ist allgemeines Futter für Entscheidungen und
  kommt als gewöhnliche Note aus.

### 3.2 Die 102 offenen Testcases

Die Testcase-Note führt 490 Positionen, davon 102 offen. Ein Teil davon stammt aus Wellen, die
Monate zurückliegen.

**Entschieden (2026-09-30):** Aus alten Wellen: **abhaken.** Was aus dem laufenden Durchgang
stammt: **sammeln.**

Die Frage „welche Testcases" war berechtigt — die Note nennt Wellen, keine Gegenstände, und
aus „Welle F3" geht nicht hervor, was jemand ausprobieren soll. Das ist zugleich die
Begründung für die Regel in `docs/testcase-notes.md`, Abschnitte nach dem Abnahmegegenstand
zu benennen.

### 3.3 Die 47 fragwürdigen pass-Einträge

Gemessen: 47 der 380 abgehakten Testcases begründen sich selbst mit „Code verifiziert" statt
mit Benutzung. Die Regel dagegen steht jetzt in `docs/testcase-notes.md` und den Global Rules.

**Entschieden (2026-09-30): Altbestand abhaken, Regel gilt ab jetzt.** Dieselbe Linie wie
3.2. Einträge aus Wellen, die Monate zurückliegen, wieder zu öffnen erzeugt eine Liste, die
niemand abarbeitet — und eine Liste, die niemand abarbeitet, ist genau das Problem, das hier
behoben werden soll.

---

## 4. Abnahmen, die nur ein Mensch machen kann

| Was | Umfang | Stand |
|---|---|---|
| Multi-Workspace-Sessions | 10 Testcases, `docs/superpowers/acceptance/2026-09-20-...md` | nie durchgeführt; „scheint zu gehen" |
| Handoff-Dispatch im Alltag | Übergabe schreiben, zustellen, Zustandsblock lesen | einmal von mir durchgeführt, nie von dir |
| Rollengrenzen | Refinement versucht Code zu ändern und wird abgewiesen | einmal in einer Wegwerf-Umgebung belegt |
| Spiegelung | Note editieren, per Handoff einarbeiten lassen, nachziehen | einmal von mir durchgeführt |

Das erste ist das wichtigste — es berührt Session-Wiederherstellung, Workspace-Zuordnung und
Entity-Run-Verzeichnisse, also genau die Stellen, an denen am 2026-09-30 drei Defekte saßen.

**Terminiert (2026-09-30): alles ab Freitag.** Bis dahin wird gebaut, nicht abgenommen.

---

## 5. Befunde, die eine Entscheidung brauchen

Aus der Befund-Note „Befunde 2026-09-30":

- **F-3 (high) — entschieden: der Rückfall bleibt, aber er wird messbar.** Der Prompt-Marker
  hat bisher funktioniert; die Selbstmeldung ist neu und muss sich erst beweisen. Solange das
  nicht belegt ist, ist es falsch, den funktionierenden Weg abzuschalten. **Auftrag:**
  nachvollziehbar machen, welches Signal eine Session bereit gemeldet hat — dann lässt sich
  nach einigen Wochen sehen, ob die Selbstmeldung trägt, statt es zu vermuten.
- **F-10 — geklärt, mit einer wichtigen Berichtigung.** Es gibt **zwei** Focus-Konzepte, und
  **beide müssen bleiben**: der Sprach-Fokus für die STT-Eingabe (welche Session bekommt das
  Gesprochene, `VoiceInputRouter` mit Fokus und Pinning) und der Grid-Focus-Mode, der eine
  Session auf mehrere Fenstergrößen aufzieht. Was am 2026-09-30 entfernt wurde, war ein
  **drittes**, totes: eine A11y-Einstellung, die niemand auslas. Beide echten Wege sind
  nachgeprüft und intakt.
- **F-5 (geparkt):** siehe 3.3, erledigt.

---

## 6. Was ich nicht auf die Liste gesetzt habe

Technische Schulden ohne Produktfrage: Lint-Warnungen, die verbliebenen `any` mit echter
Typentscheidung, Initialisierungsreihenfolgen.

**Festgelegt (2026-09-30):** Das ist nicht vorzulegen. Nach bester Praxis behandeln und nicht
mehr danach fragen. Maßstab ist, dass es funktioniert.

Voice, Bluetooth und Updater waren am 2026-09-29/30 nicht Gegenstand. **Stillschweigende
Anforderung:** Sie sollen weiterhin funktionieren. Wer hier arbeitet, prüft das mit, statt es
anzunehmen — die 88 Tests des VoiceInputRouter sind der billigste Teil davon.
