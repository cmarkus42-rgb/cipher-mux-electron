import { execFile } from 'child_process'

/**
 * Promise wrapper around child_process.execFile with timeout.
 * Uses execFile (NOT exec) to prevent shell injection.
 * Ported from cipher-mux v1.
 */
export function runCommand(
  cmd: string,
  args: string[] = [],
  opts: { timeout?: number; cwd?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: opts.timeout ?? 10_000, cwd: opts.cwd }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${stderr || err.message}`))
      } else {
        resolve(stdout.trim())
      }
    })
  })
}
