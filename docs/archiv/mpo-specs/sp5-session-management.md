# SP-5: Session Management — Detail-Spec

> MPO Sub-Projekt 5 | Wave 2 | Aufwand: ~1.5d
> Plan-Phasen: 4a, 4b, 4c | Tickets: BAEXXR, SXMDW8, 2EE9XA

---

## Ziel

Session-Resume, Fork und Orphan-Detection implementieren. Sessions koennen fortgesetzt und verzweigt werden.

## Vorbereitung

**LIES ZUERST:**
1. `CLAUDE.md` im Repo-Root
2. `src/main/session/session-manager.ts` — SessionManager, StartSessionOpts, wie Sessions erstellt werden
3. `src/renderer/components/PaneHeader.tsx` — bestehende Controls
4. `src/renderer/components/SidebarPanel.tsx` — Sessions-Tab

## Funktionale Anforderungen

### Phase 4a: --resume Flag (~0.5d)

#### FR-1: StartSessionOpts erweitern
```typescript
interface StartSessionOpts {
  // ... bestehende Felder
  resume?: boolean  // NEU: --resume Flag an Claude Code uebergeben
}
```
- Wenn `resume: true`, wird `--resume` an den `claude` CLI-Aufruf angehaengt
- Claude Code resumed dann die letzte Session im selben Projektverzeichnis

#### FR-2: Entity-Sessions standardmaessig mit Resume
- Alle Entity-Sessions (Orchestrator, MPO, Companion, Refinement) starten per Default mit `resume: true`
- Manuelle Sessions: kein Default-Resume
- Konfigurierbar: In SessionDialog "Resume previous session" Checkbox (default: unchecked fuer manuelle Sessions)

#### FR-3: Resume-Option im SessionDialog
- Neue Checkbox in `SessionDialog.tsx`: "Letzte Session fortsetzen"
- Default unchecked fuer manuelle Sessions
- Beim Oeffnen: pruefen ob eine vorherige Claude-Session im Projekt existiert (optional, nice-to-have)
- i18n-Keys verwenden

### Phase 4b: Fork Session (~0.5d)

#### FR-4: Fork-Button im PaneHeader
- Neuer Button im PaneHeader (neben bestehenden Controls): Fork-Icon
- Nur sichtbar fuer Claude-Code-Sessions (nicht fuer Shell-Sessions)
- Tooltip: "Fork Session" (i18n)

#### FR-5: Fork-Logik
- Click auf Fork-Button:
  1. Lese `session-id` der aktuellen Session (aus Claude-Code-Statusline oder Session-State)
  2. Erstelle neue Session mit `claude --fork-session --resume <session-id>`
  3. Neue Session in naechstem freien Grid-Slot platzieren
  4. Name: `<original-name>-fork`
- Fehlerbehandlung: Wenn kein freier Slot → GridPlacementPopup oeffnen

#### FR-6: Session-ID Tracking
- SessionManager muss die Claude-Code Session-ID tracken (nicht die cipher-mux interne ID)
- Auslesen aus Statusline oder `claude --status` Output
- Neues Feld in Session-State: `claudeSessionId?: string`

### Phase 4c: Verwaiste Sessions (~0.5d, Research-Anteil)

#### FR-7: Orphan Detection
- Vergleich: `tmux list-sessions` vs. bekannte `cmux-*` Prefixes im SessionManager
- tmux-Sessions die `cmux-` prefix haben aber nicht im SessionManager registriert sind = Orphans
- Pruefung bei App-Start und periodisch (alle 5 Minuten)

#### FR-8: Orphan UI
- Sidebar Sessions-Tab: "Verwaiste Sessions" Hinweis wenn Orphans erkannt
- Klappbare Liste der Orphans mit tmux-Session-Name
- Pro Orphan: "Adoptieren" Button (registriert Session im SessionManager) und "Beenden" Button (tmux kill-session)
- i18n-Keys verwenden

#### FR-9: Scope-Grenze
- **NUR** verwaiste cipher-mux-Sessions (cmux-* prefix) erkennen
- Externe tmux-Sessions (ohne cmux- prefix) werden ignoriert
- Keine automatische Adoption — immer User-Entscheidung

## Abgrenzung

- Kein automatischer Resume beim App-Neustart (nur explizit)
- Keine Deep-Integration mit Claude-Code Session-Management (nur CLI-Flags)
- Keine externen (non-cipher-mux) tmux-Sessions

## Meta-Requirements

- **i18n:** Alle neuen UI-Strings via t()
- **Pattern:** SessionManager-Erweiterungen muessen mit SP-3 (Entity Framework) kompatibel sein. Wenn SP-3 bereits EntityConfig eingefuehrt hat, darauf aufbauen.
- **Adaptive Implementierung:** Lies den aktuellen Stand von session-manager.ts BEVOR du implementierst — SP-3 koennte bereits Aenderungen gemacht haben.

## Quality Gate

### Testcases

| # | Test | Erwartetes Ergebnis |
|---|---|---|
| T1 | Session mit resume: true starten | `--resume` im CLI-Aufruf |
| T2 | Entity-Session (Orchestrator) starten | Automatisch mit --resume |
| T3 | Manuelle Session starten | Ohne --resume (default) |
| T4 | Fork-Button klicken | Neue Session mit --fork-session erstellt |
| T5 | Fork bei vollem Grid | GridPlacementPopup oeffnet |
| T6 | Orphan-Detection: cmux-Session ohne Registration | Als Orphan erkannt |
| T7 | Orphan-Detection: non-cmux tmux-Session | Wird ignoriert |
| T8 | Orphan adoptieren | Session im SessionManager registriert |
| T9 | Orphan beenden | tmux-Session gekillt |

### Code-Qualitaet
- `npm run lint` ohne neue Errors
- `npm run test` gruen
- Kein Duplizieren von SessionManager-Logik
- Defensive tmux-Calls (Fehler abfangen wenn Session schon weg)

### Dokumentation
- CHANGELOG.md aktualisieren
- docs/todo.md aktualisieren

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- SessionManager: `src/main/session/session-manager.ts`
- PaneHeader: `src/renderer/components/PaneHeader.tsx`
- SidebarPanel: `src/renderer/components/SidebarPanel.tsx`
- SessionDialog: `src/renderer/components/SessionDialog.tsx`
