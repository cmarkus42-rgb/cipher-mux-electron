/**
 * VoiceOutputRouter — placeholder for future TTS output of session responses.
 *
 * This interface defines the contract for routing agent responses from
 * tmux sessions back through TTS. Not implemented yet — the current
 * scope is STT input only.
 *
 * TODO: Implement when TTS output of session responses is needed.
 * Likely approach: poll tmux capture-pane for new output, detect
 * completed responses, feed through PiperTTS.
 */

/** Route an agent's text response to TTS for spoken playback. */
export interface VoiceOutputRouterContract {
  routeAgentResponse(sessionId: string, text: string): Promise<void>
  shutdown(): void
}
