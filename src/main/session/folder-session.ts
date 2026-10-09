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
import type { LaunchCommand } from '../agent/agent-adapter'

export interface WorkspaceSectionSource {
  id: string
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
export function resolveWorkspaceSections(
  req: WorkspaceSectionRequest,
  workspaces: readonly WorkspaceSectionSource[] | null | undefined,
): WorkspaceSections {
  if (req.workspacePrompt?.trim() || req.contextPaths?.length) {
    return {
      reconcile: true,
      ...(req.workspacePrompt?.trim() ? { workspacePrompt: req.workspacePrompt.trim() } : {}),
      ...(req.contextPaths?.length ? { contextPaths: req.contextPaths } : {}),
    }
  }
  if (req.workspaceId === undefined) return { reconcile: false }
  if (req.workspaceId === null) return { reconcile: true }

  // Die Liste kommt ungeprueft aus der Config — defensiv lesen.
  const ws = Array.isArray(workspaces) ? workspaces.find(w => w?.id === req.workspaceId) : undefined
  const prompt = ws?.workspacePrompt?.trim()
  const paths = Array.isArray(ws?.contextPaths) && ws.contextPaths.length ? ws.contextPaths : undefined
  return {
    reconcile: true,
    ...(prompt ? { workspacePrompt: prompt } : {}),
    ...(paths ? { contextPaths: paths } : {}),
  }
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
