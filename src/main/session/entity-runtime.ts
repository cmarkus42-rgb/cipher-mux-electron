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
 * Deliberately no role carries a default model. Which model a role deserves is
 * a cost and quality judgement belonging to the person paying for it, not a
 * guess baked into the registry. An absent value means "let the CLI decide",
 * which is exactly what happened before this existed — so switching this on
 * changes nothing until somebody chooses.
 */
import type { EntityConfig } from '../../shared/types'

/** The slice of config this resolution reads. */
export interface EntityRuntimeConfig {
  /** Per-role model override, keyed by entity id. */
  entityModels?: Record<string, string>
  /** Per-role adapter override, keyed by entity id. */
  entityAdapters?: Record<string, string>
}

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
  const model = readOverride(runtimeConfig?.entityModels, config.id) ?? config.model
  const adapterId = readOverride(runtimeConfig?.entityAdapters, config.id) ?? config.adapterId

  return {
    ...(model ? { model } : {}),
    ...(adapterId ? { adapterId } : {}),
  }
}
