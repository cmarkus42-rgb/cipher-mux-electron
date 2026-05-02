# MPO Implementierungsplan — cipher-mux-electron v0.11

> **Erstellt:** 2026-04-28, MPO-Session
> **Basis:** MPO-AUFTRAG-KONSOLIDIERT-2026-04-28.md (187 Anforderungen, 10 Cluster)
> **Offene Fragen:** Alle 12 geklaert (User-Entscheidungen inline dokumentiert)

---

## Uebersicht

**Strategie:** Alles parallel, kein Zwischen-Testing, ein grosser Test am Ende.
**Worker:** 5 Haupt-Worker + 1 Background-Investigation
**Koordination:** MPO monitort, beantwortet 90% der Worker-Fragen autonom, eskaliert Geschmacksfragen.
**File-Ownership:** Jeder Worker hat primaere Files. Bei Ueberlappung koordiniert MPO die Merge-Reihenfolge.

---

## Worker-Uebersicht

| Worker | Cluster | Anforderungen | Primaere Files |
|--------|---------|---------------|----------------|
| W1 Grid & Messaging | A.1-A.3, A.5, H.4-H.7, H.9, G.12 | 10 | grid-types.ts, SessionGrid.tsx, mcp-tools.ts (mux_send §), message-bus.ts |
| W2 Entity & Persona | E.1-E.4, E.6-E.8, H.1, H.8 | 11 | session-manager.ts, entity-registry.ts, character-defaults.ts, templates, CLAUDE.md |
| W3 Notes & Testcase | C.1-C.6, D.1 | 7 | note-manager.ts, note-tagging.ts, NoteEditor.tsx, NotesCell.tsx, SidebarPanel.tsx |
| W4 Demo & UI Polish | B.3-B.9, G.1-G.12 | 16 | HighlightOverlay.tsx, components.css, InfoSettingsView.tsx, StatusBar.tsx, WorkspacePopup.tsx |
| W5 Voice | F.1-F.6, C.4 | 7 | voice-input-router.ts, voice-output-router.ts, VoiceControl.tsx, tts-piper.ts |
| BG MCP Investigation | A.4 | 1 | mcp-server.ts (read-only) |

**Gesamt:** 57 Anforderungen ueber 6 Worker (inkl. P.1-P.5 Projekt-Workspace-Struktur)

---

## Abhaengigkeiten

```
W1 (Grid) ────────────── unabhaengig
W2 (Entity) ──────────── unabhaengig (aber W3 braucht E fuer D.1 Testcase-Entity)
W3 (Notes) ───────────── C.1-C.6 unabhaengig, D.1 wartet auf W2 (E.1/E.4)
W4 (Demo & UI) ────────── unabhaengig
W5 (Voice) ───────────── unabhaengig
BG (MCP) ─────────────── unabhaengig
```

**Einzige echte Abhaengigkeit:** D.1 (Testcase Mode) braucht das Entity-Template aus E.4. Worker 3 startet mit C.1-C.6 und beginnt D.1 sobald W2 das Entity-Template liefert. MPO koordiniert den Uebergang.

---

## File-Ownership & Konflikt-Matrix

### Geteilte Files (Koordination noetig)

| File | W1 | W2 | W3 | W4 | W5 |
|------|----|----|----|----|-----|
| mcp-tools.ts | mux_send (Z.71-123) | — | — | highlight/open (Z.1193-1290) | neues mux_tts_speak |
| session-manager.ts | grid-slot recovery (Z.256-294) | entity/persona (Z.526-659) | — | — | — |
| SidebarPanel.tsx | — | — | notes section | sidebar window (G.5) | — |
| app.tsx | — | entity status | — | — | — |
| ipc-channels.ts | — | neue Entity-Channels | Notes-Channels | — | Voice-Pin-Channel |
| components.css | — | — | — | highlight CSS + settings | — |

**Regel:** Jeder Worker aendert NUR seine zugewiesenen Sektionen. Bei Merge-Konflikten hat der thematisch naehere Worker Vorrang.

---

## User-Entscheidungen (aus Fragenklaerung)

| # | Frage | Entscheidung |
|---|-------|-------------|
| 1 | Grid-Bugs vs. Features | Parallel, kein Zwischen-Testing |
| 2 | MCP Investigation | Background-Worker, blockiert nichts |
| 3 | Entity-Scanner | Eigener Service (EntityRegistry) |
| 5 | Backdrop Opacity | Fest 25% |
| 6 | Compact Sessions | Basename ≠ Anzeigename → zeigen |
| 7 | Farbbalken Breakpoints | Gruen 0-25%, Gelb 26-40%, Orange 41-55%, Rot 56%+ |
| 8 | Drag&Drop Prompt | "Hier, guck dir das an:" + Titel + Body |
| 9 | Preset-Editor | Reiter: Rolle/Faehigkeiten/Arbeitsregeln/Scope, 400px min, Warnung |
| 10 | TTS Architektur | MCP-Tool mux_tts_speak, Entity kuratiert |
| 11 | STT Pin Feedback | StatusBar: leuchtet/gedimmt + Session-Header: Voice-Indikator-Button |
| 12 | Screenshot-Methode | Direkt screencapture -i -c |

---

## Detail-Specs

Jeder Worker erhaelt eine eigene `.mpo-detail-spec-w{N}.md` im moreismore/-Verzeichnis mit:
- Vollstaendige Anforderungsliste mit Akzeptanzkriterien
- Betroffene Files mit Zeilennummern
- Code-Kontext (relevante Funktionen, Datenstrukturen)
- Architektur-Entscheidungen
- Testcases
- Koordinations-Hinweise (welche Files/Sektionen gehoeren diesem Worker)

---

## Zeitplan

Alle Worker starten gleichzeitig. Kein sequentielles Wellen-Modell.
- **Start:** Sofort nach Detail-Spec-Erstellung
- **Monitoring:** MPO liest alle 7 Minuten Worker-Output
- **Koordination:** MPO beantwortet Worker-Fragen, verteilt Cross-Worker-Entscheidungen
- **Abschluss:** Wenn alle Worker "fertig" melden → Gesamttest

---

## Projekt-Root

```
/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/
```

## Integriert: Projekt-Workspace-Struktur (P.1-P.5)

**Quelle:** moreismore/konzept-projekt-workspace-struktur.md

Fuenf neue Anforderungen aus dem Konzept "Tags statt Ordner, Workspace = Projekt":
- **P.1** (W3): Tag-basiertes Notes-Scoping ersetzt Ordner-Scoping
- **P.2** (W3): Auto-Tagging bei aktivem Workspace
- **P.3** (W3): Migration bestehender Notes (Ordner → flach + Tags)
- **P.4** (W2): Workspace-Config um defaultTags[] und entityPresets erweitern
- **P.5** (W4): Workspace-Editor: Default-Tags editierbar

**Geparkt (eigenes Projekt):** Standardisierte Projektordner-Struktur (docs/specs/, docs/audit/, moreismore/ etc.) und Entity→Ordner-Zuordnung. Gute Idee, aber eigener Scope — nicht in v0.11.

## Relevante Recherche-Dokumente

- `docs/research-context-and-xterm-2026-04-27.md` — Context-Anzeige + xterm.js fit()
- `docs/research-notes-management-2026-04-27.md` — Notes-Management, Tag-Hierarchien
- `moreismore/konzept-projekt-workspace-struktur.md` — Projekt-Workspace-Konzept (Quelle fuer P.1-P.5)
