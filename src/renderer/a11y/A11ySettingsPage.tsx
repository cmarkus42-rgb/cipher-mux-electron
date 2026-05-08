// src/renderer/a11y/A11ySettingsPage.tsx
import { useCallback } from 'preact/hooks'
import type { A11ySettings } from './hooks/useA11ySettings'

interface A11ySettingsPageProps {
  settings: A11ySettings
  onUpdate: (patch: Partial<A11ySettings>) => void
}

const CVD_THEMES = [
  {
    id: 'cvd-deuteranopia' as const,
    label: 'Rot-Gruen (Deuteranopie/Protanopie)',
    desc: 'Ersetzt Rot/Gruen durch Blau/Orange. Fuer die haeufigste Form der Farbenblindheit (~7% der Maenner).',
  },
  {
    id: 'cvd-tritanopia' as const,
    label: 'Blau-Gelb (Tritanopie)',
    desc: 'Ersetzt Blau/Gelb durch Magenta/Gruen. Fuer Tritanopie (<0.01%).',
  },
  {
    id: 'cvd-achromatopsia' as const,
    label: 'Graustufen (Achromatopsie)',
    desc: 'Reine Graustufen. Alle Informationen werden durch Icons, Text und Formen statt Farben transportiert.',
  },
]

const SYSTEM_PREF_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'system', label: 'Systemeinstellung folgen' },
  { value: 'on', label: 'Immer an' },
  { value: 'off', label: 'Immer aus' },
]

export function A11ySettingsPage({ settings, onUpdate }: A11ySettingsPageProps) {
  const handleCvdChange = useCallback((themeId: typeof settings.cvdTheme) => {
    onUpdate({ cvdTheme: settings.cvdTheme === themeId ? null : themeId })
  }, [settings.cvdTheme, onUpdate])

  return (
    <div class="a11y-settings" role="region" aria-label="Barrierefreiheits-Einstellungen">
      {/* CVD Themes */}
      <section class="a11y-section">
        <h3 class="a11y-section__title">Farbenblindheits-Themes</h3>
        <p class="a11y-section__desc">
          Spezielle Farbpaletten, die auch bei eingeschraenktem Farbsehen gut funktionieren.
          Waehle das Theme, das zu deiner Sehstaerke passt.
        </p>
        <div class="a11y-cvd-list" role="radiogroup" aria-label="CVD-Theme auswaehlen">
          {CVD_THEMES.map(cvd => (
            <label
              key={cvd.id}
              class={`a11y-cvd-item${settings.cvdTheme === cvd.id ? ' a11y-cvd-item--active' : ''}`}
            >
              <input
                type="radio"
                name="cvd-theme"
                checked={settings.cvdTheme === cvd.id}
                onChange={() => handleCvdChange(cvd.id)}
                aria-label={cvd.label}
              />
              <div>
                <strong>{cvd.label}</strong>
                <span class="a11y-cvd-item__desc">{cvd.desc}</span>
              </div>
            </label>
          ))}
          <label class={`a11y-cvd-item${settings.cvdTheme === null ? ' a11y-cvd-item--active' : ''}`}>
            <input
              type="radio"
              name="cvd-theme"
              checked={settings.cvdTheme === null}
              onChange={() => onUpdate({ cvdTheme: null })}
              aria-label="Kein CVD-Theme (Standard)"
            />
            <div>
              <strong>Kein CVD-Theme</strong>
              <span class="a11y-cvd-item__desc">Standard-Farbpalette verwenden.</span>
            </div>
          </label>
        </div>
      </section>

      {/* System Preferences */}
      <section class="a11y-section">
        <h3 class="a11y-section__title">Systemeinstellungen</h3>
        <p class="a11y-section__desc">
          Normalerweise folgt cipher-mux deinen Systemeinstellungen.
          Hier kannst du das Verhalten ueberschreiben.
        </p>

        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>Bewegung reduzieren</span>
            <span class="a11y-pref-hint">Deaktiviert Animationen (Grid-Resize, Sidebar-Slide, Uebergaenge)</span>
          </div>
          <select
            value={settings.reducedMotion}
            onChange={e => onUpdate({ reducedMotion: (e.target as HTMLSelectElement).value as any })}
            aria-label="Bewegung reduzieren"
          >
            {SYSTEM_PREF_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

      </section>

      {/* Font Settings */}
      <section class="a11y-section">
        <h3 class="a11y-section__title">Schrift-Einstellungen</h3>
        <p class="a11y-section__desc">
          Passe Schriftgroesse fuer UI und Terminal getrennt an.
        </p>

        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>UI-Schriftgroesse</span>
            <span class="a11y-pref-hint">{settings.fontSize}px (10–32) — Header, Status-Bar, Sidebar</span>
          </div>
          <input
            type="range"
            min={10}
            max={32}
            step={1}
            value={settings.fontSize}
            onChange={e => onUpdate({ fontSize: Number((e.target as HTMLInputElement).value) })}
            aria-label="UI-Schriftgroesse"
          />
        </div>

        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>Terminal-Schriftgroesse</span>
            <span class="a11y-pref-hint">{settings.terminalFontSize}px (8–28) — xterm.js Sessions</span>
          </div>
          <input
            type="range"
            min={8}
            max={28}
            step={1}
            value={settings.terminalFontSize}
            onChange={e => onUpdate({ terminalFontSize: Number((e.target as HTMLInputElement).value) })}
            aria-label="Terminal-Schriftgroesse"
          />
        </div>

        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>Notes-Editor Schriftgroesse</span>
            <span class="a11y-pref-hint">{settings.noteEditorFontSize}px (10–32) — CodeMirror Editor</span>
          </div>
          <input
            type="range"
            min={10}
            max={32}
            step={1}
            value={settings.noteEditorFontSize}
            onChange={e => onUpdate({ noteEditorFontSize: Number((e.target as HTMLInputElement).value) })}
            aria-label="Notes-Editor Schriftgroesse"
          />
        </div>

        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>Zeilenhoehe</span>
            <span class="a11y-pref-hint">{settings.lineHeight.toFixed(1)} (1.0–3.0)</span>
          </div>
          <input
            type="range"
            min={1.0}
            max={3.0}
            step={0.1}
            value={settings.lineHeight}
            onChange={e => onUpdate({ lineHeight: Number((e.target as HTMLInputElement).value) })}
            aria-label="Zeilenhoehe"
          />
        </div>

        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>Buchstabenabstand</span>
            <span class="a11y-pref-hint">{settings.letterSpacing}px (0–5)</span>
          </div>
          <input
            type="range"
            min={0}
            max={5}
            step={0.5}
            value={settings.letterSpacing}
            onChange={e => onUpdate({ letterSpacing: Number((e.target as HTMLInputElement).value) })}
            aria-label="Buchstabenabstand"
          />
        </div>

        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>Schriftart</span>
            <span class="a11y-pref-hint">Leer = System-Standard</span>
          </div>
          <input
            type="text"
            class="a11y-input-text"
            value={settings.fontFamily}
            placeholder="z.B. OpenDyslexic, Arial"
            onChange={e => onUpdate({ fontFamily: (e.target as HTMLInputElement).value })}
            aria-label="Schriftart"
          />
        </div>
      </section>

      {/* Focus Mode */}
      <section class="a11y-section">
        <h3 class="a11y-section__title">Focus Mode</h3>
        <p class="a11y-section__desc">
          Maximiert eine einzelne Session auf das gesamte Fenster.
          Grid, Sidebar und andere Zellen werden ausgeblendet.
          Aktivieren per Button in der Zelle oder mit Cmd+Shift+F. Escape zum Deaktivieren.
        </p>
        <div class="a11y-pref-row">
          <div class="a11y-pref-label">
            <span>Focus Mode</span>
            <span class="a11y-pref-hint">Cmd+Shift+F oder Button in der Zellen-Kopfzeile</span>
          </div>
          <label class="a11y-toggle">
            <input
              type="checkbox"
              checked={settings.focusModeEnabled}
              onChange={() => onUpdate({ focusModeEnabled: !settings.focusModeEnabled })}
              aria-label="Focus Mode aktivieren"
            />
            <span class="a11y-toggle__slider" />
          </label>
        </div>
      </section>
    </div>
  )
}
