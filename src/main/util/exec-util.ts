import { execFile } from 'child_process'
import * as os from 'os'

/**
 * Extended PATH for Electron — GUI apps on macOS don't inherit
 * the full shell PATH, so common CLI locations must be added.
 */
const EXTRA_PATHS = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  `${os.homedir()}/.npm-global/bin`,
  `${os.homedir()}/.local/bin`,
  `${os.homedir()}/.claude/local`,
]

function getEnhancedPath(): string {
  const existing = process.env.PATH ?? ''
  const extras = EXTRA_PATHS.filter((p) => !existing.includes(p))
  return extras.length ? `${existing}:${extras.join(':')}` : existing
}

/**
 * Promise wrapper around child_process.execFile with timeout.
 * Uses execFile (NOT exec) to prevent shell injection.
 */
export function runCommand(
  cmd: string,
  args: string[] = [],
  opts: { timeout?: number; cwd?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      timeout: opts.timeout ?? 10_000,
      cwd: opts.cwd,
      env: { ...process.env, PATH: getEnhancedPath() },
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}
