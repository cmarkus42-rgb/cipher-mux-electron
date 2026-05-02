# Multi-Session-Entwicklungsarchitektur

> Operatives Dokument für Claude-Sessions, die an Cipher-Mux v2 (oder anderen mittelgroßen Projekten in diesem Setup) arbeiten. Lies das vor dem ersten Befehl.

## Warum

Mittelgroße Anwendungen (eine App, ein Service, ein größeres Feature) übersteigen das, was eine einzelne Coding-Session zuverlässig leisten kann. Anforderungen werden vergessen, Kontext driftet, Code wird inkonsistent. Diese Architektur zerlegt die Arbeit in **drei Ebenen** mit klaren Verantwortungen, einer **persistenten Spec** als Single Source of Truth und einem **Reviewer in frischem Kontext** als Vergessens-Detektor.

## Ebenen

### L0 — Stakeholder-Session (Architektur)

- **Zweck:** Anforderungen klären, Subsystem-Schnitt nach Systems-Engineering, Spec schreiben, Übergabeprompts entwerfen
- **Modell:** `opusplan` (Opus für Plan-Phase, Sonnet für Schreiben)
- **Lebensdauer:** lang. `/compact` an Bruchstellen, kein `/clear`.
- **Artefakte:** `docs/specs/*.md`, `docs/handoffs/S*.md`, ADRs in `docs/adr/`
- **Off-Limits:** alles außer den genannten Doku-Pfaden. L0 schreibt keinen Produktivcode.

### L1 — Subsystem-Session

- **Zweck:** ein Subsystem planen und implementieren, Worker spawnen, Rückfragen an L0 wenn Spec lückenhaft
- **Modell:** Sonnet, **Plan-Modus zwingend** vor erstem Schreibvorgang
- **Lebensdauer:** ein Subsystem lang, dann `/clear` oder neue Session
- **Worktree:** eigenes `git worktree add ../<projekt>-<subsystem> feature/<subsystem>`
- **Inputs am Start:** Hauptspec, Subsystem-Übergabeprompt, eigene `sub-CLAUDE.md`
- **Off-Limits:** alle Pfade außerhalb des Subsystems. Cross-Cutting → Rückfrage an L0.

### L2 — Worker-Session

- **Zweck:** ein konkretes Häppchen umsetzen (eine Komponente, ein Schema, ein Adapter)
- **Modell:** Sonnet (Default) oder Haiku (für rein mechanische Aufgaben)
- **Form:** Subagent der L1-Session, im selben Worktree
- **TDD-first:** Tests vor Implementierung, wo möglich
- **Output:** Diff + Tests + kurze Zusammenfassung der erledigten REQ-IDs

### Reviewer — separate Session, frischer Kontext

- **Zweck:** Plan-, Code- und Spec-Conformance-Review
- **Modell:** Sonnet
- **Wichtig:** **kein Subagent** der schreibenden Session. Eigene Session mit frischem Cache, damit nicht durch eigenen Output voreingenommen.
- **Inputs:** Spec, Diff oder Plan, REQ-ID-Liste

---

## Spec als Single Source of Truth

Jede Anforderung bekommt eine ID nach Schema `REQ-<Subsystem>-<Nummer>` (z. B. `REQ-S2-014`). Beispiel-Spec-Eintrag:

```markdown
### REQ-S2-014 · MessageBus persistiert Nachrichten über Neustart hinweg

**Akzeptanzkriterien:**
- [ ] Nachrichten werden in SQLite gespeichert mit Timestamp und Session-ID
- [ ] Nach App-Neustart werden ungesendete Nachrichten an die Empfänger zugestellt
- [ ] Wenn Empfänger-Session nicht existiert, Nachricht 7 Tage halten, dann verfallen

**Tests:** `tests/messagebus/persistence.test.ts`
**Off-Limits:** keine Schema-Änderung ohne Migration in `db/migrations/`
```

Die ID wandert in jeden Übergabeprompt und in den Reviewer-Check. Das ist der **Anti-Vergessens-Anker**.

---

## Übergabeprompt-Template (L0 → L1)

Speichern als `docs/handoffs/S<N>-<name>.md`. L1-Session startet mit `cat docs/handoffs/S<N>-<name>.md` als erster Anweisung.

```markdown
# Übergabe: Subsystem S<N> — <Name>

## Auftrag
<Ein bis zwei Sätze, was das Subsystem leisten muss.>

## Anforderungs-IDs (verbindlich)
- REQ-S<N>-001: <Kurzbeschreibung>
- REQ-S<N>-002: <Kurzbeschreibung>
...

Volltext: siehe docs/specs/<subsystem>.md

## Architektur-Kontext
- Welche anderen Subsysteme angrenzen
- Welche APIs stabil sind (rufen, nicht ändern)
- Welche APIs dieses Subsystem definiert (publizieren)

## Off-Limits (nicht anfassen)
- <Pfad 1>
- <Pfad 2>
Bei Bedarf an Cross-Cutting-Änderung: Rückfrage an L0, nicht still ändern.

## Definition of Done
- Alle REQ-IDs sind im Code umgesetzt und durch Tests abgedeckt
- Reviewer-Session hat Spec-Conformance bestätigt
- sub-CLAUDE.md im Worktree ist aktuell

## Modell- und Tooling-Hinweise
- Modell: Sonnet, Plan-Modus zwingend
- Worktree: feature/<subsystem>
- Worker als Subagents im selben Worktree, nicht parallel in fremden Worktrees
```

---

## sub-CLAUDE.md je Subsystem

Im Worktree-Root, schmal (< 100 Zeilen). Beispiel-Skelett:

```markdown
# Subsystem S<N> — <Name>

## Auftrag
<aus Übergabeprompt kopiert, ein Absatz>

## Stack
<Sprache, Framework, Test-Tool, Build-Befehl>

## Konventionen
- <Naming, Imports, Datei-Layout>

## Off-Limits
- <Pfade, die nicht angefasst werden dürfen>

## Tests
- Run: `<command>`
- Coverage muss grün sein vor Commit

## Bekannte Schnittstellen zu anderen Subsystemen
- S<X>: <kurze Beschreibung der Vertragsschnittstelle>
```

---

## Reviewer-Checkliste

Reviewer startet als **frische Session**, lädt Spec und Diff, prüft systematisch.

### Plan-Review (vor Implementierung)
- [ ] Alle REQ-IDs aus dem Übergabeprompt sind im Plan adressiert?
- [ ] Plan respektiert Off-Limits?
- [ ] Plan dokumentiert Annahmen, die in der Spec nicht standen?
- [ ] Plan benennt fehlende Tests?

### Code-Review (nach Diff)
- [ ] Diff fasst nur erlaubte Pfade an?
- [ ] Pro REQ-ID: konkreter Code-Nachweis vorhanden?
- [ ] Tests für jede REQ-ID vorhanden und grün?
- [ ] Stille Schema-/API-Änderungen? (kritisch flaggen)
- [ ] Hardcoded Secrets, Default-Werte wie `supersecretkey`? (kritisch)
- [ ] Externe Pakete: existieren in offizieller Registry? (Slopsquatting-Check)

### Spec-Conformance (Abschluss)
- [ ] Welche REQ-IDs sind nachweislich erfüllt? Liste mit Code-Pointern.
- [ ] Welche REQ-IDs fehlen oder sind teilweise? Backlog für L1.
- [ ] Drift entdeckt (Code macht etwas anderes als Spec sagt)? Spec-Update oder Code-Anpassung anstoßen, niemals still ignorieren.

---

## Token-Disziplin

- L0: lang, mit `/compact` an Bruchstellen, opusplan
- L1: pro Subsystem eine Session, `/clear` zwischen Subsystemen
- L2: Subagents im L1-Worktree, eigener Kontext, fokussierte Spawn-Prompts
- Reviewer: frischer Kontext, Sonnet, eigener Cache (nicht im selben Modell-Wechsel mit L0/L1)
- `MAX_THINKING_TOKENS=10000` als globales Default
- MCP-Server: nur die wirklich gebrauchten aktiv (`/mcp` prüfen)
- `.claudeignore`: `node_modules/`, `dist/`, `.next/`, große Logs

---

## Cross-Cutting-Realität

Cipher-Mux v2 (und ähnliche Apps) hat echte Cross-Cutting Concerns: UI ↔ MessageBus ↔ Backend ↔ Orchestrator. In der Praxis heißt das:

- **L0 ist nicht nur Initial-Architekt, sondern dauerhafter Koordinator.** Wenn S2 und S3 eine API-Frage zwischen sich klären müssen, läuft das über L0, weil L0 die Spec-Hoheit hat.
- **Bei Schnittstellen-Änderungen** muss L0 die Spec aktualisieren, bevor irgendein L1 schreibt.
- **Verträge zwischen Subsystemen** gehören in eine eigene Spec (`docs/specs/contracts.md`), die alle L1-Sessions als Pflichtlektüre haben.

---

## Iterations-Loop

```
Spec (mit REQ-IDs)
   ↓
L0: Übergabeprompt schreiben
   ↓
L1 (im Worktree): Plan → Reviewer prüft Plan → Implementierung → Worker spawnen
   ↓
Reviewer (frisch): Spec-Conformance gegen REQ-IDs
   ↓
   ├─ alle erfüllt → Merge in main, Subsystem fertig
   ├─ teilweise erfüllt → Backlog zurück an L1
   └─ Drift entdeckt → an L0: Spec aktualisieren oder Code anpassen
```

---

## Wann diese Architektur überdimensioniert ist

- Einzelne Skripte, Wegwerf-Tools, Prototypen ohne Produktiv-Anspruch → eine Session reicht
- Bug-Fixes in bestehenden, gut getesteten Codebasen → keine neue Spec, direkter Fix mit Reviewer-Pass
- Reine Refactorings → eine L1-Session in einem Worktree, ohne L0-Spec-Phase
