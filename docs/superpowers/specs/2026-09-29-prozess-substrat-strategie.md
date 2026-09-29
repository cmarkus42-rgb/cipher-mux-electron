# Mux als Prozess-Substrat — Strategie

**Datum:** 2026-09-29
**Status:** Erfassung eines Gesprächs, noch keine abgestimmte Entscheidung
**Anlass:** Der Mux hat seinen Vorsprung gegenüber der nackten CLI weitgehend verloren. Was bleibt, ist nicht Orchestrierung, sondern Prozess.

---

## 1. Der Ausgangsbefund

Mit Claude 4.6 war der Mux deutlich besser als die CLI allein. Heute macht es im Kern
keinen großen Unterschied mehr. Claude Code hat sich die Orchestrierung einverleibt:
Subagents, Background-Tasks, Workflows, Plan Mode, 1M Kontext.

Das war das sichtbarste Verkaufsargument des Mux, und es ist weg. Der Versuch, „up to date
mit Claude" zu bleiben, ist ein Rennen gegen einen Hersteller, der schneller liefert als ein
Einzelprojekt — jede nachgebaute Orchestrierung wird im nächsten Release überflüssig.

**Nicht einverleibt wurde:**

- **Dauerhaftigkeit über Tage.** Ein Subagent stirbt mit seinem Turn. Eine tmux-Session
  überlebt den App-Absturz.
- **Menschliche Einsicht und Eingriff.** Fünf Panes sehen und in einem eingreifen.
- **Rollen mit Gedächtnis.** Identitäten über Wochen, keine Tasks über Turns.
- **Voice.**

## 2. Zwei Achsen, die nicht dasselbe sind

Die wichtigste begriffliche Korrektur des Gesprächs:

**Orchestrierung** — wer startet wen, wer wartet auf wen, Fan-out und Fan-in.
→ Kann Claude Code. Abgeben.

**Rollentrennung** — welcher Kontext macht welche Arbeit, und wo liegt die Übergabegrenze.
→ Kann Claude Code **nicht**, auch nicht mit Subagents. Ein Subagent ist Helfer *einer*
Session: er stirbt, sein Kontext ist weg, der Elternkontext bleibt vollgelaufen. Gebraucht
werden Peers mit eigener Identität, eigenem Gedächtnis, eigenem Modell, die sich
**Artefakte** übergeben statt Gesprächsverläufe.

Rollentrennung ist Kontexthygiene, und sie ist mehr als „der Kontext ist voll": Eine Session,
die eine Spec geschrieben hat, ist auf ihre eigenen Entscheidungen **verankert** und merkt
nicht, dass die Spec falsch ist. Deshalb darf Refinement nicht bauen, nachdem es gespect hat.

## 3. Der Beleg aus der eigenen Praxis

Das Multi-Workspace-Paket (12 Tasks, 28 Commits, 2026-09-20/21) ist die Datenbasis.

**Frontloading hat Iterationen nicht verhindert.** Der sehr detaillierte Plan hatte vier
Defekte:

| Defekt | Gefunden von |
|---|---|
| Symlink-Liste zeigte auf einen Pfad, den kein Code schreibt | Task-Review |
| `?? undefined` im Preload kollabierte die null/undefined-Unterscheidung | Implementer, gegen die Anweisung |
| `PaneHeader` als Badge-Heimat, Komponente nie gemountet | Implementer |
| `applyWorkspace` konnte Sessions gar nicht binden (Critical) | Erst das Whole-Branch-Review |

**Was daraus folgt — drei Dinge:**

1. **Detailtiefe zahlt sich aus, weil sie den Plan falsifizierbar macht.** Ein vager Plan
   kann nicht widerlegt werden, ein präziser schon. Der Fehler wird lokal und früh statt
   global und spät. Das ist ein anderer Mechanismus als „vorausdenken spart Runden".
2. **Es braucht eine Stufe, die das Ganze sieht.** Der Critical lag in einer Datei, die in
   keiner Dateiliste des Plans stand. Kein Task-Review konnte ihn finden.
3. **Implementer müssen widersprechen dürfen.** Zwei von vier Defekten fand jemand, der
   seiner Anweisung widersprochen hat. Das ist eine Prompt- und Kultureigenschaft, keine
   Werkzeugeigenschaft.

## 4. Was bei Artefakt-Übergaben tatsächlich fehlt

In **jedem** Dispatch dieser Session stand ein Abschnitt „Context the brief cannot know".
Das war kein Luxus — die Briefs waren ab Task 3 veraltet, einer nannte eine tote Komponente.

Aufgeschlüsselt, was von Hand nachgeliefert werden musste:

**Berechenbar aus dem Repo (größter Block):** veraltete Zeilennummern nach Umbauten,
uncommittete Fremdänderungen, vorbestehende Lint-Fehler samt `git blame`, exakte Signaturen
der Schnittstellen aus vorherigen Tasks.

**Task- und Befundzustand:** welche Tasks fertig sind, welche Befunde offen oder geparkt
sind, welche Lücke bewusst stehenbleibt.

**Echte Memory:** Entscheidungen samt verworfener Alternativen, entdeckte Fakten
(„PaneHeader wird nie gemountet"), Begründungen von Regeln.

### Die Regel, die daraus folgt

**Alles, was aus dem Repo ableitbar ist, gehört nicht ins Gedächtnis.**

Nicht nur billiger — verlässlicher. Eine gespeicherte Erinnerung kann veralten und behauptet
sich danach mit derselben Bestimmtheit wie eine wahre. Ein `git diff` kann nicht veralten.
Wer Berechenbares speichert, baut einen zweiten, schlechteren Wahrheitsbegriff neben git.

Companion-Memory und Workspace-Memory sind für das letzte Drittel richtig — und nur dafür.
Sie dort einzusetzen, wo berechnet werden kann, ist der Weg zur Tokenverbrennfabrik.

### Wo die Token wirklich verbrennen

Nicht beim Schreiben. Beim **Abrufen** und beim **Orientieren**.

`companion_memory_recall` liefert die letzten N — recency-sortiert, nicht relevanz-sortiert.
Das skaliert gegen einen: je voller der Store, desto mehr Irrelevantes pro Sessionstart.
`companion_memory_search` (FTS5) ist das ökonomische Primitiv, `recall` das teure.

Der größere Posten ist Orientierung: Task 10 brauchte 89 Tool-Aufrufe, Task 11 83, die
Fix-Welle 102 — ein erheblicher Teil davon reines Suchen nach dem aktuellen Zustand.

**Ökonomie und Qualität zeigen hier in dieselbe Richtung:** Der berechnete Weltzustand spart
Token *und* verhindert den Stale-Brief-Fehler.

### Die Form: Handoff-Manifest

Dünn, und **generiert statt geschrieben**:

- Zeiger auf Spec/Plan — das „Was", bleibt wo es ist
- **Berechnet beim Handoff:** Diff seit dem Basis-Commit des Artefakts, beschränkt auf
  Dateien, die das Artefakt erwähnt
- **Offene Befunde** dieses Workspace aus einem Findings-Store
- **Drei bis sieben Memory-Zeiger** — IDs und Einzeiler, nicht Inhalte; die Rolle zieht nach
- Entscheidungen und verworfene Alternativen (der memory-förmige Teil)

Kuratiert wird nur die Memory-Auswahl. Alles andere entsteht im Moment der Übergabe und kann
deshalb nicht veralten.

## 5. Zielbild

Der Mux hört auf, Orchestrator sein zu wollen, und wird **Prozess- und Artefakt-Substrat**:
der Ort, an dem der Prozess und seine Artefakte liegen, mit einem Menschen, der sehen und
steuern kann.

Was aus der Multi-Workspace-Session überlebt hat und wertvoll ist, liegt in
`.superpowers/sdd/...`: Spec, Plan, Briefs, Reports, Review-Pakete, Ledger. Markdown und
Dateisystem, kein Claude-spezifisches Bit. Das ist bereits die zeitlose Realisierung — sie
existiert nur als Scratch-Verzeichnis eines Plugins statt als Mux-Konzept. Mux weiß nichts
davon, obwohl „welcher Task, wer arbeitet dran, was sagte das Review, was ist geparkt" genau
das ist, was er anzeigen und steuern könnte.

**Randbedingung:** Gerüst für die eigene Arbeit, OSS veröffentlicht. Multi-CLI ist damit
nicht durch Portabilität begründet, sondern durch **Routing** — der beste Coder muss nicht
der beste Ideation-Partner sein. Und Review von einer anderen Modellfamilie als der
implementierenden ist ein Qualitätshebel, weil Fehlermuster sich unterscheiden; ein
Geschwistermodell teilt die blinden Flecken.

**Zuschnitt:** größere Vorhaben. Kleines geht weiter direkt in Workshop oder Terminal.

## 6. cipher-keel — Ist-Aufnahme (2026-09-29)

keel bezeichnet sich im README selbst als *„the successor project to cipher-mux, built from
the ground up around the graph rather than around a message bus."*

**Lage:** 1006 Commits, zuletzt 2026-09-28, in den letzten acht Wochen 20–40 Commits an fast
jedem Arbeitstag. 2760 Tests über 203 Testdateien. Phasen 1–8 abgeschlossen, 3a bis 5 mit
formalem Audit und RELEASE-Verdikt. Nicht liegengeblieben — ein laufendes Zweitsystem.

Die letzten Wellen bauen eine autonome Kette: *„Architect delegiert, Worker arbeitet, der
Läufer weckt den Aussteller"*, gemessen mit **46 ct für 90 Minuten**, mit Git-Wächter am
Kettenanfang und Notbremse.

Methodisch ist keel voraus: „measured rather than assumed", Feldprotokolle statt Testgrün,
ein Prompt-Preview, der zeichenweise gegen die tatsächlich übergebene Datei verglichen wurde,
weil *„a preview that shows something other than what is delivered would be worse than none"*.

### Was dort bereits gebaut ist

| Im Gespräch als Lücke benannt | In keel |
|---|---|
| Rolle → (Adapter, Modell) | `model/registry.ts`, `rollen.ts`, `eignung.ts`, `slots.ts` — Capability-Records, sieben Tier/Rollen/Session-Slots, Endpoint-Auflösung, Keychain-Keys, im Settings-Fenster editierbar |
| Rollengrenzen als Constraint | `harness/pfadwache.ts`, `netzwache.ts`, `intent-vor-effekt.ts`, `faehigkeiten.ts` |
| CLI-/Modell-Agnostik | `harness/codec-anthropic.ts`, `codec-openai-chat.ts`, `fortsetzbarkeit.ts` |
| Handoff-Manifest, generiert | **Phaseninput-Layer** — „the preceding phase's output artefacts, resolved from the graph into the prompt" |
| Befunde als erstklassiges Objekt | `graph/phase-contract.ts`, `gate-cache.ts`, typisierte Knoten |
| Token-Ökonomie | `harness/budget.ts`, `preise.ts` |

### Kopplungsanalyse — was sich heben lässt

**Graph-frei, also mitnehmbar:**

| Baustein | Zeilen |
|---|---|
| `model/` komplett (`registry`, `rollen`, `eignung`, `slots`, `entry`, `defaults`) | — |
| `codec.ts`, `codec-anthropic.ts`, `codec-openai-chat.ts` | ~405 |
| `budget.ts`, `preise.ts` | ~377 |
| `pfadwache.ts`, `netzwache.ts` | ~890 |
| `faehigkeiten.ts`, `fortsetzbarkeit.ts` | ~380 |

**Graph-gekoppelt, nicht mitnehmbar:** `lauf.ts`, `werkzeuge*.ts`, `sandkasten.ts`,
`trigger-*.ts` — und der **Phaseninput-Layer**, per Definition.

Das ist die unangenehme Pointe: Vier der fünf Punkte lassen sich sauber heben. Der fünfte —
das generierte Handoff-Manifest, im Gespräch als das Wertvollste bezeichnet — ist genau der,
der am Graph hängt.

## 7. Offene Entscheidungen

**Tendenz des Users (2026-09-29):** keel liefert Bausteine und Gedanken, die Richtung wird im
Mux gebaut.

Daraus folgt, noch nicht entschieden:

1. **Was ersetzt den Graph für den Phaseninput?** Ein Findings-/Artefakt-Store auf SQLite im
   Mux wäre ein Teil-Nachbau dessen, was in keel fertig und auditiert ist. Alternativen:
   den Phaseninput schmaler schneiden (nur berechneter Delta + Befundliste, ohne
   Graph-Semantik), oder den Punkt bewusst offen lassen.
2. **Wie viel `model/` wird übernommen?** Die Registry hängt an `preset/`, `agent/`,
   `worker/` und `config-store` von keel. Portierung heißt Anpassung, nicht Kopie.
3. **Was wird zuerst gebaut?** Kandidaten, grob nach Hebel pro Aufwand:
   - *Delta-Berechnung beim Handoff* — rein deterministisch, kein Modellaufruf, ersetzt den
     größten Posten der Handarbeit
   - *Befunde als erstklassiges Objekt* — Buchhaltung, kein Modellaufruf
   - *Rolle → Modell/Adapter* — klein, sofort nutzbar, setzt das `AgentAdapter`-Interface
     zum ersten Mal unter echten Druck
   - *Rollengrenzen über `settings.local.json`* — die Mechanik schreibt Mux bereits pro
     Entity (`getMcpPermissionsForEntity`), bisher nur für MCP-Tools
4. **Bleibt keel parallel in Betrieb?** Es ist ein aktives System mit einer laufenden
   autonomen Kette. Ein Mux, der dieselbe Richtung einschlägt, konkurriert mit ihm um
   dieselbe Aufmerksamkeit.

## 8. Was bewusst nicht drinsteht

Kein Task-Zuschnitt, keine Dateilisten, keine Reihenfolge. Das ist eine Erfassung des
Gesprächsstands, kein Implementierungsplan. Der entsteht erst, wenn Punkt 1 und 3 aus
Abschnitt 7 entschieden sind.
