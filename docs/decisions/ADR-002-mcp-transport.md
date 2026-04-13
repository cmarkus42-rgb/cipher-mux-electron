# ADR-002: MCP Transport

**Status:** Entschieden
**Datum:** 2026-04-13
**Betrifft:** SPEC.md Abschnitt 2 (MCP Server), Abschnitt 4 (MCP Tools)

## Kontext

Der MCP-Server muss sowohl von lokalen Claude Code Sessions als auch von externen Clients (externer Agent via VPN) erreichbar sein. Die Wahl des Transports bestimmt, welche Clients anbinden können und wie komplex die Server-Implementierung wird.

## Optionen

### Option A: Streamable HTTP (aktueller MCP-Standard)

Server exponiert einen HTTP-Endpoint. Clients senden POST (JSON-RPC), Server antwortet mit JSON oder SSE-Stream. Session-Management via `MCP-Session-Id` Header.

- **Vorteile:**
  - Aktueller MCP-Standard (SSE deprecated seit Spec 2025-03-26)
  - Netzwerk-fähig: Claude Code, externer Agent, curl, jeder HTTP-Client
  - API-Key-Auth trivial (Bearer Token im Header)
  - @modelcontextprotocol/sdk hat eingebauten HTTP-Transport
  - Kein Subprocess-Management nötig
- **Nachteile:**
  - HTTP-Server im Main Process (Port-Konflikte möglich)
  - Slightly mehr Overhead als stdio
- **Risiko:** niedrig

### Option B: stdio Transport

MCP-Server wird als separater Prozess gestartet, Client kommuniziert via stdin/stdout.

- **Vorteile:**
  - Einfachste Implementierung (kein HTTP-Server)
  - Standard für lokale MCP-Server
  - Kein Port-Management
- **Nachteile:**
  - Nur für lokale Subprocess-Szenarien — externe Clients (externer Agent) können nicht anbinden
  - Jeder Client braucht einen eigenen Server-Prozess
  - Widerspricht dem Architektur-Ziel: MCP-Server im Main Process
- **Risiko:** mittel (blockiert externe Clients, mehrere Prozesse)

## Empfehlung

**Option A: Streamable HTTP**

Streamable HTTP ist der aktuelle Standard, unterstützt externe Clients (Requirement), und das SDK bietet eingebauten Support. stdio scheidet aus, weil externer Agent via VPN anbinden soll — das geht nur über Netzwerk.

## Entscheidung

**Option A: Streamable HTTP** — Aktueller MCP-Standard, netzwerkfähig für externe Clients.

## Konsequenzen

- MCP-Server startet HTTP-Listener auf konfiguriertem Host/Port (Default: 127.0.0.1:3100)
- API-Key wird beim ersten Start generiert und via safeStorage gespeichert
- `mcp-auth.ts` validiert Bearer Token vor jeder Request
- Claude Code Sessions erhalten MCP-Config automatisch via Auto-Injection
- Für VPN-Zugang: Host auf 0.0.0.0 oder VPN-IP konfigurieren
