# Übergabe an eine frische Hauptsession

**Anker-Commit:** `9e8d20a` (2026-09-29)
**Von:** einer langen Session, die Multi-Workspace-Sessions gebaut und danach die Richtung neu bestimmt hat
**An:** eine frische Hauptsession, die den Mux-Prozess fertig baut
**Status:** offen

> **Was dieses Dokument ist.** Der Handkoffer-Vorläufer dessen, was gebaut werden soll:
> Übergaben sollen künftig Notes sein (siehe Auftrag unten). Diese hier ist eine Datei in git,
> weil sie einen Sessionwechsel überleben muss. Berechne den aktuellen Zustand selbst gegen den
> Anker-Commit — was hier steht, sind **Entscheidungen, Fallen und Zeiger**, keine Bestandsliste.

---

## 1. Der Auftrag

**Der Mux wird fertig gebaut.** Zwei Stränge, vom Nutzer so benannt:

1. **Angepasste Prompts für die Rollen** — die Entity-Presets (Companion, Refinement,
   Ideation Partner, Cyber Factory, Debugger, Testing Assistant, Audit, Workshop) sollen die
   Arbeitsteilung tragen, die unten unter „Rollentrennung" beschrieben ist.
2. **Update des technischen Prozesses** — Übergaben, Rollengrenzen, Modell-Routing.

Es ist ein **Do-over des Prozesses und der Dokumentation, nicht des Codes.** Der Mux hat sich
über Monate bewährt; die Codebasis ist das Kapital, nicht der Ballast.

## 2. Entscheidungen, die schon gefallen sind

Diese stehen nicht zur Disposition, es sei denn, du findest einen Fehler in der Begründung.
Dann sag es — die Begründungen stehen hier, damit man mit ihnen streiten kann, nicht damit man
ihnen folgt.

### 2.1 Mux statt keel

`cipher-keel-electron` (unter `CIPHER-MUX/projects/`) bezeichnet sich selbst als Nachfolger des
Mux und ist ein aktives Zweitsystem: 1006 Commits, zuletzt 2026-09-28, 2760 Tests, Phasen 1–8
auditiert, eine autonome Kette, die durchfährt (gemessen: 46 ct für 90 Minuten).

**Trotzdem trägt der Mux die Richtung.** Die Begründung des Nutzers, in seinen Worten
zusammengefasst:

- keel zielt auf **Autonomie** — und die bieten am Ende auch andere CLI-Tools, die man mit API
  nutzt. Es ist Commodity-Boden, auf dem gerade alle rennen.
- Es läuft **nicht gut genug**, und er fühlt sich nicht berufen, derjenige zu sein, der es
  optimiert.
- Der Mux ist **zugänglicher** und hat als **Maker-Cockpit** eine Zielgruppe, zu der er stehen
  kann — auch wenn sie ihn nicht nutzt.
- Der Mux hat seinen Mehrwert **über Monate bewiesen**.

Dazu eine Umformulierung, die im Gespräch angeboten und nicht widersprochen wurde: „keel ist zu
groß gedacht" trifft es nicht ganz. keel zielt auf Autonomie; gesucht ist **Steuerbarkeit**.
Das ist kein Größen-, sondern ein Zielunterschied — und er sagt präzise, was aus keel **nicht**
zu holen ist.

### 2.2 Zielgebung als Entwurfsfilter

**Maker-Cockpit, zugänglich.** Das ist keine Absichtserklärung, sondern entscheidet Fragen:

- **gegen** verborgene Stores, Graph-Semantik, alles, was man verstehen muss, bevor es nützt
- **für** sichtbare Artefakte, die man lesen, anfassen und weiterreichen kann
- **für** den Menschen in der Schleife als Normalfall, nicht als Notausgang

Wo eine Entwurfsfrage auftaucht, gewinnt die Variante, die ein Mensch ohne Einarbeitung
nachvollziehen kann — auch wenn sie weniger kann.

**Randbedingung:** Gerüst für die eigene Arbeit, OSS veröffentlicht. „Fertig" bemisst sich an
Kohärenz und eigener Nutzung, nicht an Adoption.

### 2.3 Orchestrierung abgeben, Rollentrennung behalten

Zwei Achsen, die oft verwechselt werden:

- **Orchestrierung** (wer startet wen, Fan-out/Fan-in) → kann Claude Code inzwischen selbst.
  Abgeben. Nicht nachbauen.
- **Rollentrennung** (welcher Kontext macht welche Arbeit, wo liegt die Übergabegrenze) → kann
  Claude Code **nicht**, auch nicht mit Subagents. Ein Subagent ist Helfer *einer* Session: er
  stirbt, sein Kontext ist weg, der Elternkontext bleibt vollgelaufen.

Rollentrennung ist Kontexthygiene, und sie ist mehr als „der Kontext ist voll": Eine Session,
die eine Spec geschrieben hat, ist auf ihre eigenen Entscheidungen **verankert** und merkt
nicht, dass die Spec falsch ist. Deshalb darf Refinement nicht bauen, nachdem es gespect hat.

### 2.4 Übergaben sind Notes

Nicht ein verborgener Store, nicht ein Graph. Eine Übergabe ist eine **Note**: sichtbar, lesbar,
editierbar, und der Mensch kann sie aus der Sidebar an eine Session weiterreichen. In einem
Maker-Cockpit muss man die Übergabe *sehen* können.

**Zum Teil schon gebaut:** `NoteManager.createHandoff()` schreibt Frontmatter mit
`from_session`, `to_entity` und `handoff_status: 'pending' | 'consumed'`. `mux_notes_handoff_create`
und `_search` sind registriert, `mux_notes_update` dreht den Status. Der `handoff`-Tag ist gegen
Auto-Tagging geschützt. **Es geht ums Fertigbauen.**

### 2.5 Memory zeigt auf die Note

`companion_memory_*` wird auf die **Companion-Rolle begrenzt** — dort gehört rollengebundenes
Gedächtnis hin.

Für Übergaben gilt: **die Memory-Zeile ist ein Zeiger, die Note ist der Inhalt.** Titel,
Einzeiler, Note-ID — nicht der Text. Damit wird aus `recall` ein Karteikasten statt eines
Fasses, und aus dem heutigen recency-sortierten „letzte N" der Relevanz-Index, der fehlt.

### 2.6 Berechnetes wird nie gespeichert

**Alles, was aus dem Repo ableitbar ist, gehört weder ins Gedächtnis noch in die Note.**

Nicht nur billiger — verlässlicher. Eine gespeicherte Angabe kann veralten und behauptet sich
danach mit derselben Bestimmtheit wie eine wahre. Ein `git diff` kann nicht veralten.

Die Note trägt den dauerhaften Teil: Auftrag, Entscheidungen, verworfene Alternativen, Zeiger.
Der Delta wird **beim Dispatch** berechnet und vorangestellt, nicht gespeichert.

### 2.7 Was aus keel *nicht* zu holen ist

Ketten-Runner, Trigger-Läufer, Notbremse, der eigene Agent-Loop (`lauf.ts`). Die bedienen
Autonomie. Der Mux startet CLIs; er braucht keine eigene Schleife um ein Modell.

**Holbar, weil graph-frei** (Zeilenzahlen ca.): `model/` komplett (registry, rollen, eignung,
slots) · `codec.ts` + `codec-anthropic` + `codec-openai-chat` (~405) · `budget.ts` + `preise.ts`
(~377) · `pfadwache.ts` + `netzwache.ts` (~890) · `faehigkeiten.ts` + `fortsetzbarkeit.ts` (~380).

**Nicht holbar, weil graph-gekoppelt:** `lauf.ts`, `werkzeuge*.ts`, `sandkasten.ts`,
`trigger-*.ts` — und der Phaseninput-Layer. Dessen Funktion übernimmt das Notes-System.

## 3. Die Belege, auf denen das ruht

Aus dem Multi-Workspace-Paket (12 Tasks, 28 Commits, 2026-09-20/21). Der Plan war sehr
detailliert und hatte **vier Defekte**:

| Defekt | Gefunden von |
|---|---|
| Symlink-Liste zeigte auf einen Pfad, den kein Code schreibt | Task-Review |
| `?? undefined` im Preload kollabierte die null/undefined-Unterscheidung | Implementer, gegen seine Anweisung |
| `PaneHeader` als Badge-Heimat, Komponente nie gemountet | Implementer |
| `applyWorkspace` konnte Sessions gar nicht binden (Critical) | erst das Whole-Branch-Review |

Drei Folgerungen, die den Prozess bestimmen:

1. **Detailtiefe zahlt sich aus, weil sie den Plan falsifizierbar macht** — nicht, weil sie
   Iterationen verhindert. Ein vager Plan kann nicht widerlegt werden, ein präziser schon.
2. **Es braucht eine Stufe, die das Ganze sieht.** Der Critical lag in einer Datei, die in
   keiner Dateiliste des Plans stand. Kein Task-Review konnte ihn finden.
3. **Implementer müssen widersprechen dürfen.** Zwei von vier Defekten fand jemand, der seiner
   Anweisung widersprach. Prompt- und Kultureigenschaft, keine Werkzeugeigenschaft.

Und der Posten, der die Handarbeit dominierte: In **jedem** Subagent-Auftrag stand ein Abschnitt
„Context the brief cannot know" — veraltete Zeilennummern, Fremdänderungen im Arbeitsbaum,
vorbestehende Lint-Fehler, Signaturen aus vorherigen Tasks. Das ist der Teil, den ein Handoff
automatisch tragen müsste.

## 4. Zustand und Zeiger

- **`CLAUDE.md` wurde am 2026-09-29 korrigiert** (Commit `9e8d20a`). Sie behauptete den Message
  Bus im ersten Satz, listete ein nicht existierendes Verzeichnis, nannte 858 statt 1633 Tests
  und verwies auf zwei Dateien, die es nicht gibt. **Wenn du in älteren Ständen liest, traue ihr
  nicht.** Die vier Fallen (Node 22, rote Suites, roter Lint, injizierte Sektionen) stehen jetzt
  ganz oben — lies sie, bevor du einen Test startest.
- **Strategiepapier:** `docs/superpowers/specs/2026-09-29-prozess-substrat-strategie.md` —
  ausführlichere Fassung von Abschnitt 2, mit Ist-Aufnahme von keel und Kopplungsanalyse.
- **Multi-Workspace-Sessions (Paket A) ist auf `main` gemergt.** Die manuelle Abnahme steht
  aus: `docs/superpowers/acceptance/2026-09-20-multi-workspace-sessions-manual.md`, zehn
  Testcases, noch nicht durchgeführt.
- **Ledger des letzten Pakets:** `.superpowers/sdd/2026-09-20-multi-workspace-sessions/progress.md`
  (git-ignoriert) — jede Entscheidung, jeder vertagte Befund, eine bewusst offene Lücke.
- **keel liegt unter** `/Users/Shared/Nextcloud/Claude/CIPHER-MUX/projects/cipher-keel-electron`,
  dazu ein gutes Dutzend `cipher-keel-*-ideation`-Verzeichnisse eine Ebene höher.

## 5. Offene Entscheidungen — vor der Implementierung zu klären

1. **Befunde — wohin?** Review-Ergebnisse, geparkte Minors, bewusst offene Lücken sind das, was
   die nächste Rolle braucht, und sie sind heute nirgends ein Objekt. Als Notes fluten sie die
   Liste; in einer eigenen Tabelle sind sie unsichtbar, was der Zielgebung widerspricht.
   **Hier gibt es noch keine gute Antwort.**
2. **Delta-Berechnung — Umfang.** Minimal: Commits und Diff seit dem Anker-Commit der Note,
   beschränkt auf Dateien, die sie erwähnt. Reicht das, oder braucht es Lint- und Testzustand?
3. **Handoff-Notes brauchen einen Anker.** `createHandoff()` kennt Absender, Empfänger und
   Status, aber keinen Basis-Commit — ohne den kein Delta. Zweitens setzt die Methode
   `scope: 'global'` hart, obwohl Notes workspace-skopiert sein können.
4. **Wie viel `model/` wird portiert?** Die Registry hängt an keels `preset/`, `agent/`,
   `worker/` und `config-store`. Portierung heißt Anpassung, nicht Kopie.

**Vorgeschlagene Reihenfolge** (Hebel pro Aufwand, nicht bindend): Anker + Scope in der
Handoff-Note → Delta beim Dispatch → Memory auf Companion begrenzen und Zeiger-Semantik →
Rolle → Modell/Adapter → Rollengrenzen über `settings.local.json` (die Mechanik schreibt Mux
bereits pro Entity in `getMcpPermissionsForEntity`, bisher nur für MCP-Tools).

## 6. Was du *nicht* tun sollst

- **Den Mux nicht neu schreiben.** Do-over meint Prozess und Doku.
- **Keine Orchestrierung nachbauen.** Subagents, Fan-out, Warten-auf — das macht die CLI.
- **keels Autonomie-Maschinerie nicht portieren** (siehe 2.7).
- **Die injizierten CLAUDE.md-Sektionen nicht von Hand bearbeiten** — `Global Rules`,
  `Workspace Prompt`, `Context Directories`, `Session Identity` werden beim nächsten
  Sessionstart überschrieben. Global Rules bearbeitet man in
  `~/.config/cipher-mux/global-rules.md`.
- **Nicht ohne Not committen oder pushen.** Der Nutzer entscheidet das.

## 7. Dieses Dokument ist selbst ein Experiment

Es ist der erste echte Test der These aus Abschnitt 2.4 bis 2.6: Die Übergabe trägt den
dauerhaften Teil, der Weltzustand wird berechnet.

**Bitte führe mit:** was du dir erarbeiten musstest, das hier nicht stand. Jede Lücke ist ein
Datenpunkt für das, was ein generiertes Handoff-Manifest leisten müsste — und damit wertvoller
als eine reibungslose Einarbeitung. Wenn du am Ende sagen kannst „diese fünf Dinge hätte die
Übergabe tragen müssen", ist das Ergebnis besser, als wenn nichts gefehlt hat.

Ein Unterschied, der dabei zu beachten ist: Die Übergabe an einen **Subagenten** und an eine
**Hauptsession** sind nicht dasselbe. Subagenten waren angewiesen, nicht im Code zu suchen, um
Token zu sparen — deshalb brauchten sie den Zustand mitgeliefert. Du darfst und sollst dich
selbst orientieren. Diese Übergabe trägt deshalb bewusst wenig berechnete Fakten.
