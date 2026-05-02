# SP-1: i18n Foundation — Detail-Spec

> MPO Sub-Projekt 1 | Wave 1 | Aufwand: ~2d
> Plan-Phase: 1 | Tickets: GCQ8Q9, XPB9Q6

---

## Ziel

i18n-Framework fuer cipher-mux-electron einrichten. EN als Primaersprache, DE als zweite Sprache. Alle bestehenden UI-Strings extrahieren. Sprachumschaltung in Settings.

## Kontext

- Aktuell: Hardcodierte Strings (Mix aus DE und EN) in ~24 Renderer-Komponenten
- Kein i18n-Framework vorhanden
- Stack: Preact + Vite + TypeScript
- Warum zuerst: Jedes neue Feature danach produziert automatisch i18n-konforme Strings

## Funktionale Anforderungen

### FR-1: i18n-Framework einrichten
- `i18next` + `preact-i18next` als Dependencies hinzufuegen
- i18n-Instanz in `src/renderer/i18n.ts` konfigurieren
- Initialisierung beim App-Start in `src/renderer/index.tsx` (oder aequivalent)
- Fallback-Sprache: EN
- Namespace: `translation` (single namespace, flat keys)

### FR-2: Sprachdateien erstellen
- `src/renderer/locales/en.json` — Englische Strings (Primary)
- `src/renderer/locales/de.json` — Deutsche Strings
- JSON-Format, flache oder maximal 1-Level verschachtelte Keys
- Key-Konvention: `component.element.action`, z.B. `statusBar.session.start`
- Dynamisch ladbar ohne Rebuild (i18next lazy loading)

### FR-3: Bestehende Strings extrahieren
Alle hardcodierten UI-Strings aus diesen Komponenten extrahieren:

| Komponente | Pfad |
|---|---|
| BugreportDialog | `src/renderer/components/BugreportDialog.tsx` |
| GridControls | `src/renderer/components/GridControls.tsx` |
| GridPlacementPopup | `src/renderer/components/GridPlacementPopup.tsx` |
| InfoSettingsView | `src/renderer/components/InfoSettingsView.tsx` |
| KickoffDialog | `src/renderer/components/KickoffDialog.tsx` |
| LauncherCell | `src/renderer/components/LauncherCell.tsx` |
| NoteEditor | `src/renderer/components/NoteEditor.tsx` |
| NotesCell | `src/renderer/components/NotesCell.tsx` |
| PaneHeader | `src/renderer/components/PaneHeader.tsx` |
| PersonasTab | `src/renderer/components/PersonasTab.tsx` |
| ProjectCard | `src/renderer/components/ProjectCard.tsx` |
| ProjectPopup | `src/renderer/components/ProjectPopup.tsx` |
| RecoveryDialog | `src/renderer/components/RecoveryDialog.tsx` |
| SessionCell | `src/renderer/components/SessionCell.tsx` |
| SessionDialog | `src/renderer/components/SessionDialog.tsx` |
| SessionGrid | `src/renderer/components/SessionGrid.tsx` |
| SidebarPanel | `src/renderer/components/SidebarPanel.tsx` |
| SidebarWindow | `src/renderer/components/SidebarWindow.tsx` |
| StatusBar | `src/renderer/components/StatusBar.tsx` |
| VoiceControl | `src/renderer/components/VoiceControl.tsx` |
| WorkspacePopup | `src/renderer/components/WorkspacePopup.tsx` |
| WorkspacesTab | `src/renderer/components/WorkspacesTab.tsx` |
| WorkspacesWindow | `src/renderer/components/WorkspacesWindow.tsx` |

**Vorgehen:** Pro Komponente `useTranslation()` Hook verwenden, `t('key')` statt Hardcoded-String.

### FR-4: Sprachumschaltung in Settings
- Dropdown in InfoSettingsView (oder vergleichbare Settings-Sektion)
- Optionen: "English", "Deutsch"
- Sprachwahl in ConfigStore persistieren (`~/.config/cipher-mux/cipher-mux-config.json`)
- Sofortige UI-Aktualisierung bei Sprachwechsel (kein App-Restart)
- IPC-Channel fuer Config-Aenderung (falls noetig)

## Abgrenzung (Out of Scope)

- CLAUDE.md / Persona-Templates NICHT uebersetzen (bleiben in Autorensprache)
- Relay-Sessions sprechen Deutsch (Persona-Eigenschaft, nicht i18n)
- Keine automatische Spracherkennung — User waehlt explizit
- Backend/MCP-Tool-Responses bleiben EN (nur Frontend-Strings)
- Keine Pluralisierung/ICU-Format in Phase 1 (nur einfache Ersetzungen)

## Meta-Requirements

- **Framework:** i18next + preact-i18next (kein Custom-Ansatz)
- **Build:** Vite-kompatibel, Locales als JSON importiert oder dynamisch geladen
- **TypeScript:** Typsichere Keys (i18next typed resources oder zumindest Key-Enum/Konstanten)
- **Kein Breaking Change:** Bestehende Funktionalitaet darf nicht brechen

## Quality Gate

### Testcases

| # | Test | Erwartetes Ergebnis |
|---|---|---|
| T1 | App starten mit `language: 'en'` in Config | Alle UI-Texte auf Englisch |
| T2 | App starten mit `language: 'de'` in Config | Alle UI-Texte auf Deutsch |
| T3 | Sprache in Settings von EN auf DE umschalten | UI aktualisiert sich sofort, kein Restart |
| T4 | Sprache umschalten und App neustarten | Gewahlte Sprache bleibt erhalten |
| T5 | Fehlende Keys in DE | Fallback auf EN-String, kein Crash |
| T6 | `npm run build` | Build erfolgreich, Locales im Bundle |
| T7 | Grep nach hardcodierten deutschen/englischen Strings in .tsx | Keine gefunden (ausser technische Strings wie CSS-Klassen) |

### Code-Qualitaet
- `npm run lint` ohne neue Errors
- `npm run test` gruen
- Konsistente Key-Namenskonvention
- Kein `// @ts-ignore` fuer i18n-Types
- Alle Komponenten verwenden `useTranslation()`, kein direkter String-Import

### Dokumentation
- `CHANGELOG.md` aktualisieren (feat: i18n foundation)
- Kurze Anleitung in `docs/contributing/` wie neue Strings hinzugefuegt werden (Key-Konvention, Workflow)
- `docs/todo.md` aktualisieren

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- Renderer: `src/renderer/`
- Config: `~/.config/cipher-mux/cipher-mux-config.json`
- i18next Docs: https://www.i18next.com/
- preact-i18next: https://react.i18next.com/ (API-kompatibel mit Preact)
