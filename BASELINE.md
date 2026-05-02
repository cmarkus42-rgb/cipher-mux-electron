# Test-Baseline vor Cyber-Factory-Pack

**Datum:** 2026-05-02
**Version:** 0.9.9
**Branch:** feat/cyber-factory-pack
**Tag:** v0.9.9-pre-pack-cyber-factory

## Test-Ergebnis

```
tests 591
pass  580
fail   11
```

## Passing Test-Suites (54)

ClaudeCodeAdapter, ReferenceStubAdapter, AdapterRegistry, pcmToWav, brand module,
BugreportInterview, BugreportManager, resolveBugreport, BugreportTaskSource,
MemoryStore (SP-4), config persistence, ConversationEngine VAD, checkDependencies,
Echo Cancellation, deployEntityAssets(), EntityRegistry, grid-types,
InputRequestWatcher, KickoffOrchestrator, KickoffWatcher, buildLauncherPrompt,
McpServerManager, MCP task tools, escapeForTmux, findSessionByName, MessageBus,
InputRequestWatcher.createRequest, NoteManager search+handoff, NoteManager,
NoteTagging, GridSlot type field, OllamaChat, ollama bugreport enrichment,
OutputBatcher, generateSkillContent, syncPersonaSkills, ProjectScanner,
SessionManager.recover(), SP-5 Session Start/Fork/Orphan/ClaudeCodeAdapter,
SessionManager statusLine, ShortcutRegistry, injectStatusLineHook,
StatusLineMonitor, STT Engine (3 suites), TaskHooks, Integration lifecycles (3),
TaskManager, Task schema, Task types, TaskWatcher, terminal-registry,
getTerminalTheme (3 suites), themes.json, testcase-parser, decodeOctal,
parseLine (5 suites), TmuxParser, StringDecoder, VoiceStateMachine,
applyWorkspace, spanOf

## Known Fails (11)

| Suite | Test | Ursache | Pack-Disposition |
|---|---|---|---|
| VoiceInputRouter | dispatches text (no Enter) | submitMode-Assertions veraltet | Voice-Fix (5min) |
| VoiceInputRouter | avoids double space | submitMode-Assertions veraltet | Voice-Fix |
| VoiceInputRouter | routes to pinned | submitMode-Assertions veraltet | Voice-Fix |
| VoiceInputRouter | pin overrides notes | submitMode-Assertions veraltet | Voice-Fix |
| resolvePrompt | persona default | Persona-Resolver wird neu gebaut | Welle 1a ersetzt |
| resolvePrompt | whitespace falls through | Persona-Resolver wird neu gebaut | Welle 1a ersetzt |
| registerBuiltinEntities | projectPath from BRAND | Entity-Registrierung wird ueberarbeitet | Welle 1a ersetzt |
| mpo-template | ganzes File | Import/Setup-Fehler | Welle 2 ersetzt (Cyber Factory) |
| orchestrator-template | ganzes File | Import/Setup-Fehler | Welle 2 ersetzt (Cyber Factory) |
| BugreportTaskSource | detects new .md | Filesystem-Watch-Timing (flaky) | Debounce-Fix |
| InputRequestWatcher | file modified | Filesystem-Watch-Timing (flaky) | Debounce-Fix |

## Regel

Pack-Wellen duerfen **keine neuen Fails** einfuehren. Bestehende Known Fails
duerfen durch Pack-Arbeit geloest werden (Tests anpassen oder Module ersetzen),
aber die Gesamtzahl darf nicht steigen.
