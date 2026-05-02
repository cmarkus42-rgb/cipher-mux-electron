# Plateau-Fixes — Freitesten-Feedback

> Nach Wave 1+2 Commit. Bugs und Feedback aus manuellem Test.

---

## Bugs zu fixen (Prioritaet: hoch → niedrig)

### B1: Companion/Refinement sollen OHNE --resume starten
**Problem:** Entity-Sessions starten mit `--resume`, aber Companion und Refinement sollen frisch starten (nicht alte Sessions fortsetzen).
**Fix:** In `src/main/session/entity-registry.ts` oder wo EntityConfigs definiert werden: `autoResume: false` fuer Companion und Refinement setzen. Orchestrator und MPO koennen weiter mit resume starten.
**Alternativ:** Falls `autoResume` nicht existiert: das Feld in EntityConfig einfuehren und in `startEntity()` auswerten.

### B2: Enter in frisch mit resume geoeffneter Session schliesst sie wieder
**Problem:** Wenn eine Session mit `--resume` gestartet wird und der User Enter drueckt, schliesst sich die Session sofort.
**Analyse:** Moeglicherweise wird `--resume` falsch an den CLI-Aufruf angehaengt, oder Claude Code beendet sich weil keine vorherige Session existiert.
**Fix:** Pruefen wie `--resume` in session-manager.ts verwendet wird. Wenn keine vorherige Session existiert, sollte Claude Code normal starten (nicht crashen). Ggf. `--resume` nur senden wenn tatsaechlich eine vorherige Session existiert, oder den Fehlerfall graceful handlen.

### B4: Fork: "Source session has no Claude session ID — cannot fork"
**Problem:** `forkSession()` braucht eine `claudeSessionId`, aber diese wird nie gesetzt.
**Fix:** In `session-manager.ts` muss `claudeSessionId` aus der Claude-Code-Statusline extrahiert werden. Die Statusline enthaelt die Session-ID — der StatuslineMonitor parst sie bereits. Den geparsten Wert auf `SessionInfo.claudeSessionId` setzen. Dann kann `forkSession()` darauf zugreifen.
**Alternativ:** Falls Statusline-Parsing die Session-ID nicht enthaelt: `claude --status` ausfuehren und Session-ID aus dem Output parsen.

### B5: Notes-Editor springt nach oben im Text
**Problem:** Beim Editieren von Notes springt der CodeMirror-Editor wiederholt zum Textanfang.
**Analyse:** Wahrscheinlich wird der Editor-Content von aussen neu gesetzt (via State-Update), was den Cursor/Scroll-Position zuruecksetzt.
**Fix:** In `NoteEditor.tsx` pruefen ob `doc` oder `state` bei jedem Render neu gesetzt wird. Der Content sollte nur initial gesetzt werden und danach nur ueber CodeMirror's eigene Transaction-API aktualisiert werden. External Updates (z.B. auto-save Feedback) duerfen den Editor-State nicht ersetzen.

### B6: Companion/Refinement aus LauncherCell-Linkliste entfernen
**Problem:** Companion und Refinement erscheinen in der LauncherCell-Linkliste, sollen aber NUR in der StatusBar sein.
**Fix:** In `LauncherCell.tsx` die Entity-Buttons fuer Companion und Refinement entfernen. Sie bleiben nur in der StatusBar.

### B7: Workspace-Save Dialog passt nicht in Fenstergroesse
**Problem:** Der "Save Current as Workspace" Dialog ist zu gross fuer kleinere Fenster.
**Fix:** CSS anpassen — max-height, overflow-y: auto, responsive Design. Dialog sollte scrollbar sein wenn er nicht reinpasst.

### B8: Theme-Editor: Overlay beim Einstellen aussetzen
**Problem:** Das dunkle Overlay (Modal-Backdrop) verdeckt die App waehrend man Theme-Farben einstellt — man sieht die Live-Preview nicht.
**Fix:** Theme-Editor sollte KEIN Modal-Overlay haben. Entweder als Inline-Sektion in Settings (ohne Overlay), oder das Overlay transparent machen / ganz entfernen fuer den Theme-Editor.

### B9: Theme-Editor: "Add Theme" + Theme-Verwaltung
**Problem:** Man kann Farben aendern aber kein Theme unter eigenem Namen speichern. Es fehlt eine einfache Theme-Verwaltung.
**Fix:**
- "Save as..." Button der aktuelles Theme unter neuem Namen speichert
- Theme-Liste mit Custom-Themes (neben den Builtins)
- Delete-Button fuer Custom-Themes
- Themes in ConfigStore persistieren

### B10: Bug/Feature Toggle: Wert muss im Bugreport mitgehen
**Problem:** Der Bug/Feature-Toggle existiert, aber der gewahlte Wert ("bug" vs "feature-request") wird nicht in den Bugreport-Output geschrieben.
**Fix:** In `BugreportDialog.tsx` den Toggle-Wert als `type` Feld in das Bugreport-Frontmatter oder den Bugreport-Body aufnehmen. Der BugreportManager muss den Wert entgegennehmen und in die Note schreiben.

---

### B11: StatusBar Button-Reihenfolge anpassen
**Problem:** Aktuelle Reihenfolge ist nicht optimal.
**Neue Reihenfolge (links nach rechts):** Workspaces → Companion → Refinement → Orchestrator → MPO → **Audit** (NEU) → Bugreport → Sidebar-Toggle → Theme → Info
**Fix:** In `StatusBar.tsx` die Button-Reihenfolge aendern. VoiceControl und GridControls bleiben wo sie sind (ganz links). Die genannten Buttons kommen danach in der neuen Reihenfolge.

### B12: Neue Entity "Audit" — technisches Geruest
**Problem:** Neue Security-Audit-Entity soll als 7. Entity hinzugefuegt werden.
**Scope:** NUR technisches Geruest — die Persona/der System-Prompt wird vom User selbst erstellt.
**Was zu tun ist:**
1. Entity-Verzeichnis erstellen: `~/.config/cipher-mux/entities/audit/` (via entity-assets.ts)
2. Leere CLAUDE.md als Placeholder: "# Audit\n\nSecurity Audit Persona — wird vom User konfiguriert."
3. EntityConfig in entity-registry.ts registrieren:
   - id: `'audit'`
   - displayName: `'Audit'`
   - color: eigene Farbe (Vorschlag: rot-orange, #C0392B oder aehnlich)
   - projectPath: `~/.config/cipher-mux/entities/audit/`
   - autoResume: false
   - visible: true
4. StatusBar-Button "Audit" (zwischen MPO und Bugreport, siehe B11)
5. i18n-Keys: `statusBar.audit`, `entities.audit.displayName`
6. KEIN Companion-Link, KEINE Persona-Injection — nur das Geruest damit der User die CLAUDE.md selbst fuellen kann

## Kein Code-Bug (nur Rebuild noetig)

### B3: Memory MCP-Tools nicht in Binary
**Problem:** mux_notes_search und companion_memory_* Tools fehlen in der laufenden App.
**Ursache:** Binary aelter als Source. Kein Code-Fix noetig — nur `npm run build && npm run start`.

---

## Reihenfolge

1. B1 + B6 (schnell, Entity-Config-Aenderungen)
2. B2 (resume-Bug, blockiert Entity-Start)
3. B4 (Fork-Bug, claudeSessionId tracking)
4. B5 (Notes-Editor scroll, UX-critical)
5. B10 (Bug/Feature type im Output)
6. B8 + B7 (Theme-Editor + Workspace-Dialog CSS)
7. B9 (Theme-Verwaltung, groesstes Feature)

## Quality Gate

- `npm run lint` ohne neue Errors
- `npm run test` gruen (589+ Tests)
- `npm run build` erfolgreich
- Committe NICHT — lass uncommitted

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- Alle Strings i18n-konform (useTranslation + t())
