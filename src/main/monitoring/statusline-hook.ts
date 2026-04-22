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

  // Ensure hooks object
  if (!settings.hooks) {
    settings.hooks = {}
  }

  // Skip if StatusLine hook already present
  if (Array.isArray(settings.hooks.StatusLine) && settings.hooks.StatusLine.length > 0) {
    return
  }

  // Add StatusLine hook — writes stdin JSON to per-session file
  settings.hooks.StatusLine = [
    {
      matcher: '',
      hooks: [
        {
          type: 'command',
          command: `cat > ${STATUSLINE_DIR}/$CIPHER_MUX_SESSION_ID.json`,
        },
      ],
    },
  ]

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}
