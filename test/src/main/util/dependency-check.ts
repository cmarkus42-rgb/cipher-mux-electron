import { runCommand } from './exec-util'

export interface DependencyStatus {
  tmux: { available: boolean; version: string | null }
  claudeCode: { available: boolean; version: string | null }
}

/**
 * Checks if required external dependencies are installed.
 * Uses execFile (safe, no shell injection).
 */
export async function checkDependencies(): Promise<DependencyStatus> {
  const [tmux, claudeCode] = await Promise.all([checkTmux(), checkClaudeCode()])
  return { tmux, claudeCode }
}

async function checkTmux(): Promise<{ available: boolean; version: string | null }> {
  try {
    const version = await runCommand('tmux', ['-V'])
    return { available: true, version }
  } catch {
    return { available: false, version: null }
  }
}

async function checkClaudeCode(): Promise<{ available: boolean; version: string | null }> {
  try {
    const version = await runCommand('claude', ['--version'])
    return { available: true, version }
  } catch {
    return { available: false, version: null }
  }
}
