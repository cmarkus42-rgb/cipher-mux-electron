/**
 * Recursively merges `source` into `target`, preserving nested keys from `target`
 * that are absent in `source`. Arrays are replaced, not merged.
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target }
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key]
    const targetVal = target[key]
    if (
      sourceVal && typeof sourceVal === 'object' && !Array.isArray(sourceVal) &&
      targetVal && typeof targetVal === 'object' && !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(targetVal as any, sourceVal as any) as any
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as any
    }
  }
  return result
}
