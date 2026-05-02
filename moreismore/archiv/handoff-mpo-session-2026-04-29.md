# Handoff: MPO-Session 2026-04-29

**Session:** MPO-Run v0.11 — 57 Anforderungen + Watchdog-Testlauf + Bug-Fix-Runden
**Kontext-Verbrauch:** Hoch (Session-Ende)
**DMG:** `out/cipher-mux-0.9.7-arm64.dmg` — aktuell, alle Fixes drin

---

## Was passiert ist

### Phase 1: Hauptentwicklung (6 Worker parallel)
- 57 Anforderungen aus MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md
- 6 Worker-Sessions (W1-W5 + BG Investigation), ~25 Min Durchlaufzeit
- ~38 Commits in der ersten Runde
- Completeness Gate eingefuehrt (Phase 9.5) — 7 fehlende Features entdeckt und nachgeliefert

### Phase 2: Watchdog-Testlauf
- 84/126 Tests bestanden (67%)
- 5 MUST-Bugs, 5 SHOULD-Bugs, 8 Feature-Requests, 10 neue FR aus Walkthrough
- Alle Feature-Requests konsolidiert in `docs/more-as-more.md`
- Alle Bug/Feature-Notes mit "processed" getaggt

### Phase 3: Bug-Fix-Runden (Subagents)
- Alle 5 MUST-Bugs gefixt (TestcaseView, STT-Cursor, Recovery, Orchestrator-Migration, Workspace-Editor)
- Alle 5 SHOULD-Bugs gefixt (Aktiv-Status, Klick/Dblclick, Pin-Background, Running-Indicator, MCP Grid-Place)
- MCP Voice-Relay Permissions gefixt
- Pin-Icon Emoji → CSS-Art

### Phase 4: Architektur-Fixes (letzte Runde)
- EntityPickerPopup extrahiert (wiederverwendbar in Grid + Workspace-Editor)
- Workspace-Editor nutzt jetzt das echte Popup statt `<select>`
- entityStatus dynamisch aus Sessions berechnet (nicht mehr 6 hardcoded State-Variablen)
- Companion-Button aus Workspace-Popup entfernt

---

## Offene Retests (RT-1 bis RT-16)

In `docs/v0.11-testcases-konsolidiert.md` Sektion 11:
- RT-1 bis RT-5: MUST-Bug Retests
- RT-6 bis RT-10: SHOULD-Bug Retests
- RT-W2, RT-W6, RT-W7: Walkthrough-Bug Retests
- RT-11 bis RT-16: Workspace & Entity Retests (EntityPickerPopup, dynamic entityStatus)

---

## Bekannte offene Punkte (NICHT gefixt)

| Item | Beschreibung | Prio |
|------|-------------|------|
| W1 | Grid-Zelle flackert rechts | Mittel |
| W3 | STT/BugReport Voice-State Save/Restore | Hoch (FR.5) |
| W4 | Notes "New"-Button unleserlich | Niedrig |
| W5 | Companion Auto-Start ohne Prompt | Mittel |
| W8 | "Watchdog" → "Testing Assistant" umbenennen | Niedrig |
| TTS | mux_tts_speak "Voice not active" — 3-Schicht-Problem | Hoch (FR.6) |
| Hardcoded State | orchestratorSessionId etc. noch als separate Variablen — langfristig eliminieren | Architektur |

---

## Feature-Requests aus Walkthrough (in docs/more-as-more.md)

- WS-1: Workspace-Start mit Resume-Option
- WS-2: Lade-Indikator beim Workspace-Start
- WS-3: Recovery-Dialog als Popup
- WS-4: Workspace speichern Update-Option
- WS-5: Workspace-Popup vereinfachen
- EN-1: Preset-Editor Erweiterungen (Sortierung, Namen, VoiceRelay-als-Companion-Variante)
- DM-1: Glow-Highlight deutlicher
- NT-1: Notes-System Iteration (Sammelstelle)
- FR.1-FR.10: Detaillierte Feature-Requests in den Testcases (Sektion 10)

---

## Gelernte Lektionen (in Memory + MPO-CLAUDE.md)

1. **Completeness Gate** (Phase 9.5): Worker melden "fertig" aber ~30% der SHOULD-Items fehlen. Immer per grep/find verifizieren.
2. **Doku-Sweep** (Phase 10): CHANGELOG, Testcases, Specs committen VOR "fertig". Nicht nachtraeglich.
3. **Ein Preset-Konzept**: Keine hardcoded Entity-IDs. entityStatus dynamisch berechnen. Keine Sonderwege fuer einzelne Entities.
4. **Code lesen, nicht Doku**: Loesungen aus dem Code ableiten, nicht aus Annahmen. Ganzheitlich betrachten, Detail planen, dann implementieren.

---

## Relevante Dateien

- `moreismore/MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md` — Original-Auftrag (187 Anforderungen)
- `moreismore/MPO-IMPLEMENTIERUNGSPLAN-2026-04-28.md` — Wellenplanung
- `moreismore/.mpo-detail-spec-w1..w5+bg.md` — Detail-Specs pro Worker
- `docs/v0.11-testcases-konsolidiert.md` — Konsolidierte Testcases mit Retests
- `docs/more-as-more.md` — Feature-Requests
- `~/.config/cipher-mux/mpo/CLAUDE.md` — MPO-Template mit Phase 9.5 + Doku-Sweep

---

## Naechste Schritte

1. **Retests RT-1 bis RT-16** mit frischem DMG durchgehen
2. Je nach Ergebnis: weitere Bug-Fix-Runde oder Feature-Arbeit
3. TTS 3-Schicht-Fix (FR.6) ist der groesste offene technische Brocken
4. Langfristig: hardcoded Entity-State-Variablen eliminieren
