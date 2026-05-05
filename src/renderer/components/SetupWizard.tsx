// src/renderer/components/SetupWizard.tsx
import { h } from 'preact'
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
  onInstallAll: () => void
  onSkip: () => void
  installing: boolean
  currentStep: string | null
  progress: string
  done: boolean
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
}: SetupWizardProps) {
  const allInstalled = dependencies.length > 0 && dependencies.every((d) => d.installed)
  const allRequiredInstalled = dependencies.filter((d) => d.required).every((d) => d.installed)
  const canSkip = allRequiredInstalled && !installing

  return (
    <div class="setup-overlay">
      <div class="setup-card">
        <h2 class="setup-title">Setup</h2>
        <p class="setup-subtitle">
          {done ? 'Alle Abhaengigkeiten installiert.' : 'Dependencies pruefen\u2026'}
        </p>

        <ul class="setup-dep-list">
          {dependencies.map((dep) => (
            <li key={dep.id} class="setup-dep-item">
              <DepIcon installed={dep.installed} active={currentStep === dep.id} />
              <div class="setup-dep-info">
                <div class="setup-dep-name">
                  {dep.name}
                  <span class="setup-badge setup-badge--size">{dep.size}</span>
                  {dep.required && <span class="setup-badge setup-badge--required">required</span>}
                </div>
                <div class="setup-dep-desc">{dep.description}</div>
              </div>
            </li>
          ))}
        </ul>

        {progress && !done && <div class="setup-progress">{progress}</div>}

        {done ? (
          <div class="setup-done">Fertig — App startet&#x2026;</div>
        ) : (
          <div class="setup-actions">
            <button
              class="setup-btn-primary"
              disabled={installing || allInstalled}
              onClick={onInstallAll}
            >
              {installing ? 'Installiere\u2026' : 'Setup starten'}
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
