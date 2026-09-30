# Bestandsaufnahme: was noch offen ist

**Datum:** 2026-09-30
**Zweck:** Zusammenstellung für den Menschen. Was an Zielsetzung, Anforderungen und Bedienung
offen ist — nicht, was an Code offen ist.
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

**Zu entscheiden:** Welche Rollen rechtfertigen das größte Modell, welche kommen mit einem
kleinen aus? Kandidaten für „klein": Voice-Relay (leitet weiter), Launcher (startet),
Testing Assistant (führt aus und meldet). Kandidaten für „groß": Refinement, Cyber Factory,
Debugger.

**Ohne Entscheidung:** funktioniert alles, kostet aber überall dasselbe.

### 1.2 Was aus keel geholt wird

Das Strategiepapier listet unter 6 als „graph-frei, also mitnehmbar": `budget.ts` und
`preise.ts` (Ökonomie, ~377 Zeilen), `pfadwache.ts` und `netzwache.ts` (~890),
`faehigkeiten.ts` und `fortsetzbarkeit.ts` (~380), sowie `model/` komplett.

Von diesen ist bisher **nichts** portiert. Die Rolle-→-Modell-Mechanik ist eigenständig
entstanden, nicht aus keel übernommen.

**Zu entscheiden:** Lohnt die Ökonomie-Schiene (Budget, Preise) überhaupt, oder reicht die
Kostenkontrolle über 1.1? `pfadwache`/`netzwache` überschneiden sich inzwischen mit den
Rollengrenzen von heute — das wäre vor einer Portierung zu prüfen.

---

## 2. Anforderungen an die Spiegelung

Aus `2026-09-30-notes-als-projektgedaechtnis.md` Abschnitt 7, jeweils mit dem, was sich beim
ersten Durchlauf gezeigt hat.

### 2.1 Wer legt den Spiegel an?

Heute: von Hand. Eine Rolle, die eine Spec schreibt, legt die Datei an — die Note nicht.

**Zwei Wege:** Die Rolle legt beides an (einfach, aber vergessbar), oder der Mux erkennt neue
Dateien in bestimmten Verzeichnissen und spiegelt sie (robust, braucht eine Zuordnung
Datei → Note).

**Ohne Entscheidung:** Spiegel entstehen nur, wenn jemand daran denkt.

### 2.2 Erbt ein Spiegel den Workspace?

Heute wird eine gespiegelte Note **global**. Das ist der Grund, warum sie beim ersten Versuch
in der Sidebar nicht auffindbar war (inzwischen behoben).

**Zu entscheiden:** Soll eine Spec-Note zum Workspace gehören, in dem sie entsteht, oder
überall sichtbar sein? Für global spricht, dass eine Spec oft mehrere Workspaces betrifft;
dagegen, dass die Sidebar dann in jedem Workspace alles zeigt.

### 2.3 Umbenennen und Löschen

Wenn die gespiegelte Datei verschwindet, sagt der Drift-Block das („das Original ist nicht
mehr im Repository"). Bei **Umbenennung** sagt er dasselbe, obwohl die Datei nur umgezogen ist.

**Zu entscheiden:** Reicht die ehrliche Warnung, oder soll der Mux einer Umbenennung folgen?
Letzteres hieße `git log --follow` auswerten — machbar, aber ein Schritt Richtung
Versionsverwaltung.

### 2.4 Historie einer Spec

Idee aus dem Papier: „Historie" ist `git log --follow` auf die Datei, im Mux gerendert, statt
einer gepflegten Notes-Historie.

**Zu entscheiden:** Wie weit darf das Rendern gehen? Eine Liste von Commits mit Betreff ist
Nachvollziehen. Ein Diff-Betrachter wäre Versionsverwaltung — und damit laut eigener Regel
außerhalb.

---

## 3. Bedienung

### 3.1 Brauchen weitere Note-Typen eigene Ansichten?

Es gibt jetzt drei typisierte Notes: `testcase` (bewährt), `finding` (neu), `spec` (gespiegelt,
aber ohne eigene Ansicht — wird als Text gerendert).

**Zu entscheiden:** Verdient `spec` eine eigene Ansicht, etwa mit dem Drift-Block als Kopfzeile
und einem Sprung zur Datei? Und `requirements` / `research`, die es als Typ gibt, aber noch
nirgends?

**Anmerkung:** Der Drift-Block wird heute nur beim Dispatch berechnet. In der Oberfläche ist er
nicht zu sehen — eine gespiegelte Note zeigt nicht an, dass sie veraltet ist. Das ist die
größte Lücke zwischen Konzept und Bedienung.

### 3.2 Die 102 offenen Testcases

Die Testcase-Note führt 490 Positionen, davon 102 offen. Ein Teil davon stammt aus Wellen, die
Monate zurückliegen.

**Zu entscheiden:** Welche davon sind noch echte Abnahme-Absichten und welche Karteileichen?
Das kann nur jemand beurteilen, der weiß, was die App heute können soll.

### 3.3 Die 47 fragwürdigen pass-Einträge

Gemessen: 47 der 380 abgehakten Testcases begründen sich selbst mit „Code verifiziert" statt
mit Benutzung. Die Regel dagegen steht jetzt in `docs/testcase-notes.md` und den Global Rules.

**Zu entscheiden:** Altbestand zurücksetzen (ehrlich, aber 47 Einträge wieder offen) oder
stehen lassen und nur für Neues die Regel anwenden?

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

---

## 5. Befunde, die eine Entscheidung brauchen

Aus der Befund-Note „Befunde 2026-09-30":

- **F-3 (high):** Bereitschaft einer Session wird am Prompt-Marker im Terminal erkannt — eine
  Heuristik gegen eine Oberfläche, die sich ändern darf. Die Selbstmeldung über den
  statusLine-Hook ist inzwischen der bevorzugte Weg, der Marker nur noch Rückfall. **Zu
  entscheiden:** reicht das, oder soll der Rückfall ganz weg?
- **F-10 (low):** Zwei Focus-Mode-Konzepte lagen nebeneinander; das tote ist entfernt. Bleibt
  die Frage, ob der Grid-Mechanismus so bleiben soll, wie er ist.
- **F-5 (geparkt):** siehe 3.3.

---

## 6. Was ich nicht auf die Liste gesetzt habe

Technische Schulden ohne Produktfrage: 135 Lint-Warnungen, die verbliebenen `any` mit echter
Typentscheidung, die Initialisierungsreihenfolge einzelner Manager. Das entscheide ich, nicht
du — es steht hier nur, damit klar ist, dass es nicht vergessen wurde.

Ebenso nicht hier: Voice, Bluetooth, Updater. Die waren am 2026-09-29/30 nicht Gegenstand und
haben keine offene Frage produziert.
