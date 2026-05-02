# ADR-008: Orchestrator CLAUDE.md Template

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 2 (Orchestrator-Session), Requirements (Orchestrator)

## Kontext

Der Orchestrator ist eine Claude Code Session mit eigenem CLAUDE.md, die via MCP-Tools andere Sessions delegiert. Das Template definiert Rolle, Constraints und Verhalten. Es muss so formuliert sein, dass Claude Code sinnvoll Tasks zerlegt, dimensioniert und delegiert — ohne in Endlos-Schleifen zu geraten.

## Optionen

### Option A: Minimal (Rolle + MCP-Config)

Nur Rollendefinition und MCP-Tool-Beschreibungen. Claude Code entscheidet selbst über Delegation.

- **Vorteile:** Einfach, flexibel, wenig Wartung
- **Nachteile:** Unvorhersagbares Verhalten, kein Retry-Limit, keine Task-Sizing-Heuristik
- **Risiko:** hoch (unkontrollierter Token-Verbrauch)

### Option B: Strukturiert (Rolle + Constraints + Heuristiken)

Detailliertes Template mit expliziten Regeln für Delegation, Retry-Limits und Task-Sizing.

- **Vorteile:**
  - Vorhersagbares Verhalten
  - Token-Budget-bewusst (2-Retry-Limit)
  - Task-Sizing-Heuristiken verhindern zu grosse/kleine Aufträge
  - Fehler-Eskalation an User klar definiert
- **Nachteile:** Template muss gepflegt werden, kann bei Claude Code Updates angepasst werden müssen
- **Risiko:** niedrig

## Empfehlung

**Option B: Strukturiertes Template**

Das 2-Retry-Limit ist ein hartes Requirement. Ohne explizite Constraints im CLAUDE.md wird Claude Code dieses Limit nicht einhalten. Das Template sollte enthalten:

```markdown
# Orchestrator — cipher-mux

Du bist der Orchestrator für cipher-mux. Deine Aufgabe: Tasks an Worker-Sessions delegieren und deren Fortschritt überwachen.

## MCP-Tools
- mux_sessions: Aktive Sessions auflisten
- mux_create_session: Neue Worker-Session erstellen
- mux_kill_session: Session beenden
- mux_send: Nachricht an Session/Topic senden
- mux_read: Nachrichten lesen
- mux_status: Session-Status abfragen
- mux_context_usage: Context-Verbrauch pro Session

## Delegation-Regeln
1. Zerlege grosse Aufträge in eigenständige Sub-Tasks
2. Ein Task pro Worker-Session
3. Task-Grösse: 60-80% des Context-Windows (nicht mehr)
4. Bevor du delegierst: Prüfe via mux_context_usage ob die Ziel-Session genug Kapazität hat
5. Erstelle eine neue Session wenn nötig (mux_create_session)

## Fehlerbehandlung
1. Bei Fehler in einer Worker-Session: Analysiere via mux_read was schiefging
2. Maximal 2 Retry-Versuche pro Task
3. Nach 2 Fehlschlägen: Eskaliere an User via mux_send (topic: chat)
4. NIEMALS mehr als 2 Retries — Token sind begrenzt

## Reporting
- Sende Status-Updates an topic "status" nach jeder abgeschlossenen Delegation
- Sende Warnungen an topic "system" wenn Context-Usage >80%
```

## Entscheidung

**Option B: Strukturiertes Template** — Rolle, Constraints, 2-Retry-Limit, Task-Sizing-Heuristiken.

## Konsequenzen

- Orchestrator-Verzeichnis (`~/.config/cipher-mux/orchestrator/`) wird bei App-Start erstellt
- CLAUDE.md wird aus Template generiert (MCP-Config-Werte werden eingesetzt)
- Template ist in `src/main/session/orchestrator-template.ts` als String-Literal
- MCP-Server-URL und API-Key werden dynamisch ins Template injiziert
- Template-Updates erfordern App-Update (kein Hot-Reload)
