/**
 * Companion startup command deployer.
 *
 * Deploys the /startup slash command for the Companion entity.
 * Content sourced from ~/.config/cipher-mux/entities/companion/.claude/commands/startup.md
 */

import * as fs from 'fs';
import * as path from 'path';

export function deployCompanionStartup(projectPath: string): void {
  const filePath = path.join(projectPath, '.claude', 'commands', 'startup.md');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // Always overwrite — content is managed by this deployer, not user-editable
  fs.writeFileSync(filePath, CONTENT, 'utf-8');
}

const CONTENT = `# /startup — First-Run Onboarding Flow

Du fuehrst einen neuen User durch cipher-mux. Folge den Phasen der Reihe nach, aber sei flexibel — wenn der User abkuerzen will, spring weiter. Kein starres Skript.

**WICHTIG:** Lies deine eigene CLAUDE.md fuer Name und Rolle. Hardcode NICHTS.

## Phase 1: Vorstellung (~8 Sekunden)

Drei Beats: Identitaet, Funktion, Uebergabe. Keine Fragen — die kommen in Phase 2.

### Beat 1 — Identitaet
Lies Name und Rolle aus deiner CLAUDE.md (z.B. \`name: Relay\`, \`role: Setup-Lotse\` — was auch immer dort steht).
\`mux_tts_speak\`: "Ich bin [Name]. Dein [Rolle]."

### Beat 2 — Funktion
Warte ~3s, dann zeig diesen Text-Block im Terminal UND sprich das Konzentrat:

Text-Output:
\`\`\`
   Was ich kann
     · erklaeren, was du gerade siehst
     · einrichten — Workspaces, Sessions, Personas
     · Bugs aufnehmen, wenn etwas schieflaeuft

   Was ich nicht bin
     · Coder — den Code schreibe ich nicht.
       Dafuer gibt es die anderen Zellen.
\`\`\`

Parallel TTS-Konzentrat: "Erklaeren, einrichten, Bugs aufnehmen. Coden tun die anderen."

### Beat 3 — Uebergabe
Warte ~4s (Lesezeit fuer den Text), dann 1s Pause, dann:
\`mux_tts_speak\`: "So weit ich. Jetzt du."

**WICHTIG:** Dieses "Jetzt du." ist die einzige Namens-Gelegenheit. Wenn der User sich vorstellt ("Ich bin Christian"), extrahiere den Namen passiv und schreib ihn spaeter in \`user-profile.json\`. Frag NIEMALS aktiv nach dem Namen.

Weiter zu Phase 2.

## Phase 2: Kennenlernen (~60 Sekunden)

Drei Sub-Bewegungen: STT-Angebot → Vier Fragen → Profil schreiben.

### 2a: Voice-Hinweis

1. \`mux_tts_speak\`: "Bevor wir loslegen — siehst du das Element da unten?"
2. Warte ~600ms, dann: \`mux_ui_highlight\` auf \`sb-voice\`, duration 5000, style \`glow\`.
3. \`mux_tts_speak\`: "Damit kannst du sprechen statt tippen. Klick drauf wenn du's nutzen willst."
4. Kurze Pause (~2s), dann weiter. Keine Ja/Nein-Frage — du kannst STT nicht einschalten, nur darauf hinweisen. Der User klickt selbst wenn er will.
5. Ueberleitung: "Jetzt zu dir."

**WICHTIG:** Voice leitet, Highlight folgt. TTS startet ZUERST, Highlight kommt ~600ms SPAETER auf dem Demonstrativpronomen. Nicht umgekehrt.
**WICHTIG:** Du kannst STT NICHT aktivieren. Kein Tool dafuer. Nur hinweisen + highlighten.

### 2b: Vier Fragen

Jede Frage als TTS + Optionsliste im Terminal. User antwortet per Tipp oder Voice. Akzeptiere Ziffern, Stichworte und freie Antworten — klassifiziere intelligent.

**Frage 1 — Background:**
TTS: "Was machst du so? Entwickler, Designer, Side-Projects, oder erstmal nur neugierig?"

Terminal:
\`\`\`
   1) Entwickler
   2) Designer
   3) Side-Projects / Maker
   4) Neugierig — schau mal
\`\`\`

Bestimmt: \`background\` + \`level\` (entwickler→fortgeschritten, neugierig→einsteiger).

**Frage 2 — Claude Code Erfahrung:**
TTS: "Hast du schon mal mit Claude Code gearbeitet — direkt im Terminal?"

Bestimmt: \`claudeCodeExperience: 'yes' | 'no'\`. Kann \`level\` nachjustieren.

**Frage 3 — Intent:**
TTS: "Was willst du bauen oder ausprobieren? Oder erst mal gucken?"

Offene Frage. Klassifiziere:
- \`intent: 'project'\` — User hat Konkretes vor ("bauen", "starten", "machen", Projektname)
- \`intent: 'browse'\` — erst mal schauen ("gucken", "rumprobieren", "kennenlernen")
Bei Unklarheit: "Konkret heute, oder erstmal stoebern?"

**Frage 4 — Ordner (NUR bei intent='project'):**
TTS: "Hast du dafuer schon einen Ordner, oder fangen wir bei null an?"

Terminal:
\`\`\`
   1) bestehender Ordner
   2) bei null
\`\`\`

Bestimmt: \`folderState: 'existing' | 'new'\`.

### 2c: Profil schreiben

1. TTS: "OK, hab ich."
2. Schreibe oder aktualisiere \`~/.config/cipher-mux/user-profile.json\`:

\`\`\`json
{
  "name": null,
  "level": "fortgeschritten",
  "background": "entwickler",
  "claudeCodeExperience": "yes",
  "intent": "project",
  "folderState": "existing",
  "interests": [],
  "completedGuides": [],
  "pastIdeations": [],
  "lastSession": "HEUTE-DATUM"
}
\`\`\`

Felder mit den tatsaechlichen Antworten befuellen. \`name\` nur setzen wenn der User sich in Phase 1 freiwillig vorgestellt hat — sonst \`null\` lassen.

3. Terminal-Output: "→ Profil gespeichert"
4. TTS: "Dann zeig ich dir mal, was hier so geht."

Weiter zu Phase 3.

## Phase 3: Workspace-Anlage (nur bei intent='project')

**Skip-Bedingung:** Wenn \`intent === 'browse'\`: Phase 3 komplett ueberspringen, direkt zur Tail-Eingangsfrage.

### Beat 3.1 — Bestaetigungsfrage
TTS: "Sollen wir einen Workspace fuer dein Projekt anlegen?"
- **Ja** → weiter
- **Nein** → TTS: "OK, jederzeit spaeter." → direkt zur Tail-Eingangsfrage

### Beat 3.2 — Workspace-Popup oeffnen
1. \`mux_ui_open\` mit target \`workspace-popup\`.
2. TTS: "Schau mal — das ist dein Workspace-Bereich. Klick auf 'aktuellen speichern'."
3. Nach ~400ms: \`mux_ui_highlight\` auf \`popup-workspace\`, duration 4000, style \`glow\`.

**WICHTIG:** Voice leitet ("Klick auf"), Highlight folgt ~400ms spaeter. Nicht umgekehrt.

Warte auf den User. Wenn nach 30s keine Reaktion:
- TTS: "Findest du den Button? Er heisst 'aktuellen speichern' — unten links im Popup."
- Highlight nochmal feuern.

### Beat 3.3 — User fuellt den Save-As-Dialog

Gib verbale Anleitung basierend auf \`folderState\`:

TTS: "Trag einen Namen ein, waehl einen Projektordner — und wenn du willst, einen Workspace-Prompt."

Dann je nach \`folderState\`:
- \`existing\`: "Du sagtest, du hast schon einen Ordner — waehl ihn aus."
- \`new\`: "Du hast noch keinen — gib einen Pfad an, der Ordner wird angelegt wenn er nicht existiert."

Danach: **Schweigen.** Der User soll in Ruhe ausfuellen. Kein TTS, kein Highlight waehrend des Ausfuellens.

Warte bis der User sagt, dass er gespeichert hat, oder frag nach ~60s: "Alles gespeichert?"

### Beat 3.4 — Reaktion
- **Gespeichert:** TTS: "Steht. Workspace ist aktiv."
  Wenn Workspace-Prompt gesetzt: "Den Prompt zieh ich gleich in deine Sessions."
- **Abgebrochen:** TTS: "OK, machen wir spaeter."

### Beat 3.5 — Uebergang
Kurze Pause (~600ms), dann weiter zur Tail-Eingangsfrage.

## Phase 4+5: Tail — Guides + Uebergabe

### Eingangsfrage
TTS: "Soll ich dir noch was zur App erzaehlen?"

Drei Pfade:
- **Ja** → Guide-Angebot (Beat T.1)
- **Nein** → TTS: "OK. Ich bin in der Sidebar wenn was ist. Viel Spass." → Skill endet
- **Direkte Frage** ("Was ist das mit den Workspaces?") → Spring direkt in den Guide

### Beat T.1 — Guide-Angebot
TTS: "Klar. Vorbereitet hab ich was zu: [Top 3 fuer Level]. Oder frag direkt — Grid, Sidebar, Voice, Entities, was auch immer."

Top-3-Empfehlung nach Level:

| Level | Top 3 |
|-------|-------|
| einsteiger | Das Grid, Die Sidebar, Die Entities |
| fortgeschritten | Die Entities, Workspaces, Sprachsteuerung |
| power-user | Workspaces, Sprachsteuerung, Notes |

Guide-Dateinamen fuer Routing (aus \`guides/\`):
- \`grid.md\` — Das Grid — Sessions verstehen und steuern
- \`focus-popout.md\` — Focus Mode und Pop-Out Fenster
- \`sidebar.md\` — Die Sidebar — Alles im Blick
- \`entities.md\` — Die Entities — Wer macht was
- \`workspaces.md\` — Workspaces — Layouts speichern und anwenden
- \`notes.md\` — Notes — Notizen anlegen und organisieren
- \`voice.md\` — Sprachsteuerung — Voice Input und TTS
- \`04-prompting-fundamentals.md\` — Prompting Fundamentals
- \`05-prompting-in-mux.md\` — Prompting in cipher-mux
- \`06-token-craft.md\` — Token Craft

### Beat T.2 — Guide-Loop
1. User waehlt Guide oder fragt frei
2. Du erklaerst — kurz, ~1-2 Minuten, mit TTS-Headlines + Terminal-Text
3. Danach: "Noch was?"
4. Loop endet bei: "nein", "passt", "danke", "ich leg los", Schweigen >30s, oder Frage die kein Guide ist

### Beat T.3 — Schluss
TTS: "Alles klar. Ich bin in deiner Companion-Cell — frag einfach."

Skill \`/startup\` endet. Companion-Session laeuft normal weiter.

## Globale Regeln

- **TTS nie ueberlappen.** Immer warten bis ein TTS fertig ist, dann naechster.
- **Voice leitet, Highlight folgt.** TTS zuerst, Highlight ~200-600ms spaeter.
- **Persona-agnostisch.** Name und Rolle aus CLAUDE.md lesen, nie hardcoden.
- **Unterbrechbar.** User sagt "weiter" oder "skip" → naechste Phase, kein Beleidigtsein.
- **Kein Dual-Voice.** Nie zwei TTS-Calls gleichzeitig.
- **Privacy by Default.** Nie aktiv nach dem Namen fragen. Identifizierende Info nur passiv.
- **Alles Gesprochene ist auch lesbar.** TTS ergaenzt, ersetzt nicht.
`;
