// src/renderer/components/InfoSettingsView.tsx
import { useCallback, useEffect, useState } from 'preact/hooks'
import type { ShortcutEntry } from '../shortcut-registry'

interface InfoSettingsViewProps {
  shortcuts: ShortcutEntry[]
  onRescan: () => void | Promise<void>
  scanning: boolean
}

const api = (window as any).cipherMux

interface AppSection {
  scanPaths: string[]
  scanDepth: number
}

type TabId = 'shortcuts' | 'features' | 'settings'

export function InfoSettingsView({ shortcuts, onRescan, scanning }: InfoSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('shortcuts')
  const [scanPaths, setScanPaths] = useState<string[]>([])
  const [scanDepth, setScanDepth] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const app: AppSection | null = await api.config.get('app')
    setScanPaths(app?.scanPaths ?? [])
    setScanDepth(app?.scanDepth ?? 1)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const persist = useCallback(async (next: Partial<AppSection>) => {
    const current: AppSection | null = await api.config.get('app')
    await api.config.set('app', { ...current, ...next })
  }, [])

  const handleAdd = useCallback(async () => {
    const dir = await api.dialog.openDir({ title: 'Scan-Pfad hinzufügen' })
    if (!dir) return
    if (scanPaths.includes(dir)) return
    const next = [...scanPaths, dir]
    setScanPaths(next)
    await persist({ scanPaths: next })
    await onRescan()
  }, [scanPaths, persist, onRescan])

  const handleRemove = useCallback(async (p: string) => {
    const next = scanPaths.filter((x) => x !== p)
    setScanPaths(next)
    await persist({ scanPaths: next })
    await onRescan()
  }, [scanPaths, persist, onRescan])

  const handleDepthChange = useCallback(async (value: number) => {
    const clamped = Math.max(1, Math.min(5, Math.floor(value)))
    setScanDepth(clamped)
    await persist({ scanDepth: clamped })
  }, [persist])

  const grouped = shortcuts.reduce<Record<string, ShortcutEntry[]>>((acc, s) => {
    (acc[s.category] ??= []).push(s)
    return acc
  }, {})

  return (
    <div class="settings-view">
      <div class="info-tabs">
        {(['shortcuts', 'features', 'settings'] as TabId[]).map((tab) => (
          <button
            key={tab}
            class={`info-tab ${activeTab === tab ? 'info-tab--active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'shortcuts' ? 'Shortcuts' : tab === 'features' ? 'Features' : 'Einstellungen'}
          </button>
        ))}
      </div>

      {activeTab === 'shortcuts' && (
        <section class="settings-section">
          {Object.entries(grouped).map(([category, entries]) => (
            <div key={category}>
              <div class="settings-section__title">{category}</div>
              <table class="shortcut-table">
                <tbody>
                  {entries.map((s) => (
                    <tr key={s.combo}>
                      <td class="shortcut-table__combo"><kbd>{s.combo}</kbd></td>
                      <td class="shortcut-table__label">{s.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {activeTab === 'features' && (
        <section class="settings-section">
          <div class="settings-section__title">Terminals & Splits</div>
          <div class="settings-section__hint">
            Eingebettete Terminals über tmux-Sessions. Cmd+\ und Cmd+- für vertikale/horizontale Splits, Cmd+W zum Schließen.
          </div>
          <div class="settings-section__title">Message Bus & Chatroom</div>
          <div class="settings-section__hint">
            SQLite-basierter Nachrichtenkanal zwischen Sessions. Chatroom (Cmd+K) zeigt den Bus-Feed.
          </div>
          <div class="settings-section__title">MCP-Server</div>
          <div class="settings-section__hint">
            Lokaler HTTP-Server für Machine-to-Machine-Kommunikation. Wird automatisch in jede Session injiziert.
          </div>
          <div class="settings-section__title">Orchestrator</div>
          <div class="settings-section__hint">
            Zentrale Claude-Session, die andere Sessions via MCP steuert und koordiniert.
          </div>
          <div class="settings-section__title">Kickoff / Projektstart</div>
          <div class="settings-section__hint">
            Neues Projekt aus Obsidian-Notizen scaffolden (Cmd+N). Nutzt den projectlauncher-Skill.
          </div>
        </section>
      )}

      {activeTab === 'settings' && !loading && (
        <section class="settings-section">
          <div class="settings-section__title">Scan-Pfade</div>
          <div class="settings-section__hint">
            Verzeichnisse, die beim Scan nach Claude-Code-Projekten durchsucht werden.
          </div>
          <ul class="settings-list">
            {scanPaths.length === 0 && (
              <li class="settings-list__empty">Keine Pfade hinterlegt.</li>
            )}
            {scanPaths.map((p) => (
              <li key={p} class="settings-list__item">
                <span class="font-mono text-sm truncate" title={p}>{p}</span>
                <button class="btn btn--sm" onClick={() => handleRemove(p)} title="Entfernen">✕</button>
              </li>
            ))}
          </ul>
          <div class="settings-row">
            <button class="btn btn--primary btn--sm" onClick={handleAdd}>+ Pfad hinzufügen</button>
            <button class="btn btn--sm" onClick={onRescan} disabled={scanning}>
              {scanning ? 'Scanne…' : 'Jetzt rescannen'}
            </button>
          </div>
          <div class="settings-row" style={{ marginTop: '12px' }}>
            <label class="settings-label">
              <span>Scan-Tiefe</span>
              <input
                class="input input--sm"
                type="number"
                min={1}
                max={5}
                value={scanDepth}
                onInput={(e) => handleDepthChange(Number((e.target as HTMLInputElement).value))}
                style={{ width: '64px' }}
              />
            </label>
            <span class="text-xs text-dim">1 = nur direkte Kinder · max. 5</span>
          </div>
          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>Über</div>
          <div class="settings-section__hint">
            cipher-mux v0.2.0 — Electron-basierte Kommandozentrale für Claude Code Projekte.
          </div>
        </section>
      )}
    </div>
  )
}
