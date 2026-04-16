# ISSUE — `/launch`-Skill ruft `kickoff_complete` nicht auf

**Status:** offen
**Erfasst:** 2026-04-16
**Priorität:** hoch (blockt End-to-End-Kickoff-Flow in cipher-mux)
**Betrifft:** `projectlauncher/.claude/skills/launch/SKILL.md` Schritt 8
**Scope:** Launcher-Qualitäts-Audit (Folgephase)

---

## Beobachtung (2026-04-16 Smoke-Test)

Erster produktiver Kickoff aus cipher-mux-electron:
- Input-Dir: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/OnlyOfficeMCP`
- Launcher-Session startete sauber im `projectlauncher/`
- `/launch` arbeitete die Schritte 1–7 vollständig ab:
  - CLAUDE.md (11.5 KB) generiert
  - `docs/requirements.md` (16 KB), `docs/SPEC.md` (10 KB), `docs/todo.md`, `docs/decisions/`, `docs/issues/` erstellt
  - `.claude/settings.json`, `.claude/skills/` gemerged
  - `.gitignore`, `.git/` initialisiert
- **Schritt 8 (Completion signalisieren) wurde ausgelassen:**
  - Kein `kickoff_complete`-MCP-Call (Orchestrator-Logs zeigen keinen Tool-Aufruf)
  - Keine `.kickoff-complete`-Marker-Datei im Projekt-Verzeichnis

## Auswirkung

- Follow-up-Session im neuen Projekt öffnet nicht automatisch
- `/interview`-Prompt wird nicht injiziert
- Kein Auto-Rescan in der UI → Projekt-Kachel erscheint erst nach manuellem "Rescan"-Klick
- Scan-Path-Persistenz läuft nicht (hängt am kickoff-complete-Event)

## Hypothesen

1. **Skill-Flow endet natürlich bei Schritt 7 (git commit).** Claude betrachtet die Hauptarbeit als abgeschlossen, Schritte 8+9 werden als "optional housekeeping" wahrgenommen und gestoppt.
2. **Schritt 8 ist zu informell formuliert.** Die Anweisung "ruf das MCP-Tool `kickoff_complete` auf" ist Freitext statt strukturierter Tool-Call. Claude sieht den Tool-Namen, aber keinen Dispatch-Trigger.
3. **MCP-Tool nicht im Kontext sichtbar.** Launcher-Session hat MCP registriert (verifiziert in Logs: `[SessionManager] MCP registered for project: …/projectlauncher`), aber ob Claude das Tool in seinem Inventar sieht, ist nicht geprüft.

## Mitigation (kurzfristig)

- **Launcher-Prompt verstärken:** Completion-Call explizit am Anfang UND am Ende betonen.
- **Marker-Datei als Primary statt Fallback:** Wenn der MCP-Call unzuverlässig ist, kehr die Priorisierung um — Skill schreibt immer die Marker-Datei, MCP-Call ist Bonus. Einfacher für Claude (`touch` statt Tool-Aufruf).

## Mitigation (Folgephase — Launcher-Qualitäts-Audit)

- **Completion als expliziter Subagent-Dispatch** am Ende des Skills (eigene Phase "Handover", die nichts anderes macht).
- **Skill-Prompt-Refactor:** Schritt 8 nicht als "optional finale" formulieren, sondern als verbindlichen Exit-Gate.
- **Post-Completion-Check im Orchestrator:** Nach Timeout prüfen, ob CLAUDE.md existiert — falls ja, als "implizites Complete" behandeln und Follow-up trotzdem öffnen (pragmatische Resilienz).

## Referenz

- Skill-Datei: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/projectlauncher/.claude/skills/launch/SKILL.md` (Commit `80c00db`)
- Orchestrator: `src/main/project/kickoff-orchestrator.ts`
- MCP-Tool-Registrierung: `src/main/mcp/mcp-tools.ts` (Tool #8)
- Launcher-Prompt-Builder: `src/main/project/launcher-prompt.ts`
