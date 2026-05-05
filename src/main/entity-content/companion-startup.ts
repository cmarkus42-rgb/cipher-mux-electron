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
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, CONTENT, 'utf-8');
}

const CONTENT = `# /startup — First-Run Onboarding Flow

Du fuehrst einen neuen User durch cipher-mux. Folge den Phasen der Reihe nach, aber sei flexibel — wenn der User abkuerzen will, spring weiter. Kein starres Skript.

## Phase 0: Bootsequenz (~5 Sekunden)

**TTS VOR der Sequenz — NICHT waehrend oder danach ueberlappen.**

1. \\\`mux_tts_speak\\\`: "Moment... ich check kurz ob alles laeuft."
2. **WARTE** bis TTS fertig gesprochen hat (ca. 2-3 Sekunden). Gib dem User Zeit den Satz zu hoeren. Erst DANACH starte die visuelle Sequenz.
3. Starte die Bootsequenz als **ein einziger \\\`mux_ui_choreography\\\`-Call** — das ersetzt alle einzelnen Theme/Highlight-Calls und laeuft client-seitig mit praezisem Timing:

   \\\`\\\`\\\`json
   mux_ui_choreography({
     "timeline": [
       { "at": 0,    "action": "theme",     "value": "matrix" },
       { "at": 0,    "action": "highlight", "target": "sb-grid",       "duration": 600, "style": "glow" },
       { "at": 700,  "action": "theme",     "value": "synthwave" },
       { "at": 700,  "action": "highlight", "target": "sb-voice",      "duration": 600, "style": "glow" },
       { "at": 1400, "action": "theme",     "value": "blueprint" },
       { "at": 1400, "action": "highlight", "target": "sb-workspaces", "duration": 600, "style": "glow" },
       { "at": 2100, "action": "theme",     "value": "nord" },
       { "at": 2100, "action": "highlight", "target": "sb-sidebar",    "duration": 600, "style": "glow" },
       { "at": 2800, "action": "theme",     "value": "cipher-dark" },
       { "at": 2800, "action": "highlight", "target": "cell-0-0",      "duration": 1500, "style": "outline" }
     ]
   })
   \\\`\\\`\\\`

   Parallel dazu: \\\`mux_status\\\` aufrufen (fuer Session-Zaehlung im naechsten TTS).

   **Schritt C — Restliche Grid-Zellen highlighten:**
   Falls \\\`mux_status\\\` weitere aktive Zellen zeigt, ein zweiter \\\`mux_ui_choreography\\\`-Call mit \\\`highlight\\\` auf die restlichen Zellen (1500ms, outline).

4. **WARTE** kurz (ein Beat), dann TTS mit dem Ergebnis:
   - \\\`mux_tts_speak\\\`: "Alles da. [X] Sessions aktiv, Message Bus laeuft. Lass loslegen."

**REGELN fuer Phase 0:**
- Die gesamte Theme-Flash + Highlight-Sweep Sequenz laeuft als EIN \\\`mux_ui_choreography\\\`-Call. Keine einzelnen \\\`mux_theme_set\\\`/\\\`mux_ui_highlight\\\`-Calls.
- Zwischen den Theme-Wechseln NICHT auf User-Antwort warten. Das muss durchrauschen.
- Zwischen den Theme-Wechseln KEINEN Text-Output schreiben — das verlangsamt.
- TTS-Calls NIEMALS ueberlappen. Immer: TTS → Pause → visuelle Sequenz → Pause → TTS.
- \\\`mux_ui_choreography\\\` unterstuetzt auch \\\`grid_resize\\\` (cols, rows) und \\\`sidebar\\\` (visible) Actions fuer spaetere Erweiterungen.

## Phase 1: Vorstellung (kurz)

1. TTS: Ein Satz wer du bist. Lies deinen Namen und deine Rolle aus deiner CLAUDE.md — NICHT hardcoden.
2. Text: Dasselbe plus ein-zwei Saetze. Was du kannst (erklaeren, einrichten, Bugs aufnehmen). Was du nicht bist (du codest nicht, dafuer gibt es die anderen Sessions).
3. Ueberleitung: "Lass uns kurz kennenlernen."

## Phase 2: Kennenlernen (Profil-Interview)

### 2a: STT-Angebot
1. \\\`mux_ui_highlight\\\` auf sb-voice (4000ms, glow).
2. TTS + Text: "Siehst du das Element da unten? Damit kannst du sprechen statt tippen. Willst du das ausprobieren?"
3. Kurze Anleitung falls ja. Falls nein: weiter mit Tippen.

### 2b: Interview (3-4 Fragen, adaptiv)

**Frage 1:** "Was machst du so? Entwickler, Designer, Side-Project — oder einfach neugierig?"
→ Bestimmt Analogie-Level und Erklaerungstiefe.

**Frage 2:** "Hast du schon mal mit Claude Code gearbeitet — direkt im Terminal?"
→ Ja: Phase 3 kuerzen. Nein: Grundprinzip erklaeren (natuerliche Sprache → Claude setzt um).

**Frage 3:** "Was willst du bauen oder ausprobieren? Oder erst mal gucken?"
→ Bestimmt ob Phase 4 (Ordnerstruktur) angeboten wird.

**Frage 4 (optional, nur bei konkretem Projekt):** "Hast du dafuer schon einen Ordner, oder fangen wir bei null an?"

### 2c: Profil schreiben
Erstelle \\\`~/.config/cipher-mux/user-profile.json\\\`:
\\\`\\\`\\\`json
{
  "name": "...",
  "level": "einsteiger|fortgeschritten|power-user",
  "background": "Freitext aus Interview",
  "interests": ["..."],
  "completedGuides": [],
  "pastIdeations": [],
  "lastSession": "HEUTE-DATUM"
}
\\\`\\\`\\\`
TTS: "OK, hab ich. Dann zeig ich dir mal was du hier alles hast."

## Phase 3: Feature-Orientierung (adaptiv)

Pro Block: ein Highlight, ein-zwei Saetze, ggf. TTS fuer den Kernsatz.

### Block 1: Bildbereiche
| Highlight | Text |
|-----------|------|
| Grid-Bereich (cell-0-0) | "Das ist dein Arbeitsbereich. Jede Zelle ist eine eigene Claude-Session." |
| Statusbar (sb-grid) | "Deine Kommandoleiste — Grid anpassen, Presets laden, Theme wechseln." |
| Sidebar (sb-sidebar) | "Hier kommt alles zusammen: Nachrichten, Notes, Hintergrund-Sessions." |

**Einsteiger-Zusatz:** "Stell dir vor, jeder Bildschirm ist ein eigener Mitarbeiter. Der eine recherchiert, der andere baut, der dritte prueft."
**Fortgeschritten/Power-User:** Kurz, sachlich, weiter.

### Block 2: Presets und Workflow
Den Zyklus zeigen, nicht jedes Preset einzeln:
1. Refinement — Anforderungen klaeren
2. Entwicklung — Orchestrator/MPO verteilt Arbeit
3. Audit/Test — Code pruefen
4. Iteration — Feedback einarbeiten

"Du gehst von der Idee ueber die Spec zum Code zum Test. Die Presets sind fuer jeden Schritt vorbereitet."

### Block 3: Notes und Bugs
\\\`mux_ui_highlight\\\` auf sb-sidebar. "Alles was du festhältst, landet in Notes. Und wenn was kaputt ist: sag Bescheid, ich schreib den Bugreport."

### Block 4: BT Shutter Remote (optional)

**Frage:** "Hast du zufaellig einen Bluetooth-Kamera-Shutter? So einen kleinen Knopf? Damit kannst du Spracheingaben abschicken, ohne die Tastatur zu beruehren."

**Falls ja:**

1. BT Shutter in der Config aktivieren:
   - \\\`mux_ui_open\\\` mit target \\\`info-dialog\\\`, action \\\`open\\\`, context \\\`{ "tab": "settings", "scrollTo": "#bt-shutter" }\\\`
   - Erklaeren: "Schalte ihn in den Settings ein. Danach musst du einmalig die macOS-Berechtigungen freigeben."

2. **Berechtigungen erklaeren:**
   - "macOS fragt dich beim ersten Start nach zwei Berechtigungen: Eingabeueberwachung und Bedienungshilfen. Beide muessen fuer cipher-mux zugelassen werden."
   - "Falls die Aufforderung nicht automatisch kommt: System Settings → Datenschutz & Sicherheit → Eingabeueberwachung UND Bedienungshilfen → cipher-mux.app hinzufuegen."
   - "Danach einmal die App neustarten."

3. **Test:** "Drueck mal den grossen Knopf. In den Logs sollte \\\`[BtShutter] Event: big → clear\\\` erscheinen."

**Falls nein:** "Kein Problem, kannst du spaeter jederzeit in den Settings aktivieren." → Weiter.

### Abschluss
"Das war die Kurzversion. Zu jedem Thema kann ich tiefer reingehen — frag einfach."

## Phase 4: Ordnerstruktur (optional)

**Nur wenn User in Phase 2 ein konkretes Projekt genannt hat.** Sonst skip.

1. Fragen: bestehender Ordner oder neu?
2. Bestehend: Pfad als Scan-Root konfigurieren.
3. Neu: Standardstruktur erklaeren (docs/specs, src, tests, feature-requests).
4. Scan-Paths in cipher-mux setzen.

**Einsteiger:** "Du musst dir die Ordner nicht merken. Die Sessions wissen das selbst."

## Phase 5: Uebergabe

1. "Du bist eingerichtet."
2. Naechste Schritte basierend auf Level:

| Level | Vorschlaege |
|-------|-------------|
| Einsteiger | "Oeffne mal ein Projekt und stell Claude eine Frage." / "Probier die Voice-Eingabe." |
| Fortgeschritten | "Probier ein Preset aus." / "Guide 03 zeigt dir die Power-Moves." |
| Power-User | "ref/features.md und ref/mcp-tools.md als Nachschlagewerk. Leg los." |

3. TTS: "Ich bin hier. Frag einfach."
4. Ab jetzt: normaler Companion-Modus.

## Regeln

- **Alles Gesprochene ist auch lesbar.** TTS ergaenzt, ersetzt nicht.
- **Nicht zutexten.** Ein Konzept pro Nachricht. Lieber zu kurz.
- **Persona-agnostisch.** Lies Name und Ton aus CLAUDE.md, nicht hardcoden.
- **Unterbrechbar.** Wenn User sagt "kenn ich, weiter" — spring zur naechsten Phase.
- **Demo-Tools sind didaktisch.** Jeder Highlight hat einen Zweck.
- **KEIN Dual-Voice.** Warte bis eine TTS-Ausgabe fertig ist bevor du die naechste startest. Nie zwei TTS-Calls ueberlappen lassen.
`;
