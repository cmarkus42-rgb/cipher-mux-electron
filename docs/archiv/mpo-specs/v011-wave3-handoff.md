# MPO Handoff — v0.11 Wave 3 Dispatch

> Fuer die naechste MPO-Session. Sofort starten, kein weiteres Briefing noetig.

---

## Ausgangslage

- v0.11 Wave 1+2 committed: `e2dedbc feat: v0.11 — Stability + UX Overhaul`
- **Abnahme durchgefuehrt:** 58 Testcases, 38 PASS, 10 FAIL, 3 PARTIAL
- Testcases-Dokument: `docs/v0.11-manual-testcases.md`
- App laeuft als gepackte Version: `out/mac-arm64/cipher-mux.app`
- 589/589 automatisierte Tests pass, Build sauber

## Anforderungspaket

Liegt unter: `docs/mpo-specs/v011-wave3-anforderungspaket.md`

### Struktur: 2 Wellen

**Welle 1: Bugfixes (BLOCKER)**
- SP-BF: 9 Bugfixes aus Abnahme (siehe Anforderungspaket fuer Details)

**Welle 2: Features (nach Bugfixes)**
- SP-LC: LauncherCell-Popup als zentraler Einstieg (Korrektur — "+" in StatusBar war nie gewollt)
- SP-F: Tag Management UI
- SP-J: Sidebar Visual Polish
- SP-K: Voice Mode Integration (3-State: OFF/STT/COM)
- SP-L: MCP App-Control Tools

Bugreport-Architektur (SP-G/H/I) ist Prio 3 und kann Wave 4 werden.

## Die 10 FAILs (Welle 1)

| ID | Problem | Prio |
|----|---------|------|
| BF-1 / F4 | Session-Recovery: Terminal leer bis User interagiert | Hoch |
| BF-2 / F9 | Eject-to-Background-Button kaputt | Hoch |
| BF-3 / F5 | Notes nicht in Sidebar sichtbar | Hoch |
| BF-4 / G1.2 | Message-Bus Nachrichten nicht sichtbar | Hoch |
| BF-5 / F11 | Grid-Resize verschiebt Sessions (Reflow-Bug) | Mittel |
| BF-6 / D2.4-6 | Hardcodierte Persona in Entity-Templates | Mittel |
| BF-7 / F13 | DevTools nicht oeffenbar in gepackter App | Mittel |
| BF-8 / TX.2 | 1 Test-Fail bugreport-source | Klein |
| BF-9 / F2 | LauncherCell umgeht Grid-Placement nicht | Mittel |

## Wichtige Entscheidungen aus der Abnahme-Session

### LauncherCell statt StatusBar "+"
Der "+" Button in der StatusBar war NIE gewollt. Sessions werden AUSSCHLIESSLICH ueber LauncherCell (leere Grid-Zellen) gestartet. SP-LC korrigiert das. LauncherCell-Popup bekommt drei Bereiche: Presets | Pfad | Notes.

### Voice Mode: 3 Radio-States
OFF / STT / COM — kein Cyberpunk-Toggle mehr. STT = wie bisher (in fokussierte Zelle). COM = Voice-Relay als Background-Session mit TTS-Rueckkanal. Gesamte Pipeline existiert bereits, nur Verdrahtung noetig.

### MCP App-Control
Companion/Voice-Relay sollen App steuern koennen (Grid resize, Session eject/focus, Sidebar toggle). Neue MCP-Tools, ca. 20-30 Zeilen pro Tool.

### Bugreport local-first bleibt
Lokale Bugreport-Funktion (Ollama) wird standalone-Modul. LLM Provider Settings fuer Veroeffentlichung. Aber Prio 3 — erstmal Bugfixes und UX.

## Dispatch-Plan

### Welle 1: Bugfixes (2 Worker parallel)

| Worker | Aufgabe |
|--------|---------|
| Worker 1 | BF-1 (Recovery leer) + BF-2 (Eject) + BF-7 (DevTools) + BF-8 (Test-Fail) + BF-9 (LauncherCell-Placement) |
| Worker 2 | BF-3 (Notes) + BF-4 (Message-Bus) + BF-5 (Grid-Reflow) + BF-6 (Persona) |

### Welle 2: Features (3 Worker parallel, nach Welle 1)

| Worker | Aufgabe |
|--------|---------|
| Worker 3 | SP-LC (LauncherCell-Popup) + SP-J (Sidebar Polish) |
| Worker 4 | SP-K (Voice Mode) |
| Worker 5 | SP-F (Tags) + SP-L (MCP Control) |

## Worker-Startup

```bash
# Welle 1
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w3-bugfix1","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w3-bugfix2","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'

# Welle 2 (nach Bugfixes)
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w3-launcher","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w3-voice","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w3-tags","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'
```

Falls Claude Code nicht automatisch startet:
```bash
tmux send-keys -t <session> "claude --dangerously-skip-permissions" Enter && sleep 1 && tmux send-keys -t <session> Enter
```

Instruktionen per tmux send-keys — IMMER separates Enter nachschicken!

## Nach Completion

1. `npm run test` → 0 Failures
2. `npm run build` → sauber
3. Alles committen
4. `npm run dist` → gepackte App bauen
5. `open out/mac-arm64/cipher-mux.app` → User testen lassen

## Wave 4 (danach)

- Testcase-Modus (4 Phasen, Orchestrator-gesteuert) — Spec: `moreismore/feature-testcase-modus.md`
- Bugreport-Architektur (SP-G/H/I) falls nicht in Wave 3 gemacht
- Weitere Findings: F1 (Info→Settings), F8 (Voice-Ready-Pling), F10 (helle Themes), F12 (Workspace-Editor)

## Memory aktualisieren

Nach Abschluss `project_mux_v010_consolidation.md` auf v0.11 Wave 3 Status updaten.
