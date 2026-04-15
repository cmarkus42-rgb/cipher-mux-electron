import type { ProjectInfo, SessionInfo, ContextUsage } from '../../shared/types'
import { ProjectCard } from './ProjectCard'

interface CockpitViewProps {
  sessions: SessionInfo[]
  contextUsages: Record<string, ContextUsage>
  projects: ProjectInfo[]
  scanning: boolean
  onRescan: () => void
  onStartSession: (project: ProjectInfo) => void
}

const gridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 'var(--space-lg)',
  padding: 'var(--space-lg)',
  overflowY: 'auto' as const,
  flex: 1,
}

export function CockpitView({ sessions, contextUsages, projects, scanning, onRescan, onStartSession }: CockpitViewProps) {

  /** Match a session to a project by path */
  function sessionForProject(project: ProjectInfo): SessionInfo | undefined {
    return sessions.find(
      (s) => s.projectPath === project.path && s.status === 'active'
    )
  }

  if (projects.length === 0 && !scanning) {
    return (
      <div class="empty-state">
        <div class="empty-state__title">Cockpit</div>
        <div class="empty-state__text">
          No projects found. Configure scan paths or use the button below to scan.
        </div>
        <button class="btn btn--primary" onClick={onRescan}>
          Scan Projects
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div class="toolbar">
        <div class="toolbar__group">
          <span class="font-heading text-upper text-sm">Projects</span>
          <span class="badge">{projects.length}</span>
        </div>
        <div class="toolbar__spacer" />
        <div class="toolbar__group">
          <button
            class="btn btn--sm"
            onClick={onRescan}
            disabled={scanning}
          >
            {scanning ? 'Scanning...' : 'Scan Projects'}
          </button>
        </div>
      </div>

      {/* Project Grid */}
      <div style={gridStyle}>
        {projects.map((project) => (
          <ProjectCard
            key={project.path}
            project={project}
            session={sessionForProject(project)}
            contextUsage={sessionForProject(project) ? contextUsages[sessionForProject(project)!.id]?.usedPercentage : undefined}
            onStartSession={onStartSession}
          />
        ))}
      </div>
    </div>
  )
}
