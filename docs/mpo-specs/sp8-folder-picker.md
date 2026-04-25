# SP-8: Folder-Picker — Detail-Spec

> MPO Sub-Projekt 8 | Wave 3 | Aufwand: ~0.5d
> Betrifft: SessionDialog, ProjectPopup, KickoffDialog, ipc-hub, preload

---

## Ziel

Native Folder-Picker-Dialog ueberall wo Projekt-Pfade eingegeben werden. Aktuell: manuelle Texteingabe. Neu: Button neben dem Textfeld oeffnet nativen macOS Folder-Dialog.

## Kontext

- Electron hat `dialog.showOpenDialog()` mit `properties: ['openDirectory']`
- Aktuell muessen User Pfade manuell eintippen oder per Drag&Drop — fehleranfaellig
- Betrifft mindestens: SessionDialog (neue Session), ProjectPopup (Projekt-Pfad), KickoffDialog

## Was neu kommt

### A1: IPC-Channel fuer Folder-Dialog (main)
- Neuer IPC-Handler in `ipc-hub.ts`:
  ```ts
  ipcMain.handle('dialog:open-folder', async (_event, options?: { defaultPath?: string }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      defaultPath: options?.defaultPath || os.homedir(),
    })
    if (result.canceled) return null
    return result.filePaths[0]
  })
  ```
- In `preload.ts` exposen: `openFolderDialog: (options?) => ipcRenderer.invoke('dialog:open-folder', options)`
- In `ipc-channels.ts` den Channel-Namen registrieren

### A2: FolderPickerInput Komponente (renderer)
- Neue Komponente: `src/renderer/components/FolderPickerInput.tsx`
- Props: `value: string`, `onChange: (path: string) => void`, `placeholder?: string`
- Layout: Textfield + Browse-Button (📁) rechts daneben
- Browse-Button ruft `window.electronAPI.openFolderDialog()` auf
- Ergebnis setzt den Wert im Textfield
- Textfield bleibt editierbar (Copy-Paste weiterhin moeglich)
- Styling: konsistent mit bestehenden Input-Feldern

### A3: Integration in bestehende Dialoge
- **SessionDialog.tsx** — Projekt-Pfad-Feld durch FolderPickerInput ersetzen
- **ProjectPopup.tsx** — Projekt-Pfad-Feld durch FolderPickerInput ersetzen
- **KickoffDialog.tsx** — Falls Pfad-Eingabe vorhanden, ebenfalls ersetzen
- Bestehende Logik (Validation, State) bleibt unveraendert — nur das Input-Element aendern

### A4: Favorites & Recents (optional, nice-to-have)
- Letzte 5 gewaehlte Pfade merken (in config-store)
- Dropdown am Browse-Button mit Recents
- **NUR wenn Zeit uebrig** — Basis-Funktionalitaet hat Prioritaet

## Reihenfolge

1. A1 (IPC) → A2 (Komponente) → A3 (Integration)
2. A4 nur wenn A1-A3 sauber fertig

## Quality Gate

| # | Kriterium | Pruefung |
|---|---|---|
| Q1 | IPC funktioniert | `dialog:open-folder` oeffnet nativen Dialog |
| Q2 | Komponente rendert | FolderPickerInput zeigt Textfeld + Button |
| Q3 | Dialog-Ergebnis | Gewahlter Pfad erscheint im Textfeld |
| Q4 | Alle Dialoge umgestellt | SessionDialog, ProjectPopup, KickoffDialog nutzen FolderPickerInput |
| Q5 | Manuelle Eingabe weiterhin moeglich | Textfeld bleibt editierbar |
| Q6 | Tests gruen | `npm run test` |
| Q7 | Build sauber | `npm run build` |

## Testcases

1. SessionDialog oeffnen → Browse-Button klicken → nativer Dialog erscheint → Ordner waehlen → Pfad im Feld
2. Dialog abbrechen → Feld bleibt unveraendert
3. Pfad manuell eintippen → funktioniert wie bisher
4. ProjectPopup → Browse → gleiche Funktionalitaet

## Referenzen

- Repo: `/Users/Shared/Nextcloud/Claude/ClaudeCode01/cipher-mux-electron/`
- SessionDialog: `src/renderer/components/SessionDialog.tsx`
- ProjectPopup: `src/renderer/components/ProjectPopup.tsx`
- KickoffDialog: `src/renderer/components/KickoffDialog.tsx`
- ipc-hub: `src/main/ipc-hub.ts`
- preload: `src/main/preload.ts`
