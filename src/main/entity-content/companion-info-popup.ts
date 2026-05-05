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
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, CONTENT, 'utf-8');
}

const CONTENT = `# cipher-mux Features

## Grid & Sessions

cipher-mux zeigt bis zu 21 Sessions (7 Spalten x 3 Zeilen) in einem flexiblen Grid-Layout. Jede Zelle kann ein Claude-Code-Terminal, einen Markdown-Notiz-Editor oder einen Launcher-Platzhalter enthalten. Zellen lassen sich per Drag & Drop tauschen und vertikal zusammenfassen.

## Sidebar

Vier Tabs auf der rechten Seite: **Nachrichten** (Inter-Session-Chat, sichtbar bei aktivem Orchestrator), **Hintergrund-Sessions** (laufende Sessions ausserhalb des Grids mit Live-Vorschau), **Eingabe-Anfragen** (MPO-Entscheidungen, sichtbar bei aktivem MPO), **Notizen** (Suche und Tag-Filter fuer alle gespeicherten Notizen). Die Sidebar laesst sich als eigenes Fenster abkoppeln.

## Statusleiste

Von links nach rechts: **Spracheingabe** (Push-to-Talk mit LED-Status), **Grid-Steuerung** (Spalten/Zeilen hinzufuegen oder entfernen), **Workspaces** (Layout- und Persona-Editor), **Orchestrator** (Start/Stop mit Aktivitaets-Indikator), **MPO** (Multi-Projekt-Orchestrator), **Bugreport** (Bug-Meldung mit Sprach-Interview und Screenshot), **Sidebar** (Ein-/Ausblenden), **Theme** (durch 10 Farbschemata wechseln), **Info** (Einstellungen und Shortcuts), **Version** (rechts).

## Spracheingabe

Lokale Spracherkennung ohne Netzwerk. Silero VAD erkennt Sprache automatisch, Whisper transkribiert lokal. Text erscheint im fokussierten Terminal ohne automatisches Absenden — erst nach Pruefung per Sprachbefehl ("abschicken", "absenden") oder Enter. Weitere Befehle: "neue Zeile" fuer Zeilenumbruch.

## Notizen

CodeMirror-6-Editor mit Live-Markdown-Rendering. YAML-Frontmatter fuer Titel und Tags. Auto-Save nach 2 Sekunden. Manuelles Speichern (Cmd+S) loest Ollama-basiertes Auto-Tagging aus (bis zu 5 Tags pro Notiz). Notizen sind global oder workspace-bezogen gespeichert. Sidebar-Tab mit Suchfeld und Tag-Filter-Chips.

## Projekte

**Scanner:** Automatische Erkennung von Projekten in konfigurierten Verzeichnissen (CLAUDE.md als Marker). Zeigt Git-Branch, Aenderungsstatus und SDD-Phase.

**Projekt-Popup:** Drei Bereiche — gefundene Projekte, manueller Pfad, Kickoff fuer neue Projekte.

**Kickoff-Dialog:** Startet den Projekt-Launcher mit optionaler Anforderungsdatei. Der Launcher generiert CLAUDE.md, SPEC.md-Skelett, .claude/-Verzeichnis und startet danach ein Anforderungs-Interview.

## Workspaces & Personas

**Personas** sind Rollen mit Name, Farbe und Standard-Prompt. Eingebaute Personas (Orchestrator, MPO, Worker) sind gesperrt, eigene Personas frei konfigurierbar. Personas werden automatisch als Claude-Code-Skills synchronisiert.

**Workspaces** sind vorkonfigurierte Grid-Layouts. Im visuellen Editor werden Personas und Projekte pro Zelle zugewiesen. Ein Klick auf "Apply" baut das Grid auf, startet alle Sessions und weist die Rollen zu. Prompt-Aufloesung in drei Stufen: Zell-Prompt > Workspace-Override > Persona-Default.

## Orchestrator

Delegiert Aufgaben an Worker-Sessions, ueberwacht den Fortschritt und verarbeitet Bug-Reports. Erstellt automatisch neue Sessions fuer Teilaufgaben, sendet Instruktionen ueber tmux, prueft den Kontext-Verbrauch alle 2 Minuten. Bei Fehlschlaegen: bis zu N Wiederholungen, danach Eskalation an den Nutzer ueber die Sidebar.

## MPO (Multi-Projekt-Orchestrator)

Zerlegt grosse Anforderungen in unabhaengige Teil-Projekte. 10-Phasen-Lebenszyklus: Anforderungs-Validierung, Zerlegung, Detail-Spezifikation, wellenbasierter Session-Start, Monitoring (7-Minuten-Zyklen), autonome Beantwortung (Level 1-4), Eskalation an den Nutzer (Level 5), Fortschritts-Tracking, Abschluss-Zusammenfassung.

## Themes

10 Farbschemata: **cipher-ivory** (helles Standard), **cipher-dark** (dunkles Standard), **blueprint** (Ingenieur-Entwurf), **warm-paper** (Sepia), **gruvbox-dark** (Retro), **nord** (skandinavisch kuehl), **synthwave** (80er Neon), **matrix** (Phosphor-Gruen), **brutalist** (Schwarz-Weiss mit Signalrot), **high-contrast** (WCAG AAA). Jedes Theme definiert Farben, Geometrie, Schriftarten und Terminal-Palette.

## Tastenkuerzel

| Kuerzel | Aktion |
|---|---|
| Cmd+B | Bugreport-Dialog oeffnen |
| Escape | Dialog schliessen |
| Cmd+C | Kopieren / Prozess abbrechen |
| Cmd+V | Einfuegen |
| Ctrl+Shift+Space | Spracheingabe umschalten |
| Cmd+S | Notiz speichern + Auto-Tagging |
| Cmd+Enter | Eingabe-Anfrage beantworten |

Zusaetzliche Aktionen per Klick: Zell-Header (Hoehe umschalten, Projekt wechseln, Shell oeffnen, schliessen, per Drag tauschen), Statusleiste (alle Buttons), Sidebar (abkoppeln, Notizen oeffnen, Tags filtern).

## Konfiguration

Einstellungen unter "info" > "einstellungen": **Scan-Pfade** fuer Projekt-Erkennung (Tiefe 1-5), **Agent-Berechtigungen** (Skip-Permissions-Toggle), **Theme-Auswahl**. Konfiguration gespeichert in \\\`~/.config/cipher-mux/cipher-mux-config.json\\\`.

## Einschraenkungen

- Nur macOS (tmux-Abhaengigkeit)
- Maximal 21 Sessions (7x3 Grid)
- Kontext-Warnung ab 80% Auslastung
- Nachrichten-Aufbewahrung: 7 Tage
- Whisper-Modell muss unter \\\`~/.config/cipher-mux/models/whisper/\\\` liegen
`;
