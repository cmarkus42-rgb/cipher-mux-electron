# Seed: Konfigurierbare LLM-Provider

## Idee in einem Satz
Ueberall wo cipher-mux ein LLM braucht (Bugreport-Interview, Note-Tagging, kuenftig mehr), soll der Provider konfigurierbar sein — nicht nur Ollama.

## Treiber
1. **Portabilitaet:** Andere User haben kein lokales Ollama
2. **Qualitaet:** Fuer komplexere Tasks (Bugreport-Analyse) waeren staerkere Modelle besser

## Betroffene Stellen (aktuell)
- `BugreportInterview` → `OllamaClient` (Voice-Pipeline, TTS/STT + LLM)
- `NoteTagging` → `OllamaClient` (Auto-Tagging bei Cmd+S)
- Beide in `src/main/bugreport/` bzw. `src/main/notes/`

## Annahmen (zu pruefen)
- [ ] ConfigStore reicht fuer API-Key-Speicherung (kein Keychain noetig)
- [ ] Ollama bleibt Default (zero-config fuer lokale Nutzung)
- [ ] User konfiguriert pro App, nicht pro Feature (ein Provider fuer alles)

## Offene Fragen
- Soll man pro Feature einen anderen Provider waehlen koennen? (Tagging: schnell+billig, Bugreport: stark+langsam)
- Wie geht die App damit um, wenn kein Provider konfiguriert ist UND kein Ollama laeuft?
- Sollen API-Keys validiert werden (Test-Call beim Speichern)?
