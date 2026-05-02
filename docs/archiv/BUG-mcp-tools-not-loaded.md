# Bug: MCP-Tools werden in Orchestrator-Session nicht geladen

**Severity:** High — Orchestrator ist ohne MCP-Tools funktionsunfähig
**Reported:** 2026-04-15
**Reporter:** Orchestrator-Session

## Symptom

Die Orchestrator-Session (und vermutlich alle Worker-Sessions) hat keinen Zugriff auf die mux_*-Tools (mux_sessions, mux_send, mux_read, mux_create_session, etc.), obwohl der MCP-Server auf `http://127.0.0.1:3100/mcp` läuft und korrekt antwortet.

## Diagnose

- **Server erreichbar:** Ja (HTTP 401 ohne Auth, JSON-RPC-Antworten mit Auth)
- **MCP-Protokoll:** Antwortet korrekt (Streamable HTTP)
- **Env-Vars gesetzt:** Ja (`CIPHER_MUX_MCP_URL`, `CIPHER_MUX_MCP_KEY` werden via tmux übergeben)
- **Claude Code MCP-Config:** **FEHLT** — kein `mcpServers`-Eintrag in Settings

## Root Cause

cipher-mux-electron startet Claude Code Sessions mit Env-Vars:

```
tmux new-session ... -e CIPHER_MUX_MCP_URL=http://127.0.0.1:3100 -e CIPHER_MUX_MCP_KEY=a01b91b588fc79f7b2d3f92db4adbc81
```

Claude Code ignoriert diese Env-Vars. Es braucht einen expliziten MCP-Server-Eintrag in `settings.json` (projekt-level), z.B.:

```json
{
  "mcpServers": {
    "cipher-mux": {
      "type": "streamableHttp",
      "url": "http://127.0.0.1:3100/mcp",
      "headers": {
        "Authorization": "Bearer <key>"
      }
    }
  }
}
```

## Fix-Vorschlag

Beim Spawnen einer Session (dort wo `tmux new-session` aufgerufen wird) zusätzlich die projekt-level Claude Code Settings schreiben:

**Pfad:** `~/.claude/projects/<project-hash>/settings.json`

Der Project-Hash ist der Pfad mit `-` statt `/`, z.B.:
`~/.claude/projects/-Users-cipher--config-cipher-mux-orchestrator/settings.json`

### Schritte:

1. Project-Hash aus dem Working Directory ableiten
2. `settings.json` mit `mcpServers`-Config schreiben/mergen (bestehende Settings nicht überschreiben!)
3. Auth-Token dynamisch einsetzen

## Zusätzliches Problem

Der Server antwortet mit `"Server already initialized"` auf neue `initialize`-Requests. Prüfen ob Multi-Session-Support korrekt funktioniert — jede Claude-Code-Instanz braucht ihre eigene MCP-Session-ID via Streamable HTTP.

## Workaround

Manuell die Settings-Datei anlegen:

```bash
cat > ~/.claude/projects/-Users-cipher--config-cipher-mux-orchestrator/settings.json << 'EOF'
{
  "mcpServers": {
    "cipher-mux": {
      "type": "streamableHttp",
      "url": "http://127.0.0.1:3100/mcp",
      "headers": {
        "Authorization": "Bearer a01b91b588fc79f7b2d3f92db4adbc81"
      }
    }
  }
}
EOF
```
