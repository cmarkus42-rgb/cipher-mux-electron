# Feature Request — Companion Video & Demo Mode

**Status:** IN ARBEIT
**Erstellt:** 2026-04-26, Companion-Session (Abnahme v0.11)

## Vision

Der Companion kann cipher-mux vollstaendig fernsteuern und dabei erklaeren was passiert. Das ermoeglicht drei Szenarien: Showreel-Videos, How-To-Erklaervideos, und interaktives Live-Onboarding innerhalb der App.

## Voraussetzungen

### MCP-Steuerung (existiert, muss stabil sein)

Companion braucht zuverlaessigen Zugriff auf alle UI-steuernden MCP-Tools:
- Session-Lifecycle (spawn, kill, resume)
- Grid-Steuerung (place, move, resize)
- Sidebar (open, close, navigate)
- Workspaces (load, switch)
- Notes (open, create)
- Dialoge (Settings, Unified Dialog)

### UI-Highlighting (NEU — muss gebaut werden)

Companion muss Aufmerksamkeit auf UI-Elemente lenken koennen:
- Element-Highlight (Rahmen, Glow, Pulsieren)
- Pfeil/Pointer auf ein Element
- Bereich dimmen (alles ausser Fokus-Element abdunkeln)
- Tooltip/Callout an Element heften

Moegliches MCP-Tool: `ui_highlight({ selector, style, duration })`

### Orchestrierungs-Skills (NEU — fuer zusammenhaengende Ablaeufe)

Statt 30 einzelne MCP-Calls: Skills die eine Szene abfahren.
- `onboarding-tour` — Erstnutzer-Fuehrung durch die App
- `show-feature --name grid` — einzelnes Feature vorfuehren
- `video-scene --id intro` — vorgeskriptete Szene fuer Videoproduktion

---

## Szenario 1: Showreel / Trailer

**Ziel:** 60-90 Sekunden Video das begeistert. "Schau was cipher-mux kann."

### Konzept-Vorschlag: "The AI That Runs Itself"

**Eroeffnung (0-10s)**
- Leerer Bildschirm, nur cipher-mux Logo
- Text erscheint: "Was waere, wenn deine Entwicklungsumgebung sich selbst erklaeren koennte?"

**Act 1: Erwachen (10-25s)**
- Companion spawnt sich selbst in eine Zelle
- Schreibt: "Hallo. Ich bin dein Companion. Lass mich dir zeigen, was hier geht."
- Spawnt eine zweite Session — ein echtes Projekt wird geoeffnet
- Grid fuellt sich: 2 Sessions, Companion links, Projekt rechts

**Act 2: Orchestrierung (25-45s)**
- Companion: "Ein Projekt? Langweilig. Lass uns drei gleichzeitig machen."
- Orchestrator spawnt, 3 Worker-Sessions erscheinen
- Grid geht auf 3x2, alles fuellt sich
- Terminals scrollen, Code wird geschrieben
- Sidebar oeffnet sich: Message-Bus zeigt Koordination in Echtzeit

**Act 3: Kontrolle (45-65s)**
- Companion: "Zu viel? Kein Problem."
- Workspace wird geladen — vordefiniertes Layout, zack
- Companion: "Zu wenig?" — zweiter Workspace, anderes Layout
- Theme wechselt — visueller Punch

**Abschluss (65-80s)**
- Alle Sessions stoppen bis auf Companion
- Companion: "Das war ich. Stell dir vor, was du damit machst."
- cipher-mux Logo, URL

### Produktionshinweise
- Latenzen zwischen MCP-Calls werden rausgeschnitten
- Companion-Text kann als Voice-Over eingesprochen oder als Terminal-Output gezeigt werden
- Musik/Sound-Design separat
- Schnitt-Tempo: zuegig, kein Leerlauf

---

## Szenario 2: How-To Erklaervideo(s)

**Ziel:** Kurze, fokussierte Clips (2-5 Min) die jeweils ein Feature erklaeren.

### Clip-Vorschlaege

**Clip 1: "Deine erste Session" (2 Min)**
- Leeres Grid → LauncherCell erklaeren (Highlight)
- Projekt oeffnen → was passiert im Hintergrund (tmux, Claude Code)
- Erste Eingabe machen → Claude antwortet
- Session schliessen

**Clip 2: "Das Grid verstehen" (3 Min)**
- Spalten/Zeilen anpassen (Highlight auf +/- Buttons)
- Sessions verschieben (Drag zeigen)
- RowSpan (Zelle auf volle Hoehe)
- Hintergrund-Sessions erklaeren

**Clip 3: "Workspaces — Setup in einem Klick" (2 Min)**
- Workspace-Editor oeffnen (Highlight)
- Bestehendes Workspace laden
- Neues Workspace erstellen
- Als Default setzen

**Clip 4: "Der Orchestrator" (3 Min)**
- Was ist ein Orchestrator? (Analogie: Fluglotse)
- Orchestrator starten, Aufgabe geben
- Beobachten wie Worker-Sessions entstehen
- Message-Bus: Koordination live sehen

**Clip 5: "Companion — dein Guide" (2 Min)**
- Companion oeffnen, Begruessung
- Frage stellen, Antwort bekommen
- Companion oeffnet ein Feature und erklaert es (Live-Highlighting)
- Memory: "Er merkt sich was du brauchst"

### Produktionshinweise
- Jeder Clip ist eigenstaendig, kein Vorwissen noetig
- Companion fuehrt und erklaert (Text im Terminal oder Voice-Over)
- UI-Highlighting zeigt wo man hinschauen soll
- Am Ende jedes Clips: "Naechster Schritt: [Link zum naechsten Clip]"

---

## Szenario 3: Live-Onboarding in der App

**Ziel:** Erstnutzer wird beim ersten Start interaktiv durch die App gefuehrt.

- Companion startet automatisch (startupGreeting)
- Fragt: "Erste Mal hier? Soll ich dir alles zeigen?"
- Bei Ja: `onboarding-tour` Skill startet
- Companion highlightet Elemente, erklaert, wartet auf User-Interaktion
- Am Ende: User-Profil wird angelegt, Companion weiss Bescheid

Das ist der hochwertigste Case — aber auch der mit den hoechsten Anforderungen an Latenz und UI-Highlighting-Qualitaet.

---

## Abhaengigkeiten

```
MCP-Tools stabil → UI-Highlighting bauen → Skills schreiben → Videos produzieren
                                         → Live-Onboarding bauen
```

## Risiken

| Risiko | Mitigation |
|--------|-----------|
| MCP-Latenz zu hoch fuer Live-Onboarding | Fuer Videos egal (Schnitt), fuer Live: MCP-Calls batchen |
| UI-Highlighting komplex | Einfach anfangen: nur Rahmen/Glow, kein Dimming |
| Skill-Skripte veralten bei UI-Aenderungen | Skills muessen gepflegt werden wie Tests |
| Companion-Text langweilig | Wayne-Persona nutzen, Humor reinbringen |
