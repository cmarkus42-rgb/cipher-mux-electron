/**
 * Companion guides deployer.
 *
 * Deploys 10 guide files for the Companion entity:
 * - 7 thematic guides (from verified Note content, 2026-05-11)
 * - 3 prompting guides (04-06, legacy references fixed)
 */

import * as fs from 'fs';
import * as path from 'path';

export function deployCompanionGuides(projectPath: string): void {
  const guidesDir = path.join(projectPath, 'guides');

  const files: Array<{ name: string; content: string }> = [
    { name: 'grid.md', content: GUIDE_GRID },
    { name: 'focus-popout.md', content: GUIDE_FOCUS },
    { name: 'sidebar.md', content: GUIDE_SIDEBAR },
    { name: 'entities.md', content: GUIDE_ENTITIES },
    { name: 'workspaces.md', content: GUIDE_WORKSPACES },
    { name: 'notes.md', content: GUIDE_NOTES },
    { name: 'voice.md', content: GUIDE_VOICE },
    { name: '04-prompting-fundamentals.md', content: GUIDE_04 },
    { name: '05-prompting-in-mux.md', content: GUIDE_05 },
    { name: '06-token-craft.md', content: GUIDE_06 },
  ];

  for (const file of files) {
    const filePath = path.join(guidesDir, file.name);
    fs.mkdirSync(guidesDir, { recursive: true });
    fs.writeFileSync(filePath, file.content, 'utf-8');
  }
}

const GUIDE_GRID = `# Guide: Das Grid — Sessions verstehen und steuern

Das Grid ist dein Arbeitsbereich. Hier laufen deine KI-Sessions — sichtbar, gleichzeitig, steuerbar.

---

## Was ist eine Session?

Stell dir vor, du rufst Claude gleichzeitig auf mehreren Telefonen an. Jeder Anruf ist unabhängig — eigenes Gedächtnis, eigene Aufgabe, eigenes Verzeichnis. Das Grid zeigt dir alle Anrufe auf einen Blick.

Eine **Zelle** ist ein Slot im Grid. Leer → zeigt \\\`+\\\`. Belegt → zeigt eine laufende Session.

---

## Eine Session starten

1. Klick auf \\\`+\\\` in einer leeren Zelle
2. Das **Launcher-Popup** öffnet sich — drei Tabs:
   - **Presets** — spezialisierte Rollen (Companion, Cyber Factory, etc.)
   - **Path** — eigenen Projektordner öffnen
   - **Notes** — eine Notiz in dieser Zelle anzeigen
3. Preset oder Pfad wählen → Session startet

Alternativ: \\\`Cmd+N\\\` öffnet das Launcher-Popup in der nächsten freien Zelle.

---

## Die Zell-Kopfleiste lesen

Jede Session hat eine Kopfleiste. Von links nach rechts:

**Der Punkt** zeigt den Status:
- Farbiger Punkt = Entity (Preset) aktiv — Farbe ist entitätsspezifisch
- Grün = viel Context-Platz
- Orange/Rot = Context wird eng

**Die Farb-Leiste** darunter (der schmale Balken oben im Header) zeigt die Context-Auslastung als Balken. Farbkodierung: grün → gelb → orange → rot.

**Die Buttons rechts** (von links nach rechts):

| Symbol | Was es tut |
|--------|------------|
| Scan | **Focus Mode** — Session maximieren (→ Guide: Focus Mode) |
| ↓/↑ | Zelle vertikal expandieren / kollabieren (nur bei 2+ Zeilen) |
| GitBranch | Session **forken** — neue parallele Kopie |
| Kamera | **Screenshot** — Snapshot in Zwischenablage |
| ⇄ | **Projekt wechseln** — anderen Ordner zuweisen, Session bleibt |
| ↑ | **In Hintergrund** — aus Grid entfernen, weiterläuft (→ Sidebar) |
| Terminal | **Shell** im Projektverzeichnis öffnen |
| Pfeil-raus | **Pop Out** — als eigenes Fenster öffnen (→ Guide: Pop-Out Fenster) |
| ✕ | Session beenden |

---

## Grid-Größe anpassen

Unten in der Statusleiste: **spalten +/-** und **zeilen +/-**.

- Min. 1×1, Max. 7×3
- Typisch: 2×1 für Alltag, 3×1 für drei parallele Sessions, 2×2 für Factory + Worker

---

## Sessions verschieben

Header einer Session anfassen und auf eine andere Zelle ziehen. Die beiden Sessions tauschen die Plätze.

---

## Context-Warnung ernst nehmen

Wenn der Balken orange oder rot wird, ist das Context Window fast voll. Claude "vergisst" dann ältere Teile des Gesprächs. Lösung: neue Session starten (\\\`/new\\\` in der Session oder Fork).

---

**Weiter:** Guide: Workspaces — Layouts speichern und anwenden
**Weiter:** Guide: Focus Mode und Pop-Out Fenster
**Weiter:** Guide: Die Sidebar — Alles im Blick
`;

const GUIDE_FOCUS = `# Guide: Focus Mode und Pop-Out Fenster

Manchmal brauchst du Platz. Focus Mode und Pop-Out geben dir genau das — auf unterschiedliche Arten.

---

## Focus Mode: Eine Session groß schalten

Der Focus Mode maximiert eine Session **im Grid** — sie belegt 2×2 Zellen. Die anderen Sessions rücken zusammen, bleiben aber sichtbar.

**Aktivieren:**
- Scan-Icon (☰ mit Pfeilen) im Session-Header klicken
- oder \\\`Cmd+Shift+F\\\`

**Was passiert:**
- Die Session expandiert auf 2×2
- Eine floating **Focus-Bar** erscheint oben

**Die Focus-Bar:**
\\\`\\\`\\\`
[Session-Name]  CTX 34%  |  Aa  |  ESC
\\\`\\\`\\\`
- **CTX XX%** — Context-Nutzung, farbkodiert
- **Aa** — Font-Größe anpassen (klicken → \\\`-\\\` / px-Anzeige / \\\`+\\\`, Bereich 8–36px)
- **ESC** — Focus Mode beenden

**Beenden:** ESC-Taste, ESC-Button in der Bar, oder Scan-Icon erneut klicken.

**Tipp:** Bei einem 4×2-Grid kannst du zwei Focus-Sessions nebeneinander haben — jede belegt 2×2 ihrer Hälfte.

---

## Pop-Out: Session als eigenes Fenster

Das Pop-Out trennt eine Session komplett vom Grid und öffnet sie als eigenständiges Electron-Fenster.

**Aktivieren:** ExternalLink-Icon (Pfeil nach außen oben rechts) im Session-Header.

**Was das Fenster hat:**
- Minimale Titelleiste (ohne macOS-Decorations) — verschiebbar per Drag
- Session-Name links, gedimmt
- **Dock-Button** rechts: Session zurück ins Grid holen

Die Session **läuft weiter** — kein Neustart, kein Unterbrechung. Gut für: lange laufende Workers die du im Blick behalten willst, oder zweiten Monitor.

---

## Sidebar als Fenster

Die Sidebar kann ebenfalls als eigenes Fenster geöffnet werden.

**Aktivieren:** ⧉-Button im Sidebar-Header (oben rechts der Sidebar).

**Zurück:** ⇤-Button im Sidebar-Fenster-Header.

Praktisch für: Notes auf einem Monitor, Grid auf dem anderen.

---

**Zurück:** Guide: Das Grid — Sessions verstehen und steuern
**Weiter:** Guide: Die Sidebar — Alles im Blick
`;

const GUIDE_SIDEBAR = `# Guide: Die Sidebar — Alles im Blick

Die Sidebar ist die Kommandozentrale für alles, was nicht direkt im Grid sichtbar ist: Notes, Hintergrund-Sessions, Nachrichten, Erinnerungen.

**Öffnen:** \\\`sidebar\\\`-Button in der Statusleiste (leuchtet wenn Inhalt wartet).

---

## Die fünf Sektionen

Jede Sektion ist auf- und zuklappbar — der Zustand wird gespeichert. Klick auf den Sektions-Header klappt sie ein oder aus.

---

### 1. Notes

Dein Notiz-Browser. Zeigt alle Notes, durchsuchbar und nach Tags filterbar.

**Workspace-Filterung:** Wenn ein Workspace aktiv ist, filtert die Notes-Sektion automatisch auf \\\`workspace:<Name>\\\`. Du siehst nur Notes die zu deinem aktuellen Workspace gehören. Filter manuell überschreibbar.

**Interaktion:**
- Einfachklick → Details/Preview
- Doppelklick → Note in Grid-Zelle öffnen
- Drag → Note auf eine Grid-Zelle ziehen

**Mehrere Notes:** Auswählen → löschen (mit 15 Sekunden Undo-Möglichkeit) oder Tags hinzufügen/entfernen.

---

### 2. Background Sessions

Sessions die aus dem Grid in den Hintergrund geschickt wurden (↑-Button im Header). Sie laufen weiter — du siehst sie hier.

Jede Karte zeigt Name und Context-Nutzung.

**Einfachklick:** Karte expandieren — zeigt Pfad, Context-Balken, Terminal-Preview (wird alle 5 Sekunden aktualisiert)
**Doppelklick:** Session ins Grid holen
**Drag:** Session auf eine Ziel-Zelle im Grid ziehen

---

### 3. Orphaned Sessions *(erscheint nur wenn vorhanden)*

tmux-Sessions die cipher-mux nicht kennt — Überbleibsel nach Abstürzen oder manuell gestartete Sessions.

Pro Session: **Adoptieren** (ins System übernehmen) oder **Beenden**.

---

### 4. Companion Memory

Gespeicherte Erinnerungen des Companions aus vergangenen Sessions. Standardmäßig eingeklappt. Durchsuchbar.

---

### 5. Messages

Nachrichten über den **Message Bus** — der gemeinsame Kanal aller Sessions. Zeigt Sender, Uhrzeit, Text.

---

## Sidebar als eigenes Fenster

⧉-Button im Sidebar-Header öffnet die Sidebar als separates Fenster — ideal für Multi-Monitor. ⇤ dockt sie wieder zurück.

---

**Zurück:** Guide: Das Grid — Sessions verstehen und steuern
**Weiter:** Guide: Workspaces — Layouts speichern und anwenden
`;

const GUIDE_ENTITIES = `# Guide: Die Entities — Wer macht was

cipher-mux kommt mit einer Reihe spezialisierter KI-Rollen — **Entities** genannt. Jede hat ein klares Aufgabengebiet. Das Ziel: die richtige Rolle für den richtigen Job, statt eine Generalisten-Session für alles.

---

## Der Software-Lebenszyklus

Die Entities sind entlang eines Entwicklungsablaufs angeordnet:

\\\`\\\`\\\`
Idee → Anforderungen → Implementierung → Testen → Bugs fixen
\\\`\\\`\\\`

Und dahinter drei unterstützende Rollen: Companion, Audit, Workshop.

---

## Die Entities im Überblick

### Companion
**Dein Einstiegspunkt.** Erklärt Konzepte, hilft bei Entscheidungen, nimmt Bug-Reports auf. Merkt sich deine Präferenzen über Sessions hinaus.

Nicht: Code schreiben oder ausführen. Der Companion *berät*, er *macht* nicht.

---

### Ideation Partner
**Für rohe Ideen.** Du bringst eine vage Vorstellung — Ideation recherchiert, strukturiert, fokussiert. Ergebnis: ein Anforderungspaket das an Refinement übergeben werden kann.

*Beispiel:* "Ich will eine Trading-Dashboard-App" → Ideation klärt: Welche Daten? Welche Ansichten? Welche Integrationen? → Anforderungspaket.

---

### Refinement
**Für saubere Anforderungen.** Nimmt ein Anforderungspaket und macht daraus eine Detail-Spec mit REQ-IDs, Lücken-Audit, klaren Akzeptanzkriterien. Kein Code — nur Spec.

---

### Cyber Factory
**Für große, strukturierte Implementierungsprojekte.** Plant Wellen, koordiniert bis zu 5 parallele Worker-Sessions, monitort Fortschritt, übergibt an Testing. Hoher Koordinationsaufwand — die "Fabrik".

*Wann:* Wenn es mehrere größere Aufgaben gibt die aufeinander aufbauen.

---

### Workshop
**Für kleine Jobs.** Einzelne Fixes, Wartungsaufgaben, alles zu klein für die Factory. Außerdem: Koordinator für **Bugreport-Triage** — nimmt Findings aus Testing-Sessions entgegen, verteilt sie an Debugger, Ideation oder Cyber Factory.

*Wann:* "Mach das mal schnell" — oder nach einer Testing-Session wenn Bugs verteilt werden müssen.

---

### Testing Assistant
**Für strukturiertes Testen.** Führt Testcases aus, probiert adversariale Szenarien, prüft Sicherheit, erstellt einen Findings-Report. Übergibt an Workshop.

---

### Debugger
**Für gezieltes Bug-Fixen.** Bekommt Findings, analysiert Root Cause, plant Fix, führt aus, verifiziert. Entscheidet selbst: ist es klein → erledigt selbst, ist es groß → gibt an Workshop oder Cyber Factory weiter.

---

### Audit
**Für Code-Review und Release-Entscheidung.** Prüft Code, Sicherheit, ADR-Konsistenz. Läuft als Schleife bis alles sauber ist. Gibt eine Release-Empfehlung.

---

### Launcher
**Für den Projekt-Kickoff.** Scannt Projekte, startet die Orchestrierung. Spezialisierte Rolle im Kickoff-Flow.

---

## Die Weichen im System

Zwei Entities sind besondere Weichen:

**Debugger** entscheidet nach der Analyse: Ist der Job klein genug → macht er selbst weiter. Ist er zu groß → gibt er an Workshop (viele kleine) oder Cyber Factory (große Projekte) ab.

**Workshop** ist die Schaltzentrale für Bug-Triage: empfängt Findings, klassifiziert (Trivialität / Bug / Feature / Eskalation), verteilt an die passende Entity.

---

## Welche Entity wann?

| Situation | Entity |
|-----------|--------|
| Neue Idee entwickeln | Ideation Partner |
| Anforderungen präzisieren | Refinement |
| Größeres Feature bauen | Cyber Factory |
| Schnelle Fixes / kleine Jobs | Workshop |
| Testen und Bugs finden | Testing Assistant |
| Einzelnen Bug analysieren und fixen | Debugger |
| Code-Qualität und Release prüfen | Audit |
| Fragen / Erklärungen / Orientierung | Companion |

---

**Zurück:** Guide: Workspaces — Layouts speichern und anwenden
**Verwandt:** cipher-mux Wissensbase — Vollständige Feature-Dokumentation (Detailreferenz)
`;

const GUIDE_WORKSPACES = `# Guide: Workspaces — Layouts speichern und anwenden

Ein Workspace ist ein gespeichertes Grid-Layout — welche Sessions wo laufen, mit welchen Projekten und Einstellungen. Ein Klick, alles steht.

**Öffnen:** \\\`workspaces\\\` in der Statusleiste → eigenes Fenster mit 4 Tabs.

---

## Tab: Workspaces

Links die Liste deiner Workspaces, rechts der Editor.

### Workspace erstellen

1. \\\`+ Neu\\\` in der Liste
2. Name vergeben
3. Spalten/Zeilen einstellen
4. Zellen befüllen (Klick auf Zelle → EntityPicker)
5. Speichern

### Zelle konfigurieren

Klick auf eine Zelle im Grid-Editor öffnet den **Cell Inspector**:

- **Cell Type** — Session oder Notes-Zelle
- **Preset** — welches Entity-Preset, oder eigener Projektpfad
- **Cell Prompt** — optionaler Zusatz-Prompt nur für diese Zelle

### Zellen zusammenführen

Am unteren Rand einer Zelle erscheint ein Handle — klicken verbindet die Zelle mit der darunterliegenden. Nochmal klicken trennt sie.

### Workspace-weite Einstellungen

**Workspace Prompt:** Text der in *alle* Sessions dieses Workspaces injiziert wird.

**Context Directories:** Verzeichnisse als zusätzlicher \\\`@\\\`-Kontext für alle Sessions.

**Default Tags:** Tags die automatisch auf neue Notes angewendet werden (nur \\\`klasse:wert\\\`-Format).

**Notes Global:** Notes-Sektion zeigt alle Notes global oder nur workspace-gefiltert.

### Default-Workspace

Stern-Button → wird beim App-Start automatisch geladen.

---

## Tab: Companion

Characters (Personas) verwalten. Ein Character steuert Ton und Stil — für alle Entity-Sessions gleichzeitig. Der aktive Character-Block wird in jede Session injiziert.

**Die sechs eingebauten Characters:**

| Name | Kurzcharakter |
|------|---------------|
| **Relay** (Standard) | Ruhig, präzise, wissenschaftsjournalistisch. Kein Lob ohne Prüfung. |
| **Cipher** | Positiver Cyberpunk, pragmatisch loyal. Trocken, direkt, Gegenargumente unaufgefordert. |
| **Wayne** | Pragmatischer Enthusiast. "Das kriegen wir hin"-Attitude, leichter Nerd-Humor. |
| **Der Kyniker** | Nur Fakten und Code. Kein Fließtext, kein Lob. Ja/Nein wenn möglich. |
| **Theaitetos** | Führt durch Fragen, nicht Antworten. Deckt Lücken und Confirmation Bias auf. |
| **Der Glitch** | Bricht Denkmuster. Unkonventionelle Metaphern, hinterfragt die Prämisse. |

**Globaler Override:** Checkbox — dieser Character überschreibt alle preset-spezifischen Zuweisungen.

Eigene Characters: Name + Farbe + Prompt-Text. Activate-Button macht ihn aktiv.

---

## Tab: Presets

Zeigt alle Entity-Presets. CLAUDE.md-Inhalt direkt editierbar.

Neues Custom-Preset: "Neu anlegen" — liefert ein Template mit Abschnitten: Rolle, Fähigkeiten, Arbeitsregeln, Scope.

---

## Tab: Tags

Tag-Verwaltung. Tag-Klassen und vordefinierte Tags konfigurierbar.

---

**Zurück:** Guide: Das Grid — Sessions verstehen und steuern
**Weiter:** Guide: Die Entities — Wer macht was
`;

const GUIDE_NOTES = `# Guide: Notes — Notizen anlegen und organisieren

Das Notes-System ist der Wissensspeicher von cipher-mux. Sessions schreiben Notes, du liest sie, verlinkst sie, und gibst sie weiter — auch an andere Apps wie Obsidian.

---

## Note anlegen

**Über den Launcher:** \\\`+\\\` in einer leeren Zelle → Tab **Notes** → "Neue Notiz".

**Über die Sidebar:** Notes-Sektion → \\\`+\\\`-Button.

**Per Session:** Jede Session kann Notes über MCP-Tools anlegen (\\\`mux_notes_create\\\`).

---

## Note bearbeiten

Eine Note öffnet sich in einer **Grid-Zelle** als Markdown-Editor (CodeMirror).

Unterstützte Formatierung: Überschriften, **fett**, *kursiv*, Links, Code-Blöcke, Zitate, Listen, Tabellen.

**Speichern:**
- \\\`Cmd+S\\\` → speichert und schlägt **Tags** vor (via lokalem KI-Modell)
- **Auto-Save** nach 2 Sekunden Inaktivität (ohne Tag-Vorschlag)

---

## Tags

Tags sind das Organisationsprinzip. Format immer: \\\`klasse:wert\\\`

Beispiele:
- \\\`workspace:CIPHER-MUX\\\`
- \\\`kind:bugreport\\\`
- \\\`entity:companion\\\`
- \\\`status:open\\\`

Beim Speichern mit \\\`Cmd+S\\\` schlägt das lokale Modell (Ollama) passende Tags vor. Du kannst sie übernehmen, ablehnen oder eigene tippen.

**Tag-Autocomplete:** Beim Tippen eines Tags werden bekannte Tags vorgeschlagen.

---

## Notes in der Sidebar finden

Sidebar → Sektion **Notes**. Suche (Volltextsuche) und Tag-Filter.

**Workspace-Filter:** Wenn ein Workspace aktiv ist, zeigt die Sidebar automatisch nur Notes mit \\\`workspace:<Name>\\\`. Manuell überschreibbar.

**Doppelklick** auf eine Note → öffnet sie in einer Grid-Zelle.
**Drag** → Note auf eine leere Zelle ziehen.

---

## Notes als Workspace-Zelle

In Workspaces kann eine Zelle als **Notes-Zelle** konfiguriert werden (statt Session). Sie zeigt dann direkt den Notes-Editor. Konfigurierbar im Workspace-Editor → Cell Type.

---

## Wann Note, wann Memory?

| Note | Companion Memory |
|------|--------------------|
| Sichtbar in der Sidebar | Nicht im UI sichtbar |
| Teilbar (auch in Obsidian) | Nur intern |
| Für Inhalte die dokumentiert werden sollen | Für Präferenzen und Kontext |
| Handoffs zwischen Sessions | Session-übergreifende Erinnerungen |

**Faustregel:** Wenn du es in Obsidian lesen willst — Note. Wenn es nur die KI wissen soll — Memory.

---

## Handoff-Notes

Sessions übergeben Aufgaben über **Handoff-Notes** — strukturierte Notes mit Tags wie \\\`kind:handoff\\\`, \\\`toEntity:debugger\\\`.

Das ist der Standard-Weg wie z.B. Testing Assistant seine Findings an Workshop übergibt: als Note, nicht als direkter Chat.

---

## Bugreports als Notes

Der Bugreport-Dialog (\\\`Cmd+B\\\`) legt Bugs und Feature-Requests als Notes an:
- Tags: \\\`kind:bugreport\\\`, \\\`status:open\\\`
- Sichtbar in der Sidebar unter dem workspace-Filter

---

**Zurück:** Guide: Die Sidebar — Alles im Blick
**Verwandt:** Guide: Die Entities — Wer macht was
**Verwandt:** cipher-mux Wissensbase — Vollständige Feature-Dokumentation (Detailreferenz)
`;

const GUIDE_VOICE = `# Guide: Sprachsteuerung — Voice Input und TTS

cipher-mux hat eine vollständige Sprachsteuerung — lokal, ohne Cloud, ohne Netzwerk. Eingabe per Mikrofon (STT), Ausgabe per Stimme (TTS).

---

## Aktivieren

Die Statusleiste zeigt drei Buttons: \\\`OFF\\\` / \\\`STT\\\` / \\\`COM\\\`

- **OFF** — Sprachsteuerung aus
- **STT** — Speech-to-Text: Mikrofon → Text wird in die fokussierte Session eingefügt
- **COM** — Conversation-Modus: spricht direkt mit dem Voice Relay

Die **LED** daneben zeigt den Status: aus / grün (bereit) / rot (nimmt auf) / gelb (verarbeitet).

---

## STT — Sprechen und Senden

Wenn STT aktiv ist, wird gesprochener Text eingefügt — aber **nicht automatisch gesendet**. Du kannst korrigieren, dann senden.

**Senden per Stimme:**
- "abschicken" / "absenden" / "senden" → Enter
- "neue zeile" → Zeilenumbruch

Alles andere = normaler Text.

---

## Navigationsbefehle

| Befehl | Aktion |
|--------|--------|
| "hoch" / "runter" | Eine Seite scrollen |
| "ganz hoch" / "ganz runter" | Zum Anfang / Ende |
| "zum marker" | Zur letzten Antwort |
| "grid hoch/runter/links/rechts" | Grid-Fokus verschieben |
| "kopieren" | Aktuelle Selektion in Zwischenablage |
| "einfügen" | Clipboard in fokussierte Session |

Varianten werden erkannt: "grit", "zelle", "focus".

---

## Voice Pin — Stimme an eine Session binden

Im STT-Modus erscheint neben dem Session-Namen ein ◉-Button. Klicken → Voice geht immer in diese Session, egal wohin du im Grid klickst.

---

## COM-Modus — Voice Relay

Der COM-Modus verbindet dich mit dem **Voice Relay** — das ist im Wesentlichen du und der Companion, aber für reine Sprachinteraktion optimiert.

**Was der Voice Relay ist:**
- Eine vollständige Session mit derselben Persona und demselben Wissen wie der aktive Character
- Du redest *mit* ihm — direkt, nicht durch andere Sessions hindurch
- Er kann die App steuern, Status abfragen, Notes anlegen, Bugs aufnehmen
- Wenn du möchtest, gibt er Aufgaben an andere Sessions weiter — aber auf deinen Wunsch hin, nicht automatisch

**Was sich ändert (nur die Form, nicht der Inhalt):**
- Keine Markdown-Ausgabe — fließende Sätze
- Kurze Turns (4–5 Sätze, dann Pause oder Rückfrage)
- TTS ist primärer Ausgabekanal
- IDs, Pfade, Code werden nie vorgelesen — immer zusammengefasst

---

## TTS — Konfiguration

Einstellungen unter \\\`einstellungen\\\` → **Sprache** → TTS.

**Optionen:**
- **TTS ein/aus**
- **Engine:** Piper (lokal, schnell) oder macOS-Systemstimme
- **Verbosity:** Minimal (nur Kernantworten) oder Alles Relevante
- **Installed Voices:** aktive Stimme wählen, Preview, löschen
- **Voice Catalog:** neue Piper-Stimmen downloaden, Filter nach Sprache und Qualität

**Barge-In:** Wenn die Session spricht und du anfängst zu reden, unterbricht das die TTS.

---

## Bluetooth-Fernbedienung

BT Shutter (z.B. AB Shutter 3) als Auslöser. Aktivieren unter \\\`einstellungen\\\` → **Sprache** → BT Shutter.

- **Auto:** Knopfdruck = sofort senden
- **Manual:** Knopfdruck = Aufnahme starten, nochmal = stoppen und senden

---

**Zurück:** Guide: Das Grid — Sessions verstehen und steuern
**Weiter:** Guide: Notes — Notizen anlegen und organisieren
`;

const GUIDE_04 = `# Prompting Fundamentals — Getting Real Results from AI

This guide covers universal principles for working with large language models (LLMs) like Claude. These skills apply everywhere — in cipher-mux, in raw Claude Code, in the browser, in any AI tool. Master these and everything else gets easier.

**Type:** Explanation (understanding-oriented)
**Prerequisites:** None — this is foundational knowledge
**Time:** 20-30 minutes to read, a lifetime to practice

---

## The 5-Building-Block Prompt

Every effective prompt has five components. Not always in this order, not always all five — but the more you include, the better the result.

### 1. Role

Tell the AI who it is for this task.

> "Du bist Frontend-Entwickler für eine PHP-Website."

Why it matters: the role shapes depth, vocabulary, assumptions, and which knowledge the model draws on. A "security auditor" looks at code differently than a "performance engineer." Same code, different eyes.

### 2. Context

What does the AI need to know about your situation?

> "Die Website ist statisches PHP auf Strato-Hosting. Ich pflege sie allein, kein Team."

Without context, the AI guesses — sometimes accurately, sometimes not. Context is cheap to provide and expensive to lack. Include: tech stack, constraints, who will use the result, what has been tried already.

### 3. Task

What exactly should happen?

> "Ändere den Preis für 'Komplettumzug Standard' auf preise.php von 450 auf 490."

The more specific the task, the less room for interpretation. "Make the homepage better" is an invitation for the AI to do whatever it feels like. "Reduce homepage load time by optimizing images and deferring non-critical CSS" is a task.

### 4. Constraints

What should the AI NOT do?

> "Keine neuen Abhängigkeiten. Kein Tailwind. Erst Plan zeigen, dann Code."

Constraints prevent the AI's default behaviors from kicking in. Without them, Claude will happily add a new framework, refactor surrounding code, and create helper utilities you never asked for. Constraints are guardrails.

### 5. Format

How should the answer be structured?

> "Antworte mit: 1. Was geändert wurde, 2. Warum, 3. Wie ich es teste."

Format instructions save you from parsing walls of text. You know what you need — tell the AI, so it delivers in that shape.

### Bad vs. Good — Same Task

**Bad:** "Mach die Startseite besser."

**Good:** "Du bist Frontend-Entwickler für meine PHP-Website. Die Startseite lädt auf dem Handy langsam. Bitte: 1. Analysiere index.php und die verlinkten CSS/JS-Dateien. 2. Zeig mir die drei größten Performance-Hebel, sortiert nach Aufwand vs. Effekt. 3. Erst Plan zeigen, dann Code. Keine neuen Frameworks."

The difference is not length — it is precision. The good prompt takes 30 seconds longer to write and saves 15 minutes of back-and-forth.

---

## Your AI's Working Memory: The Token Window

Every AI model has a limit on how much text it can hold in "working memory" at once. This is the **context window**, measured in tokens (roughly: one token ≈ 0.75 English words, one long German word ≈ 3-5 tokens).

**Current specs (April 2026):**
- Claude Opus 4.6/4.7, Sonnet 4.6: 1,000,000 tokens (~750K English words, ~1,500 book pages)
- Claude Haiku 4.5: 200,000 tokens

Think of it as **RAM vs. ROM vs. Disk:**
- **Context window = RAM.** What the AI is actively thinking about right now. Limited, fast, everything here is "in focus."
- **Training data = ROM.** Background knowledge from training. Always accessible but not actively loaded — the AI draws on it implicitly.
- **Files on disk = external storage.** Vast but requires explicit loading. When Claude reads a file, it enters the context window (RAM).

For most daily work, you will never hit the raw capacity limit. A million tokens is enormous. But quality degrades long before you hit the wall — that is context rot.

---

## Context Rot: When Quality Degrades

Long sessions degrade even within the window limit. After hours of back-and-forth, corrections, tangents, and accumulated context, the AI's attention spreads thin. The "lost in the middle" problem is real: information buried in the middle of a long context gets up to 30% less attention than information at the start or end.

**Signs of context rot:**
- Claude forgets rules you established earlier in the session
- Answers contradict something it said 20 messages ago
- It starts hallucinating file names or function names that do not exist
- It references things you never said

**The fix is simple: start a new session.** This is not failure — it is craft. Experienced users start fresh every 1-2 hours as a habit, not because something went wrong. A new session with a clear prompt almost always outperforms a degraded long session.

**The handover technique:** Before closing a session, ask Claude to summarize the current state in half a page. Save it as a file. Start a new session. First message: "Lies diese Zusammenfassung und mach da weiter wo wir aufgehört haben." Clean context, full state.

---

## The 150-Instruction Budget

Claude Code's CLAUDE.md file — the project instructions that load automatically — has roughly 150 effective instruction slots. The system prompt already uses about 50 of them. Every instruction you add competes with the others for attention.

**The pruning test:** For every line in a CLAUDE.md, ask: "Would removing this cause Claude to make a mistake?" If Claude already does it correctly on its own, the instruction is noise. Remove it.

This applies beyond CLAUDE.md. Every prompt has an attention budget. Front-load the important parts. Put the critical instruction at the very beginning or very end — never bury it in the middle.

---

## Hallucinations: When AI Invents

LLMs do not "know" things the way a database knows things. They predict the most likely next words based on patterns. Sometimes the most likely continuation is wrong — confidently, fluently wrong. This is a hallucination.

**Common forms:**
- Inventing function names that do not exist in your codebase
- Citing libraries or APIs with incorrect parameter names
- Claiming a feature exists when it does not
- Generating plausible-looking code that fails silently

**How to handle it:**
- Always test locally. Never deploy code you have not run.
- When uncertain, ask explicitly: "Bist du sicher, dass diese Funktion existiert? Falls nicht, schlag einen verifizierten Weg vor."
- Give Claude verification tools — tests, linters, type checkers. An AI with feedback loops hallucinates less than one without.
- The anti-hallucination pattern: include in your prompt or CLAUDE.md: "Never speculate about code you have not opened. Read the file before answering."

---

## The Confirmation Trap

AI models are trained to be helpful. Helpfulness defaults to agreement. If you say "I think we should use a microservice architecture," Claude will likely agree and explain why that is a great idea — even if a monolith would be better for your case.

**How to break the trap:**
- Ask for counterarguments: "Nenn mir zwei Gründe warum das eine schlechte Idee sein könnte."
- Ask for alternatives: "Was wären die Nachteile gegenüber Ansatz X?"
- State your assumption and ask Claude to challenge it: "Ich gehe davon aus, dass Y. Stimmt das, oder übersehe ich was?"

The meta-rule: Claude is a tool, not a colleague. A tool does not push back. You have to create the conditions for honest feedback by explicitly requesting it.

---

## Focused Sessions

One session, one topic. This is the single highest-leverage habit.

When you are fixing a bug and suddenly ask "Oh, and can you also quickly refactor that other component?" — the session loses focus. Context fills with unrelated information. Quality drops for both tasks.

**Rules:**
- One topic per session. Theme switch = new session.
- Between unrelated tasks in the same session: use \\\`/clear\\\` to reset context.
- After two failed correction attempts on the same issue: start a fresh session with a better initial prompt. The clean context almost always outperforms accumulated corrections.
- Side questions that do not need to persist: use \\\`/btw\\\` — it answers in an overlay without entering conversation history.

---

## Forcing Research

LLMs overestimate their own knowledge. They will answer confidently from training data even when that data is outdated or incomplete. The fix: explicitly ask them to research before answering.

**Instead of:** "Schreib einen Blogartikel über DSGVO-Anforderungen für Kontaktformulare."

**Try:** "Bevor du schreibst — was weißt du aus dem aktuellen Stand zu DSGVO bei Kontaktformularen? Gibt es neue Richtlinien 2025/2026? Recherchier das kurz, dann machen wir die Gliederung."

This pattern — research first, then outline, then execute — reduces hallucinations, brings in current information, and often surfaces considerations you had not thought of.

---

## The Doom Loop

This is the central failure mode of vibe coding: the AI claims to fix a bug but does not actually fix it. You point out it is still broken. The AI apologizes and "fixes" it again — differently broken. You correct again. Context fills with failed approaches. Quality spirals downward.

**How to break it:**
- After two failed fix attempts: stop. Start a fresh session.
- In the new session, describe the problem clearly — including what was already tried and why it failed. "Ich habe X und Y probiert, beides hat nicht funktioniert weil Z. Was ist die eigentliche Ursache?"
- The doom loop usually means the initial diagnosis was wrong. A fresh session forces re-diagnosis.

**Prevention:**
- Plan in markdown, not code. Iterate on requirements in a separate conversation. Discarded ideas in markdown cost nothing. Discarded ideas in code become tech debt.
- Require a diagnosis before a fix: "Erklär mir erst was das Problem ist. Dann fixen wir es zusammen."

---

## The Two-Pass Pattern

Generate first, review second — in separate passes. This is more effective than trying to get it perfect in one shot.

**How it works:**
1. First pass: generate the code, text, or plan. Accept that it will have issues.
2. Second pass: review it critically. Use a fresh session, a different prompt, or even a different model. "Hier ist ein Code-Entwurf. Prüf ihn auf Fehler, Sicherheitslücken, und fehlende Edge Cases."

Research consistently shows: three focused agents working in sequence (generate → review → fix) outperform one generalist working three times as long. This principle is built into cipher-mux's architecture — the Cyber Factory delegates to specialized workers rather than doing everything in one session.

---

## The Meta-Rule

Claude is a tool. You decide. You verify. You own the result.

A good tool-user knows what they want, checks the output, and takes responsibility for what goes live. Claude does the heavy lifting and contributes ideas — the judgment and quality assurance stay with the human.

A controlled study in 2025 found that experienced developers were 19% slower with AI tools — while believing they were 24% faster. The subjective experience of speed masks the cost of context-switching, debugging AI-generated code, and the trust-then-verify gap.

The antidote: discipline. Clear prompts, focused sessions, verification before shipping, new sessions when quality drops. Those who internalize this work genuinely faster. Those who trust blindly accumulate invisible debt.

---

## Quick Reference: Patterns That Work

| Pattern | When to use |
|---|---|
| 5-building-block prompt | Every non-trivial request |
| Handover technique | Before ending a long session |
| /clear between tasks | When switching topics in same session |
| Fresh session after 2 failed fixes | When stuck in the doom loop |
| "Recherchier das vorher" | Before any content that needs current facts |
| "Nenn mir Gegenargumente" | Before any decision |
| Two-pass (generate + review) | For anything that will be shipped |
| Anti-hallucination prompt | In CLAUDE.md for critical projects |
| One topic per session | Always |

**Next step:** Guide 05 (Prompting in cipher-mux) covers how to write effective instructions for the Workshop, Cyber Factory, and Launcher specifically.
`;

const GUIDE_05 = `# Prompting in cipher-mux — Getting the Systems to Work for You

This guide covers how to write effective input for cipher-mux's specialized systems: the Workshop, the Cyber Factory, the Launcher, voice input, bugreports, and inter-session communication.

**Type:** How-To Guide (task-oriented)
**Prerequisites:** Guide: Die Entities, Guide 04 (Prompting Fundamentals)
**Time:** 15-20 minutes

---

## Writing Instructions for the Workshop

The Workshop handles small jobs, maintenance, and single tasks. It breaks your request into sub-tasks and assigns them to workers. This means your instruction needs to be decomposable — it must be possible to split it into independent pieces.

### What the Workshop Expects

Clear scope, clear boundaries, clear success criteria. The Workshop thinks in terms of: "What sessions do I need to create? What does each one do? How do I know it is done?"

### Good vs. Bad Workshop Instructions

**Bad:** "Fix the auth stuff and make the frontend look better."

Two problems: "auth stuff" is vague (fix what?), and "look better" is subjective with no success criteria. The Workshop cannot decompose this into worker tasks.

**Good:** "Three tasks: 1. Extract the token validation logic from auth.ts into a new file token-validator.ts with unit tests. 2. Add rate limiting to the login endpoint — max 5 attempts per minute per IP. 3. Replace the inline styles in LoginForm.tsx with CSS modules. All tasks are independent."

The Workshop can immediately create three workers, each with a clear, self-contained task.

### Sizing Worker Tasks

Each worker gets its own context window. A task should use 60-80% of that window — enough room to work but not so large that the worker runs out of context mid-task.

Rules of thumb:
- One file change = one worker (usually)
- One feature across 2-3 tightly coupled files = one worker
- If a task would require reading more than 10 files to understand, it is too big — break it down further

### What to Watch For

In the sidebar Messages tab:
- **Progress updates** — workers report what they are doing
- **Questions** — sometimes a worker asks for clarification. The Workshop tries to answer, but may escalate to you
- **Warnings** — context usage above 80%, repeated errors, or stalled workers
- **Completion** — "All tasks complete. Summary: ..."

If a worker seems stuck (no progress for 10+ minutes), check the sidebar. The Workshop's monitoring catches most stalls, but you can also check manually by looking at cell context usage indicators.

---

## Writing Requirements for the Launcher

The Launcher scaffolds a project from a requirements document. The quality of the scaffold is directly proportional to the quality of the input.

### Structure of a Good Requirements Document

\\\`\\\`\\\`
Goal: [one sentence — what does this project do?]

Target Audience: [who will use it?]

Functional Requirements:
1. [What it must do — be specific]
2. [Each requirement gets a number]
3. [Testable: you can tell if it works or not]

Constraints:
- [Tech stack preferences]
- [What it must NOT do]
- [Design guidelines]

Non-Functional Requirements:
- [Performance targets]
- [Security needs]
- [Accessibility requirements]
\\\`\\\`\\\`

### Common Mistakes

**Too vague:** "Build an app for managing tasks." — What kind of tasks? For whom? Web, mobile, CLI? What does "managing" mean — create, assign, schedule, track?

**Too prescriptive:** "Use React 19.2 with Zustand for state, Tanstack Router for routing, Tailwind 4 with the oxide engine..." — You are making implementation decisions before understanding the problem. State what you need, not how to build it. Let the Launcher (and Claude) make the technical choices.

**Missing constraints:** No constraints means Claude will make its own choices — and they might not match your expectations. "No backend" or "must work offline" or "must run on Strato shared hosting" are constraints that shape the entire architecture.

**The sweet spot:** Enough detail that someone who knows nothing about your project could build the right thing. Enough freedom that the builder can make good technical decisions.

### The Quality Baseline

If cipher-mux has a quality baseline directory configured, the Launcher uses it as a reference for the depth and quality of the generated scaffold. This is like showing a new architect an example of work you consider excellent and saying "aim for this level."

---

## Writing for Cyber Factory Input Requests

When the Cyber Factory cannot make a decision autonomously, it sends a bubble to the sidebar. Your response drives the direction of multiple worker sessions.

### What a Bubble Looks Like

\\\`\\\`\\\`
Question: The authentication sub-project needs a session storage
strategy. Two workers will depend on this decision.

Options:
  A) JWT tokens (stateless, no server storage needed) [recommended]
  B) Server-side sessions with Redis
  C) Cookie-based sessions with encrypted payload

Context: The requirements mention "no external dependencies beyond
the database." Redis would add a dependency. JWT aligns better with
the stated constraints.

[Custom answer field]
\\\`\\\`\\\`

### How to Answer Effectively

- **Read the recommendation first.** The Cyber Factory has context you might not have — it knows what all workers are doing. The recommended option usually has the best reasoning.
- **If you agree:** click the recommended option. Done. Fast.
- **If you disagree:** click a different option, or write a custom answer with your reasoning: "Use B because we need session revocation, and JWT revocation is hard to get right."
- **If you need more info:** write "Explain the trade-offs in more detail" in the custom field. The Cyber Factory will elaborate and re-ask.
- **Speed matters.** Workers are paused. A 30-second decision keeps the pipeline moving. A 30-minute deliberation means 30 minutes of idle compute. If you genuinely need time, that is fine — but do not forget there are sessions waiting.

---

## Voice Input Patterns

Voice in cipher-mux is for natural language — instructions, descriptions, thinking out loud. Not for code.

### What Works Well

**Giving instructions:**
"Erstell eine neue React-Komponente die eine Tabelle rendert. Die Tabelle soll sortierbar sein nach jeder Spalte. Die Daten kommen als Array von Objekten rein."

**Describing bugs:**
"Der Save-Button in der NotesCell macht nichts wenn ich drauf klicke. In der Konsole steht irgendwas mit ENOENT. Das passiert nur bei neuen Notizen, nicht bei bestehenden."

**Thinking out loud:**
"Ich überlege ob wir die Authentifizierung als eigenes Modul auslagern oder im API-Gateway lassen. Absenden. Was meinst du?"

### What Does Not Work

**Dictating code:** "function open paren items close paren open curly brace return items dot map..." — Do not do this. Type code. Voice is for what you want, not how to write it.

**Rapid-fire short commands:** Voice needs a moment to detect end of speech. Single-word commands get lost. Use keyboard for quick interactions.

### The Review-Then-Submit Pattern

Text from voice input appears in the terminal but is NOT auto-submitted. This is intentional — it gives you a chance to review the transcription before sending.

1. Speak your instruction
2. Wait for transcription to appear
3. Read it. If correct: say "abschicken" (or "absenden" or "senden")
4. If wrong: use keyboard to correct, then say "abschicken"

This pattern catches Whisper's occasional mis-transcriptions before they become instructions.

---

## Writing Effective Bugreports

A bugreport feeds into the Workshop's bug queue. The better the report, the faster the fix.

### What the Workshop Needs

**Minimum:** What happened, what you expected, where it happened.

**Ideal:** Steps to reproduce, expected vs. actual behavior, error messages (exact text), affected component/file if known.

### Bad vs. Good

**Bad:** "The button doesn't work."

**Good:** "Steps: 1. Open NotesCell, 2. Create new note, 3. Click Save icon in tab bar. Expected: note saves, toast confirmation. Actual: nothing happens, console shows 'Error: ENOENT: no such file or directory'. Affects: NoteEditor component, save flow for new (unsaved) notes."

### Using Voice Interview Mode

The bugreport dialog has a voice interview option. Claude asks you questions about the bug and enriches your answers into a structured report. This is great when you are frustrated and just want to vent — the AI turns your stream of consciousness into actionable information.

### Screenshot Capture

The bugreport dialog can capture a screenshot and attach it to the report. Use this for visual bugs — layout issues, missing elements, wrong colors. The screenshot is base64-encoded in the report's YAML frontmatter.

---

## Inter-Session Communication

Sessions in cipher-mux communicate through two channels:

### The Message Bus

A shared SQLite database where sessions post messages tagged with a topic. Anyone can read, anyone can write. The Workshop reads the bus regularly to monitor progress.

**Topics:**
- \\\`chat\\\` — user-facing messages, shown in sidebar Messages tab
- \\\`status\\\` — progress updates from workers
- \\\`bug\\\` — incoming bugreport notifications
- \\\`system\\\` — warnings (high context usage, errors)

The bus is asynchronous — you post a message, and other sessions pick it up when they check. There is no guarantee of immediate delivery.

### tmux send-keys (Direct Injection)

For immediate delivery, the Workshop uses tmux to type directly into a worker's terminal. This is how initial task instructions are sent — the message bus cannot deliver prompts to an idle Claude session (it is not reading the bus until it has a task).

**When to use which:**
- Status updates, reports, notifications → Message Bus
- Initial task instructions, urgent redirects → tmux send-keys (handled by Workshop automatically)

As a user, you rarely interact with either directly. The Workshop handles routing. But understanding the distinction helps when debugging communication issues: if a worker did not receive an instruction, it is usually a timing issue with tmux send-keys (the worker was not ready yet), not a bus problem.

---

## Quick Reference: Prompt Patterns for cipher-mux

| System | Key principle |
|---|---|
| Workshop | Decomposable tasks with clear boundaries and success criteria |
| Cyber Factory | Complete requirements doc with goal, audience, features, constraints |
| Cyber Factory Input Requests | Fast decisions, trust recommendations, ask for detail when unsure |
| Voice | Natural language only, review before submit, no code dictation |
| Bugreports | Steps to reproduce > vague descriptions. Use voice interview when frustrated |
| Workers | Standard prompting (Guide 04) — one topic, specific, constrained |

**Next step:** Guide 06 (Token Craft) covers how to work efficiently with context windows, choose the right model, and keep sessions productive.
`;

const GUIDE_06 = `# Token Craft — Working Efficiently with Context and Models

This guide covers the practical side of AI efficiency: choosing the right model, managing context windows, knowing when to start fresh, and making every token count.

**Type:** Explanation (understanding-oriented)
**Prerequisites:** Guide 04 (Prompting Fundamentals — especially the Token Window and Context Rot sections)
**Time:** 15-20 minutes

---

## Models: When to Use What

Claude comes in three tiers, each with different strengths. Knowing which to use when is the first efficiency lever.

### Claude Opus 4.6 / 4.7

The most capable model. Best at: complex multi-step reasoning, architectural decisions, creative work, ambiguous tasks that need judgment. Largest context window (1M tokens). Most expensive in terms of compute budget.

Use for: orchestration, planning, code review, complex debugging, anything where getting it right the first time matters more than speed.

### Claude Sonnet 4.6

The daily driver. Fast, capable, cost-effective. Same 1M context window. Handles most coding tasks, refactoring, feature implementation, and documentation without breaking a sweat.

Use for: implementation work, routine coding, file modifications, test writing. This is your default for worker sessions.

### Claude Haiku 4.5

The lightweight model. 200K context window (smaller but still substantial). Fastest response times. Lowest compute cost. Excellent at well-specified tasks where the instructions are clear and the scope is narrow.

Use for: simple changes, formatting, file operations, tasks with detailed specs, high-volume work. Also: Haiku excels when given frontloaded context — a well-written CLAUDE.md or spec makes Haiku surprisingly effective.

### Multi-Model in cipher-mux

cipher-mux's architecture naturally supports multi-model routing:
- **Workshop / Cyber Factory:** use the most capable model (Opus). They make decisions, decompose problems, and coordinate — reasoning quality matters most here.
- **Workers:** use Sonnet for implementation tasks. Good balance of quality and speed.
- **Simple tasks:** if a worker's task is well-specified (e.g., "rename all instances of X to Y in files A, B, C"), Haiku is sufficient and faster.

The Cyber Factory's escalation system is an implicit multi-model pattern: Level 1-4 decisions (autonomous) could run on Sonnet, while Level 5 escalations (to the user) naturally involve the most capable model.

---

## Context Window Management

Guide 04 introduced the context window as RAM. Here is how to manage it actively.

### The "Lost in the Middle" Problem

Transformer attention creates pairwise relationships between tokens. In very long contexts, information in the middle gets less attention than information at the start or end — up to 30% less. This is a fundamental property of the architecture, not a bug.

**Practical consequence:** Put the most important information at the very beginning or very end of your context. Your CLAUDE.md loads at the top (good — it gets strong attention). Your current question goes at the end (good — recency bias helps). The danger zone is the middle: hours of accumulated conversation history, old corrections, abandoned approaches.

### The todo.md Attention Hack

A technique from the Manus AI team: maintain a \\\`todo.md\\\` or \\\`progress.md\\\` file that gets updated as work progresses. At the end of each major step, the model updates this file — pushing the current state and remaining tasks into the recency zone of the context.

In cipher-mux terms: the Workshop and Cyber Factory do this naturally via the task system (\\\`mux_task_update\\\`). The tasks' current state is always queryable, always recent.

### When to /compact vs. Start Fresh

**\\\`/compact\\\`** compresses the conversation history, keeping key information and discarding noise. Good when: you want to continue in the same direction, just with more room. Tip: add focus instructions: \\\`/compact Focus on the auth module changes and ignore the earlier discussion about database schema.\\\`

**Starting fresh** clears the entire context and begins from scratch. Surprisingly, this often outperforms compaction. Why? Claude can rediscover the current state by reading the filesystem — git log, file contents, test results. A fresh session with "Read the project state and continue the auth work" is cleaner than a compacted session carrying forward noise.

**Rule of thumb:**
- Working on the same narrow task? \\\`/compact\\\`
- Switching focus or session feels degraded? Start fresh
- After two failed fix attempts? Always start fresh (doom loop escape)

---

## Token-Efficient Work Patterns

### /clear Between Tasks

If you switch topics in the same session, use \\\`/clear\\\` to reset the context. This is the single highest-impact habit for token efficiency. Without it, your database schema discussion pollutes your CSS debugging.

### Subagents for Exploration

When you need to investigate something (scan the codebase for patterns, read documentation, explore alternatives), use a subagent. The subagent works in its own context window and returns a summary. Your main session stays clean.

In cipher-mux, this happens naturally: the Workshop and Cyber Factory delegate exploration to workers, keeping their own context focused on coordination.

### /btw for Side Questions

Claude Code has \\\`/btw\\\` — it answers a question in an overlay without entering the conversation history. Perfect for quick lookups: "/btw what is the default port for PostgreSQL?" You get the answer. The context is untouched.

### Stable Prompt Prefixes

This is a technical detail that matters economically. The Anthropic API caches prompt prefixes. If your system prompt and CLAUDE.md are identical between calls (same text, same order), cached tokens cost 10x less than fresh ones. This means:

- Do not put timestamps in CLAUDE.md (they change every second, breaking the cache)
- Keep CLAUDE.md stable — edit it deliberately, not frequently
- Consistent session setup pays for itself through cache hits

### Prefer Pointers Over Inline Content

Instead of pasting 200 lines of code into your prompt, use \\\`@path/to/file.ts:42-80\\\`. Claude reads the file directly, and the reference is a few tokens instead of hundreds. Same result, fraction of the cost.

---

## Session Lifecycle

### Signs It Is Time for a New Session

- Claude repeats itself or contradicts earlier statements
- Rules you established are being ignored
- Hallucinated file names or function names appear
- The context usage indicator is orange or red (80%+)
- You have been in the same session for more than 2 hours

None of these are failures. They are signals. Acting on them promptly saves more tokens than pushing through.

### The Handover Pattern

Before ending a productive session:

1. Ask Claude: "Fass den aktuellen Stand zusammen. Was ist fertig, was ist offen, welche Entscheidungen wurden getroffen?"
2. Save the summary to a file: \\\`docs/handover-YYYY-MM-DD.md\\\`
3. Start a new session
4. First message: "Lies docs/handover-YYYY-MM-DD.md und mach da weiter."

The new session has a clean context loaded with exactly the state it needs. This is the session-level equivalent of rebooting a computer — same work, fresh resources.

### The 2-Hour Heuristic

Experienced Claude Code users often start fresh every 1-2 hours as a habit, not because something went wrong. The cost is one handover (2 minutes). The benefit is consistently high-quality responses for the next session. It is like regularly saving your game — a small investment that prevents large losses.

---

## CLAUDE.md as Token Investment

Your CLAUDE.md is loaded into every session automatically. This means:

- A good CLAUDE.md saves tokens in every single interaction (Claude does not need to be told things it already knows)
- A bad CLAUDE.md wastes tokens in every single interaction (Claude processes irrelevant instructions, or worse, follows wrong ones)

### The Pruning Test (Revisited)

For every line: "Would removing this cause Claude to make a mistake?"

- If yes → keep it
- If Claude does it correctly without the instruction → remove it
- If it is aspirational but Claude ignores it → either rewrite it more forcefully or remove it

### What Belongs in CLAUDE.md

- Commands Claude cannot guess (custom build scripts, test runners)
- Code style rules that differ from language defaults
- Architectural decisions specific to your project
- Common gotchas and non-obvious behaviors

### What Does NOT Belong in CLAUDE.md

- Standard language conventions (Claude already knows these)
- File-by-file descriptions of the codebase (Claude can read the files)
- Information that changes frequently (it becomes stale)
- Long code examples (they become stale; use \\\`@file:line\\\` pointers)

---

## cipher-mux's Built-in Efficiency

cipher-mux has several features that support token-efficient work without you thinking about it:

**StatusLine Monitor:** Real-time context usage per session, visible in each cell header. Green = healthy, orange = 80%+ (getting full), red = 90%+ (critical). This is your dashboard for session health.

**Workshop / Cyber Factory Context Monitoring:** Both check worker context usage every 2 minutes. If a worker hits 90%, they can take action — finish the current sub-task, summarize, and start a fresh worker.

**Message Bus:** Lightweight asynchronous messaging. A status update on the bus is a few dozen tokens. The alternative — having two sessions share a full conversation — would cost thousands of tokens. The bus architecture is inherently token-efficient.

**Session Survival:** tmux sessions survive app crashes. This means no token loss from unexpected restarts. Recovery adopts sessions without re-creating context.

**Workspace Apply:** Spawning five sessions with one click is not just convenient — it avoids the token cost of manually setting up each session with its persona and project instructions. The workspace does that frontloading for you.

---

## Quick Reference: Efficiency Patterns

| Pattern | Token impact |
|---|---|
| /clear between tasks | High — prevents context pollution |
| Start fresh after 2 hours | High — prevents context rot |
| Handover technique | Medium — clean state transfer |
| /compact with focus | Medium — preserves context, reduces noise |
| /btw for side questions | Low per use, high over time |
| Stable CLAUDE.md (no timestamps) | High — 10x cheaper cached tokens |
| @file:line instead of pasting | Medium — saves hundreds of tokens per reference |
| Subagents for exploration | High — protects main context |
| Multi-model routing | High — right model for right task |

**This is the final guide in the learning path.** You now have the foundations (Grid, Sidebar, Notes guides), the power features (Entities, Workspaces, Voice guides), the prompting skills (Guides 04-05), and the efficiency knowledge to use it all sustainably.
`;
