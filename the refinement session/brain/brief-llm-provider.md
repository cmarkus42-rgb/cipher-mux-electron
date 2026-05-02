# Brief: Konfigurierbare LLM-Provider

## Richtungsentscheidung

cipher-mux bekommt ein konfigurierbares LLM-Backend. Statt direkt an Ollama gebunden zu sein, abstrahiert ein `LLMProvider`-Interface die Kommunikation. User waehlen ihren Provider in den Settings.

## Fuer wen
Primaer: User ohne lokales Ollama-Setup (die App soll out-of-the-box nutzbar sein).
Sekundaer: Power-User die staerkere Modelle fuer bestimmte Tasks wollen.

## Scope v1
- **Drin:** Generisches Interface, Settings-UI, drei Provider-Typen (Ollama, OpenAI-kompatibel, Anthropic), globaler Provider, graceful degradation
- **Draussen:** Per-Feature Provider-Override, Claude-Session als Backend, Keychain-Integration, Streaming-Support im Interface

## Constraints
- API-Keys im ConfigStore (JSON), mit Sync-Warnung
- Ollama bleibt Default (zero-config wenn lokal verfuegbar)
- Interface bewusst minimal: `send(messages): Promise<string>`
- Nur OpenAI Chat Completions Format fuer "kompatible" Provider

## Risiken (aus [[seed-llm-provider]])
1. API-Inkompatibilitaeten bei "OpenAI-kompatiblen" Providern
2. API-Keys in unverschluesseltem JSON
3. Interface-Creep wenn neue Consumer dazukommen

## Betroffene Module
- `src/main/bugreport/ollama-client.ts` → wird zum generischen `LLMClient`
- `src/main/notes/note-tagging.ts` → nutzt neues Interface
- `src/renderer/components/InfoSettingsView.tsx` → neue Settings-Section
- `src/main/config/config-store.ts` → neuer Config-Key `llm`
