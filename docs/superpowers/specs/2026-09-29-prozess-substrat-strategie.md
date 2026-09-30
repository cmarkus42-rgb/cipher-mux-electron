# Mux als Prozess-Substrat — Strategie und Zielgebung

**Datum:** 2026-09-29
**Status:** Zielgebung entschieden, Umsetzungsfragen offen
**Anlass:** Der Mux hat seinen Vorsprung gegenüber der nackten CLI weitgehend verloren. Was bleibt, ist nicht Orchestrierung, sondern Prozess.

---

## 1. Zielgebung — entschieden

**Der Mux wird fertig gebaut. cipher-keel liefert Bausteine und Gedanken, nicht die Richtung.**

Begründung des Users (2026-09-29), sinngemäß: keels Prozess ist zu groß gedacht. Er würde
ihn für sich selbst bauen. Es war spannend, die Kette bis zum Laufen zu bringen, aber in dem
Moment, in dem sie lief, hatte sie keinen Mehrwert — weder für ihn noch für irgendwelche
interessierten Abnehmer. Der Mux ist zugänglicher und hat als **Maker-Cockpit** eine
Zielgruppe, zu der er stehen kann, auch wenn sie ihn nicht nutzt.

### Das ist ein Entwurfsfilter, keine Absichtserklärung

„Zugänglich" und „Maker-Cockpit" entscheiden konkrete Fragen:

- **Gegen** verborgene Stores, Graph-Semantik, alles, was man verstehen muss, bevor es nützt
- **Für** sichtbare Artefakte, Dinge, die man anfassen, lesen und weiterreichen kann
- **Für** den Menschen in der Schleife als Normalfall, nicht als Notausgang

Wo eine Entwurfsfrage auftaucht, gewinnt die Variante, die ein Mensch ohne Einarbeitung
nachvollziehen kann — auch wenn sie weniger kann.

### Eine Umformulierung, die ich anbiete

„keel ist zu groß gedacht" trifft es nicht ganz. keel zielt auf **Autonomie** — eine Kette,
die durchfährt, ohne dass jemand hinsieht. Der Wert, den du tatsächlich suchst, liegt in
**Steuerbarkeit**: vorausdenken, Rollen trennen, sehen was passiert, eingreifen können.

Das ist nicht „zu groß", das ist ein anderes Ziel. Und es sagt präzise, was aus keel **nicht**
zu übernehmen ist: der Ketten-Runner, die Trigger-Läufer, die Notbremse. Die bedienen
Autonomie. Zu übernehmen ist, was Steuerbarkeit und Ökonomie bedient.

## 2. Der Ausgangsbefund

Mit Claude 4.6 war der Mux deutlich besser als die CLI allein. Heute macht es im Kern keinen
großen Unterschied mehr. Claude Code hat sich die Orchestrierung einverleibt: Subagents,
Background-Tasks, Workflows, Plan Mode, 1M Kontext.

Der Versuch, „up to date mit Claude" zu bleiben, ist ein Rennen gegen einen Hersteller, der
schneller liefert als ein Einzelprojekt. Jede nachgebaute Orchestrierung wird im nächsten
Release überflüssig.

**Nicht einverleibt wurde:** Dauerhaftigkeit über Tage (ein Subagent stirbt mit seinem Turn,
eine tmux-Session überlebt den App-Absturz) · menschliche Einsicht und Eingriff · Rollen mit
Gedächtnis über Wochen · Voice.

## 3. Zwei Achsen, die nicht dasselbe sind

**Orchestrierung** — wer startet wen, wer wartet auf wen, Fan-out und Fan-in.
→ Kann Claude Code. Abgeben.

**Rollentrennung** — welcher Kontext macht welche Arbeit, wo liegt die Übergabegrenze.
→ Kann Claude Code **nicht**, auch nicht mit Subagents. Ein Subagent ist Helfer *einer*
Session: er stirbt, sein Kontext ist weg, der Elternkontext bleibt vollgelaufen. Gebraucht
werden Peers mit eigener Identität, eigenem Gedächtnis, eigenem Modell, die sich
**Artefakte** übergeben statt Gesprächsverläufe.

Rollentrennung ist Kontexthygiene, und sie ist mehr als „der Kontext ist voll": Eine Session,
die eine Spec geschrieben hat, ist auf ihre eigenen Entscheidungen **verankert** und merkt
nicht, dass die Spec falsch ist. Deshalb darf Refinement nicht bauen, nachdem es gespect hat.

## 4. Der Beleg aus der eigenen Praxis

Das Multi-Workspace-Paket (12 Tasks, 28 Commits, 2026-09-20/21) ist die Datenbasis.

**Frontloading hat Iterationen nicht verhindert.** Der sehr detaillierte Plan hatte vier
Defekte:

| Defekt | Gefunden von |
|---|---|
| Symlink-Liste zeigte auf einen Pfad, den kein Code schreibt | Task-Review |
| `?? undefined` im Preload kollabierte die null/undefined-Unterscheidung | Implementer, gegen die Anweisung |
| `PaneHeader` als Badge-Heimat, Komponente nie gemountet | Implementer |
| `applyWorkspace` konnte Sessions gar nicht binden (Critical) | Erst das Whole-Branch-Review |

**Drei Folgerungen:**

1. **Detailtiefe zahlt sich aus, weil sie den Plan falsifizierbar macht.** Ein vager Plan
   kann nicht widerlegt werden, ein präziser schon. Der Fehler wird lokal und früh statt
   global und spät. Anderer Mechanismus als „vorausdenken spart Runden".
2. **Es braucht eine Stufe, die das Ganze sieht.** Der Critical lag in einer Datei, die in
   keiner Dateiliste des Plans stand. Kein Task-Review konnte ihn finden.
3. **Implementer müssen widersprechen dürfen.** Zwei von vier Defekten fand jemand, der
   seiner Anweisung widersprach. Prompt- und Kultureigenschaft, keine Werkzeugeigenschaft.

## 5. Übergaben: das Notes-System trägt sie

### Was bei Artefakt-Übergaben fehlte

In **jedem** Dispatch der Multi-Workspace-Session stand ein Abschnitt „Context the brief
cannot know". Die Briefs waren ab Task 3 veraltet, einer nannte eine tote Komponente.

Aufgeschlüsselt:

- **Berechenbar aus dem Repo** (größter Block): veraltete Zeilennummern nach Umbauten,
  uncommittete Fremdänderungen, vorbestehende Lint-Fehler samt `git blame`, exakte
  Signaturen der Schnittstellen aus vorherigen Tasks
- **Task- und Befundzustand:** was fertig ist, was offen oder geparkt ist, welche Lücke
  bewusst stehenbleibt
- **Echte Memory:** Entscheidungen samt verworfener Alternativen, entdeckte Fakten,
  Begründungen von Regeln

### Die Entscheidung: Übergaben sind Notes

Nicht ein verborgener Store, nicht ein Graph. **Eine Übergabe ist eine Note.** Sie ist
sichtbar, lesbar, editierbar, und der Mensch kann sie aus der Sidebar heraus an eine Session
weiterreichen. Das ist kein Kompromiss gegenüber dem Graphen, sondern der Punkt: In einem
Maker-Cockpit muss man die Übergabe *sehen* können.

**Das ist zum Teil schon gebaut.** `NoteManager.createHandoff()` existiert und schreibt
Frontmatter mit `from_session`, `to_entity` und `handoff_status: 'pending' | 'consumed'` —
die Übergabe hat bereits einen Lebenszyklus. `mux_notes_handoff_create` und
`mux_notes_handoff_search` sind als MCP-Tools registriert, `mux_notes_update` kann den Status
auf `consumed` drehen. Der Tag `handoff` ist im Tag-Repository geführt und gegen
Auto-Tagging geschützt.

Es geht also ums **Fertigbauen**, nicht ums Neubauen.

### Memory zeigt auf die Note

`companion_memory_*` wird auf die **Companion-Rolle begrenzt**. Dort gehört es hin:
persönliches, rollengebundenes Gedächtnis.

Für Übergaben gilt: **Die Memory-Zeile ist ein Zeiger, die Note ist der Inhalt.** Ein
Eintrag trägt Titel, Einzeiler und Note-ID — nicht den Text. Das löst genau das
Token-Problem: Recall liefert Karteikarten statt Inhalte, der Inhalt wird nur gezogen, wenn
er gebraucht wird.

Damit wird Memory zu dem Relevanz-Index, der heute fehlt. `companion_memory_recall` liefert
„die letzten N", recency-sortiert — das skaliert gegen einen, je voller der Store, desto mehr
Irrelevantes pro Sessionstart. Als Zeiger-Index ist dieselbe Mechanik brauchbar.

### Was **nicht** in die Note gehört

**Der berechnete Weltzustand.** Er veraltet in dem Moment, in dem er geschrieben wird.

Regel: **Alles, was aus dem Repo ableitbar ist, gehört weder ins Gedächtnis noch in die
Note.** Nicht nur billiger — verlässlicher. Eine gespeicherte Erinnerung kann veralten und
behauptet sich danach mit derselben Bestimmtheit wie eine wahre. Ein `git diff` kann nicht
veralten. Wer Berechenbares speichert, baut einen zweiten, schlechteren Wahrheitsbegriff
neben git.

Die Auflösung: Die Note trägt den **dauerhaften** Teil — Auftrag, Entscheidungen, verworfene
Alternativen, Zeiger. Der Delta wird **beim Dispatch** berechnet und der Note vorangestellt,
nicht in ihr gespeichert. Der Mensch sieht in der Sidebar die Note plus einen Zustandsblock,
der beim Öffnen frisch entsteht.

### Wo die Token wirklich verbrennen

Nicht beim Schreiben. Beim Abrufen und beim **Orientieren**. Task 10 brauchte 89
Tool-Aufrufe, Task 11 83, die Fix-Welle 102 — ein erheblicher Teil davon reines Suchen nach
dem aktuellen Zustand.

Ökonomie und Qualität zeigen hier in dieselbe Richtung: Der berechnete Weltzustand spart
Token *und* verhindert den Stale-Brief-Fehler.

## 6. cipher-keel — Ist-Aufnahme (2026-09-29)

keel bezeichnet sich im README selbst als *„the successor project to cipher-mux, built from
the ground up around the graph rather than around a message bus."*

**Lage:** 1006 Commits, zuletzt 2026-09-28, in den letzten acht Wochen 20–40 Commits an fast
jedem Arbeitstag. 2760 Tests über 203 Testdateien. Phasen 1–8 abgeschlossen, 3a bis 5 mit
formalem Audit und RELEASE-Verdikt. Die letzten Wellen bauen eine autonome Kette:
*„Architect delegiert, Worker arbeitet, der Läufer weckt den Aussteller"*, gemessen mit
**46 ct für 90 Minuten**, mit Git-Wächter und Notbremse.

Methodisch ist keel voraus: „measured rather than assumed", Feldprotokolle statt Testgrün,
ein Prompt-Preview, der zeichenweise gegen die tatsächlich übergebene Datei verglichen wurde.

### Kopplungsanalyse — was sich heben lässt

**Graph-frei, also mitnehmbar:**

| Baustein | Zeilen | Dient |
|---|---|---|
| `model/` komplett (`registry`, `rollen`, `eignung`, `slots`, `entry`, `defaults`) | — | Rolle → Modell/Adapter |
| `codec.ts`, `codec-anthropic.ts`, `codec-openai-chat.ts` | ~405 | Anbieter-Abstraktion |
| `budget.ts`, `preise.ts` | ~377 | Ökonomie |
| `pfadwache.ts`, `netzwache.ts` | ~890 | Rollengrenzen als Constraint |
| `faehigkeiten.ts`, `fortsetzbarkeit.ts` | ~380 | Fähigkeiten, Wiederaufnahme |

**Graph-gekoppelt:** `lauf.ts`, `werkzeuge*.ts`, `sandkasten.ts`, `trigger-*.ts` und der
Phaseninput-Layer.

**Bewusst nicht zu übernehmen** (dient Autonomie, nicht Steuerbarkeit): Ketten-Runner,
Trigger-Läufer, Notbremse, der eigene Agent-Loop (`lauf.ts`). Der Mux startet CLIs; er
braucht keine eigene Schleife um ein Modell.

Der Phaseninput-Layer entfällt als Portierungsziel — seine Funktion übernimmt das
Notes-System nach Abschnitt 5.

## 7. Offene Entscheidungen

1. **Befunde — wohin?** Review-Ergebnisse, geparkte Minors, bewusst offene Lücken sind das,
   was die nächste Rolle braucht, und sie sind heute nirgends ein Objekt. Als Notes würden
   sie die Liste fluten; in einer eigenen Tabelle wären sie unsichtbar, was der Zielgebung
   widerspricht. Denkbar: leichter Store, der bei Bedarf als Note materialisiert.
2. **Delta-Berechnung — Umfang.** Minimal: Commits und Diff seit dem Anker-Commit der Note,
   beschränkt auf Dateien, die sie erwähnt. Reicht das, oder braucht es Lint- und
   Testzustand dazu?
3. **Handoff-Notes brauchen einen Anker.** `createHandoff()` kennt heute Absender, Empfänger
   und Status — aber keinen Basis-Commit. Ohne den lässt sich kein Delta berechnen. Und:
   die Methode setzt `scope: 'global'` hart, obwohl Notes workspace-skopiert sein können.
4. **Wie viel `model/` wird portiert?** Die Registry hängt an `preset/`, `agent/`, `worker/`
   und `config-store` von keel. Portierung heißt Anpassung, nicht Kopie.
5. **Reihenfolge.** Kandidaten nach Hebel pro Aufwand:
   - *Delta beim Dispatch* — rein deterministisch, kein Modellaufruf, ersetzt den größten
     Posten der Handarbeit
   - *Handoff-Note um Anker und Scope ergänzen* — klein, Voraussetzung für das Delta
   - *Memory auf Companion begrenzen, Zeiger-Semantik einführen*
   - *Rolle → Modell/Adapter* — setzt das `AgentAdapter`-Interface zum ersten Mal unter
     echten Druck
   - *Rollengrenzen über `settings.local.json`* — die Mechanik schreibt Mux bereits pro
     Entity (`getMcpPermissionsForEntity`), bisher nur für MCP-Tools

## 7a. Stand der Reihenfolge (2026-09-30)

Alle fünf Kandidaten aus Abschnitt 7.5 sind umgesetzt. Was dabei anders lief als geplant:

| Posten | Stand | Abweichung vom Plan |
|---|---|---|
| Delta beim Dispatch | gebaut, live belegt | `executeHandoff` existierte bereits — hier unerwähnt |
| Handoff-Note um Anker und Scope | gebaut | Scope war gegenstandslos: `NoteInfo.scope` ist deprecated, Bindung läuft über Tags |
| Memory auf Companion, Zeiger-Semantik | gebaut | Begrenzung brauchte eine Rollen-Identität auf der MCP-Verbindung; eine Permission zu entfernen genügt nicht |
| Rolle → Modell/Adapter | gebaut | Adapterseite war fertig, nur die Rollenseite fehlte |
| Rollengrenzen über `settings.local.json` | **Weg verworfen**, Ziel erreicht | `--dangerously-skip-permissions` umgeht `deny`; durchgesetzt wird über PreToolUse-Hook |

Der letzte Punkt ist der lehrreiche: Der Plan nannte `settings.local.json`, weil der Mux dort
schon eine Allowlist pro Entity schreibt. Gemessen stellte sich heraus, dass diese Allowlist
für Entity-Sessions gar nichts tut, solange sie mit `--dangerously-skip-permissions` starten —
und eine Deny-Regel ebenso wenig. Der Plan baute auf einer Mechanik, die er für wirksam hielt.

Offen bleibt Abschnitt 7.1 nicht mehr in der ursprünglichen Form: Befunde als
`noteType: finding` sind die Antwort, siehe `2026-09-30-notes-als-projektgedaechtnis.md`
Abschnitt 5. Gebaut ist die Typisierung, nicht die eigene Ansicht dafür.

## 8. Was bewusst nicht drinsteht

Kein Task-Zuschnitt, keine Dateilisten. Das ist Zielgebung plus Gesprächsstand, kein
Implementierungsplan. Der entsteht, wenn die Punkte aus Abschnitt 7 entschieden sind.
