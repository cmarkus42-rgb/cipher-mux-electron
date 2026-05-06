// src/renderer/components/SetupWizard.tsx
import { h } from 'preact'
import { useState } from 'preact/hooks'
import '../styles/setup-wizard.css'

export interface SetupDependency {
  id: string
  name: string
  installed: boolean
  required: boolean
  size: string
  description: string
}

export interface SetupWizardProps {
  dependencies: SetupDependency[]
  onInstallAll: (selectedIds?: string[]) => void
  onSkip: () => void
  installing: boolean
  currentStep: string | null
  progress: string
  done: boolean
  error?: boolean
}

function DepIcon({ installed, active }: { installed: boolean; active: boolean }) {
  if (active) {
    return <span class="setup-dep-icon setup-dep-icon--active">&#x21BB;</span>
  }
  if (installed) {
    return <span class="setup-dep-icon setup-dep-icon--ok">&#x2713;</span>
  }
  return <span class="setup-dep-icon setup-dep-icon--missing">&#x2717;</span>
}

export function SetupWizard({
  dependencies,
  onInstallAll,
  onSkip,
  installing,
  currentStep,
  progress,
  done,
  error,
}: SetupWizardProps) {
  // Track which optional deps are selected (all selected by default)
  const [selectedOptional, setSelectedOptional] = useState<Set<string>>(() => {
    const optIds = new Set<string>()
    for (const d of dependencies) {
      if (!d.required && !d.installed) optIds.add(d.id)
    }
    return optIds
  })

  const allInstalled = dependencies.length > 0 && dependencies.every((d) => d.installed)
  const allRequiredInstalled = dependencies.filter((d) => d.required).every((d) => d.installed)
  const canSkip = allRequiredInstalled && !installing

  const toggleOptional = (id: string) => {
    setSelectedOptional(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleInstall = () => {
    const selectedIds = Array.from(selectedOptional)
    onInstallAll(selectedIds)
  }

  return (
    <div class="setup-overlay">
      <div class="setup-card">
        <h2 class="setup-title">Setup</h2>
        <p class="setup-subtitle">
          {done ? 'Alle Abhaengigkeiten installiert.' : error ? 'Installation fehlgeschlagen.' : 'Dependencies pruefen\u2026'}
        </p>

        <ul class="setup-dep-list">
          {dependencies.map((dep) => (
            <li key={dep.id} class="setup-dep-item">
              <DepIcon installed={dep.installed} active={currentStep === dep.id} />
              <div class="setup-dep-info">
                <div class="setup-dep-name">
                  {!dep.required && !dep.installed && !installing && (
                    <input
                      type="checkbox"
                      class="setup-dep-checkbox"
                      checked={selectedOptional.has(dep.id)}
                      onChange={() => toggleOptional(dep.id)}
                    />
                  )}
                  {dep.name}
                  <span class="setup-badge setup-badge--size">{dep.size}</span>
                  {dep.required && <span class="setup-badge setup-badge--required">required</span>}
                  {!dep.required && <span class="setup-badge setup-badge--optional">optional</span>}
                </div>
                <div class="setup-dep-desc">{dep.description}</div>
              </div>
            </li>
          ))}
        </ul>

        {progress && !done && <div class={`setup-progress${error ? ' setup-progress--error' : ''}`}>{progress}</div>}

        {done ? (
          <div class="setup-done">Fertig — App startet&#x2026;</div>
        ) : (
          <div class="setup-actions">
            <button
              class="setup-btn-primary"
              disabled={installing || allInstalled}
              onClick={handleInstall}
            >
              {installing ? 'Installiere\u2026' : error ? 'Erneut versuchen' : 'Setup starten'}
            </button>
            {canSkip && (
              <button class="setup-link-skip" onClick={onSkip}>
                Ueberspringen
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
