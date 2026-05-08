/** Minimal task shape needed for topic resolution (avoids importing full Task type). */
interface TaskSlice {
  title: string
  state: string
  sessionId: string | null
  updatedAt: number
}

/** Minimal session shape needed for topic resolution. */
interface SessionSlice {
  id: string
  name: string
  projectPath: string | null
  entityId?: string
}

/** Entity ID → human-readable display name. */
const ENTITY_DISPLAY_NAMES: Record<string, string> = {
  orchestrator: 'Orchestrator',
  'cyber-factory': 'Cyber Factory',
  companion: 'Companion',
  refinement: 'Refinement',
  launcher: 'Launcher',
  'voice-relay': 'Voice Relay',
  audit: 'Audit',
  'ideation-partner': 'Ideation Partner',
  debugger: 'Debugger',
  'testing-assistant': 'Testing Assistant',
  bugreport: 'Bugreport',
}

const FILLER_WORDS = new Set(['ja', 'ok', 'y', 'n', 'yes', 'no', 'weiter', 'nein', 'gut', 'passt', 'done', 'exit'])

/**
 * Extract a substantive prompt from tmux capture-pane output.
 * Walks lines bottom-to-top, skipping empty/filler/prompt-marker lines.
 * Returns undefined if nothing substantive found.
 */
export function extractPromptFromCapture(capture: string): string | undefined {
  const lines = capture.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    let line = lines[i].trim()
    // Strip all ANSI escape sequences (color, cursor, screen control)
    line = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
    // Strip leading prompt markers
    line = line.replace(/^[>$%❯●■▸]+\s*/, '')
    line = line.trim()
    if (line.length < 8) continue
    if (FILLER_WORDS.has(line.toLowerCase())) continue
    // Truncate to 80 chars
    return line.length > 80 ? line.slice(0, 80) : line
  }
  return undefined
}

/**
 * Derive a thematic topic string for a session at snapshot save-time.
 *
 * Priority: running task → completed task → tmux capture → project basename.
 * Entity name is prefixed when entityId is set.
 */
export function resolveSessionTopic(
  session: SessionSlice,
  tasks: TaskSlice[],
  tmuxCapture: string | undefined,
): string {
  const sessionTasks = tasks.filter(t => t.sessionId === session.id)

  // 1. Running/dispatched task
  const active = sessionTasks
    .filter(t => t.state === 'running' || t.state === 'dispatched')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (active.length > 0) {
    return withEntityPrefix(session.entityId, active[0].title, '—')
  }

  // 2. Most recent completed task
  const completed = sessionTasks
    .filter(t => t.state === 'completed')
    .sort((a, b) => b.updatedAt - a.updatedAt)
  if (completed.length > 0) {
    return withEntityPrefix(session.entityId, completed[0].title, '—')
  }

  // 3. tmux capture
  if (tmuxCapture) {
    const prompt = extractPromptFromCapture(tmuxCapture)
    if (prompt) {
      return withEntityPrefix(session.entityId, prompt, '—')
    }
  }

  // 4. Fallback: project basename
  const basename = session.projectPath
    ? session.projectPath.replace(/\/+$/, '').split('/').pop() ?? 'session'
    : 'session'
  return withEntityPrefix(session.entityId, basename, '·')
}

function withEntityPrefix(entityId: string | undefined, text: string, separator: string): string {
  if (!entityId) return text
  const name = ENTITY_DISPLAY_NAMES[entityId] ?? entityId
  return `${name} ${separator} ${text}`
}
