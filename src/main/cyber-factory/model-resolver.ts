/** Cyber Factory — symbolic model name → versioned model string resolver */

import type { ModelChoice } from './types'

const MODEL_MAP: Record<ModelChoice, string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
}

/**
 * Resolve a symbolic ModelChoice to its versioned model string.
 * Used when constructing Claude CLI invocations for sub-project workers.
 */
export function resolveModel(choice: ModelChoice): string {
  return MODEL_MAP[choice]
}

/**
 * Type guard — returns true if value is a valid ModelChoice.
 */
export function isValidModelChoice(value: string): value is ModelChoice {
  return value === 'haiku' || value === 'sonnet' || value === 'opus'
}
