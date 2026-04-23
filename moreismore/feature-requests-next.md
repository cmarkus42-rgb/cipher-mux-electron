# Feature Requests — nächste Runde

Gesammelt 2026-04-23. Noch nicht vertieft, nur strukturiert notiert.

## 1. Orchestrator → sichtbare Session öffnen (neuer Use Case)

Eigene Funktion: User sagt dem Orchestrator "mach mal ne Session auf für Projekt X".
- Session wird im Grid geöffnet (nächster freier Slot, vlnr, dann nächste Zeile)
- Fokus wechselt automatisch zur neuen Session
- Abgrenzung: Das ist NICHT dasselbe wie Hintergrund-Worker-Sessions (die bleiben unsichtbar)
- Eigenes MCP-Tool oder eigener Modus von `mux_create_session` (z.B. `visible: true`)

## 2. Chatroom-Kacheln für Hintergrund-Sessions

Hintergrund-Sessions (die der Orchestrator per `mux_create_session` startet) sollen im Chatroom als Kacheln erscheinen.
- Chatroom zeigt Übersicht aller laufenden Worker-Sessions
- Klick auf Kachel → Session ins Grid holen / Fokus setzen
- Abgrenzung: Hintergrund-Sessions tauchen NICHT automatisch im Grid auf

## 3. Workspaces (abspeicherbare Grid-Layouts)

Komplette Grid-Konfiguration als benanntes Workspace speichern & wiederherstellen:
- Grid-Größe (cols × rows)
- Welche Sessions in welchen Slots
- Jede Session kann einen **fixen Startprompt** haben:
  - Für den **Orchestrator** (was soll der Orchestrator mit dieser Session tun)
  - Für den **MPO** (welche Aufgabe bekommt der Worker)
- Workspace per Name laden → Grid baut sich automatisch auf

## 4. Shell-Session-Button (Terminal ohne Claude)

Button an/unter/neben einer Claude-Session:
- Öffnet eine neue Session **im selben Projektpfad**
- Startet **nur ein Terminal** (zsh/bash), **ohne** Claude CLI
- Use Case: `npm run dev`, `git status`, Build-Befehle etc.
- Falls Platz im selben Slot nicht möglich → daneben in nächstem freien Slot
