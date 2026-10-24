/**
 * Role → model / adapter.
 *
 * Which model a role runs on, and which agent implementation drives it.
 *
 * Both halves already existed on the adapter side and were never fed: the
 * Claude Code adapter turns `model` into `--model <id>`, and AdapterRegistry
 * can look an adapter up by id — but nothing on the role side ever supplied
 * either, so every role ran on whatever the CLI happened to default to. This
 * is the missing half, and it is what first puts the AgentAdapter interface
 * under real pressure: a role naming a different agent has to resolve through
 * the registry rather than through getDefault().
 *
 * Three layers, the same shape prompt resolution already uses elsewhere
 * (cell > workspace override > persona default):
 *
 *   user override (config) > role default (registry) > nothing (CLI decides)
 *
 * Seit 2026-10-24 tragen Rollen einen Modell-Default (Entscheidung des Users:
 * Opus führt, Sonnet baut und prüft, Haiku arbeitet zu — siehe
 * `agent/model-routing.ts`). Die Registry-Werte sind **Claude-Code-Namen**.
 * Läuft eine Rolle über einen anderen Adapter (Codex, opencode), gilt ihr
 * Default deshalb nicht: Codex bekäme sonst `--model sonnet` und kennt das
 * Modell nicht. Ein User-Override gilt immer — der ist für seinen Adapter
 * geschrieben.
 */
import type { EntityConfig } from '../../shared/types'

/** The slice of config this resolution reads. */
export interface EntityRuntimeConfig {
  /** Per-role model override, keyed by entity id. */
  entityModels?: Record<string, string>
  /** Per-role adapter override, keyed by entity id. */
  entityAdapters?: Record<string, string>
  /**
   * Adapter einer Rolle ohne eigenen (`agent.defaultAdapter`). Fehlt er, gilt
   * claude-code — der Default der AdapterRegistry.
   */
  defaultAdapterId?: string
}

/** Für diesen Adapter sind die Modell-Defaults der Registry geschrieben. */
const ROLE_MODEL_ADAPTER = 'claude-code'

export interface EntityRuntime {
  /** Model id to launch with, or undefined to leave it to the CLI. */
  model?: string
  /** Adapter id to drive this role, or undefined for the registry default. */
  adapterId?: string
}

/**
 * Read one override out of a config map.
 *
 * Defensive on purpose: config is JSON on disk and can be hand-edited into any
 * shape. A blank string is how a UI clears a field, so it must mean "no
 * preference" rather than a model literally named "".
 */
function readOverride(
  map: Record<string, string> | undefined,
  entityId: string,
): string | undefined {
  if (!map || typeof map !== 'object') return undefined
  const raw = (map as Record<string, unknown>)[entityId]
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

export function resolveEntityRuntime(
  config: EntityConfig,
  runtimeConfig: EntityRuntimeConfig | undefined,
): EntityRuntime {
  const adapterId = readOverride(runtimeConfig?.entityAdapters, config.id) ?? config.adapterId
  const effectiveAdapter = adapterId ?? runtimeConfig?.defaultAdapterId ?? ROLE_MODEL_ADAPTER
  const roleDefault = effectiveAdapter === ROLE_MODEL_ADAPTER ? config.model : undefined
  const model = readOverride(runtimeConfig?.entityModels, config.id) ?? roleDefault

  return {
    ...(model ? { model } : {}),
    ...(adapterId ? { adapterId } : {}),
  }
}
