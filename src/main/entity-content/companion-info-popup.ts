/**
 * Companion info popup deployer.
 *
 * Deploys the how-to-info-popup.md for the Companion entity.
 * Content sourced from ~/.config/cipher-mux/entities/companion/how-to-info-popup.md
 */

import * as fs from 'fs';
import * as path from 'path';

export function deployCompanionInfoPopup(projectPath: string): void {
  const filePath = path.join(projectPath, 'how-to-info-popup.md');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, CONTENT, 'utf-8');
}

const CONTENT = `# cipher-mux Features

## Grid & Sessions

cipher-mux zeigt bis zu 21 Sessions (7 Spalten x 3 Zeilen) in einem flexiblen Grid-Layout. Jede Zelle kann ein Claude-Code-Terminal, einen Markdown-Notiz-Editor oder einen Launcher-Platzhalter enthalten. Zellen lassen sich per Drag & Drop tauschen und vertikal zusammenfassen.

## Sidebar

Vier Tabs auf der rechten Seite: **Nachrichten** (Inter-Session-Chat, sichtbar bei aktivem Workshop), **Hintergrund-Sessions** (laufende Sessions ausserhalb des Grids mit Live-Vorschau), **Eingabe-Anfragen** (Entscheidungen von Entities, sichtbar bei aktiven Entity-Sessions), **Notizen** (Suche und Tag-Filter fuer alle gespeicherten Notizen). Die Sidebar laesst sich als eigenes Fenster abkoppeln.

## Statusleiste

Von links nach rechts: **Spracheingabe** (OFF/STT/COM-Wahlschalter), **Grid-Steuerung** (Spalten/Zeilen hinzufuegen oder entfernen), **Workspaces** (Layout- und Charakter-Editor), **Sidebar** (Ein-/Ausblenden), **Theme** (aktuelles Farbschema, Klick oeffnet Theme-Editor), **einstellungen** (Einstellungen-Dialog), **Version** (rechts).

## Spracheingabe

Lokale Spracherkennung ohne Netzwerk. Silero VAD erkennt Sprache automatisch, Whisper transkribiert lokal. Text erscheint im fokussierten Terminal ohne automatisches Absenden — erst nach Pruefung per Sprachbefehl ("abschicken", "absenden") oder Enter. Weitere Befehle: "neue Zeile" fuer Zeilenumbruch.

## Notizen

CodeMirror-6-Editor mit Live-Markdown-Rendering. YAML-Frontmatter fuer Titel und Tags. Auto-Save nach 2 Sekunden. Manuelles Speichern (Cmd+S) loest Claude-Session-basiertes Auto-Tagging aus (bis zu 5 Tags pro Notiz). Notizen sind global oder workspace-bezogen gespeichert. Sidebar-Tab mit Suchfeld und Tag-Filter-Chips.

## Projekte

**Scanner:** Automatische Erkennung von Projekten in konfigurierten Verzeichnissen (CLAUDE.md als Marker). Zeigt Git-Branch, Aenderungsstatus und SDD-Phase.

**Projekt-Popup:** Drei Bereiche — gefundene Projekte, manueller Pfad, Kickoff fuer neue Projekte.

**Kickoff-Dialog:** Startet den Projekt-Launcher mit optionaler Anforderungsdatei. Der Launcher generiert CLAUDE.md, SPEC.md-Skelett, .claude/-Verzeichnis und startet danach ein Anforderungs-Interview.

## Workspaces & Characters

**Characters** sind Persoenlichkeitsprofile mit Name, Farbe und Prompt. Sie formen den Kommunikationsstil von Voice Relay und Companion. Eingebaute Characters sind gesperrt, eigene Characters frei konfigurierbar.

**Workspaces** sind vorkonfigurierte Grid-Layouts. Im visuellen Editor werden Personas und Projekte pro Zelle zugewiesen. Ein Klick auf "Apply" baut das Grid auf, startet alle Sessions und weist die Rollen zu. Prompt-Aufloesung in drei Stufen: Zell-Prompt > Workspace-Override > Persona-Default.

## Agent-CLIs

Drei Kommandozeilen-KIs koennen in einer Zelle laufen: **Claude Code** (Tier 1, Voreinstellung), **Codex CLI** (Tier 2, gemessen an codex-cli 0.155.1) und **opencode** (Tier 2, gemessen an opencode 1.18.34). Tier 2 heisst: nicht jede Mux-Faehigkeit ist dort gemessen. Unter Codex ist Sub-Agents nicht gemessen; unter opencode fehlen Context-Anzeige und Sub-Agents, Rollengrenzen sind nicht verdrahtet und es gibt keinen Rauchtest gegen die echte CLI.

Gewaehlt wird pro Rolle im Presets-Tab (Feld **CLI**), global unter "einstellungen" → general → **Standard-CLI**. Reihenfolge: Wahl pro Rolle > Default der Rolle > globale Einstellung. Gilt ab dem naechsten Sessionstart der Rolle.

Projektanweisungen liest Claude Code aus \`CLAUDE.md\`, Codex und opencode aus \`AGENTS.md\`. Dem Run-Verzeichnis einer Codex-Rolle traegt der Mux in \`~/.codex/config.toml\` Vertrauen ein — ohne das haengt die Session in einem blockierenden Dialog. Abschaltbar ueber \`agent.codexTrustRunDirs\`.

## Workshop

Delegiert Aufgaben an Worker-Sessions, ueberwacht den Fortschritt und verarbeitet Bug-Reports. Erstellt automatisch neue Sessions fuer Teilaufgaben, sendet Instruktionen ueber tmux, prueft den Kontext-Verbrauch alle 2 Minuten. Bei Fehlschlaegen: bis zu N Wiederholungen, danach Eskalation an den Nutzer ueber die Sidebar.

## Cyber Factory

Zerlegt grosse Anforderungen in sequentielle Wellen (Waves). 11-Phasen-Lebenszyklus: Spec-Lesen, Architektur, Wellenplanung, Wave-Start, Monitoring, Eskalation, Risk-Review, Wave-Abschluss, Testing-Handoff, Debugger-Routing, Abschluss-Bericht.

## Themes

13 Farbschemata: **cipher-ivory**, **cipher-dark**, **blueprint**, **warm-paper**, **gruvbox-dark**, **nord**, **synthwave**, **matrix**, **brutalist**, **high-contrast**, **cvd-deuteranopia**, **cvd-tritanopia**, **cvd-achromatopsia**. Jedes Theme definiert Farben, Geometrie, Schriftarten und Terminal-Palette. Klick auf Theme-Name oeffnet den Theme-Editor.

## Tastenkuerzel

| Kuerzel | Aktion |
|---|---|
| Cmd+B | Bugreport-Dialog oeffnen |
| Cmd+N | Launcher in der ersten leeren Zelle |
| Cmd+Shift+F | Focus Mode an/aus |
| Cmd+Shift+W / A / S / D | Fokus nach oben / links / unten / rechts |
| Cmd+Shift+? | Kuerzelliste zeigen |
| Escape | Focus Mode verlassen, Dialog schliessen |
| Cmd+C | Kopieren / Prozess abbrechen |
| Cmd+V | Einfuegen |
| Ctrl+Shift+Space | **Push-to-talk** -- nur solange Voice laeuft |
| Cmd+S | Notiz speichern + Auto-Tagging |
| Cmd+Alt+I | DevTools |

Zusaetzliche Aktionen per Klick: Zell-Header (Hoehe umschalten, Projekt wechseln, Shell oeffnen, schliessen, per Drag tauschen), Statusleiste (alle Buttons), Sidebar (abkoppeln, Notizen oeffnen, Tags filtern).

## Konfiguration

Einstellungen unter "einstellungen": 7 Tabs — **general**, **sprache**, **themes**, **shortcuts**, **remote**, **a11y**, **about**. Konfiguration gespeichert in \`~/Library/Application Support/cipher-mux-electron/cipher-mux-config.json\`. Die Datei \`~/.config/cipher-mux/config.json\` existiert daneben und wird **nicht** gelesen — wer dort editiert, aendert nichts.

## Einschraenkungen

- Nur macOS (tmux-Abhaengigkeit)
- Maximal 21 Sessions (7x3 Grid)
- Kontext-Warnung ab 80% Auslastung
- Nachrichten-Aufbewahrung: 7 Tage
- Whisper-Modell muss unter \`~/.config/cipher-mux/models/whisper/\` liegen
`;
