// src/renderer/hooks/useEntityPresets.ts — Load entity presets from registry
import { useState, useEffect } from 'preact/hooks'

export interface EntityPresetItem {
  id: string
  displayName: string
  color: string
  icon?: string
  sortOrder: number
  singleInstance?: boolean
}

const api = () => (window as any).cipherMux

/**
 * Hook to load entity presets dynamically from the entity registry.
 * Returns the list of all registered entities (built-in + scanned), sorted by sortOrder.
 */
export function useEntityPresets(): EntityPresetItem[] {
  const [presets, setPresets] = useState<EntityPresetItem[]>([])

  useEffect(() => {
    api().entity.list().then((configs: any[]) => {
      setPresets(
        configs
          .filter((c: any) => c.visible !== false && !c.launcherHidden)
          .map((c: any) => ({
            id: c.id,
            displayName: c.displayName,
            color: c.color,
            icon: c.icon,
            sortOrder: c.sortOrder ?? 100,
            singleInstance: c.singleInstance ?? false,
          }))
          .sort((a: EntityPresetItem, b: EntityPresetItem) => a.sortOrder - b.sortOrder)
      )
    }).catch(() => {
      // Fallback: empty, UI will just not show presets
    })
  }, [])

  return presets
}
