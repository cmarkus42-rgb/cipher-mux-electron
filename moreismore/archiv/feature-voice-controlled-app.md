# Feature Request: Voice-Controlled App

**Datum:** 2026-04-23
**Prio:** Offen / Backlog
**Status:** Idee

## Beschreibung

Die gesamte cipher-mux App soll per Voice steuerbar werden — nicht nur STT-Input in Sessions, sondern die komplette UI-Interaktion.

## Mögliche Ausprägungen (offen)

- Session erstellen, wechseln, schließen per Sprachbefehl
- Grid-Layout steuern (Split, Resize, Focus)
- Voice-Kommandos für Navigation (Cockpit, Chatroom, Terminals)
- Orchestrator-Befehle per Sprache auslösen
- Bugreport-Interview starten/stoppen
- Settings ändern
- "Hey Cipher" Wake-Word?

## Bereits implementiert (2026-04-23)

- Voice-Kommandos in Session-Mode: "abschicken"/"absenden"/"senden" → Enter, "neue zeile" → Newline
- Text wird ohne Enter diktiert, Submit per Sprachbefehl
- Funktioniert bei deutlicher Aussprache zuverlässig

## Verbesserungsideen

- Fuzzy-Matching für Commands (Levenshtein-Distanz) — Whisper erkennt kurze Wörter manchmal ungenau
- Mehr Commands: "löschen", "alles löschen", "rückgängig"

## Kontext

Voice-Command-Layer existiert bereits im VoiceInputRouter. Die Infrastruktur (VAD, Whisper, IPC) ist vorhanden — Erweiterung auf App-weite Steuerung wäre der nächste Schritt.
