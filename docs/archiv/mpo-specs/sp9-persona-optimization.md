# SP-9: Workspace-Persona-Prompt-Optimierung — Detail-Spec

> MPO Sub-Projekt 9 | Wave 2 (Subagent) | Aufwand: ~0.5-1d
> Quer ueber alle Entities | Keine Tickets (Qualitaets-Initiative)

---

## Ziel

Alle Workspace-Persona-Prompts (die Templates die via persona-skill-sync als SKILL.md in Sessions injiziert werden) mit Sorgfalt ueberarbeiten. Ergebnis: konsistente, praezise, wirkungsvolle Persona-Definitionen fuer alle 6 Relay-Entities.

## Kontext

- Personas werden ueber `src/main/workspace/persona-skill-sync.ts` als SKILL.md in Sessions injiziert
- Relay ist die geteilte Persona-Identitaet ueber alle Entities
- Entity-spezifische Spezialisierungen (Companion=Advisor, Refinement=Ideation, etc.)
- User-Profil: `~/.config/cipher-mux/user-profile.json`
- Companion Memory Store (SP-4) als neues Tool fuer Relay

## Vorbereitung

**LIES:**
1. `src/main/workspace/persona-skill-sync.ts` — wie Personas gerendert werden
2. Alle bestehenden Persona-Definitionen:
   - `the how-to-session/CLAUDE.md` (Companion)
   - `the refinement session/CLAUDE.md` (Refinement)
   - Orchestrator CLAUDE.md (unter `~/.config/cipher-mux/orchestrator/CLAUDE.md` oder im Repo)
   - MPO CLAUDE.md (unter `~/.config/cipher-mux/mpo/CLAUDE.md` oder im Repo)
3. `src/main/companion/prompt-templates/relay-core.md` (falls bereits von SP-4 erstellt)
4. `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/SPEC.md` §7 (Core-Prompt-Template)
5. MCP-Tool-Liste: `src/main/mcp/mcp-tools.ts` — welche Tools Sessions zur Verfuegung stehen

## Aufgaben

### A1: Analyse (0.25d)
- Alle bestehenden Persona-Prompts lesen
- Katalogisieren: Was steht drin, was fehlt, was ist inkonsistent
- Luecken identifizieren:
  - Fehlen MCP-Tool-Instruktionen?
  - Fehlen Verhaltens-Beispiele?
  - Ist der Ton konsistent?
  - Werden User-Profil und Memory genutzt?

### A2: relay-core.md optimieren (0.25d)
Das Herzstueck — der gemeinsame Persona-Kern:
- Charakter-Definition: "ruhig, kompetent, leicht nerdig, trockener Humor" — mit konkreten Do/Don't-Beispielen
- Ton-Kalibrierung: 3-5 Beispiel-Antworten die den richtigen Ton treffen
- Anti-Patterns: Was Relay NICHT tut (kein Ueber-Enthusiasmus, keine Floskeln, kein Wiederholen)
- User-Profil-Nutzung: Wie Level/Background/History die Antworten beeinflusst
- Memory-Nutzung: Wann recall(), wann write(), welche Cues
- Template-Variablen: `{{display_name}}`, `{{user_profile_yaml}}`, `{{evolved_annotations}}` sinnvoll einsetzen

### A3: Entity-Overlays optimieren (0.25d)
Pro Entity ein Overlay-Prompt der auf relay-core aufbaut:

**Companion (Advisor):**
- How-to-Guides-Awareness: Welche Guides existieren, wann verweisen
- Erklaer-Modus: Angepasst an User-Level
- Grenzen: Beratet, orchestriert nicht, codet nicht direkt

**Refinement (Ideation):**
- 5-Phasen-Ideation-Prozess: Klar strukturiert
- Skills-Awareness: Welche Ideation-Skills verfuegbar
- Grenzen: Ideiert, implementiert nicht

**Orchestrator (Coordination):**
- Session-Management: Wann welche Tools einsetzen
- Delegations-Muster: Wie Arbeit verteilt wird
- Grenzen: Koordiniert, codet nicht

**MPO (Generalunternehmer):**
- Multi-Projekt-Zerlegung: Klare Methodik
- Eskalations-Hierarchie: 5-Level-System
- Grenzen: Delegiert, codet nicht

**Launcher (Interviewer):**
- Projekt-Interview: Strukturierter Ablauf
- Requirement-Extraktion: Was gefragt werden muss
- Grenzen: Interviewt, implementiert nicht

**Voice Relay (Konversation) — NEU:**
- Sprach-Modus: Laengere Saetze, natuerlicher Flow, keine Code-Bloecke
- MCP-Operator: Proaktives Tool-Angebot ("Soll ich mal in die Session schauen?")
- Grenzen: Spricht, tippt nicht direkt in Sessions

### A4: Deliverables erstellen (0.25d)
Pro Prompt:
- Optimierte .md-Datei
- Changelog: Was geaendert, warum, vorher/nachher-Beispiel
- Ablage: Im jeweiligen Entity-Verzeichnis oder als PR-ready Dateien

## Quality Gate

### Pruefkriterien
| # | Kriterium | Pruefung |
|---|---|---|
| Q1 | Konsistenz | Alle Entities fuehlen sich wie dieselbe Person an |
| Q2 | Praezision | Keine vagen Anweisungen ("sei hilfreich"), nur konkrete Verhaltensregeln |
| Q3 | MCP-Awareness | Jede Entity weiss welche Tools sie hat und wann sie sie nutzt |
| Q4 | Ton | 3 Beispiel-Antworten pro Entity die den richtigen Ton treffen |
| Q5 | Grenzen | Explizite Don'ts pro Entity |
| Q6 | User-Profil | Mindestens 2 Beispiele wie das Profil die Antwort beeinflusst |
| Q7 | Memory | Klare Recall/Write-Heuristiken |

### Kein Code — nur .md-Dateien
- Keine Code-Aenderungen
- Keine Test-Suite
- Review durch User nach Abschluss

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- Persona-Sync: `src/main/workspace/persona-skill-sync.ts`
- Companion CLAUDE.md: `the how-to-session/CLAUDE.md`
- Refinement CLAUDE.md: `the refinement session/CLAUDE.md`
- Companion Spec: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/SPEC.md`
