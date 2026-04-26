# MPO Handoff — v0.11 Wave 2 Dispatch

> Fuer die naechste MPO-Session. Sofort starten, kein weiteres Briefing noetig.

---

## Ausgangslage

- v0.11 Wave 1 (Stability) ist implementiert aber NICHT committed (uncommitted changes in 30 files, +1359/-592)
- **4 Tests failen:** 3x `test/main/session-recovery.test.ts` (Z.195, 231, 270) + 1x `test/main/bugreport-source.test.ts` (Z.65)
- Build geht durch, App laeuft als gepackte Version (`out/mac-arm64/cipher-mux.app`)
- Single-Instance-Lock, Grid-Popup-Cancel, Entity-Doppelstart-Prevention, Message-Bus-Clear, Companion-Memory-Prompt — alles schon drin

## Anforderungspaket

Liegt unter: `docs/mpo-specs/v011-wave2-anforderungspaket.md`

5 Sub-Projekte:
1. **SP-A:** 4 failende Tests fixen (Blocker)
2. **SP-B:** Sidebar auto-hide raus, nur manueller Toggle
3. **SP-C:** Unified Session Dialog (Hauptbrocken — ersetzt SessionDialog + ProjectPopup + Entity-Start-Buttons)
4. **SP-D:** Companion Startup-Greeting verdrahten
5. **SP-E:** Build + dist + Testcases validieren

## Dispatch-Plan

| Worker | Aufgabe | Abhaengigkeit |
|--------|---------|---------------|
| Worker 1 | SP-A (Test-Fixes) + SP-B (Sidebar) | Keine |
| Worker 2 | SP-C (Unified Session Dialog) | Keine (aber groesster Brocken) |
| Worker 3 | SP-D (Greeting) | Keine |

Alle parallel startbar. SP-E macht der MPO selbst am Ende.

## Worker-Startup

```bash
# Sessions via MCP erstellen (NICHT manuell per tmux!)
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w2-fixes","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w2-dialog","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'
bash /tmp/mcp-call.sh mux_create_session '{"name":"cmux-mpo-w2-greeting","projectPath":"/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron","adapter":"claude-code"}'
```

Falls Claude Code nicht automatisch startet:
```bash
tmux send-keys -t <session> "claude --dangerously-skip-permissions" Enter && sleep 1 && tmux send-keys -t <session> Enter
```

Instruktionen per tmux send-keys — IMMER separates Enter nachschicken!

## Nach Completion

1. `npm run test` → 0 Failures
2. `npm run build` → sauber
3. Alles committen (ein Commit pro SP oder ein Combined)
4. `npm run dist` → gepackte App neu bauen
5. `open out/mac-arm64/cipher-mux.app` → User testen lassen

## Offene Bugreports (18)

Nicht Teil dieses Pakets, aber im Hinterkopf behalten:
- Session Rename, File Drop, Fork Session, --resume fuer MPO
- Siehe `moreismore/BUG-2026-04-25-*.md`

## Memory-Files aktuell halten

Nach Abschluss `project_mux_v010_consolidation.md` updaten (ist jetzt v0.10→v0.11 Status).
