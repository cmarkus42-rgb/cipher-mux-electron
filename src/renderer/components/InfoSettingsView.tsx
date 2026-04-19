// src/renderer/components/InfoSettingsView.tsx
import { useCallback, useEffect, useState } from 'preact/hooks'
import { APP_VERSION } from '../../shared/constants'

interface InfoSettingsViewProps {
  onRescan: () => void | Promise<void>
  scanning: boolean
}

const api = (window as any).cipherMux

interface AppSection {
  scanPaths: string[]
  scanDepth: number
}

type TabId = 'shortcuts' | 'features' | 'settings'

// Built-in shortcuts (hard-coded since most keyboard shortcuts were removed)
const SHORTCUTS = [
  { category: 'global', combo: 'Cmd+B', label: 'bugreport dialog öffnen' },
  { category: 'global', combo: 'Escape', label: 'dialog / overlay schließen' },
  { category: 'terminal', combo: 'Cmd+C', label: 'text kopieren / prozess abbrechen' },
  { category: 'terminal', combo: 'Cmd+V', label: 'einfügen' },
]

export function InfoSettingsView({ onRescan, scanning }: InfoSettingsViewProps) {
  const [activeTab, setActiveTab] = useState<TabId>('features')
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

  const grouped = SHORTCUTS.reduce<Record<string, typeof SHORTCUTS>>((acc, s) => {
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
            {tab === 'shortcuts' ? 'shortcuts' : tab === 'features' ? 'features' : 'einstellungen'}
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
          <div class="settings-section__hint" style={{ marginTop: '12px' }}>
            die meisten aktionen werden per klick in der statusbar oder im grid ausgelöst.
            keyboard shortcuts sind auf ein minimum reduziert.
          </div>
        </section>
      )}

      {activeTab === 'features' && (
        <section class="settings-section wiki-section">
          <div class="wiki-entry">
            <div class="settings-section__title">was ist cipher-mux?</div>
            <p class="wiki-text">
              cipher-mux ist eine electron-app, die mehrere claude code sessions gleichzeitig
              in einem fenster verwaltet. jede session läuft in einem eigenen tmux-terminal.
              die sessions können über einen message bus kommunizieren und werden von einem
              orchestrator koordiniert.
            </p>
            <p class="wiki-text">
              <strong>wann braucht man das?</strong> sobald man an mehreren projekten gleichzeitig
              arbeitet oder ein projekt so groß ist, dass ein einzelner claude agent an seine
              context-grenzen stößt. der orchestrator kann aufgaben verteilen und ergebnisse
              zusammenführen.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">grid layout</div>
            <p class="wiki-text">
              das hauptfenster zeigt ein grid mit bis zu 5×3 zellen. jede zelle kann eine
              terminal-session aufnehmen. leere zellen zeigen einen „+" button zum starten
              neuer sessions.
            </p>
            <p class="wiki-text">
              <strong>bedienung:</strong> grid-größe über die „spalten ±" / „zeilen ±" controls
              unten rechts anpassen. sessions per drag & drop umordnen. klick auf den header
              einer session setzt den fokus.
            </p>
            <p class="wiki-text">
              <strong>projekt wechseln:</strong> „⇄" im header einer session öffnet den
              projektpicker. die alte session wird gestoppt und eine neue im selben slot gestartet.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">orchestrator</div>
            <p class="wiki-text">
              der orchestrator ist eine spezielle claude session, die immer in slot 0 (oben links)
              läuft. er hat zugriff auf alle anderen sessions über den MCP-server und kann:
            </p>
            <ul class="wiki-list">
              <li>sessions starten, stoppen und überwachen</li>
              <li>nachrichten an sessions senden</li>
              <li>context-usage aller sessions abfragen</li>
              <li>aufgaben zwischen sessions verteilen</li>
            </ul>
            <p class="wiki-text">
              der orchestrator startet automatisch mit der app. über den „orchestrator" button
              in der statusbar kann er manuell gestartet/gestoppt werden.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">message bus & chatroom</div>
            <p class="wiki-text">
              alle sessions teilen sich einen SQLite-basierten nachrichtenbus. sessions können
              nachrichten an topics senden (z.b. „broadcast", „orchestrator", „session:xyz").
              der chatroom zeigt den gesamten bus-feed in echtzeit.
            </p>
            <p class="wiki-text">
              <strong>wozu?</strong> der orchestrator nutzt den bus um anweisungen zu verteilen.
              sessions können ergebnisse zurückmelden. du siehst im chatroom was zwischen den
              agents passiert.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">MCP-server</div>
            <p class="wiki-text">
              ein lokaler HTTP-server (default port 3100) stellt tools bereit, die claude sessions
              programmatisch nutzen können. der MCP-server wird automatisch in jede neue session
              injiziert (via CLAUDE.md).
            </p>
            <p class="wiki-text">
              <strong>verfügbare tools:</strong> session management, message bus, context usage
              abfrage, kickoff/projektstart. der orchestrator nutzt diese tools um andere
              sessions zu steuern.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">context usage monitoring</div>
            <p class="wiki-text">
              jede session zeigt ihren aktuellen context-verbrauch im header (0-100%). die farbe
              wechselt automatisch:
            </p>
            <ul class="wiki-list">
              <li><span style={{ color: 'var(--color-neon-green)' }}>grün</span> — 0-60%: alles gut</li>
              <li><span style={{ color: 'var(--color-neon-orange)' }}>orange</span> — 60-85%: wird eng</li>
              <li><span style={{ color: 'var(--color-neon-red)' }}>rot</span> — 85-100%: session bald am limit</li>
            </ul>
            <p class="wiki-text">
              die daten kommen aus claudes statusLine-hook und werden in echtzeit aktualisiert.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">bugreport</div>
            <p class="wiki-text">
              über „bugreport" in der statusbar (oder Cmd+B) kannst du einen bug-report erstellen.
              die beschreibung wird optional von ollama (lokales LLM) in ein strukturiertes format
              gebracht: titel, severity, tags, schritte, zusammenfassung. der report landet als
              markdown-datei in der outbox.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">themes</div>
            <p class="wiki-text">
              zwei themes: <strong>ivory</strong> (hell, keramik-töne) und <strong>dark</strong>
              (dunkel, muted neon). wechsel über „theme: ..." in der statusbar. die terminals
              passen sich automatisch an. die wahl wird persistent gespeichert.
            </p>
          </div>

          <div class="wiki-entry">
            <div class="settings-section__title">projekt scanner</div>
            <p class="wiki-text">
              cipher-mux scannt konfigurierte verzeichnisse nach claude-code-projekten
              (erkennbar an CLAUDE.md, .claude/, package.json etc). die gefundenen projekte
              erscheinen im projektpicker wenn du eine neue session startest.
            </p>
            <p class="wiki-text">
              scan-pfade und -tiefe lassen sich im „einstellungen" tab konfigurieren.
            </p>
          </div>
        </section>
      )}

      {activeTab === 'settings' && !loading && (
        <section class="settings-section">
          <div class="settings-section__title">scan-pfade</div>
          <div class="settings-section__hint">
            verzeichnisse, die beim scan nach claude-code-projekten durchsucht werden.
          </div>
          <ul class="settings-list">
            {scanPaths.length === 0 && (
              <li class="settings-list__empty">keine pfade hinterlegt.</li>
            )}
            {scanPaths.map((p) => (
              <li key={p} class="settings-list__item">
                <span class="font-mono text-sm truncate" title={p}>{p}</span>
                <button class="btn btn--sm" onClick={() => handleRemove(p)} title="Entfernen">✕</button>
              </li>
            ))}
          </ul>
          <div class="settings-row">
            <button class="btn btn--primary btn--sm" onClick={handleAdd}>+ pfad hinzufügen</button>
            <button class="btn btn--sm" onClick={onRescan} disabled={scanning}>
              {scanning ? 'scanne…' : 'jetzt rescannen'}
            </button>
          </div>
          <div class="settings-row" style={{ marginTop: '12px' }}>
            <label class="settings-label">
              <span>scan-tiefe</span>
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
            <span class="text-xs text-dim">1 = nur direkte kinder · max. 5</span>
          </div>
          <div class="settings-section__title" style={{ marginTop: 'var(--space-lg)' }}>über</div>
          <div class="settings-section__hint">
            cipher-mux {APP_VERSION} — electron-basierte kommandozentrale für claude code projekte.
          </div>
        </section>
      )}
    </div>
  )
}
