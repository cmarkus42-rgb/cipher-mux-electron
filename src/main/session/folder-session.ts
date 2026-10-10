/**
 * Ordner-Sessions — eine CLI in einem beliebigen Verzeichnis, gestartet aus dem
 * Launcher, ohne Rolle.
 *
 * Zwei reine Entscheidungen, damit `SessionManager.start()` sie nicht inline
 * trifft:
 *
 * 1. **Welche Workspace-Sektionen gehoeren in die CLAUDE.md.** Bis 0.12.0 wurde
 *    nur injiziert, wenn ein Prompt mitkam. Eine Session ohne Workspace fasste
 *    die Datei nie an — und las dann den Prompt, den ein frueherer
 *    Workspace-Start dort hinterlassen hatte, unerneuert und zu keinem
 *    Workspace mehr gehoerend.
 * 2. **Wie die Startzeile aussieht.** Der Renderer baute sie selbst, fest als
 *    `claude …`, waehrend der Main-Prozess MCP fuer die Default-CLI einrichtete.
 *    Jetzt baut sie der Adapter, der auch injiziert.
 */
import type { LaunchCommand, InstructionsTarget } from '../agent/agent-adapter'

export interface WorkspaceSectionSource {
  id: string
  name?: string
  cells?: ReadonlyArray<{ project?: string } | null>
  workspacePrompt?: string
  contextPaths?: string[]
}

export interface WorkspaceSectionRequest {
  /** Drei Zustaende: undefined = keine Entscheidung, null = ohne, String = dieser. */
  workspaceId?: string | null
  workspacePrompt?: string
  contextPaths?: string[]
}

export interface WorkspaceSections {
  /** false = CLAUDE.md nicht anfassen. true = Sektionen genau auf diesen Stand bringen. */
  reconcile: boolean
  /** Set when the session belongs to a known workspace — named in the section. */
  workspaceId?: string
  workspaceName?: string
  /** Projects of the workspace's cells — role directories excluded. */
  workspaceProjects?: string[]
  workspacePrompt?: string
  contextPaths?: string[]
}

/**
 * Ausdrueckliche Werte gewinnen — so kommt der Workspace-Apply mit seinem
 * Zellen-Prompt durch. Sonst entscheidet `workspaceId`:
 *
 * - `undefined`: nicht anfassen. Das ist die Shell aus dem Zellenkopf und jeder
 *   Aufrufer, der von Workspaces nichts weiss; fuer sie aendert sich nichts.
 * - `null`: ohne Workspace — vorhandene Sektionen werden **entfernt**.
 * - ID: Prompt und Kontextpfade dieses Workspaces; ein unbekannter ist wie
 *   keiner, statt einen anderen zu raten.
 */
/**
 * Die Projekte eines Workspaces: was in seinen Zellen als Projekt steht. Zellen,
 * die auf ein Rollenverzeichnis zeigen (Altlast aus der Zeit vor `presetId`),
 * sind keine Projekte und fallen raus. Die Zellen kommen ungeprueft aus der
 * Config — jeder Eintrag wird geprueft, nichts wirft.
 */
export function workspaceProjects(ws: WorkspaceSectionSource, entitiesRoot: string): string[] {
  const root = entitiesRoot.replace(/\/+$/, '') + '/'
  const out: string[] = []
  for (const cell of Array.isArray(ws.cells) ? ws.cells : []) {
    const p = typeof cell?.project === 'string' ? cell.project.trim() : ''
    if (!p || p.startsWith(root) || out.includes(p)) continue
    out.push(p)
  }
  return out
}

export function resolveWorkspaceSections(
  req: WorkspaceSectionRequest,
  workspaces: readonly WorkspaceSectionSource[] | null | undefined,
  entitiesRoot = '',
): WorkspaceSections {
  // Die Liste kommt ungeprueft aus der Config — defensiv lesen.
  const ws = typeof req.workspaceId === 'string' && Array.isArray(workspaces)
    ? workspaces.find(w => w?.id === req.workspaceId)
    : undefined
  const projects = ws && entitiesRoot ? workspaceProjects(ws, entitiesRoot) : []
  const identity = ws
    ? {
      workspaceId: ws.id,
      ...(ws.name?.trim() ? { workspaceName: ws.name.trim() } : {}),
      ...(projects.length ? { workspaceProjects: projects } : {}),
    }
    : {}

  if (req.workspacePrompt?.trim() || req.contextPaths?.length) {
    return {
      reconcile: true,
      ...identity,
      ...(req.workspacePrompt?.trim() ? { workspacePrompt: req.workspacePrompt.trim() } : {}),
      ...(req.contextPaths?.length ? { contextPaths: req.contextPaths } : {}),
    }
  }
  if (req.workspaceId === undefined) return { reconcile: false }
  if (!ws) return { reconcile: true }

  const prompt = ws.workspacePrompt?.trim()
  const paths = Array.isArray(ws.contextPaths) && ws.contextPaths.length ? ws.contextPaths : undefined
  return {
    reconcile: true,
    ...identity,
    ...(prompt ? { workspacePrompt: prompt } : {}),
    ...(paths ? { contextPaths: paths } : {}),
  }
}

/**
 * Der Text der Sektion `## Workspace Prompt`. Eine Ordner-Session erfuhr bis
 * 0.12.1 nur, was der Workspace-Prompt sagte — hatte der Workspace keinen, wusste
 * sie nicht, dass es ihn gibt. Rollen tragen dafuer `## Session Identity`.
 * `undefined` = Sektion entfernen.
 */
export function formatWorkspacePrompt(
  s: Pick<WorkspaceSections, 'workspaceId' | 'workspaceName' | 'workspaceProjects' | 'contextPaths' | 'workspacePrompt'>,
): string | undefined {
  let who: string | undefined
  if (s.workspaceId) {
    who = `Du arbeitest im Workspace **${s.workspaceName ?? s.workspaceId}** (\`${s.workspaceId}\`).`
    if (s.workspaceProjects?.length) {
      who += '\n\nProjekte in diesem Workspace:\n'
        + s.workspaceProjects.map(p => `- \`${p}\``).join('\n')
    }
    if (s.contextPaths?.length) {
      who += '\n\nDazu gehören die Kontextordner unter `## Context Directories`.'
    }
  }
  const parts = [who, s.workspacePrompt?.trim() || undefined].filter((p): p is string => !!p)
  return parts.length ? parts.join('\n\n') : undefined
}

/**
 * Inhalt einer Anweisungsdatei, die der Mux neu anlegt. Der Verweis ist der
 * Grund, warum das Anlegen vertretbar ist: liegt eine AGENTS.md im Projekt, liest
 * opencode die CLAUDE.md nicht mehr (gemessen) — ohne den Satz verloere es die
 * eigentlichen Projektanweisungen, sobald einmal eine Codex-Session dort lief.
 */
export function newInstructionsFile(target: InstructionsTarget): string {
  if (!target.pointerTo) return '# Projektanweisungen\n'
  return '# Projektanweisungen\n\n'
    + `Die eigentlichen Projektanweisungen stehen in \`${target.pointerTo}\` in diesem Verzeichnis. `
    + 'Lies sie zu Beginn der Session vollständig; was dort steht, gilt hier genauso.\n'
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

function shellArg(s: string): string {
  return /^[A-Za-z0-9_\-.=/:@,+]+$/.test(s) ? s : shellQuote(s)
}

/**
 * Die Zeile, die nach TERMINAL_READY ins Pane getippt wird. `launch = null`
 * heisst „nur Shell". Das `cd` steht davor, weil die Shell ihr Startverzeichnis
 * nicht in jedem Fall behaelt (Login-Profile, die woanders hin wechseln).
 */
export function buildFolderAutoLaunch(dirPath: string, launch: LaunchCommand | null): string {
  const cd = `cd ${shellQuote(dirPath)} && clear`
  if (!launch) return `${cd}\n`
  return `${cd}; ${[launch.cmd, ...launch.args].map(shellArg).join(' ')}\n`
}

/**
 * Die CLI fuer eine wiederhergestellte Session (Keep Working, Recovery).
 *
 * Eine Rolle loest ihre CLI weiter selbst auf — sie kann seit dem Speichern
 * umgestellt worden sein, und dann gilt die neue Wahl. Eine Ordner-Session hat
 * keine Rolle; ohne die gespeicherte ID kaeme eine Codex-Session nach dem
 * Neustart als Default-CLI zurueck, und das saehe nach Erfolg aus.
 * `undefined` heisst: Rolle bzw. Default entscheiden.
 */
export function restoreAdapterId(
  entry: { entityId?: string | null; adapterId?: string | null },
  isKnown: (adapterId: string) => boolean,
): string | undefined {
  if (entry.entityId) return undefined
  const id = entry.adapterId ?? null
  return id && isKnown(id) ? id : undefined
}
