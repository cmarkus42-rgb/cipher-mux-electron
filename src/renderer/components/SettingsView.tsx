import { useCallback, useEffect, useState } from 'preact/hooks'

interface SettingsViewProps {
  onRescan: () => void | Promise<void>
  scanning: boolean
}

const api = (window as any).cipherMux

interface AppSection {
  scanPaths: string[]
  scanDepth: number
}

export function SettingsView({ onRescan, scanning }: SettingsViewProps) {
  const [scanPaths, setScanPaths] = useState<string[]>([])
  const [scanDepth, setScanDepth] = useState(1)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const app: AppSection | null = await api.config.get('app')
    setScanPaths(app?.scanPaths ?? [])
    setScanDepth(app?.scanDepth ?? 1)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

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

  if (loading) {
    return <div class="empty-state"><div class="empty-state__text">Lade…</div></div>
  }

  return (
    <div class="settings-view">
      <h2 class="settings-view__heading">Einstellungen</h2>

      <section class="settings-section">
        <div class="settings-section__title">Scan-Pfade</div>
        <div class="settings-section__hint">
          Verzeichnisse, die beim Scan nach Claude-Code-Projekten durchsucht werden.
          Ein Projekt wird erkannt, wenn <code>CLAUDE.md</code>, <code>.claude/</code> oder <code>docs/</code> vorhanden ist.
        </div>

        <ul class="settings-list">
          {scanPaths.length === 0 && (
            <li class="settings-list__empty">Keine Pfade hinterlegt.</li>
          )}
          {scanPaths.map((p) => (
            <li key={p} class="settings-list__item">
              <span class="font-mono text-sm truncate" title={p}>{p}</span>
              <button
                class="btn btn--sm"
                onClick={() => handleRemove(p)}
                title="Entfernen"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>

        <div class="settings-row">
          <button class="btn btn--primary btn--sm" onClick={handleAdd}>
            + Pfad hinzufügen
          </button>
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
          <span class="text-xs text-dim">
            1 = nur direkte Kinder · 2 = Kind + Enkel · max. 5
          </span>
        </div>
      </section>

      <section class="settings-section">
        <div class="settings-section__title">Über</div>
        <div class="settings-section__hint">
          cipher-mux v0.2.0 — Electron-basierte Kommandozentrale für Claude Code Projekte.
        </div>
      </section>
    </div>
  )
}
