import type { StartSessionOpts } from '../../shared/types'

export const CREATE_SESSION_ADAPTERS = ['claude-code', 'opencode', 'codex'] as const
export type CreateSessionAdapter = (typeof CREATE_SESSION_ADAPTERS)[number]

export interface CreateSessionArgs {
  name: string
  projectPath: string
  command?: string
  shellOnly?: boolean
  resume?: boolean
  model?: string
  adapter?: CreateSessionAdapter
  /** undefined = Workspace des Aufrufers, null = ausdruecklich ungebunden. */
  workspaceId?: string | null
}

/**
 * Was `mux_create_session` an `SessionManager.start()` gibt.
 *
 * Die Startzeile baut der Adapter (`folderLaunch`), wie beim Ordner-Start aus
 * dem Launcher. Bis 0.13.0 stand hier eine feste `claude`-Zeile — wer opencode
 * wollte, musste es per `command` starten, und die Session lief dann unter
 * `adapterId: 'claude-code'`: ohne Modell in der opencode.json, ohne
 * Usage-Plugin, mit falschen Capabilities.
 *
 * Workspace wie bei `mux_entity_start`: ohne Angabe der des Aufrufers. Eine
 * Rolle in einem Workspace, die einen Worker startet, will ihn dort haben;
 * vergessene Angaben wuerden sonst ungebundene Sessions erzeugen.
 */
export function buildCreateSessionOpts(
  args: CreateSessionArgs,
  callerWorkspaceId: string | null | undefined,
): StartSessionOpts {
  const workspaceId = args.workspaceId === undefined ? (callerWorkspaceId ?? null) : args.workspaceId
  const opts: StartSessionOpts = {
    name: args.name,
    projectPath: args.projectPath,
    workspaceId,
  }

  if (args.command) {
    opts.command = args.command
    if (args.adapter) opts.adapterId = args.adapter
    return opts
  }
  if (args.shellOnly) return opts

  opts.adapterId = args.adapter ?? 'claude-code'
  opts.folderLaunch = { resume: args.resume }
  if (args.model) opts.model = args.model
  return opts
}
