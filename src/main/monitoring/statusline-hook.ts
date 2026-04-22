import * as fs from 'fs'
import * as path from 'path'
import { STATUSLINE_DIR } from '../../shared/constants'

/**
 * Inject a StatusLine hook into a project's .claude/settings.local.json.
 *
 * The hook writes Claude Code's status line JSON to
 * /tmp/cipher-mux/context/$CIPHER_MUX_SESSION_ID.json on every update.
 * The env var CIPHER_MUX_SESSION_ID must be set in the session's tmux
 * environment (done by SessionManager.start()).
 */
export function injectStatusLineHook(projectPath: string): void {
  const claudeDir = path.join(projectPath, '.claude')
  const settingsPath = path.join(claudeDir, 'settings.local.json')

  fs.mkdirSync(claudeDir, { recursive: true })

  // Read existing settings or start fresh
  let settings: Record<string, any> = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
  } catch {
    // File doesn't exist or invalid JSON
  }

  // Skip if statusLine already configured
  if (settings.statusLine?.command) {
    return
  }

  // Add statusLine — top-level setting, receives JSON on stdin
  settings.statusLine = {
    type: 'command',
    command: `cat > ${STATUSLINE_DIR}/$CIPHER_MUX_SESSION_ID.json`,
    padding: 0,
  }

  // Remove legacy hooks.StatusLine if present
  if (settings.hooks?.StatusLine) {
    delete settings.hooks.StatusLine
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks
    }
  }

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}
