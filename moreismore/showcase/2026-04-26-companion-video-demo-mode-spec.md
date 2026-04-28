# Spec: Companion Video & Demo Mode — MCP-Tools

**Status:** Implemented (v0.11 Wave 3)
**Datum:** 2026-04-26 (aktualisiert 2026-04-28)
**Kontext:** Companion soll cipher-mux visuell erklaeren koennen — durch Highlighting, Menue-Oeffnen und Theme-Wechsel. Dieses Dokument spezifiziert die MCP-Infrastruktur dafuer.
**Siehe auch:** `companion-demo-skills-vision.md` — Szenarien und Skill-Konzepte (wird spaeter interaktiv ausgearbeitet)

---

## Zusammenfassung

Vier neue MCP-Tools erweitern den Companion um ein Presentation-Layer. Der Companion kann UI-Elemente hervorheben (mit Glow- oder Outline-Effekt), Menues/Dialoge oeffnen/schliessen/toggeln, das Theme wechseln und per TTS sprechen. In Kombination mit den 31 bestehenden MCP-Tools (insgesamt 35 Tools: Grid-Control, Sidebar, Session-Management, Notes, Memory, Tasks) kann er die App komplett erklaeren und vorfuehren.

---

## Design-Entscheidungen

| Entscheidung | Gewaehlt | Alternativen verworfen |
|---|---|---|
| Tool-Umfang | 3 neue Tools (Highlight, Open, Theme) | Vollzugriff-Puppeteer (zu viele Tools), nur Highlight (zu wenig) |
| Element-Identifikation | `data-highlight`-Attribute (semantische IDs) | CSS-Selektoren (fragil), logische Namen mit Mapping-Layer (unnoetige Indirektion) |
| Companion-Rolle | Guide ("zeigt wo es ist") | Puppeteer ("macht es fuer dich") |

---

## Neue MCP-Tools

### `mux_ui_highlight`

Hebt ein UI-Element visuell hervor.

| Parameter | Typ | Required | Beschreibung |
|-----------|-----|----------|-------------|
| `target` | string | ja | Wert des `data-highlight`-Attributs am Element |
| `duration` | number | nein | Millisekunden, Default 3000. `0` = bleibt bis `clear` |
| `style` | enum | nein | `"glow"` (Default) oder `"outline"` |
| `clear` | boolean | nein | `true` = alle aktiven Highlights entfernen |

**Highlight-Styles (implementiert):**

| Style | Rendering | CSS | Einsatz |
|-------|-----------|-----|---------|
| `glow` (Default) | Border-Glow via `box-shadow` | `.highlight-overlay--glow` mit theme-aware `--highlight-color` | Auffaellig, fuer Show-Modus |
| `outline` | Dashed Outline | `.highlight-overlay--outline` mit `2px dashed` | Subtil, fuer Live-Hilfe |

Der Glow-Effekt nutzt `box-shadow` statt eines separaten Overlay-DIV. Die Farbe passt sich automatisch an das aktive Theme an (`--highlight-color` CSS Custom Property). Position wird per `getBoundingClientRect` bei jedem Call und bei resize/scroll neu berechnet.

**Implementierung:**
- HighlightOverlay-Komponente im Renderer (absolute positionierte DIVs)
- Beim Call: `[data-highlight="<target>"]` im DOM suchen, Rect messen, Overlay positionieren
- Nach `duration` automatisch entfernen
- Mehrere Highlights gleichzeitig moeglich, gleiches Target ersetzt vorherigen Highlight
- Reposition auf window resize und scroll (capture phase)
- IPC-Channel: `UI_HIGHLIGHT`

### `mux_ui_open`

Oeffnet, schliesst oder toggelt ein Menue, Popup oder Dialog.

| Parameter | Typ | Required | Beschreibung |
|-----------|-----|----------|-------------|
| `target` | string | ja | Logischer Name des Popups/Dialogs |
| `action` | enum | nein | `"open"`, `"close"`, oder `"toggle"` (Default: `"toggle"`) |
| `context` | object | nein | Zusatzinfo, z.B. `{ cell: "1-0", tab: "voice" }` |

**Actions (implementiert):**
- `toggle` (Default) — Oeffnet geschlossenes Popup, schliesst offenes
- `open` — Oeffnet das Popup (noop wenn schon offen)
- `close` — Schliesst das Popup (noop wenn schon geschlossen)

**Tab-Context:** `context.tab` oeffnet direkt einen bestimmten Tab in tabbaren Dialogen. Beispiel: `{ target: "info-dialog", context: { tab: "voice" } }` oeffnet Settings auf dem Voice-Tab.

**Bekannte Targets (Stand 2026-04-28):**
- `workspace-popup` — Workspace-Auswahl
- `info-dialog` (alias: `settings`) — Settings Dialog mit Tabs (general, appearance, shortcuts, voice, about)
- `launcher-popup` — LauncherCell-Popup (mit `context.cell` fuer Zelle, z.B. `"1-0"`)
- `bugreport-dialog` — Bugreport-Dialog

Neue Targets werden ergaenzt wenn neue Dialoge entstehen. Die App loest den Namen auf den existierenden Open-Pfad auf — kein neues Routing noetig. Unbekannte Targets geben einen Fehler zurueck mit Liste der bekannten.

**IPC-Channel:** `UI_OPEN`

### `mux_theme_set`

Wechselt das aktive Theme.

| Parameter | Typ | Required | Beschreibung |
|-----------|-----|----------|-------------|
| `theme` | string | ja | Theme-ID |

**Gueltige Theme-IDs:** `cipher-ivory`, `cipher-dark`, `blueprint`, `warm-paper`, `gruvbox-dark`, `nord`, `synthwave`, `matrix`, `brutalist`, `high-contrast`

Setzt `body[data-theme]` und persistiert in ConfigStore. Gleiche Logik wie der bestehende Theme-Klick in der StatusBar.

**IPC-Channel:** `THEME_SET`

---

## `data-highlight` Namensschema

Statt einer fixen Liste definiert die Spec ein Namensschema. Konkrete Werte werden beim Implementieren an die UI-Elemente geklebt.

| Kategorie | Muster | Beispiele |
|-----------|--------|-----------|
| StatusBar-Controls | `sb-{control}` | `sb-voice`, `sb-grid`, `sb-workspaces`, `sb-sidebar`, `sb-theme`, `sb-info` |
| Grid-Zellen | `cell-{col}-{row}` | `cell-0-0`, `cell-2-1` |
| Zellen-Header | `cell-head-{col}-{row}` | Buttons-Bereich einer Zelle |
| Sidebar-Sektionen | `side-{section}` | `side-messages`, `side-background`, `side-notes`, `side-requests`, `side-memory` |
| Sidebar-Notes (dynamisch) | `side-note-{id}` | `side-note-abc123` — einzelne Note in der Sidebar-Liste |
| Sidebar-Sessions (dynamisch) | `side-session-{id}` | `side-session-xyz789` — Background-Session-Card |
| Popups/Dialoge | `popup-{name}` | `popup-workspace`, `popup-launcher`, `popup-info` |
| Popup-Inhalte | `popup-{name}-{part}` | `popup-launcher-presets`, `popup-launcher-path` |

**Dynamische Targets (NEU):** `side-note-{id}` und `side-session-{id}` erlauben das Highlighting einzelner Notes oder Background-Sessions in der Sidebar. Die ID kommt aus der Note/Session und wird als `data-highlight`-Attribut auf das jeweilige DOM-Element gesetzt.

Neue UI-Elemente bekommen ein `data-highlight` wenn sie highlightbar sein sollen. Keine zentrale Registry noetig.

---

## Bestehende MCP-Tools (werden mitgenutzt)

Der Companion nutzt fuer Demo-Szenarien auch diese existierenden Tools:

**Grid-Control (5):** `mux_grid_resize`, `mux_grid_place`, `mux_session_focus`, `mux_session_eject`, `mux_sidebar_toggle`

**Session-Management (5):** `mux_create_session`, `mux_kill_session`, `mux_sessions`, `mux_status`, `mux_context_usage`

**Notes (8):** `mux_notes_create`, `mux_notes_list`, `mux_notes_read`, `mux_notes_update`, `mux_notes_search`, `mux_notes_delete`, `mux_notes_handoff_create`, `mux_notes_handoff_search`

**Memory (4):** `companion_memory_write`, `companion_memory_recall`, `companion_memory_search`, `companion_memory_forget`

**Messaging (2):** `mux_send`, `mux_read`

**Tasks (4):** `mux_task_create`, `mux_task_update`, `mux_task_list`, `mux_task_get`

**Voice (1):** `mux_tts_speak`

**Other (2):** `kickoff_complete`, `mux_bugreport_resolve`, `mux_input_request_create`

---

## Implementierungs-Reihenfolge

1. **`data-highlight`-Attribute** an UI-Elemente kleben (reine DOM-Aenderungen, kein Logik-Impact)
2. **Highlight-Overlay** im Renderer bauen (CSS-Layer + IPC-Handler)
3. **`mux_ui_highlight`** in mcp-tools.ts registrieren
4. **`mux_ui_open`** registrieren (delegiert an bestehende Dialog-Open-Logik)
5. **`mux_theme_set`** registrieren (delegiert an bestehende Theme-Logik)
6. **Manueller Test** — Companion-Session starten, Tools einzeln ausprobieren

---

## Abgrenzung

**In Scope:**
- Drei neue MCP-Tools
- `data-highlight`-Attribute an UI-Elementen
- Highlight-Overlay (CSS Glow/Outline)

**Out of Scope (V1):**
- Spotlight/Dimming (alles ausser Fokus abdunkeln)
- Tooltips/Callouts an Elementen
- Pfeil/Pointer-Overlays
- Companion bedient Dialoge (er oeffnet sie nur)
- Deterministische Script-Engine
- Video-Export/Recording aus der App

**Separat geplant (siehe companion-demo-skills-vision.md):**
- Companion-Skills fuer Showreel, How-To-Clips
- Live-Hilfe-Verhalten
- Onboarding-Tour

---

## Risiken

| Risiko | Mitigation |
|--------|-----------|
| Highlight-Position stimmt nicht (Scrolling, Resize) | Positionierung per `getBoundingClientRect` beim Call, nicht gecacht |
| Element mit `data-highlight` existiert nicht mehr | Tool gibt Fehler zurueck, Companion kann darauf reagieren |
| MCP-Latenz stoert Live-Hilfe | Fuer V1 akzeptabel — Highlight erscheint halt 200-500ms spaeter |
| Glow/Outline sieht je nach Theme schlecht aus | Highlight-Farbe theme-aware machen (CSS Custom Property) |
