import { useState } from 'preact/hooks'
import { useTranslation } from 'react-i18next'
import type { ProjectInfo, SessionInfo } from '../../shared/types'

interface ProjectCardProps {
  project: ProjectInfo
  session?: SessionInfo
  contextUsage?: number
  onStartSession: (project: ProjectInfo) => void
}

function contextColorClass(pct: number): string {
  if (pct > 80) return 'text-ctx-error'
  if (pct >= 60) return 'text-ctx-warn'
  return 'text-accent'
}

export function ProjectCard({ project, session, contextUsage, onStartSession }: ProjectCardProps) {
  const { t } = useTranslation()
  const isActive = session != null && session.status === 'active'
  const [copied, setCopied] = useState(false)

  const handleCopyPath = async (e: MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(project.path)
      setCopied(true)
      setTimeout(() => setCopied(false), 1000)
    } catch (err) {
      console.error('[ProjectCard] clipboard write failed:', err)
    }
  }

  return (
    <div class={`card ${isActive ? 'card--selected' : ''}`}>
      <div class="card__title" title={project.path}>
        {project.name}
      </div>

      <div class="card__body">
        {/* Git info */}
        {project.gitBranch && (
          <div style={{ marginBottom: '4px' }}>
            <span class="font-mono text-sm text-dim">
              {project.gitBranch}
            </span>
            {project.gitDirty && (
              <span class="badge badge--warn" style={{ marginLeft: '6px' }}>
                {t('projectCard.uncommitted')}
              </span>
            )}
          </div>
        )}

        {/* SDD phase */}
        {project.sddPhase && (
          <span class="badge badge--info">
            {project.sddPhase}
          </span>
        )}

        {/* CLAUDE.md indicator */}
        {project.hasClaudeMd && (
          <span class="badge" style={{ marginLeft: project.sddPhase ? '6px' : '0' }}>
            CLAUDE.md
          </span>
        )}
      </div>

      <div class="card__footer">
        <span
          class="font-mono text-xs text-dim truncate"
          style={{
            flex: 1,
            direction: 'rtl',
            textAlign: 'left',
            cursor: 'pointer',
            userSelect: 'none',
          }}
          title={copied ? t('projectCard.copied') : t('projectCard.copyPath', { path: project.path })}
          onClick={handleCopyPath}
        >
          {copied ? '✓ ' + t('projectCard.copied') : project.path}
        </span>

        {isActive && contextUsage != null && (
          <span class={`font-mono text-xs ${contextColorClass(contextUsage)}`}>
            CTX {contextUsage}%
          </span>
        )}
        {isActive ? (
          <span class="badge badge--ok">{t('projectCard.active')}</span>
        ) : (
          <button
            class="btn btn--primary btn--sm"
            onClick={() => onStartSession(project)}
          >
            {t('projectCard.startSession')}
          </button>
        )}
      </div>
    </div>
  )
}
