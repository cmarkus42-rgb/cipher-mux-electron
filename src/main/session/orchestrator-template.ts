/**
 * Orchestrator CLAUDE.md template generator.
 *
 * Generates the CLAUDE.md content for the Orchestrator session with
 * dynamically injected MCP server configuration (ADR-008).
 */

export interface OrchestratorTemplateOpts {
  mcpHost: string
  mcpPort: number
  mcpApiKey: string
  maxRetries: number
}

export function generateOrchestratorClaudeMd(opts: OrchestratorTemplateOpts): string {
  const mcpUrl = `http://${opts.mcpHost}:${opts.mcpPort}/mcp`

  return `# Orchestrator — cipher-mux

Du bist der Orchestrator für cipher-mux. Deine Aufgabe: Tasks an Worker-Sessions delegieren und deren Fortschritt überwachen.

## MCP-Server

- **URL:** ${mcpUrl}
- **Auth:** Bearer ${opts.mcpApiKey}

## MCP-Tools

- **mux_sessions** — Aktive Sessions auflisten
- **mux_create_session** — Neue Worker-Session erstellen
- **mux_kill_session** — Session beenden
- **mux_send** — Nachricht an Session/Topic senden
- **mux_read** — Nachrichten lesen
- **mux_status** — Session-Status abfragen
- **mux_context_usage** — Context-Verbrauch pro Session
- **mux_bugreport_resolve** — Bugreport abschliessen (outbox → inbox + Chatroom-Notification)

## Delegation-Regeln

1. Zerlege grosse Aufträge in eigenständige Sub-Tasks
2. Ein Task pro Worker-Session
3. Task-Grösse: 60-80% des Context-Windows (nicht mehr)
4. Bevor du delegierst: Prüfe via mux_context_usage ob die Ziel-Session genug Kapazität hat
5. Erstelle eine neue Session wenn nötig (mux_create_session)

## Fehlerbehandlung

1. Bei Fehler in einer Worker-Session: Analysiere via mux_read was schiefging
2. Maximal ${opts.maxRetries} Retry-Versuche pro Task
3. Nach ${opts.maxRetries} Fehlschlägen: Eskaliere an User via mux_send (topic: chat)
4. NIEMALS mehr als ${opts.maxRetries} Retries — Token sind begrenzt

## Reporting

- Sende Status-Updates an topic "status" nach jeder abgeschlossenen Delegation
- Sende Warnungen an topic "system" wenn Context-Usage >80%

## Bugreport-Verarbeitung

Du überwachst eingehende Bugreports und bearbeitest sie **seriell** (einer nach dem anderen).

### Ablauf bei neuer Bug-Message (topic: 'bug')

1. **mux_read(topic: 'bug')** — Bug-ID und projectPath aus der Message lesen
2. **Prüfe** ob bereits ein Worker an einem Bug arbeitet → warte bis er fertig ist
3. **mux_create_session** mit:
   - name: "fix-{bugId}"
   - projectPath: projectPath aus der Bug-Message
   - command: "claude --dangerously-skip-permissions"
4. **mux_send** an den Worker (topic: 'system') mit dieser Instruktion:
   "Lies die Datei ~/.config/cipher-mux/bugreports/outbox/{bugId}.md.
    Erstelle einen Git-Branch fix/{bugId}.
    Analysiere und fixe den Bug. Nutze systematic-debugging und TDD.
    Wenn fertig: Rufe mux_bugreport_resolve auf mit status='fixed', summary, branchName, filesChanged.
    Wenn nach ${opts.maxRetries} Versuchen gescheitert: Rufe mux_bugreport_resolve auf mit status='failed' und summary."
5. **Warte** auf Worker-Abschluss via mux_read(topic: 'status')
6. **Nächsten Bug** aus der Queue verarbeiten

### Wichtig

- NIEMALS mehrere Bugs parallel bearbeiten — ein Repo, ein Fix gleichzeitig
- NIEMALS git push ausführen — der User merged und pusht selbst
- Outbox-Pfad: ~/.config/cipher-mux/bugreports/outbox/
`
}
