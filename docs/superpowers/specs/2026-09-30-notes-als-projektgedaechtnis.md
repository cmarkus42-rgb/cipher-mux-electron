# Notes als Projektgedächtnis — Typisierung und Spiegelung

**Datum:** 2026-09-30
**Status:** Zielbild entschieden, Umsetzung offen
**Vorgänger:** `2026-09-29-prozess-substrat-strategie.md`
**Anlass:** Ergebnisse von Sessions — Recherchen, Anforderungspakete, Specs, Übergaben —
sind im Mux nicht als Projektgedächtnis sichtbar. Sie liegen in git oder in einer flachen
Notes-Liste, aber nicht dort, wo man ein Projekt nachvollzieht.

---

## 1. Der Anspruch

Ergebnisse von Sessions sollen **im Mux, am Projekt, sichtbar und nachvollziehbar** sein —
als gut typisierte Notes. Sie sollen bequem zur Verfügung stehen und zugleich **Arbeitsfläche**
sein: Korrekturen hineinschreiben und einarbeiten lassen muss gehen.

Das ist kein UX-Wunsch. Die Oberfläche trägt das im Kern bereits; es fehlt die Typisierung
und die Anbindung an git.

## 2. Die Grenzziehung

**git bleibt die primäre Wahrheit. Die Note spiegelt sie.**

Genauer, und das ist der Kern:

- Die Note ist **Information für den Menschen**, nicht die Wahrheitsquelle für die KI.
- Eine Rolle, die etwas wissen muss, liest **git**. Nicht die Note.
- Die Note macht sichtbar, was passiert ist, und nimmt Korrekturen entgegen.

Damit löst sich der Einwand gegen jede Kontextschicht auf. Die Sorge lautet: sie wird zum
zweiten, schlechteren Wahrheitsbegriff neben git. Wenn die Note ausdrücklich nicht maßgeblich
ist, kann sie es nicht werden.

**Kein git-Nachbau.** Die Frage vor jedem Stück Integration: *Dient es dem Nachvollziehen
einer Übergabe, oder ist es Versionsverwaltung?* Das Erste gehört in den Mux, das Zweite nicht.
Diff-Ansichten, Blame, Branch-Verwaltung: nicht.

## 3. Zwei Regeln, die aus Erfahrung stammen

### 3.1 Nicht-Autorität muss sichtbar sein, nicht erklärt

Ein veralteter Spiegel, der aktuell aussieht, ist auch dann eine Falle, wenn irgendwo steht,
dass er nicht maßgeblich ist — er wird trotzdem gelesen, sobald man ihn jemandem reicht.

**Beleg aus der eigenen Arbeit:** Das Strategiepapier vom 2026-09-29 führte unter „offene
Entscheidungen" die Frage, wie `scope: 'global'` in `createHandoff()` zu reparieren sei. Der
Code hatte das längst beantwortet — `NoteInfo.scope` ist deprecated, Notes liegen flach,
Workspace-Bindung läuft über Tags, eine Migration hatte das bereits umgestellt. Das Dokument
war „nur Gesprächsstand" und hat die nächste Session dennoch in die Irre geführt. Ausgerechnet
das Dokument, das die Regel „Berechnetes wird nie gespeichert" aufstellt, hat sie gebrochen.

**Konsequenz:** Eine gespiegelte Note trägt, gegen welchen Commit sie gespiegelt wurde. Beim
Öffnen wird berechnet, ob die Datei sich seither bewegt hat, und das Ergebnis steht sichtbar
darüber — „spiegelt `docs/spec.md`, Stand `abc1234`, seither 3 Commits". Das ist dieselbe
Ankermechanik wie beim Handoff-Delta, auf eine Datei statt auf ein Repository angewandt.

Drift, die man sieht, statt Nicht-Autorität, die man glauben muss.

### 3.2 Korrekturen werden zu Anweisungen, nicht zu Patches

Sobald der Mensch den Spiegel editiert und die Datei sich ebenfalls bewegt, braucht man
Merge-Semantik. Die hat git, und sie nachzubauen ist genau der verbotene Weg.

**Der Weg ohne Nachbau:** Die Korrektur in der Note ist **Eingabe für eine Rolle**, kein Patch.

```
Note bearbeiten → Handoff an die zuständige Rolle → Rolle ändert die Datei in git
→ Spiegel zieht nach
```

Der Transport dafür existiert bereits: `mux_notes_handoff_dispatch` stellt eine Note samt
berechnetem Zustandsblock in eine Rollen-Session zu. Die Arbeitsfläche ist damit kein neues
Konzept, sondern eine Anwendung des vorhandenen.

**Der Spiegel wird nie automatisch zurückgeschrieben.**

## 4. Typisierung

`noteType` existiert bereits, und es gibt einen Präzedenzfall: `TestcaseView` rendert
ausschließlich Notes mit `noteType: testcase`. Typspezifische Darstellung ist also gebaute
Mechanik, nicht neue.

Vorgeschlagene Typen:

| Typ | Inhalt | git-Gegenstück |
|---|---|---|
| `spec` | Technische Spezifikation | `docs/superpowers/specs/*.md` |
| `requirements` | Anforderungspaket | Datei im Projekt |
| `research` | Rechercheergebnis | optional |
| `handoff` | Übergabe zwischen Rollen | keines (lebt im Mux) |
| `finding` | Review-Befund, geparkter Minor, bewusst offene Lücke | offen, siehe 5 |
| `testcase` | bereits vorhanden | keines |

Nicht jeder Typ braucht ein Gegenstück. `handoff` hat keins — eine Übergabe ist ihrer Natur
nach ein Mux-Objekt. `research` kann eines haben.

## 5. Was das für „Befunde — wohin?" bedeutet

Abschnitt 7.1 des Vorgängerpapiers stellt diese Frage und hält ausdrücklich fest, dass es
keine gute Antwort gibt: Als Notes fluten Befunde die Liste, in einer eigenen Tabelle sind sie
unsichtbar.

Mit Typisierung löst sich das Dilemma: `noteType: finding` erscheint in einer eigenen Ansicht
statt in der allgemeinen Liste — sichtbar, aber nicht flutend. Ob Befunde zusätzlich ein
git-Gegenstück bekommen, bleibt offen; dafür spricht Versionierbarkeit, dagegen der Aufwand
für ein Objekt mit kurzer Lebensdauer.

## 6. Abgrenzung zum Harness

Der Mux ersetzt den Harness nicht. Claude Code kann Orchestrierung, Subagenten, große
Kontexte. Was er strukturell nicht kann, ist Rollentrennung über Tage: ein Subagent stirbt mit
seinem Turn.

Daraus folgt ein Wartungsgesetz, das aus konkreten Fehlern stammt und nicht aus Prinzipien:

> **Der Mux darf keine Annahmen über das Innenleben der CLI kodieren.**

Belege vom 2026-09-29/30, alle drei still über Monate gelaufen und dann ohne Fehlermeldung
gekippt:

- `isBusy()` las `pane_current_command` auf `'claude'` — die CLI meldet dort ihre
  Versionsnummer (`2.1.284`), also galt jede laufende CLI als unbeschäftigt.
- Der Prompt-Marker `❯` sollte Eingabebereitschaft beweisen; er steht auch im
  Vertrauensdialog („❯ No, exit").
- Den Transcript-Pfad aus dem Arbeitsverzeichnis abzuleiten wurde erst gar nicht versucht: die
  Kodierung ist bereits zwischen CLI-Versionen uneinheitlich
  (`-Users-cipher--config-…` neben `-Users-cipher-config-…`).

Ein vierter Beleg zeigt, dass das Gesetz auch nach innen gilt: Der Mux darf auch keine
Annahmen über seine *eigene* Filterkomposition machen, wenn zwei Stellen dieselbe Frage
beantworten. `filterByWorkspace` behandelte eine Note ohne `workspace:`-Tag als global und
zeigte sie überall; `SidebarPanel` setzte zusätzlich `workspace:<name>` als Include-Filter und
entfernte genau diese Notes wieder (behoben in `13bb779`, siehe 7.5). Zwei Regeln, die einander
aufheben, sind derselbe Fehlertyp wie eine Heuristik, die eine Messung überstimmt.

**Umkehrschluss als Entwurfsregel:** Was der Mux über eine Session wissen will, soll die
Session selbst melden, nicht ihr Bildschirm hergeben. Der statusLine-Hook war die ganze Zeit
vorhanden und wurde nie als Bereitschaftssignal genutzt.

## 7. Offene Punkte

1. **Woher kommt die Spiegelung?** Schreibt die Rolle die Datei und der Mux erkennt sie, oder
   legt die Rolle Datei und Note gemeinsam an? Ersteres ist robuster, verlangt aber eine
   Zuordnung Datei → Note.
2. **Historie.** „Historie einer Spec" sollte `git log --follow` auf die Datei sein, im Mux
   gerendert — nicht eine gepflegte Notes-Historie. Das ist billiger und kann nicht veralten.
   Zu klären ist, wie weit das Rendern gehen darf, ohne Versionsverwaltung zu werden.
3. **Bekommen Befunde ein git-Gegenstück?** Siehe 5.
4. **Löschen und Umbenennen.** Was passiert mit dem Spiegel, wenn die Datei verschwindet oder
   umzieht? Der Drift-Block muss das sagen können, statt stillzuschweigen.
5. **Wie kommt eine extern entstandene Note im Cockpit an?** Der Normalfall des Konzepts ist,
   dass eine Rolle Datei und Note anlegt und der Mensch es sieht. Beim ersten Durchlauf
   (Abschnitt 9) war die Note in der Sidebar nicht auffindbar — kein Aktualisierungsproblem,
   sondern der Filterwiderspruch aus Abschnitt 6, behoben in `13bb779`. Offen bleibt die
   Entwurfsfrage: Soll eine gespiegelte Note überhaupt global sein, oder soll sie den Workspace
   erben, in dem sie entsteht?

## 7a. Nachziehen des Spiegels — gebaut

Der Kreislauf hatte eine offene Stelle: nachdem eine Rolle die Korrektur in die Datei
eingearbeitet hat, trug die Note weiterhin den alten Text und den alten Spiegelpunkt.

`NoteManager.refreshMirror()` schließt das. Drei Entscheidungen dabei:

- **Gespiegelt wird der committete Stand** (`git show <commit>:<pfad>`), nie der Arbeitsbaum.
  Ein Spiegel nennt einen Commit; eine uncommittete Änderung hat keinen zu nennen.
- **Nicht automatisch.** Der Spiegel ist Arbeitsfläche. Eine noch nicht eingearbeitete
  Korrektur würde von einem Nachziehen überschrieben.
- **Der ersetzte Text kommt zurück** (`replacedBody`), damit ein Aufrufer ihn behalten kann,
  statt seinen Verlust hinterher zu bemerken.

Ein Fehlschlag lässt die Note unangetastet.

Durchgeführt am 2026-09-30 an dieser Datei: Spiegelpunkt von `9485cef` auf `deb6019`, Typ
erhalten, Drift danach „aktuell". Der vom Menschen geschriebene Korrektur-Block verschwand
dabei aus der Note — richtig, denn sein Inhalt steht seit `f3fec45` in der Datei.

## 8. Was bewusst nicht drinsteht

Kein Datenmodell, keine Dateiliste, kein Task-Zuschnitt. Das ist Zielbild plus Begründung.
Der Umsetzungsplan entsteht, wenn Abschnitt 7 entschieden ist.

## 9. Selbsttest

Dieses Dokument ist der erste Durchlauf des eigenen Konzepts: es liegt als Datei in git und
ist im Mux als Note mit `noteType: spec` gespiegelt, die `mirrors_file` und `mirror_commit`
trägt. Die Statuszeile über der Note entsteht beim Öffnen aus `computeMirrorDrift` und sagt,
ob der Spiegel noch trägt.

Die Probe auf Abschnitt 3.1 besteht darin, dass genau dieser Absatz den Spiegel altern lässt.
