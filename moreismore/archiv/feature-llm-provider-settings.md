# Feature Request: Konfigurierbare LLM-Provider für Bug-Assistant

**Datum:** 2026-04-23
**Prio:** Offen / Backlog
**Status:** Idee

## Beschreibung

Der Bug-Assistant nutzt aktuell Ollama (lokal) als LLM-Backend. Es soll möglich sein, beliebige LLM-APIs zu konfigurieren — sowohl große Anbieter als auch Aggregatoren.

## Anforderung

Settings-UI mit:
- **API-Key** Eingabefeld
- **Provider/Endpoint** Auswahl oder Custom-URL
- **Model** Auswahl
- Ollama bleibt als Preset/Default (kein API-Key nötig)

## Anbieter-Scope

### Große Anbieter
- OpenAI (GPT-4o, etc.)
- Anthropic (Claude)
- Google (Gemini)

### Aggregatoren
- OpenRouter
- Together AI
- Groq

### Lokal
- Ollama (aktuelles Default)

## Architektur-Idee

`OllamaChat` abstrahieren zu einem generischen `LLMChat` Interface:
```typescript
interface LLMChat {
  send(userMessage: string): Promise<string>
  getHistory(): ChatMessage[]
  reset(): void
}
```

Provider-Implementierungen:
- `OllamaChat` (besteht bereits)
- `OpenAICompatChat` (deckt OpenAI, OpenRouter, Together, Groq ab — alle OpenAI-kompatibel)
- `AnthropicChat` (Claude Messages API)

## Alternative: Claude-Session als Backend

Statt einer externen API könnte eine tmux-Session im Hintergrund genutzt werden — analog zu den Worker-Sessions. Der Bug-Assistant würde dann direkt eine cipher-mux Session als LLM nutzen (Claude Code CLI). Vorteil: Kein API-Key, nutzt den existierenden Claude-Zugang. Nachteil: Langsamer, komplexerer Dispatch, Session-Overhead.

## Kontext

- Bug-Assistant Voice-Pipeline ist E2E funktional (STT + LLM + TTS)
- OllamaChat in `src/main/voice/ollama-chat.ts`
- BugreportInterview in `src/main/voice/bugreport-interview.ts`
- Settings-UI existiert in `InfoSettingsView.tsx`
