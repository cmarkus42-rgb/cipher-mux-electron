// src/renderer/hooks/useShortcuts.ts
import { useEffect, useMemo } from 'preact/hooks'
import { ShortcutRegistry } from '../shortcut-registry'
import type { ShortcutEntry } from '../shortcut-registry'

export function useShortcuts(entries: ShortcutEntry[]): ShortcutEntry[] {
  const registry = useMemo(() => new ShortcutRegistry(), [])

  useEffect(() => {
    for (const entry of entries) {
      registry.register(entry)
    }
    const handler = (e: KeyboardEvent) => registry.handleKeyDown(e)
    window.addEventListener('keydown', handler, true)
    return () => {
      window.removeEventListener('keydown', handler, true)
      for (const entry of entries) {
        registry.unregister(entry.combo)
      }
    }
  }, [entries, registry])

  return registry.getAll()
}
