/**
 * Der lokale Anbieter für die Rolle `local-worker` (Spec §6, Entscheidung E4).
 *
 * opencode spricht den Endpunkt direkt an, kein Gateway dazwischen. Die
 * Kontextgröße steht in der Config, weil opencode sie für einen selbst
 * eingetragenen Anbieter nicht kennt — mit ihr ist die Prozentanzeige eine
 * Rechnung gegen eine bekannte Zahl statt gegen OPENCODE_FALLBACK_CONTEXT_WINDOW.
 */

import type { LocalWorkerConfig } from '../../shared/types'

export { LocalWorkerConfig } from '../../shared/types'

export const LOCAL_PROVIDER_ID = 'cipher-local'

function positive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0
}

/** Defensiv: eine halbe Config ist keine — dann gibt es keinen lokalen Worker. */
export function readLocalWorkerConfig(raw: unknown): LocalWorkerConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (typeof r.baseUrl !== 'string' || r.baseUrl.trim() === '') return null
  if (typeof r.model !== 'string' || r.model.trim() === '') return null
  if (!positive(r.contextWindow) || !positive(r.maxOutputTokens)) return null
  return {
    baseUrl: r.baseUrl.trim(),
    model: r.model.trim(),
    contextWindow: r.contextWindow,
    maxOutputTokens: r.maxOutputTokens,
    ...(positive(r.timeoutMinutes) ? { timeoutMinutes: r.timeoutMinutes } : {}),
  }
}

export function buildLocalProviderBlock(cfg: LocalWorkerConfig): Record<string, unknown> {
  return {
    npm: '@ai-sdk/openai-compatible',
    name: LOCAL_PROVIDER_ID,
    options: { baseURL: cfg.baseUrl },
    models: {
      [cfg.model]: {
        name: cfg.model,
        limit: { context: cfg.contextWindow, output: cfg.maxOutputTokens },
      },
    },
  }
}

export function localModelSpec(cfg: LocalWorkerConfig): string {
  return `${LOCAL_PROVIDER_ID}/${cfg.model}`
}
