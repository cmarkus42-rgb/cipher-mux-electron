---
title: "/bugreport-Skill — allgemein verfügbar (Ebene 3)"
status: v0.1
date: 2026-04-30
ebene: 3
quelle: konzept-projekt-workspace-struktur.md (Punkt 6), Companion-Vorarbeit
referenz: 11-workspace-memory.md, 17-projekt-struktur.md, 04-presets-funktional.md
---

# 18 — `/bugreport`-Skill

## Zweck

Bug-Reports und Feature-Requests sind die haeufigsten User-zu-System-Eingaben in cipher-mux. Sie passieren in jedem Preset, zu jeder Zeit, oft mitten in einer anderen Aufgabe. Wenn der User dafuer einen Companion-Wechsel braucht oder durch ein UI-Popup muss, geht der Gedanke verloren.

Der `/bugreport`-Skill ist ein **allgemein verfuegbares** Werkzeug, das aus jedem Preset heraus aufgerufen werden kann. Er fuehrt ein kurzes Mini-Interview, erstellt eine Note mit korrekten Tags (Workspace-Default + `kind:bugreport` oder `kind:feature-request`), und kehrt zur urspruenglichen Aufgabe zurueck.

Im Companion ist er typischer Einstiegspunkt — aber nicht exklusiv. Cyber-Factory-Hauptsessions, Worker, Refinement, Testing Assistant, Debugger, Audit: alle koennen `/bugreport` aufrufen. Auch im Hintergrund (via MCP-Tool aus einer Sub-Session) ist das moeglich.

## Trigger-Wege

| Trigger | Wie | Wo |
|---------|-----|----|
| Slash-Command | User tippt `/bugreport` oder `/feature-request` in eine Session | jede Claude-Code-Session in cipher-mux |
| Sprach-Befehl | "Bugreport: ...", "Feature-Wunsch: ..." | Voice Companion uebersetzt zu Skill-Aufruf |
| MCP-Tool aus Sub-Session | `mux_bugreport_create({...})` | jede Worker-Sub-Session, Cyber Factory, Testing Assistant |
| UI-Sidebar-Button | "Bug melden" / "Feature wuenschen" — Sidebar-Buttons | cipher-mux UI |
| Companion-Konversation | "Da ist ein Bug" → Companion erkennt und startet Skill | Companion-Sessions |

## Mini-Interview-Flow

Nach Trigger fuehrt der Skill ein **dreistufiges** Mini-Interview. Maximum 3 Fragen, ausser der User stoppt frueher.

### Stufe 1 — Klassifizierung

> *"Bug-Report oder Feature-Request?"*

Wenn der Trigger schon eindeutig war (z.B. `/feature-request`), entfaellt die Frage.

### Stufe 2 — Inhalt

Bei **Bug-Report:**

> *"Was ist passiert? In zwei, drei Saetzen — Was hast du gemacht, was waere erwartet, was ist tatsaechlich passiert?"*

Bei **Feature-Request:**

> *"Was haettest du gerne? In zwei, drei Saetzen — Was waere der Use-Case, warum waere das wichtig?"*

Der User antwortet frei. Der Skill schreibt das in den Notes-Body.

### Stufe 3 — Severity / Prioritaet (Default-Vorschlag)

Bei **Bug-Report:**

> *"Severity? Vorschlag: mittel. (Hoch / Mittel / Niedrig)"*

Bei **Feature-Request:**

> *"Prioritaet? Vorschlag: niedrig. (Hoch / Mittel / Niedrig / Sammelplatz)"*

Der Skill macht einen Default-Vorschlag basierend auf Inhalts-Heuristik (Wort-Match wie "Crash" → hoch, "schoener waere" → niedrig). User kann uebernehmen oder korrigieren.

### Optional — Reproduktion / weitere Notizen

Wenn der User mehr sagen will: er kann frei weitertippen. Der Skill schiebt das in den Notes-Body.

## Note-Format

Pro Bug-Report wird eine Markdown-Note in `~/.config/cipher-mux/notes/` erzeugt:

```markdown
---
id: bug-2026-05-02-tmux-flicker
created: 2026-05-02T14:23:00Z
tags:
  - kind:bugreport
  - severity:mittel
  - status:open
  - project:cipher-mux        # vom aktiven Workspace
  - workspace:hauptprojekt    # vom aktiven Workspace
created_by_session: cmux-companion-1
---

# Grid-Zelle flackert beim Workspace-Wechsel

## Was ist passiert

User wechselt vom Workspace 'cipher-mux-development' zu 'experiment-1'. 
Die rechte Grid-Zelle flackert kurz, der Inhalt erscheint mehrfach.

## Erwartet

Sauberer Wechsel ohne visuellen Glitch.

## Tatsaechlich

Mehrfaches Repaint, wirkt unsauber.

## Reproduktion

1. Cockpit oeffnen
2. Workspace wechseln
3. Beobachten: Flicker rechts oben

## Notizen

(User-Eingabe oder Companion-Annotation)
```

Frontmatter ist Pflicht. Tags-Set ist Auto-Mix aus Workspace-Default-Tags plus Skill-spezifischen Tags (`kind:`, `severity:`, `status:`).

Bei Feature-Request analog mit `kind:feature-request` und `prioritaet:` statt `severity:`.

## Workspace-Bindung

Wenn ein Workspace aktiv ist (siehe `17-projekt-struktur.md`):

- Workspace-Default-Tags werden automatisch zur Note hinzugefuegt (z.B. `project:cipher-mux`, `workspace:hauptprojekt`)
- Die Note erscheint im Workspace-Filter automatisch
- Bug-Report gehoert damit zum Projekt, nicht zur App

Wenn kein Workspace aktiv: Note bekommt keine Projekt-Tags. Sie liegt frei. Beim spaeteren Aktivieren eines Workspaces kann der User die Note manuell mit Workspace-Tags versehen.

## Lessons-Learned-Variante

Der Skill hat einen Sub-Modus fuer Lessons Learned. Trigger:

```
/lesson-learned   oder   "Lesson Learned: ..."
```

Mini-Interview entsprechend angepasst:

- *Stufe 1:* "Was ist die Lesson? In einem Satz."
- *Stufe 2:* "Was war der Trigger? Konkretes Beispiel reicht."
- *Stufe 3:* "Wo aendert das was? Konvention, Spec, Code, Persona, Skill?"

Note-Tags: `kind:lesson-learned`, plus Workspace-Default, plus Konsequenz-Tags (z.B. `aenderung:konvention`, `aenderung:persona`).

Wenn die Konsequenz eine Aenderung am System ist (z.B. Persona-Update, Konvention in CLAUDE.md), schreibt der Skill **zusaetzlich** ein Memory-Pattern (`scope_kind=user` oder `workspace`, `kind=pattern`) — siehe `11-workspace-memory.md` Lessons-Learned-Sonderfall.

## Handover-Variante

Trigger: `/handover` oder "Handover: ...".

Fuer den Fall, dass der User eine Session uebergeben will (z.B. nach langer Cyber-Factory-Welle, nach MPO-Lauf). Der Skill produziert eine Handover-Note mit:

- Aktueller Stand (was wurde erreicht)
- Offene Punkte
- Bekannte Bugs (Verweise auf bug-report-Notes)
- Naechste Schritte
- Relevante Dateien

Format ist analog zum bestehenden `handoff-mpo-session-2026-04-29.md` — strukturiert, aber knapp.

## ConfigStore-Keys

```typescript
interface BugReportSkillConfig {
  enabled: boolean;
  autoSeverityHeuristic: boolean;     // Default true: Default-Severity vorschlagen
  defaultSeverity: 'hoch' | 'mittel' | 'niedrig'; // Default 'mittel' fuer Bugs
  defaultPriority: 'hoch' | 'mittel' | 'niedrig' | 'sammelplatz'; // Default 'niedrig' fuer Features
  notesPath: string;                  // Default ~/.config/cipher-mux/notes/
  attachSessionContext: boolean;      // Default true: created_by_session ID mitschreiben
}
```

ConfigStore-Sektion: `bugreport_skill`.

## MCP-Tools

| Tool | Status | Zweck |
|------|--------|-------|
| `mux_bugreport_create` | **Neu** | Bug-Report mit Mini-Interview erstellen, Note schreiben |
| `mux_feature_request_create` | **Neu** | Feature-Request analog |
| `mux_lesson_learned_create` | **Neu** | Lessons-Learned-Variante |
| `mux_handover_create` | **Neu** | Handover-Variante |
| `mux_notes_create` | Bestehend | nutzt der Skill intern fuer Note-Persistierung |
| `mux_input_request_create` | Bestehend | nutzt der Skill fuer Mini-Interview-Fragen |

Alle vier Skill-Tools sind aus jeder Session aufrufbar — keine Preset-Beschraenkung.

## IPC-Channels

```typescript
export const IPC_BUGREPORT = {
  TRIGGER: 'bugreport:trigger',           // UI-Sidebar-Button → Main
  INTERVIEW_NEXT: 'bugreport:interview-next',
  INTERVIEW_RESPONSE: 'bugreport:interview-response',
  COMPLETE: 'bugreport:complete',
} as const;
```

## Persona-Sprachstil

Der Skill folgt dem aktiven Persona des Aufrufers. Beispiele:

**Cipher-Persona:**

> "Bug oder Feature?"  
> "Schiess los — was ist passiert?"  
> "Severity? Klingt nach mittel."  
> "Notiert. Workspace-Default-Tags drauf, du findest's im Filter."

**Relay-Persona:**

> "Bug-Report oder Feature-Request?"  
> "Was ist passiert? Zwei, drei Saetze — was war erwartet, was ist eingetreten."  
> "Severity einschaetzen — Hoch, Mittel, Niedrig?"  
> "Note erstellt unter `bug-2026-05-02-tmux-flicker.md`. Tags: bugreport, mittel, open, project:cipher-mux."

**Wayne-Persona:**

> "Was kommt rein?"  
> "Erzaehl — was hat dich gerade gestoert?"  
> "Wie ernst? Sieht nach mittel aus."  
> "Hab ich. Naechster Versuch — was als naechstes?"

**Kyniker-Persona (telegrafisch):**

> "Bug?"  
> "Was?"  
> "Severity?"  
> "Notiert."

## Tests

1. *Slash-Command-Trigger:* User tippt `/bugreport` in einer Session → Skill startet Mini-Interview
2. *Workspace-Default-Tag-Auto-Add:* Note in aktivem Workspace `cipher-mux-development` → bekommt automatisch `project:cipher-mux`
3. *Severity-Heuristik:* Eingabe enthaelt "Crash" → Default-Vorschlag `severity:hoch`
4. *Drei-Stufen-Limit:* User antwortet auf Stufe 2 mit langem Text → Skill akzeptiert und springt zu Stufe 3, kein viertes Frage-Round
5. *Lessons-Learned-Pattern-Write:* `/lesson-learned` mit Konsequenz "Konvention in CLAUDE.md" → Note + Memory-Pattern-Eintrag
6. *Handover-Format:* `/handover` produziert strukturierte Note mit Sektionen Stand/Offen/Bugs/Naechste-Schritte
7. *Kein-Workspace-Fall:* Skill in Session ohne aktiven Workspace → Note ohne Projekt-Tags, User-Hinweis "kein Workspace aktiv"
8. *Persona-Adaptation:* Trigger in Cipher-Session → Skill verwendet Cipher-Tonalitaet; Trigger in Relay-Session → Relay-Tonalitaet

## Migration

`/bugreport`-Skill existiert teilweise im Companion (Vorarbeit). In Welle 4 (siehe `12-migration-rebuild.md`) wird er:

- Als allgemein verfuegbares Skill-Modul herausgezogen (`src/main/skills/bugreport-skill.ts`)
- Mit Slash-Command-Handler in der Session-Layer integriert
- Mit MCP-Tools `mux_bugreport_create` und Verwandte registriert
- Im Companion-Akzent (`03-preset-akzente.md`) als Standard-Routing erwaehnt
- In allen anderen Presets als verfuegbares Tool aufgelistet

Bestehende Bug-Notes (vor diesem Skill) sind kompatibel — sie sind schon Markdown mit Frontmatter; nur die Tag-Konvention `kind:bugreport` muss ggf. nachgezogen werden (Migrations-Skript `scripts/migrate-bug-notes.ts`).

## Abgrenzung — was der Skill NICHT macht

- *Bug-Tracking-Replacement.* Der Skill erzeugt Notes. Wenn der User ein echtes Bug-Tracking-System will (Issue-Tracker, Linear, GitHub Issues), exportiert er die Notes manuell. Der Skill ist Eingangs-Mechanik, nicht Tracking-Backend.
- *Reproduktions-Prufung.* Der Skill stellt nicht selbst die Reproduktion. Das ist Debugger-Aufgabe, wenn der Bug spaeter eskaliert wird.
- *Externer Bug-Report-Kanal (User → Entwickler).* Der Endnutzer-Kanal (BugReport-Popup im Info-Bereich) ist explizit **nicht** Teil dieses Skills. Folge-Spec, siehe `14-offene-punkte.md`.

## Offene Punkte

- *Auto-Severity-Heuristik vs. User-Wahl.* Wenn die Heuristik oft daneben liegt, wird der Default-Vorschlag eher hinderlich. Empfehlung: nach 10 Skill-Aufrufen Statistik vergleichen (User-Korrekturen vs. Defaults), Heuristik anpassen.
- *Linkage zwischen Bug-Note und Memory-Finding.* Wenn der Testing Assistant einen Finding-Eintrag im Memory hat (kind: `finding`) und der User parallel einen Bug-Report dazu schreibt, sollten die verlinkt sein. Vorschlag: optionales `linked_finding`-Feld in Bug-Note-Frontmatter.
- *Multi-Projekt-Bug-Reports.* Bug betrifft zwei Projekte gleichzeitig — Skill erlaubt mehrere Projekt-Tags, aber UX in der Sidebar-Filterung ist nicht entworfen. UI-Folge-Spec.
