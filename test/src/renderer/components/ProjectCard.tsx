import type { ProjectInfo, SessionInfo } from '../../shared/types'

interface ProjectCardProps {
  project: ProjectInfo
  session?: SessionInfo
  onStartSession: (project: ProjectInfo) => void
}

export function ProjectCard({ project, session, onStartSession }: ProjectCardProps) {
  const isActive = session != null && session.status === 'active'

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
                dirty
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
        <span class="font-mono text-xs text-dim truncate" style={{ flex: 1 }}>
          {project.path}
        </span>

        {isActive ? (
          <span class="badge badge--ok">Active</span>
        ) : (
          <button
            class="btn btn--primary btn--sm"
            onClick={() => onStartSession(project)}
          >
            Start Session
          </button>
        )}
      </div>
    </div>
  )
}
