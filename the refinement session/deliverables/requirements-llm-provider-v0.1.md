# Anforderungen — Konfigurierbare LLM-Provider

## Vision

cipher-mux nutzt an mehreren Stellen ein LLM (Bugreport-Interview, Note-Tagging). Aktuell ist das hart an Ollama gebunden. User sollen ihren bevorzugten LLM-Provider konfigurieren koennen — lokal oder Cloud.

## Zielgruppe

Primaer: cipher-mux User ohne lokales Ollama-Setup.
Sekundaer: Power-User die staerkere Modelle (GPT-4o, Claude) fuer komplexere Tasks einsetzen wollen.
Alle: Fortgeschrittene bis Power-User, die wissen was ein API-Key ist.

## Funktionale Anforderungen

1. [MUST] Generisches `LLMProvider`-Interface das `OllamaClient` ersetzt
2. [MUST] Drei Provider-Implementierungen: Ollama (Default), OpenAI-kompatibel, Anthropic
3. [MUST] Settings-UI mit Provider-Auswahl, Endpoint-URL, API-Key, Model-Name
4. [MUST] Globaler Provider — ein Setting fuer alle LLM-Features
5. [MUST] Graceful degradation: kein Provider konfiguriert → LLM-Features nicht verfuegbar, kein Crash
6. [SHOULD] Ollama-Autodetection: wenn Ollama lokal laeuft, automatisch als Default nutzen
7. [SHOULD] Test-Button in Settings: API-Key validieren mit einem Probe-Call
8. [COULD] Provider-Presets: vorkonfigurierte Endpoints fuer OpenAI, Anthropic, OpenRouter, Groq

## Nicht-funktionale Anforderungen

- API-Keys werden im ConfigStore gespeichert (JSON auf Disk, nicht verschluesselt)
- Warnung in der UI wenn API-Keys konfiguriert sind ("Keys werden unverschluesselt gespeichert")
- Kein Netzwerk-Call ohne explizite User-Aktion (ausser Ollama-Autodetect)
- Interface ist synchron (Request/Response), kein Streaming in v1

## Kern-Workflow

1. User oeffnet Settings
2. Sieht Section "LLM-Provider"
3. Waehlt Provider-Typ (Ollama / OpenAI-kompatibel / Anthropic)
4. Bei Ollama: Endpoint-URL (Default: localhost:11434), Model-Name
5. Bei Cloud: Endpoint-URL (mit Preset oder Custom), API-Key, Model-Name
6. Optional: klickt "Verbindung testen"
7. Speichert → alle LLM-Features nutzen ab sofort den neuen Provider
8. Wenn kein Provider und kein Ollama: Settings zeigen Hinweis, LLM-Features sind ausgegraut

## Scope / MVP-Abgrenzung

### Drin (v1)
- Generisches Interface + drei Provider
- Settings-UI
- Migration: bestehende OllamaClient-Aufrufe auf neues Interface umstellen
- Graceful degradation

### Bewusst draussen (spaeter)
- Per-Feature Provider-Override (z.B. Tagging: Ollama, Bugreport: Claude)
- Keychain/Secure-Storage fuer API-Keys
- Streaming-Responses
- Claude-Session als LLM-Backend
- Model-Discovery (verfuegbare Modelle vom Endpoint abfragen)

## Constraints

- TypeScript strict mode
- Electron Main Process (kein Renderer-seitiger API-Call)
- ConfigStore als Persistenz (bestehender JSON-Store)
- Ollama-spezifische Features (keep_alive, model-pull) bleiben in der Ollama-Implementierung
- Bestehende Tests fuer BugreportInterview und NoteTagging muessen weiter funktionieren

## Bekannte Risiken und Annahmen

| Risiko | Impact | Mitigation |
|--------|--------|------------|
| "OpenAI-kompatibel" ist nicht einheitlich | Provider funktioniert nicht wie erwartet | Nur Chat Completions v1 Format, strikte Validierung |
| API-Keys im Klartext auf Disk | Sicherheitsrisiko bei Sync/Backup | UI-Warnung, spaeter Keychain |
| Interface zu minimal fuer kuenftige Consumer | Erweiterungsdruck, Breaking Changes | Bewusste Entscheidung: minimal starten, erweitern wenn noetig |
| Ollama-Autodetect als Default | Verwirrung wenn Ollama nicht laeuft | Klare Fallback-Logik: Autodetect → konfigurierter Provider → nichts |

## Referenzen und Kontext

- Bestehend: `src/main/bugreport/ollama-client.ts` (aktuelle Implementierung)
- Bestehend: `src/main/notes/note-tagging.ts` (zweiter Consumer)
- Feature-Request: `moreismore/feature-llm-provider-settings.md`
- Ollama API: OpenAI-kompatibles Chat-Format unter `/v1/chat/completions`
