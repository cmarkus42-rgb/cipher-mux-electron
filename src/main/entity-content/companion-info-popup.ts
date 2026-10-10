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

cipher-mux zeigt bis zu 21 Sessions (7 Spalten x 3 Zeilen) in einem flexiblen Grid-Layout. Jede Zelle kann ein Terminal mit einer Agent-CLI (Claude Code, Codex oder opencode), einen Markdown-Notiz-Editor oder einen Launcher-Platzhalter enthalten. Zellen lassen sich per Drag & Drop tauschen und vertikal zusammenfassen.

## Sidebar

Fuenf aufklappbare Sektionen: **Notizen** (Suche und Tag-Filter, bei aktivem Workspace auf ihn gefiltert), **Hintergrund-Sessions** (laufende Sessions ausserhalb des Grids mit Live-Vorschau), **Verwaiste Sessions** (nur wenn vorhanden: uebernehmen oder beenden), **Companion Memory** und **Nachrichten** (Message Bus — veraltet, kein Weg, einer Session etwas zu sagen). Die Sidebar laesst sich als eigenes Fenster abkoppeln.

## Statusleiste

Von links nach rechts: **Spracheingabe** (OFF/STT/COM-Wahlschalter), **Grid-Steuerung** (Spalten/Zeilen hinzufuegen oder entfernen), **Workspaces** (Layout- und Charakter-Editor), **Sidebar** (Ein-/Ausblenden), **Theme** (aktuelles Farbschema, Klick oeffnet Theme-Editor), **einstellungen** (Einstellungen-Dialog), **Version** (rechts).

## Spracheingabe

Lokale Spracherkennung ohne Netzwerk. Silero VAD erkennt Sprache automatisch, Whisper transkribiert lokal. Text erscheint im fokussierten Terminal ohne automatisches Absenden — erst nach Pruefung per Sprachbefehl ("abschicken", "absenden") oder Enter. Weitere Befehle: "neue Zeile" fuer Zeilenumbruch.

## Notizen

CodeMirror-6-Editor mit Live-Markdown-Rendering. YAML-Frontmatter fuer Titel und Tags. Auto-Save nach 2 Sekunden. Manuelles Speichern (Cmd+S) loest Auto-Tagging ueber ein lokales Modell (Ollama) aus, beschraenkt auf die Tag-Achsen kind, phase, status, severity, component. workspace und entity setzt der Mux selbst. Notizen sind global oder workspace-bezogen gespeichert. Sidebar-Tab mit Suchfeld und Tag-Filter-Chips.

## Projekte

**Ordner-Start:** Im Launcher (Tab Path) einen Projektordner waehlen, dazu **Workspace** (Standard: ohne) und **CLI** (Standard: die globale). Optionen: Nur Shell, Ohne Rueckfragen, Fortsetzen, Abzweigen.

**Kickoff-Dialog:** Startet den Projekt-Launcher mit optionaler Anforderungsdatei. Der Launcher generiert CLAUDE.md, SPEC.md-Skelett, .claude/-Verzeichnis und startet danach ein Anforderungs-Interview.

## Workspaces & Characters

**Characters** sind Persoenlichkeitsprofile mit Name, Farbe und Prompt. Sie formen den Kommunikationsstil von Voice Relay und Companion. Eingebaute Characters sind gesperrt, eigene Characters frei konfigurierbar.

**Workspaces** sind vorkonfigurierte Grid-Layouts. Im visuellen Editor werden Personas und Projekte pro Zelle zugewiesen. Ein Klick auf "Apply" baut das Grid auf, startet alle Sessions und weist die Rollen zu. Prompt-Aufloesung in drei Stufen: Zell-Prompt > Workspace-Override > Persona-Default.

Jede Session im Workspace — Ordner-Session, Zelle oder Rolle — erfaehrt seinen **Namen**, seine **Projekte** (aus den Zellen) und seine **Kontextordner**. Jede Session traegt ihren eigenen Workspace; Sessions ohne Workspace tragen das Badge "ohne Workspace".

## Agent-CLIs

Drei Kommandozeilen-KIs koennen in einer Zelle laufen: **Claude Code** (Tier 1, Voreinstellung), **Codex CLI** (Tier 2, gemessen an codex-cli 0.155.1) und **opencode** (Tier 2, gemessen an opencode 1.18.35). Tier 2 heisst: nicht jede Mux-Faehigkeit ist dort gemessen — bei beiden sind es nur die Sub-Agents. Context-Anzeige und Rollengrenzen laufen unter allen dreien (bei opencode ueber Plugins). opencode braucht einen angemeldeten Anbieter.

Gewaehlt wird pro Rolle im Presets-Tab (Felder **CLI** und **Modell**), pro Ordner-Session im Launcher, global unter "einstellungen" → general → **Standard-CLI**. Reihenfolge fuer Rollen: Wahl pro Rolle > Default der Rolle (nur Local Worker: opencode) > globale Einstellung. Gilt ab dem naechsten Sessionstart der Rolle.

Projektanweisungen: Claude Code liest \`CLAUDE.md\`, Codex \`AGENTS.md\`, opencode \`AGENTS.md\` wenn vorhanden, sonst \`CLAUDE.md\` — liegt eine \`AGENTS.md\` daneben, liest opencode die \`CLAUDE.md\` gar nicht. Der Mux schreibt in die Datei, die die CLI tatsaechlich liest; fuer Codex legt er eine fehlende \`AGENTS.md\` mit Verweis auf die \`CLAUDE.md\` an. Dem Run-Verzeichnis einer Codex-Rolle traegt der Mux in \`~/.codex/config.toml\` Vertrauen ein — ohne das haengt die Session in einem blockierenden Dialog. Abschaltbar ueber \`agent.codexTrustRunDirs\`.

## Workshop

Koordiniert: verteilt Aufgaben und Bug-Reports an die passenden Sessions, sendet Instruktionen ueber tmux, prueft den Kontext-Verbrauch. Schreibt selbst keinen Produktionscode — seine Rollengrenze sperrt \`src/\`.

## Local Cyber Factory

Claude schneidet zu, ein lokales Modell codet: Die Rolle zerlegt Arbeit in Haeppchen mit je einem Abnahmetest, der **Local Worker** (opencode gegen ein lokales Modell aus \`agent.localWorker\`) schreibt den Code. Ein Laeufer ohne Modell prueft und entscheidet — gruen wird committet, rot zurueckgesetzt, hoechstens zwei Versuche. Braucht \`agent.skipPermissions\`.

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
