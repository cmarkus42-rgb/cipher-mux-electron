# Manuelle Testcases — Integration Build v0.8.4-beta

**Branch:** `main`
**Datum:** 2026-04-23

---

## 1. Context/Token-Usage Anzeige (BUG-2026-04-21-9GM8RT)

- [ ] App starten, mindestens 2 Sessions aktiv
- [ ] Pruefen: Wird Context/Token-Usage irgendwo sichtbar angezeigt? (StatusBar, Header, oder Panel)
- [ ] Neue Session erstellen → Usage sollte nach wenigen Sekunden erscheinen
- [ ] Session mit hohem Verbrauch → Usage-Wert plausibel?
- [ ] Pruefen: `/tmp/cipher-mux/context/` enthaelt JSON-Dateien pro Session

## 2. Audio Echo Cancellation (BUG-2026-04-21-2ZT9DM)

- [ ] Voicemode aktivieren mit **externen Speakern** (nicht Kopfhoerer)
- [ ] Agent spricht → Mikrofon sollte NICHT die Speaker-Ausgabe aufnehmen
- [ ] Kein Feedback-Loop / Echo hoerbar
- [ ] Barge-in (reinreden waehrend Agent spricht) funktioniert noch korrekt
- [ ] Mit Kopfhoerern testen → Verhalten unveraendert

## 3. Grid-Hoehe bei Zeilenwechsel (BUG-2026-04-22-FA2RDD)

- [ ] App mit 2 Sessions starten (1 Zeile, 2 Spalten)
- [ ] 3. Session hinzufuegen → 2. Zeile entsteht
- [ ] Pruefen: Sessions werden NICHT gestaucht — App waechst in der Hoehe
- [ ] Scrollbar erscheint wenn Fenster kleiner als Grid
- [ ] 4., 5., 6. Session hinzufuegen → Hoehe waechst weiter, Mindesthoehe pro Session bleibt
- [ ] Session entfernen → Grid schrumpft wieder
- [ ] **WICHTIG:** Spaltenbreite darf sich NICHT veraendert haben

## 4. Terminal Text-Kontrast (BUG-2026-04-22-8RR3JX)

- [ ] Terminal-Session oeffnen
- [ ] Text-Highlights/Selektionen pruefen: Gut lesbar?
- [ ] Ivory/Light Theme: Helle Farben (weiss, hellblau) muessen klar lesbar sein
- [ ] Dark Theme: Selektierter Text muss sich deutlich vom Hintergrund abheben
- [ ] ANSI-Farben in Terminal-Output pruefen (git diff, ls --color, etc.)

## 5. Input-Request Sidebar-Panel (Feature: sidebar-input-requests)

### 5.1 R-Button + Badge
- [ ] "R"-Button im OPS-Bar sichtbar, neben "C"
- [ ] Badge zeigt rote Zahl wenn offene Requests existieren
- [ ] Badge verschwindet wenn alle Requests beantwortet

### 5.2 Test-Daten anlegen
Datei erstellen: `/Users/Shared/Nextcloud/Claude/MultiProjectOrchestrator - MPO/state/input-requests.json`
```json
{
  "requests": [
    {
      "id": "ir-test-001",
      "type": "bubble",
      "projectId": "test-project",
      "question": "Soll die API REST oder GraphQL sein?",
      "context": "Test-Kontext fuer manuelle Verifizierung.",
      "options": [
        { "key": "a", "label": "REST", "description": "Konsistent" },
        { "key": "b", "label": "GraphQL", "description": "Flexibler" }
      ],
      "recommendation": "a",
      "status": "open",
      "answer": null,
      "createdAt": "2026-04-22T14:30:00Z",
      "answeredAt": null
    },
    {
      "id": "ir-test-002",
      "type": "review-link",
      "projectId": "test-project",
      "title": "Strategische Entscheidungen",
      "filePath": "/tmp/test-review.md",
      "status": "open",
      "createdAt": "2026-04-22T14:35:00Z",
      "answeredAt": null
    }
  ],
  "lastUpdated": "2026-04-22T14:35:00Z"
}
```

### 5.3 Bubble-UI (Typ A: Inline-Frage)
- [ ] R-Button klicken → Panel oeffnet sich
- [ ] Bubble mit Frage "REST oder GraphQL?" sichtbar
- [ ] Optionen a/b angezeigt, Empfehlung "a" gelb markiert
- [ ] Klick auf Bubble → Textarea fuer Inline-Editing erscheint
- [ ] Antwort eingeben + Save klicken
- [ ] JSON-Datei pruefen: `answer` und `answeredAt` gesetzt, `status: "answered"`
- [ ] Badge-Zaehler aktualisiert sich

### 5.4 Review-Link (Typ B)
- [ ] Vor Test: `echo "# Test Review" > /tmp/test-review.md`
- [ ] Review-Link-Bubble sichtbar mit Titel "Strategische Entscheidungen"
- [ ] Klick → CotEditor oeffnet `/tmp/test-review.md`

### 5.5 File-Watcher
- [ ] JSON-Datei extern aendern (neuen Request hinzufuegen)
- [ ] Panel aktualisiert sich automatisch (< 1 Sekunde)
- [ ] Badge-Count aktualisiert sich

### 5.6 Keine Seiteneffekte
- [ ] Andere Satellite-Panels (Commands, etc.) funktionieren weiterhin
- [ ] App-Performance unveraendert

---

## 6. Voice: Session-Input (STT → tmux) [NEU v0.8.4]

- [x] Voice-Toggle in Statusbar einschalten
- [x] Session fokussieren, sprechen → Text erscheint im Terminal (ohne Enter)
- [x] "Abschicken" / "Senden" / "Absenden" sagen → Enter wird gesendet
- [x] "Neue Zeile" sagen → Zeilenumbruch ohne Submit
- [x] Mehrere Saetze diktieren, dann "Abschicken" → alles wird gesendet
- [x] LED springt nach Transkription sofort auf gruen (kein 90s Hang)
- [x] Focus-Wechsel auf andere Session → naechste Eingabe geht an neue Session
- [x] Voice deaktivieren → LED aus, keine VAD-Events mehr

## 7. Voice: Bug-Assistant (STT + LLM + TTS) [NEU v0.8.4]

- [x] Bugreport-Dialog oeffnen → "voice" Button sichtbar
- [x] Voice starten → VAD laeuft, Greeting-Bubble erscheint
- [x] Bug beschreiben → Whisper transkribiert, Ollama antwortet
- [x] TTS spricht die Antwort (Piper, deutsche Stimme)
- [x] Chat-Bubbles scrollen automatisch nach unten bei neuen Turns
- [x] Nach 2-3 Runden: Report wird generiert, in Textarea uebernommen
- [x] Voice stoppen → Mikrofon wird freigegeben

## 8. Voice: Mode-Trennung [NEU v0.8.4]

- [x] Session-Voice aktiv → Bugreport oeffnen → Voice starten
- [x] Session-Voice wird automatisch suspendiert (kein Doppel-VAD)
- [x] Bugreport schliessen → Session-Voice wird restauriert
- [x] Bugreport-Voice ohne vorherige Session-Voice → kein Fehler

---

## 9. Regressions-Check

- [ ] Sessions erstellen/loeschen funktioniert
- [ ] Chatroom funktioniert
- [ ] Bugreport-Dialog funktioniert
- [ ] Theme-Wechsel (Ivory/Dark) funktioniert
- [ ] Keyboard Shortcuts (Cmd+B etc.) funktionieren
