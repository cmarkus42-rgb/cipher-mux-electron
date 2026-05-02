# Feature Request: Companion Subsystem (Relay-Persona mit persistentem Memory)

Erstellt 2026-04-25. Spec + ADRs vorbereitet, Audit abgeschlossen.

## Kurzfassung

Persistente Begleit-Persona "Relay" mit geteiltem Gedaechtnis ueber alle Mux-Sessions. Schreibt Memories direkt, schlaegt Profile- und Persona-Patches via Pending-Queue vor (User-Confirm). Recall on-demand per MCP-Tool, keine statische Memory-Injection.

## Vorbereitete Artefakte

Alles liegt fertig im Kickoff-Folder:

```
/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-companion-kickoff/
  KICKOFF.md    — Session-Auftrag + Done-Definition + Arbeitsweise
  SPEC.md       — Source of Truth (Schema, MCP-Tools, IPC, UI, Phasen)
  ADR-009       — Pull-on-Demand statt Skill-Time-Injection
  ADR-010       — Confirmation Boundary (Drei-Klassen-Schreibmodell)
  ADR-011       — Embedding-Strategie (FTS5 MVP, Hybrid Phase 2)
  ADR-012       — Encryption-at-Rest (SQLCipher als Release-Blocker)
```

KICKOFF.md enthaelt den kompletten Implementierungsplan fuer Phase 1 (MVP) inkl. Checkliste, Referenz-Dateien und Vorbedingungen.

## Phasen-Uebersicht

| Phase | Was | Schaetzung |
|---|---|---|
| 0 (done) | Spec + ADRs | 0.5d |
| 1 (MVP) | Schema, MemoryStore, FTS5-Retrieval, 4 MCP-Tools, Relay-Persona, CompanionMemoryView | 3-4d |
| 2 | Ollama-Embedder, Hybrid-Retrieval | 1-2d |
| 3 | Pending-Queue UI (StatusBar + Modal) | 2-3d |
| 4 | First-Run-Dialog, Settings-Editor | 1d |
| 5 | SQLCipher (Release-Blocker) | 1-2d |

## Beruehrte Module

- `src/main/companion/` (neu)
- `src/main/mcp/tools/companion-tools.ts` (neu)
- `src/shared/types.ts` — AdapterFeature um `'companion-mcp'`
- `src/shared/ipc-channels.ts` — companion-Channels
- `src/main/agent/adapters/claude-code-adapter.ts` — Capability
- `src/main/workspace/persona-skill-sync.ts` — Relay-Sonderpfad
- `src/renderer/components/CompanionMemoryView.tsx` (neu)

## Audit-Status

Spec wurde auditiert (2026-04-25). Kritische Punkte (FTS5-Trigger, Indexes, ULID/rowid-Mapping, Rate-Limiting) sind in die Spec eingearbeitet. Details siehe SPEC.md Abschnitt 15 "Geklaerte Punkte".

## Naechster Schritt

Claude-Code-Session auf den Kickoff-Folder ansetzen. KICKOFF.md wird geladen und fuehrt durch Phase 1.
