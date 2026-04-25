# SP-9 Persona-Analyse: Bestandsaufnahme und Luecken

> Erstellt: 2026-04-25 | Status: Analyse-Ergebnis

---

## 1. Inventar der bestehenden Persona-Prompts

| Entity | Quelle | Laenge | Sprache | Persona-Name |
|--------|--------|--------|---------|-------------|
| Companion (Advisor) | `the how-to-session/CLAUDE.md` | ~140 Zeilen | EN/DE gemischt | Relay |
| Refinement (Ideation) | `the refinement session/CLAUDE.md` | ~310 Zeilen | DE | Relay |
| Orchestrator | `orchestrator-template.ts` (generiert) + `~/.config/.../orchestrator/CLAUDE.md` | ~125 Zeilen | DE | keiner (nur Rolle) |
| MPO | `~/.config/cipher-mux/mpo/CLAUDE.md` | ~200 Zeilen | DE | keiner (nur Rolle), Persona = "Wayne Szalinski light" |
| Launcher | `launcher-prompt.ts` (generiert) | ~15 Zeilen | DE | keiner |
| Voice Relay | nicht existent | 0 | — | — |
| Builtin Personas | `persona-types.ts` | 1-2 Saetze | EN | Orchestrator, MPO |
| relay-core.md | SPEC.md §7 (Entwurf, nicht implementiert) | ~40 Zeilen | DE | {{display_name}} / Relay |

## 2. Identifizierte Luecken

### L1: Kein gemeinsamer Persona-Kern
- Companion und Refinement haben jeweils eigene Identitaets-Bloecke, die fast identisch sind aber leicht abweichen ("calm, competent IT professional" vs. "ruhiger, kompetenter IT-Profi")
- `relay-core.md` existiert nur als Entwurf in der SPEC, nicht als Datei
- Orchestrator und MPO haben GAR KEINE Persona — nur Rollenbeschreibungen

### L2: Sprach-Inkonsistenz
- Companion CLAUDE.md: Identitaet in EN, Beispiele in DE
- Refinement CLAUDE.md: komplett DE
- Orchestrator/MPO: komplett DE
- Builtin Personas in `persona-types.ts`: EN
- relay-core.md Entwurf: DE

### L3: MCP-Tool-Awareness fehlt fast ueberall
- Companion: kennt KEINE MCP-Tools (kein mux_send, kein mux_notes_create, kein companion recall/remember)
- Refinement: erwaehnt `mux_create_session` und `tmux send-keys` in Phase 5, aber nicht als Tool-Liste
- Orchestrator: hat volle Tool-Liste (gut)
- MPO: hat volle Tool-Liste (gut)
- Launcher: kennt nur `kickoff_complete`

### L4: Memory/Companion-Integration fehlt
- Companion und Refinement sollen mit Relay-Memory arbeiten (recall, remember, profile_patch, persona_observe)
- Keiner der bestehenden Prompts erwaehnt diese Tools
- `user-profile.json` wird referenziert, aber das Companion-System soll dies langfristig ersetzen/ergaenzen

### L5: Ton-Kalibrierung ohne Beispiele
- Companion: hat Anti-Patterns (gut), aber keine Beispiel-Antworten die den Ton zeigen
- Refinement: hat Anti-Patterns (gut), keine Ton-Beispiele
- Orchestrator: keinerlei Ton-Definition
- MPO: "Wayne Szalinski light" ist eine Referenz, keine Definition

### L6: Grenzen-Definition inkonsistent
- Companion: explizite Scope-Sektion (gut)
- Refinement: explizite Scope-Sektion (gut)
- Orchestrator: implizit ("delegiert"), aber keine expliziten Don'ts
- MPO: hat "Kein Code ausfuehren" (gut), aber keine Persona-bezogenen Grenzen

### L7: Voice Relay fehlt komplett
- Kein Prompt, kein Entwurf, keine Ueberlegung zum Sprach-Modus

### L8: Persona-Drift zwischen Builtin und Runtime
- `persona-types.ts` definiert Orchestrator mit englischem 1-Liner: "You coordinate the work..."
- `orchestrator-template.ts` generiert ein ausfuehrliches deutsches CLAUDE.md
- Die beiden Quellen stehen nicht in Beziehung zueinander

### L9: User-Profil-Nutzung oberflaechlich
- Companion: liest user-profile.json, passt Begruesssung und Route an (gut)
- Refinement: liest user-profile.json, passt Begruesssung und Anrede an (gut)
- Aber: KEINE Anpassung des Erklaer-Tiefe oder Ton basierend auf Level
- Kein Beispiel wie "fortgeschritten" vs "einsteiger" die Antwort aendert

## 3. Staerken (beibehalten)

- Companion CLAUDE.md ist das reifste Dokument: klare Didaktik-Regeln, Routing-Tabelle, Analogien
- Refinement CLAUDE.md hat ein durchdachtes 5-Phasen-Modell mit Phase-Gates
- Beide haben Anti-Pattern-Listen und Scope-Sektionen
- MPO hat detaillierte Monitoring- und Eskalations-Regeln
- Orchestrator hat robuste Delegation und Retry-Logik

## 4. Handlungsplan

1. **relay-core.md** schreiben — gemeinsamer Kern fuer alle Relay-Entities
2. **Entity-Overlays** fuer alle 6 Entities — bauen auf relay-core auf
3. **orchestrator-overlay.md** — Persona hinzufuegen, nicht nur Rolle
4. **mpo-overlay.md** — Wayne Szalinski durch Relay-konsistenten Ton ersetzen
5. **voice-relay-overlay.md** — von Grund auf
6. **launcher-overlay.md** — minimaler Overlay, da kurze Interaktion
