// src/renderer/shortcut-registry.ts

export interface ShortcutEntry {
  combo: string
  label: string
  category: 'Navigation' | 'Layout' | 'Aktionen'
  /** Return false to let the event propagate (e.g. pass through to terminal). */
  action: () => void | boolean
}

interface ParsedCombo {
  meta: boolean
  key: string
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split('+')
  return {
    meta: parts.includes('cmd') || parts.includes('meta'),
    key: parts[parts.length - 1],
  }
}

function matchEvent(e: KeyboardEvent, parsed: ParsedCombo): boolean {
  if (parsed.meta && !e.metaKey) return false
  return e.key.toLowerCase() === parsed.key || e.code.toLowerCase() === parsed.key
}

export class ShortcutRegistry {
  private shortcuts: Map<string, ShortcutEntry & { parsed: ParsedCombo }> = new Map()

  register(entry: ShortcutEntry): void {
    this.shortcuts.set(entry.combo, { ...entry, parsed: parseCombo(entry.combo) })
  }

  unregister(combo: string): void {
    this.shortcuts.delete(combo)
  }

  getAll(): ShortcutEntry[] {
    return Array.from(this.shortcuts.values()).map(({ parsed: _, ...entry }) => entry)
  }

  handleKeyDown(e: KeyboardEvent): boolean {
    for (const entry of this.shortcuts.values()) {
      if (matchEvent(e, entry.parsed)) {
        const result = entry.action()
        // If action returns false, let the event propagate (e.g. to terminal)
        if (result === false) return false
        e.preventDefault()
        e.stopPropagation()
        return true
      }
    }
    return false
  }
}
