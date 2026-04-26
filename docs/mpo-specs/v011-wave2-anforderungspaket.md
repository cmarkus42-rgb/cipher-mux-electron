# v0.11 Wave 2 — Anforderungspaket

> MPO-Dispatch-Paket | Stand: 2026-04-26 14:00
> Kontext: v0.11 Wave 1 (Stability) ist committed. 4 Tests failen (session-recovery, bugreport-source).
> Ziel: Alles was den User beim Testen blockiert beheben + Kern-UX-Verbesserungen.

---

## Priorisierung: Was zuerst testbar sein muss

1. **Test-Fixes** — 4 failende Tests reparieren (Blocker fuer Commits)
2. **Sidebar vereinfachen** — auto-hide raus, nur manueller Toggle
3. **Unified Session Dialog** — der groesste UX-Umbau
4. **Companion Startup-Greeting verdrahten**
5. **Build + Testcases**

---

## SP-A: Test-Fixes (Blocker)

### A1: session-recovery Tests fixen

3 Tests in `test/main/session-recovery.test.ts` (Zeilen 195, 231, 270) failen mit `actual: 0, expected: 1/2`.
Die v0.11 Worker haben `session-manager.ts` stark umgebaut (Recovery-Logik).

**Aufgabe:** Tests lesen, gegen neuen Code abgleichen, Assertions anpassen oder fehlende Logik nachziehen.

### A2: bugreport-source Test fixen

1 Test in `test/main/bugreport-source.test.ts` (Zeile 65) failt.

**Aufgabe:** Gleich wie A1.

### Quality Gate
- `npm run test` → 0 Failures
- `npm run build` → sauber

---

## SP-B: Sidebar Toggle vereinfachen

### Anforderung
Die Sidebar soll NUR ueber einen manuellen Toggle-Button ein/ausgeschaltet werden. KEIN auto-hide wenn leer. Der User entscheidet selbst.

### Was aendern
- `src/renderer/app.tsx`: `sidebarHasContent`-Logik und alle Stellen die `setSidebarVisible` automatisch setzen entfernen
- `sidebarVisible` default `true` beibehalten
- StatusBar Toggle-Button bleibt
- Sidebar zeigt "Keine aktiven Hintergrund-Sessions" wenn leer (statt zu verschwinden)

### Quality Gate
- Sidebar bleibt sichtbar auch wenn keine Sessions im Hintergrund
- Toggle-Button schaltet sie manuell ein/aus
- App-Neustart: Sidebar-State wird nicht persistiert (immer sichtbar)

---

## SP-C: Unified Session Dialog

### Ueberblick
SessionDialog, ProjectPopup und die Entity-Start-Buttons in der StatusBar werden durch EINEN Dialog ersetzt: **UnifiedSessionDialog**.

### Oeffnen
- StatusBar: Neuer "+" Button (ersetzt die einzelnen Entity-Buttons fuer Companion, Refinement, Voice, Audit)
- Orchestrator und MPO behalten eigene Buttons (sind Meta-Entities, keine User-Sessions)
- Bugreport behalt eigenen Button
- Keyboard-Shortcut: `Cmd+N`

### Dialog-Layout (2 Tabs)

#### Tab 1: Presets
Liste der verfuegbaren Presets (Entities):
- **Companion** — Coding-Berater, Memory, How-To Guides
- **Refinement** — Ideation, Brainstorming, Scope-Analyse
- **Voice** — Sprach-Konversation (Background-Session)
- **Audit** — Code-Audit mit 4-Phasen-Report

Jedes Preset zeigt:
- Name + kurze Beschreibung (1 Zeile)
- Farbcodierung (Entity-Farbe als Akzent)
- "Start"-Button

Kein Emoji/Icon — nur Text + Farbe (Design-Direktive: Pixel-Art kommt spaeter, erstmal clean text).

#### Tab 2: Pfad-Session
Freie Session an einem beliebigen Pfad starten:
- **Pfad-Auswahl:** FolderPickerInput (Browse-Button + Textfeld)
- **Favoriten/Zuletzt:** Liste der letzten 5 gewaehlten Pfade (aus config-store). Klick uebernimmt Pfad.
- **Start-Optionen** (Checkboxes/Toggles):
  - `Claude starten` (default: an) — wenn aus: nur Shell im Ordner
  - `--resume` (default: aus) — letzte Konversation fortsetzen
  - `--dangerously-skip-permissions` (default: aus) — Permissions ueberspringen
- "Start"-Button

### Nach dem Start
- Session wird erstellt
- Grid-Placement-Popup fragt wo die Session platziert werden soll
- Bei Presets die als Background laufen sollen (Voice): direkt in Background, kein Grid-Placement

### Was wegfaellt
- `SessionDialog.tsx` — geloescht (ersetzt durch UnifiedSessionDialog)
- `ProjectPopup.tsx` — geloescht (ersetzt durch Tab 2)
- Entity-Start-Buttons in StatusBar fuer Companion, Refinement, Voice, Audit — weg
- `KickoffDialog.tsx` — bleibt erstmal (wird vom Launcher/Orchestrator genutzt, nicht vom User direkt)

### Was bleibt in der StatusBar
- **Workspaces** Button (oeffnet WorkspacesWindow)
- **Orchestrator** Button (startet/oeffnet Orchestrator)
- **MPO** Button (startet/oeffnet MPO)
- **"+"** Button (oeffnet UnifiedSessionDialog)
- **Bugreport** Button (oeffnet BugreportDialog)
- Sidebar Toggle Button (rechts)

### Favoriten/Recents Datenmodell
```ts
// In config-store.ts
recentPaths: string[]  // max 10, neueste zuerst
```
Beim Start einer Pfad-Session: Pfad an den Anfang von `recentPaths` pushen (Duplikate entfernen).

### IPC
- Bestehende Session-Start-Logik wiederverwenden (`session:create` oder `entity:start`)
- Neuer IPC-Channel: `config:get-recent-paths` / `config:add-recent-path`

### Dateien
- Neu: `src/renderer/components/UnifiedSessionDialog.tsx`
- Aendern: `src/renderer/app.tsx` (Dialog-State, StatusBar-Props)
- Aendern: `src/renderer/components/StatusBar.tsx` (Buttons umbauen)
- Aendern: `src/main/ipc-hub.ts` (Recent-Paths IPC)
- Aendern: `src/main/config/config-store.ts` (recentPaths Feld)
- Aendern: `src/main/preload.ts` (Recent-Paths API exposen)
- Aendern: `src/shared/ipc-channels.ts` (neue Channel-Namen)
- Loeschen: `src/renderer/components/SessionDialog.tsx`
- Loeschen: `src/renderer/components/ProjectPopup.tsx`
- Ggf. loeschen: `src/renderer/components/FolderPickerInput.tsx` (in UnifiedSessionDialog integrieren oder als Sub-Komponente behalten)

### Styling
- Modal-Dialog (wie GridPlacementPopup)
- Tab-Switcher oben (Presets | Pfad-Session)
- Konsistent mit bestehendem Dark-Theme
- Keine Emojis, keine Icons — clean text, Farb-Akzente

---

## SP-D: Companion Startup-Greeting

### Anforderung
Wenn eine Companion-Session gestartet wird, soll automatisch eine Begruessung gesendet werden. Der `startupGreeting`-Wert existiert bereits in der Entity-Config (`'Hey, kannst du mir was erklaeren?'`), wird aber nicht verdrahtet.

### Was aendern
- `src/main/session/session-manager.ts`: Nach erfolgreichem `startEntity()` fuer Entities mit `startupGreeting`: per `tmux send-keys` den Greeting-Text in die Session senden + Enter
- Delay: 3-5 Sekunden nach Session-Start (Claude Code muss erst bereit sein)
- Nur bei NEUEM Start, nicht bei Recovery

### Quality Gate
- Companion starten → nach ~5s erscheint die Begruessung im Terminal
- Andere Entities ohne `startupGreeting` → kein Greeting

---

## SP-E: Build + Testcases

### Anforderung
Am Ende muessen folgende Testcases manuell pruefbar sein:

#### Unified Session Dialog
- [ ] "+" Button in StatusBar sichtbar
- [ ] Klick oeffnet Dialog mit 2 Tabs
- [ ] Tab "Presets": 4 Entities gelistet (Companion, Refinement, Voice, Audit)
- [ ] Preset klicken → Session startet → Grid-Placement fragt wo
- [ ] Tab "Pfad-Session": Pfad-Eingabe + Browse + Recents
- [ ] Pfad waehlen → Start → Session startet
- [ ] Start-Optionen: Claude an/aus, --resume, --skip-permissions
- [ ] Dialog hat Cancel/Schliessen
- [ ] Alte SessionDialog/ProjectPopup Buttons sind weg

#### Sidebar
- [ ] Sidebar sichtbar bei App-Start
- [ ] Toggle-Button schaltet ein/aus
- [ ] Sidebar zeigt Meldung wenn leer (nicht unsichtbar)

#### Companion Greeting
- [ ] Companion starten → Begruessung erscheint nach ~5s
- [ ] Refinement starten → keine Begruessung (kein startupGreeting)

#### Tests + Build
- [ ] `npm run test` → 0 Failures
- [ ] `npm run build` → sauber
- [ ] `npm run dist` → gepackte App laeuft

---

## Abhaengigkeiten & Reihenfolge

```
SP-A (Test-Fixes)  ──────→  [Commit-faehig]
SP-B (Sidebar)     ──────→  [Commit-faehig]
SP-C (Unified Dialog) ───→  [Groesster Aufwand, 1-2 Worker]
SP-D (Greeting)    ──────→  [Unabhaengig, klein]
SP-E (Build+Test)  ──────→  [Ganz am Ende]
```

SP-A und SP-B sind unabhaengig und schnell. SP-C ist der Hauptbrocken. SP-D ist ein Quick-Win. SP-E validiert alles.

---

## Hinweise fuer Worker

- **NICHT committen** — MPO committed am Ende nach Validierung
- **npm run test + npm run build** als Quality Gate nach jeder Aenderung
- **Bestehende Tests nicht loeschen** — anpassen wenn Logik sich geaendert hat
- **Keine Emojis** in UI-Texten (Design-Direktive)
- **i18n-Keys** fuer alle neuen UI-Texte (de.json + en.json)
- **FolderPickerInput** wiederverwenden wenn moeglich
- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
