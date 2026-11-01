/**
 * Was `mux_task_list` zurueckgibt: eine Uebersicht, keine Volltexte.
 *
 * Bis 2026-11-01 gab das Werkzeug jeden Task mit Beschreibung und Ergebnis
 * zurueck, ohne Grenze. Bei rund 10.000 Tasks (13 MB) brach der MCP-Client die
 * Verbindung ab — die Sessions meldeten „mux tasks nicht lesbar". Den Volltext
 * eines Tasks liefert `mux_task_get`.
 */
import type { Task } from '../../shared/types'

export const TASK_LIST_DEFAULT_LIMIT = 50
export const TASK_LIST_MAX_LIMIT = 500

export interface TaskListEintrag {
  id: string
  title: string
  state: Task['state']
  source: string
  parentId: string | null
  sessionId: string | null
  createdAt: number
  updatedAt: number
}

export interface TaskListAntwort {
  total: number
  shown: number
  tasks: TaskListEintrag[]
  hint?: string
}

/** Neueste zuerst, gekappt auf `limit`; `total` zaehlt alle Treffer. */
export function taskListAntwort(tasks: Task[], limit = TASK_LIST_DEFAULT_LIMIT): TaskListAntwort {
  const grenze = Math.max(1, Math.min(Math.floor(limit), TASK_LIST_MAX_LIMIT))
  const neueste = [...tasks].sort((a, b) => b.createdAt - a.createdAt).slice(0, grenze)
  const antwort: TaskListAntwort = {
    total: tasks.length,
    shown: neueste.length,
    tasks: neueste.map((t) => ({
      id: t.id,
      title: t.title,
      state: t.state,
      source: t.source,
      parentId: t.parentId,
      sessionId: t.sessionId,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  }
  if (neueste.length < tasks.length) {
    antwort.hint = `${tasks.length - neueste.length} aeltere ausgelassen — Filter (state, source) oder limit setzen; Volltext per mux_task_get.`
  }
  return antwort
}
