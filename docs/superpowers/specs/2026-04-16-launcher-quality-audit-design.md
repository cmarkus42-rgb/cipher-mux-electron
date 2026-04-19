# Design — Launcher-Qualitäts-Audit

**Datum:** 2026-04-16
**Status:** Design (nach Brainstorming approved)
**Bezug:**
- `docs/issues/ISSUE-launch-skill-skipped-completion.md` (akuter Bug)
- `memory/project_launcher_quality_audit.md` (Audit-Zielbild)
- `docs/superpowers/specs/2026-04-16-projectlauncher-design.md` (Vorgänger: Integration)
**Rollout:** Zwei Implementation-Plans (Plan 1 kritisch, Plan 2 Quality-Refactor)

---

## Problem

Der Launcher-Flow aus dem Vorgänger-Spec läuft mechanisch, aber er produziert unterdurchschnittliche Qualität. Zwei konkrete Symptome:

1. **Exit-Gate bricht** — `/launch` ruft `kickoff_complete` in der Praxis nicht auf (Smoke-Test 2026-04-16). Schritt 8 ist informell formuliert und wird als optionales Housekeeping gelesen. Konsequenz: cipher-mux-Follow-up-Session öffnet nicht, Scan-Path-Persistenz läuft nicht, User muss manuell rescannen.
2. **Output-Tiefe fehlt** — die generierten Projekte erreichen nie wieder die Stringenz von cipher-boox (hand-gebaut, pre-Launcher). CLAUDE.md bleibt flach, ADR-Disziplin greift zu schwach, Subagent-Nutzung im Skill ist unterrepräsentiert.

Hinzu kommt ein drittes, größeres Thema: der projectlauncher-6-Phasen-Flow hat 2025 Dinge vorweggenommen, die heute durch die `superpowers`-Skills (`brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `finishing-a-development-branch`, `using-git-worktrees`) stringenter und erzwungener abgedeckt werden. Die projectlauncher-Phasen *appellieren* an Disziplin; superpowers *erzwingen* sie über HARD-GATEs und Checklisten. Publikationswürdige Qualität braucht Zwang, nicht Appell.

## Ziel dieser Iteration

Dreifacher Scope in einem kohärenten Design:

1. **Completion-Gate zuverlässig machen** — produktionsblockierendes Issue beheben (Plan 1).
2. **Modernisierung mit superpowers** — projectlauncher-Doku-Regime bleibt als Artefakt-Kontrakt, aber die Disziplin-Mechanik wandert zu superpowers. Im generierten Projekt (`B2 Full-Stack`).
3. **Template-Tiefe auf cipher-boox-Niveau** — CLAUDE.md, Verzeichnisstruktur, Meta-Kanon, Qualitäts-Anspruch.

Guiding principle: **`/launch` wird dünner, das Zielprojekt wird tiefer.** Die Requirements-Arbeit gehört nicht in den Launcher, sondern in Phase 1 des Zielprojekts mit `brainstorming`.

## Architektur-Übersicht

Drei Schichten, klar getrennt:

**A) `/launch`-Skill (in `projectlauncher/`)** — dünn, deterministisch. Input grob verstehen, max. 2 Klärfragen bei harten Unbekannten, Template-Scaffold, CLAUDE.md generieren, git init, verbindlicher Exit-Gate.

**B) Generiertes Zielprojekt** — superpowers-native, projectlauncher-Doku-Regime als Vertrag. CLAUDE.md ist der Flow-Kontrakt (sagt explizit, welcher superpowers-Skill welche Phase macht und welches Artefakt produziert). Zwei eigene Projekt-Skills bleiben: `/decide` und `/doc-review`.

**C) cipher-mux-electron (Orchestrator)** — bleibt strukturell. Eine Ergänzung: impliziter Complete-Fallback über CLAUDE.md-Existenz-Check bei Timeout.

```
[User in cipher-mux]
    → Kickoff-Dialog (Input-Dir + Target-Dir + Notes)
    → cipher-mux spawnt Launcher-Session in projectlauncher/
        → /launch-Skill läuft (dünn)
            → Input grob verstehen (ggf. parallele Subagents)
            → Max. 2 Klärfragen nur bei harten Unbekannten
            → Scaffold: Verzeichnis + Template + CLAUDE.md + git
            → EXIT-GATE: .kickoff-complete (primary) + MCP-Call (bonus)
    → cipher-mux empfängt Complete-Signal
        (Fallback: Timeout + CLAUDE.md-Existenz = implicit complete)
    → Follow-up-Session im neuen Projekt öffnet
        → Claude liest CLAUDE.md
        → CLAUDE.md sagt: "Phase 1 — nutz brainstorming → requirements.md"
        → User startet die eigentliche Arbeit
```

## Skill-Mapping: projectlauncher × superpowers (Hybrid)

| Phase | Projekt-Skill? | superpowers-Kopplung | Output-Artefakt |
|-------|----------------|----------------------|-----------------|
| 1: Requirements | ❌ weg | `brainstorming` | `docs/requirements.md` (Schema inkl. Meta-Kanon) |
| 2: Spec | ❌ weg | `brainstorming` (design mode) | `docs/SPEC.md` |
| 3: ADR | ✅ **bleibt** | `/decide` orchestriert, ruft intern `brainstorming` | `docs/decisions/ADR-*.md` + CLAUDE.md-Update |
| 4: Task-Dekomposition | ❌ weg | `writing-plans` | `docs/todo.md` |
| 5: Implementation | ❌ weg | `executing-plans` + TDD + verification + subagent-driven | Code + Tests |
| Quer: Doc-Review | ✅ **bleibt** | `/doc-review` | Doku↔Code-Abgleich |
| Quer: Code-Review | ❌ weg | `requesting-code-review` + `finishing-a-development-branch` | Review + Merge |

Begründung für die zwei bleibenden Projekt-Skills:
- `/decide` liefert projektspezifische Artefakt-Logik (ADR-Nummerierung, Template, Cross-Reference zu SPEC.md, Auto-Pflege der ADR-Liste in CLAUDE.md), die superpowers nicht abdeckt. Die eigentliche Options-Exploration bleibt `brainstorming`.
- `/doc-review` ist ein projectlauncher-Original ohne superpowers-Äquivalent (Drift-Erkennung zwischen Doku und Code-Stand).

## Sektion 1 — Der dünne `/launch`-Skill

Fünf Schritte statt bisher neun. Der letzte ist der Exit-Gate.

**Schritt 1: Input verstehen (parallelisierbar)**
Alle Input-Quellen einlesen (Dateien, Miro-URLs, Freitext). Bei mehreren Quellen: pro Quelle ein Subagent via `superpowers:dispatching-parallel-agents`. Haupt-Session sammelt ein. Extrahiert werden nur: Projektname (kebab-case), Kurzbeschreibung, grobe Zielplattform, Tech-Stack-Hinweise, Referenz-Projekte, offensichtliche Infrastruktur-Hooks. Keine tiefe Requirements-Analyse.

**Schritt 2: Klärfragen nur bei harten Unbekannten**
Max. 2 Fragen, ausschließlich wenn das Scaffold ohne die Information nicht sauber gebaut werden kann — primär Tech-Stack (für Linter-Hook und `src/`-Pfad-Konvention). Alles andere bleibt ungefragt und gehört in Phase 1.

**Schritt 3: Scaffold (Create- oder Merge-Modus)**
Wie im Vorgänger-Spec. Template kopieren (Create) oder Dateien einzeln mergen (Merge, bei existierendem Zielpfad). Platzhalter in CLAUDE.md ersetzen. `.claude/settings.json` Linter-Hook setzen. `.gitignore`, `git init`, initial commit.

**Schritt 4: Superpowers-Verdrahtung verifizieren**
Sicherstellen, dass das neue Template die beiden Projekt-Skills (`/decide`, `/doc-review`) enthält und `.claude/commands/` sowie `.claude/worktrees/` als Gerüst mitbringt. Kein dynamischer Code — pure Template-Arbeit, nur Check.

**Schritt 5: Handover (verbindlicher Exit-Gate)**
Eigene, dedizierte Phase mit explizitem Verbindlichkeits-Wording im Skill-Prompt:

```
## Handover — dieser Schritt ist kein Housekeeping, sondern Teil der Aufgabe

Dein Job ist erst erledigt, wenn cipher-mux weiß, dass er das Projekt öffnen soll.
Das signalisierst du so:

1. (Primary) Schreib eine Marker-Datei:
   touch "<projectPath>/.kickoff-complete"

2. (Bonus) Ruf das MCP-Tool kickoff_complete auf — falls verfügbar.

Die Marker-Datei ist das verbindliche Signal. Wenn du den MCP-Call nicht
hinbekommst (Tool nicht im Inventar, MCP nicht verbunden), ist das okay —
die Marker-Datei reicht. Wenn du den Marker nicht schreibst, passiert
nichts, die Follow-up-Session öffnet nicht, und der User muss manuell
rescannen. Das ist der Fehlerfall, den du vermeidest.

Wenn beides durch ist, gib dem User eine kurze Anleitung für den
nächsten Schritt.
```

Zwei Umkehrungen gegenüber heute:
- **Marker-Datei ist Primary**, MCP-Call ist Bonus. Grund: `touch` ist ein Bash-Standard, den Claude immer im Repertoire hat. MCP-Tool-Calls sind kontextabhängig und können übersehen werden.
- **Eigene Phase mit Verbindlichkeits-Wording** statt Schritt-8-one-liner. Die Skill-Struktur trainiert Claude bis zum Ende zu arbeiten.

**Gestrichen gegenüber heute:**
- Schritt 5 (Requirements-Entwurf) — gehört in Phase 1
- Schritt 6 (SPEC.md vorbereiten mit Entscheidungspunkten) — gehört in Phase 2
- Schritt 9 (Ausgabe mit Zusammenfassung) — wird Teil von Schritt 5, kurz

## Sektion 2 — Zielprojekt: Struktur & CLAUDE.md-Template

### Verzeichnisstruktur (cipher-boox-inspiriert)

```
_template/
├── CLAUDE.md.template
├── .claude/
│   ├── settings.json             ← Linter-Hook vom /launch gesetzt
│   ├── settings.local.json       ← leer, für projektlokale Overrides
│   ├── skills/
│   │   ├── decide/SKILL.md       ← Projekt-Skill
│   │   └── doc-review/SKILL.md   ← Projekt-Skill
│   ├── commands/                 ← leer mit README, für eigene Workflows
│   │   └── README.md
│   └── worktrees/                ← leer mit .gitkeep für using-git-worktrees
│       └── .gitkeep
├── docs/
│   ├── requirements.md           ← Schema-Skelett inkl. Meta-Kanon-Sektion
│   ├── SPEC.md                   ← Skelett mit Decision-Point-Kategorien
│   ├── todo.md                   ← Platzhalter
│   ├── decisions/                ← leer mit README
│   │   └── README.md
│   └── issues/                   ← leer mit README
│       └── README.md
├── .gitignore
└── README.md                     ← User-facing Kurzbeschreibung
```

Änderungen gegenüber aktuellem Template:
- `.claude/commands/` und `.claude/worktrees/` neu (aus cipher-boox)
- `.claude/settings.local.json` leer vorhanden (aus cipher-boox)
- `docs/issues/` neu (aus cipher-mux-electron-Praxis — ISSUE-Files als Tracking)
- `docs/requirements.md` mit Pflicht-Sektion Meta-Kanon
- CLAUDE.md-Template tiefer (siehe unten)

### CLAUDE.md-Template Skelett

```markdown
# {{PROJEKTNAME}}

{{BESCHREIBUNG_2_SAETZE}}

## Aktueller Status

**Phase: 1 — Requirements-Erhebung**

Phasen-Übersicht (6-Phasen-Regime × superpowers):
1. Requirements → docs/requirements.md (via `brainstorming`)
2. Spezifikation → docs/SPEC.md (via `brainstorming`, design mode)
3. Architekturentscheidungen → docs/decisions/ADR-*.md (via `/decide`)
4. Task-Dekomposition → docs/todo.md (via `writing-plans`)
5. Implementation → Code + Tests (via `executing-plans` + TDD + verification)
6. Review & Release (via `requesting-code-review` + `finishing-a-development-branch`)

**Nächster Schritt:** Phase 1 starten. Nutze den superpowers-Skill
`brainstorming`, um das Zielbild zu schärfen, und dokumentiere das
Ergebnis in `docs/requirements.md` nach dem Schema dort.

## Build & Test

{{BUILD_COMMANDS}}

## Projektstruktur

{{MODULSTRUKTUR_TIEFER}}

## Referenz-Projekte

{{REFERENZEN_MIT_ZWECK}}

## Infrastruktur

{{INFRASTRUKTUR_KONKRET}}

## Code-Konventionen

{{KONVENTIONEN}}

## Meta-Anforderungen (nicht-verhandelbar)

1. **Sicherheit** — Angriffsflächen minimieren, Input-Validierung, sichere Defaults
2. **Resilienz** — Graceful Degradation, Retry-Strategien, Fehlertoleranz
3. **Robustheit** — Edge Cases abfangen, keine stillen Fehler
4. **Datenschutz** — Datenminimierung, Secrets-Handling, DSGVO-Bewusstsein

Werden projektspezifisch in `docs/requirements.md` konkretisiert.

## Bekannte Constraints

{{CONSTRAINTS}}

## Architekturentscheidungen

_Werden in Phase 3 via `/decide` dokumentiert. Jede ADR hier als
Einzeiler mit Cross-Ref zu docs/decisions/ADR-*.md. Das `/decide`-Skill
pflegt diese Liste automatisch._

## Qualitäts-Anspruch

Das hier wird kein Wegwerf-Prototyp. Wir bauen, um zu teilen — mit
anderen Entwicklern, mit der Community, mit dem zukünftigen Ich. Jede
Entscheidung, jede Abstraktion, jede Doku soll so geschrieben sein, dass
jemand Fremdes den Code aufmachen und verstehen kann, warum er so ist
wie er ist.

Konkret:
- **Doku:** nicht nur "was", sondern "warum" (ADRs ernst nehmen)
- **Architektur:** saubere Trennung, klare Schnittstellen
- **Code-Qualität:** typisiert, getestet, lintbar
- **Reproduzierbarkeit:** pinned dependencies, dokumentierte Setup-Schritte

## Workflow-Regeln (superpowers-Disziplin)

1. **Brainstorming-Gate:** Vor kreativer Arbeit IMMER `brainstorming`
   invoken — keine Ausnahmen.
2. **Test-Driven:** Implementation folgt `test-driven-development`.
   Tests vor Code.
3. **Verification-before-completion:** Keine "fertig"-Claims ohne
   ausgeführte Evidenz.
4. **Code-Review vor Merge:** `requesting-code-review` vor dem Mergen
   nicht-trivialer Änderungen.
5. **Kleine Batches:** Max 5–10 Dateien pro Commit.
6. **ADR vor Implementierung:** Jede nicht-triviale technische
   Entscheidung via `/decide`.

## Skill-Referenz

| Phase | Skill | Art | Output |
|-------|-------|-----|--------|
| 1 | `brainstorming` | superpowers | docs/requirements.md |
| 2 | `brainstorming` (design) | superpowers | docs/SPEC.md |
| 3 | `/decide` | Projekt-Skill | docs/decisions/ADR-*.md + CLAUDE.md |
| 4 | `writing-plans` | superpowers | docs/todo.md |
| 5 | `executing-plans` | superpowers | Code + Tests |
| — | `test-driven-development` | superpowers | Tests |
| — | `verification-before-completion` | superpowers | Evidenz |
| — | `requesting-code-review` | superpowers | Review |
| — | `/doc-review` | Projekt-Skill | Doku↔Code-Abgleich |
| — | `finishing-a-development-branch` | superpowers | Merge/PR/Cleanup |
```

### Die zwei bleibenden Projekt-Skills

**`/decide` (erweitert):**
- Input: ein Entscheidungspunkt (aus SPEC.md oder ad-hoc)
- Ruft intern `brainstorming` für die Options-Exploration
- Schreibt `docs/decisions/ADR-NNN-<slug>.md` (Context, Options, Decision, Consequences, Cross-Ref)
- Aktualisiert ADR-Liste in CLAUDE.md automatisch (Einzeiler-Summary)
- Markiert den Entscheidungspunkt in SPEC.md als erledigt

**`/doc-review` (leicht verschärft):**
- Liest aktuellen Code-Stand + docs/
- Identifiziert Drift zwischen Doku und Code
- Schlägt Updates für CLAUDE.md, SPEC.md, todo.md vor
- Nutzt intern `verification-before-completion` — behauptet nichts, was nicht belegt ist

## Sektion 3 — Orchestrator-Änderungen (cipher-mux-electron)

### Impliziter Complete-Fallback

Der `KickoffOrchestrator` bekommt einen zusätzlichen Check beim Timeout:

```
Bei Timeout-Ablauf:
  1. Prüfe: existiert <targetPath>/CLAUDE.md?
     → NEIN: echter Fail, Fehlermeldung an User, Rescan erforderlich.
     → JA:   Scaffold hat geklappt, nur Exit-Gate verpasst.
             Behandle als impliziten Complete, mit Log-Warnung:
             "[KickoffOrchestrator] Implicit complete via CLAUDE.md
              presence — /launch skipped exit gate"
             Scan-Path-Persistenz + Prewarm laufen wie bei echtem Complete.
```

Begründung: wir verlassen uns nicht auf das Signal, sondern auf den Zustand. Wenn das Scaffold steht, ist die Kickoff-Arbeit inhaltlich erledigt.

### Structured Logging der Complete-Pfade

Jeder Kickoff-Flow loggt, welcher Pfad gegriffen hat:
- `kickoff_complete` MCP-Call → "normal complete"
- `.kickoff-complete` Marker → "fallback complete"
- Timeout + CLAUDE.md → "implicit complete"
- Timeout + kein CLAUDE.md → "hard fail"

Logs gehen strukturiert in den existierenden Kickoff-Log (Pfad im Implementation-Plan zu verifizieren). Nach ein paar realen Kickoffs ergibt das die Datengrundlage, ob die Exit-Gate-Verschärfung im `/launch` greift oder der implicit-complete-Fallback dauerhaft nötig bleibt.

### Keine UI-Änderungen

Kickoff-Dialog (3 Felder) und Projekt-Kachel-Verhalten bleiben. Einziger sichtbarer Unterschied bei implicit-complete: gelbe Warnung im Session-Log statt grüne Bestätigung.

## Sektion 4 — Versioning, Rollout, Testing

### Versioning: in-place mit Backup

`/launch` wird in-place refactored, nicht als `/launch-v2` parallel. Begründungen:
- `projectlauncher/` ist ein eigenes Repo mit git-Historie — Rollback via `git revert`
- Parallele Skill-Namen wären eine Benutzer-Falle
- cipher-mux greift hart auf den Skill-Namen `/launch` zu (`launcher-prompt.ts`)

Sicherheitsnetz: vor dem Refactor wird das aktuelle `_template/` nach `_template.v1/` kopiert und im Repo committed. Nach ~4 Wochen produktiver Nutzung darf `_template.v1/` wieder gelöscht werden (separater Cleanup-Commit).

### Rollout in zwei Implementation-Plans

**Plan 1 — Exit-Gate & Orchestrator-Resilienz** (kritischer Pfad, minimale Skill-Änderung):
- `/launch`-Skill: alte Struktur bleibt erhalten, aber Schritt 8 (MCP-Call) wird zur neuen, eigenständigen "Handover"-Phase mit verbindlichem Wording und Marker-als-Primary
- Orchestrator: CLAUDE.md-Existenz-Check als implicit-complete-Fallback bei Timeout
- Structured Logging der Complete-Pfade
- Ziel: cipher-mux-Smoke-Test läuft End-to-End durch, egal ob Claude das MCP-Tool kennt oder nicht
- Explizit nicht in Plan 1: Input-Parallelisierung, Requirements-/SPEC-Streichung, Template-Überarbeitung — diese bleiben zunächst wie heute

**Plan 2 — Quality-Refactor** (nicht blockierend, kann nachlaufen):
- `/launch`-Skill: Schritte 1–4 werden refactored (Input mit Subagent-Parallelisierung, dünnere Klärfragen, Streichung der Schritte „Requirements-Entwurf" und „SPEC.md vorbereiten" aus dem Launcher, Zusammenfassungs-Schritt 9 fällt weg)
- `_template/` komplett überarbeitet: CLAUDE.md-Template boox-Niveau, `.claude/commands/` + `.claude/worktrees/`, `.claude/settings.local.json`, `docs/issues/`
- `/decide`-Skill erweitert (ADR-Nummerierung, CLAUDE.md-Auto-Update, brainstorming-Delegation)
- `/doc-review`-Skill leicht verschärft (verification-Pflicht)
- requirements.md-Schema mit Meta-Kanon fest eingebaut
- Superpowers-Flow-Kontrakt in CLAUDE.md verankert
- Vor Beginn: aktuelles `_template/` nach `_template.v1/` kopieren und committen (Rollback-Sicherungsnetz)

Reihenfolge strikt: Plan 1 vor Plan 2. Plan 1 schaltet cipher-mux-Produktivbetrieb frei. Plan 2 ist die eigentliche Qualitäts-Arbeit.

### Testing

**Automated:**
- Smoke-Test-Skript in `projectlauncher/` (bash). Füttert minimalen Fake-Input an `/launch` und prüft: Verzeichnis angelegt, alle erwarteten Dateien da, CLAUDE.md enthält keine `{{…}}`-Platzhalter mehr, `.kickoff-complete` existiert, `git log` zeigt initial commit. Läuft in CI, verhindert Regression.

**Manual (Qualitäts-Validierung nach Plan 2):**
- Drei reale Obsidian-Konzepte (von cipher gewählt) durch den neuen Launcher laufen lassen.
- Output-CLAUDE.md mit cipher-boox-CLAUDE.md side-by-side vergleichen. Rubrik:
  - Modulstruktur-Tiefe (konkret vs. generisch)
  - Referenz-Projekte mit Zweck (nicht nur Pfad)
  - ADR-Liste gefüllt (nach Phase 3 / `/decide`)
  - Meta-Kanon projektspezifisch konkretisiert (in requirements.md)
  - Qualitäts-Anspruch wirkt (Tests vorhanden, verification-Evidence dokumentiert)
- Ergebnis in `projectlauncher/memory/` persistieren.
- Wenn Rubrik in 2 von 3 Projekten nicht trägt: Rollback prüfen oder gezielt nachbessern.

**Nicht getestet (YAGNI):**
- Keine automatisierten Tests für CLAUDE.md-Qualität — inhaltliches Urteil, kein mechanischer Check.
- Keine Performance-Tests — Launcher läuft < 30s.
- Keine Multi-Language-Tests — Launcher spricht Deutsch.

## Scope

**In Scope (Plan 1 + Plan 2):**
- `/launch`-Skill-Refactor (dünner, Exit-Gate verbindlich, Subagent-Parallelisierung beim Input)
- Template-Tiefe erhöht (CLAUDE.md, Verzeichnisstruktur, Meta-Kanon, Qualitäts-Anspruch)
- Zwei Projekt-Skills überarbeitet: `/decide` (erweitert), `/doc-review` (verschärft)
- Orchestrator in cipher-mux-electron: implicit-complete-Fallback + structured logging
- Smoke-Test-Skript als Regression-Schutz

**Out of Scope:**
- Kickoff-Dialog-UI — bleibt wie gebaut
- Anderer Skill-Name (`/launch-v2`) — in-place Refactor gewählt
- Internationalisierung des Launchers
- Performance-Optimierung des Scaffold-Prozesses
- Automatisiertes Urteil über CLAUDE.md-Qualität (bleibt menschlich)

## Repository-Aufteilung

- **Spec** (dieses Dokument): lebt in `cipher-mux-electron/docs/superpowers/specs/`, weil das Audit-Memory hier liegt und die Orchestrator-Änderungen hier landen.
- **Plan 1** (Exit-Gate & Orchestrator): Änderungen in beiden Repos, aber ein Plan — Haupt-Arbeit in `cipher-mux-electron` (Orchestrator + Logging), kleine Skill-Anpassung in `projectlauncher` (Handover-Phase).
- **Plan 2** (Quality-Refactor): Änderungen fast ausschließlich in `projectlauncher/` (Skill + Template + zwei Projekt-Skills). Marginale CLAUDE.md-Anpassung in cipher-mux-electron falls nötig.

## Offene Punkte (für Implementation-Plans)

Keine blockierenden offenen Punkte. Bei der Erstellung von Plan 1 zu prüfen:
- Genauer Pfad und Format des existierenden Kickoff-Logs in cipher-mux-electron (für structured logging).
- Wie der implicit-complete-Check in die bestehende `fs.watch` + Polling-Logik eingehängt wird (fs-events vs. Timeout-Callback).
