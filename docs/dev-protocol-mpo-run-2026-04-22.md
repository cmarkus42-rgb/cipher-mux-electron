# Entwicklungsprotokoll — MPO Run 2026-04-22/23

> Erster produktiver Durchlauf des Multi-Project Orchestrator (MPO).
> Orchestrator-Session: `/Users/Shared/Nextcloud/Claude/MultiProjectOrchestrator - MPO/`
> Ziel-Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`

---

## Projekt: mux_community Evolution

**Auftrag:** cipher-mux-electron (v0.8.2-beta) in ein öffentliches Open-Source Claude Code Cockpit transformieren.

**Basis-Dokumente:**
- Anforderungspaket: `docs/anforderungspaket-mux-community.md` (im MPO-Repo)
- Designdokument v0.2: `/Users/Shared/Nextcloud/Claude/mux_community/deliverables/designdokument_v0.2.md`
- Designdokument v0.3 (später gefunden): `/Users/Shared/Nextcloud/Claude/ClaudeCode01/AeriesMUX/designdokument_v0.3.md`
- Entwicklungskonzept: `docs/dev-concept-mux-community.md` (im MPO-Repo)

---

## Entscheidungen (ADRs)

| ADR | Entscheidung | Begründung |
|-----|-------------|-----------|
| ADR-013 | Monorepo mit Profile-Overlay, Cipher-Profil in `.gitignore` | Solo-Maintainer, kein Sync-Overhead |
| ADR-014 | Name bleibt `cipher-mux` | Name ist unabhängig vom Profil-System; spart ~80% Debranding |
| ADR-015 | MIT-Lizenz beibehalten | Stack ist MIT, max Adoption |
| — | Aider nur als Reference-Stub, keine Voll-Implementierung | Scope-Reduktion aligned mit v0.3 |
| — | 21 Sessions, 3×7 Grid (nicht 4×5) | DQHD 5120×1440 (32:9 Ultrawide), 3 Zeilen × 7 Spalten |
| — | Voice STT nur PTT, kein Always-Listen für Session-Input | Destruktiver Impact bei versehentlichem Submit in tmux |
| — | Whisper Large-v3 als empfohlenes Modell | Beste Qualität, Downgrade-Option in Settings |
| — | Ctrl+Shift+Space als PTT-Hotkey (nicht Fn) | Fn sendet keinen Keycode an OS |

---

## Teilprojekte und Ergebnisse

### TP-1: Profile-Overlay-System ✅
- **Session:** `cmux-mpo-tp1-profile` / `cmux-8xt31hmv`
- **Branch:** Direkt auf `main` committed
- **Ergebnis:** `src/shared/brand.ts`, `profile.community.yaml`, Profile-Lint, Onboarding
- **Tests:** 334 grün, beide Build-Profile funktionieren
- **Commits:** `0d01f81 refactor: introduce BRAND profile-overlay system`
- **Bug gefunden (post-merge):** `brand.ts` nutzt `process.env`/`fs`/`path` — crasht im Renderer. Fix: `constants.ts` von BRAND-Import entkoppelt, Main-Consumer importieren BRAND direkt.

### TP-2: AgentAdapter-Refactor ✅
- **Session:** `cmux-mpo-tp2-adapter` / `cmux-pemyshqq`
- **Branch:** `feat/agent-adapter-refactor` → merged in main
- **Ergebnis:** `AgentAdapter` Interface, `ClaudeCodeAdapter` (Tier-1), `ReferenceStubAdapter`, `AdapterRegistry`, SessionManager-Refactor, UI-Degradation, Prompt-Factory
- **Tests:** 361 grün (23 neue Adapter-Tests)
- **BUG-mcp-tools-not-loaded:** Fix integriert (duale Settings-Manipulation)
- **Commits:** 8 Commits, `+938/-71` Zeilen, 18 Dateien

### TP-3: 21-Session UI (3×7 Grid) ✅
- **Session:** `cmux-mpo-tp3-grid21` / `cmux-ygqt4082`
- **Branch:** Direkt auf `main` committed
- **Ergebnis:** `MAX_SESSIONS=21`, `MAX_GRID_COLS=7`, `MAX_GRID_ROWS=3`, `computeOptimalGrid`, Recovery-Dialog scrollbar
- **DQHD-Validierung:** 7×3 Grid = 4948×1248px → passt in 5120×1440
- **Performance:** Muss manuell validiert werden (>30 FPS bei 21 Sessions)
- **Korrektur:** Orchestrator hatte DQHD als 5120×2880 angenommen — User korrigierte auf 5120×1440

### TP-4: OSS-Infrastruktur ✅
- **Session:** `cmux-mpo-tp4-oss-infra` / `cmux-zzyajajf`
- **Branch:** Direkt auf `main` committed
- **Ergebnis:** README.md, CONTRIBUTING.md, ARCHITECTURE.md, CHANGELOG.md, NOTICE, GitHub-Templates, CI-Workflow, Linux AppImage Config, TSDoc-Lint, Platform-Abstraktion (xdg-open)
- **Blockade:** CODE_OF_CONDUCT.md wurde vom Content-Filter blockiert → übersprungen, muss manuell angelegt werden
- **Tests:** 334 grün

### TP-5: Voice → Session STT ✅
- **Session:** `cmux-mpo-tp5-voice` / `cmux-4y17ns3t`
- **Branch:** `feat/voice-session-stt` → Drift-Problem → `feat/voice-session-stt-v2` (cherry-pick von main) → merged
- **Ergebnis:** `VoiceInputRouter`, `VoiceOutputRouter` (Placeholder), Coding-Bias-Prompt, `startSessionMode()`, IPC-Channels, `useVoiceSession` Hook (PTT), `VoiceControl` Floating Pill, CSS
- **Tests:** 369 grün (2 neue Voice-Tests)
- **Drift-Problem:** Session branched von altem main-Stand, löschte versehentlich TP-1/TP-3-Arbeit. Fix: Cherry-Pick aller 12 Voice-Commits auf neuen Branch von aktuellem main. Ein Konflikt (ipc-channels.ts), trivial gelöst.
- **Commits:** 12 Commits, `+734/-11` Zeilen, 14 Dateien

---

## Finale Merge-Statistik

```
main — nach allen Merges
├── 369 Tests grün
├── Build OK (TypeScript 0 Errors, Vite OK)
├── TP-1 + TP-3 + TP-4: direkt auf main
├── TP-2: feat/agent-adapter-refactor → main (no-ff merge)
├── TP-5: feat/voice-session-stt-v2 → main (no-ff merge)
└── Alle Feature-Branches gelöscht
```

---

## Bekannte offene Punkte

1. **CODE_OF_CONDUCT.md fehlt** — Content-Filter blockiert. Manuell anlegen (Contributor Covenant 2.1).
2. **Single-Instance-Lock** — Dev-Build kann nicht neben Production-App starten. Für Dev-Mode Lock deaktivieren oder Production beenden.
3. **Whisper Large-v3 nicht als Default gesetzt** — Aktuell noch `ggml-small.bin`. Config-Änderung, kein Code-Change. Settings-UI für Modellwahl fehlt noch.
4. **Globaler Hotkey** (Accessibility-Permission) — nicht gebaut, als optional markiert.
5. **.mpo-detail-spec-tp*.md Dateien** — 5 Detail-Specs im Repo-Root. Archivieren oder löschen.
6. **Performance-Test 21 Sessions** — muss manuell validiert werden (>30 FPS).
7. **brand.ts Renderer-Crash** — gefixt (constants.ts entkoppelt), aber BRAND-Import-Pattern sollte in CLAUDE.md dokumentiert werden (nur in Main-Prozess importieren).
8. **moreismore/ Ordner** — Bugreports und neue Anforderungen die während der Entwicklung aufkamen. Werden im nächsten Durchlauf bearbeitet.

---

## MPO-Prozess: Lessons Learned

### Was funktioniert hat
- **Gap-Analyse** erkannte 3 Features als bereits fertig (Task-Queue, Voice-Pipeline, Bugreport) → ~30-40% weniger Arbeit
- **100% Session-Autonomie** bei technischen Rückfragen — 10 Fragen autonom beantwortet, 0 an User eskaliert
- **3 echte Eskalationen** an User (Repo-Strategie, Name, Lizenz) — alle Geschmacksentscheidungen
- **Parallele Sessions** sparten signifikant Wallclock-Time (4 Sessions gleichzeitig in Phase 2)
- **Fokussierter Kontext** ist ein Vorteil, kein Nachteil — jede Session konzentriert sich auf ein Thema

### Was nicht funktioniert hat
- **Voice → Session im Gap-Analysis übersehen** — Feature-Level vs. Use-Case-Level Unterscheidung fehlte
- **v0.3 Designdokument nicht gefunden** — User musste darauf hinweisen
- **DQHD-Auflösung falsch** (5120×2880 statt 5120×1440) — Faktenfehler
- **TP-5 Branch-Drift** — Session branched von altem main, löschte andere TP-Arbeit. Fix: Cherry-Pick
- **Kein Code-Review während Sessions liefen** — nur Monitoring ob Sessions arbeiten, nicht WAS sie committen
- **Keine formalen Input Requests** erstellt — alle Eskalationen liefen im Chat statt über mpo_input_request
- **Zeitgefühl fehlt** — Orchestrator wusste nicht ob User schläft oder wach ist

### Verbesserungen für nächsten Run
1. Gap-Analyse: "Technology exists" ≠ "Use-Case implemented"
2. Interface-Disziplin: Schnittstellen zwischen TPs VOR Session-Start definieren und teilen
3. Branch-Management: Alle Sessions von aktuellem main branchen, nicht von dem Branch den die tmux-Pane gerade hat
4. Code-Review: Diffs prüfen, nicht nur Session-Output lesen
5. Input Requests nutzen wenn User nicht im Chat (asynchroner Kanal)
6. Systems Engineering: RF→f→P Zerlegung mit sauberen Interface-Definitionen

---

## Referenzen

- MPO Orchestrator-Prompt: `/Users/Shared/Nextcloud/Claude/MultiProjectOrchestrator - MPO/src/prompt/orchestrator.md`
- MPO Entwicklungskonzept: `/Users/Shared/Nextcloud/Claude/MultiProjectOrchestrator - MPO/docs/dev-concept-mux-community.md`
- MPO Memory: `/Users/Shared/Nextcloud/Claude/MultiProjectOrchestrator - MPO/.claude/projects/-Users-Shared-Nextcloud-Claude-MultiProjectOrchestrator---MPO/memory/`
- Designdokument v0.2: `/Users/Shared/Nextcloud/Claude/mux_community/deliverables/designdokument_v0.2.md`
- Designdokument v0.3: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/AeriesMUX/designdokument_v0.3.md`
