import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn } from 'child_process'
import { runCommand, getEnhancedPath } from '../util/exec-util'

/**
 * git und Shell für den Läufer. Alles, was der Gate prüft, kommt von hier —
 * nicht aus dem, was der Worker berichtet.
 */

export async function runShell(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise(resolve => {
    // -l: der Testbefehl soll dieselbe Umgebung sehen wie im Terminal (node,
    // npm, flutter aus dem Profil-PATH).
    const child = spawn('/bin/zsh', ['-lc', cmd], {
      cwd,
      env: { ...process.env, PATH: getEnhancedPath() },
    })
    let output = ''
    let timedOut = false
    child.stdout.on('data', d => { output += d })
    child.stderr.on('data', d => { output += d })
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ exitCode: timedOut ? null : code, output })
    })
    child.on('error', err => {
      clearTimeout(timer)
      resolve({ exitCode: null, output: output + String(err) })
    })
  })
}

export function toRepoRelative(projekt: string, p: string): string {
  const rel = path.isAbsolute(p) ? path.relative(projekt, p) : p
  return rel.replace(/^\.\//, '')
}

const git = (projekt: string, args: string[]): Promise<string> =>
  runCommand('git', args, { cwd: projekt, timeout: 30_000 })

const lines = (s: string): string[] => s.split('\n').map(l => l.trim()).filter(Boolean)

export async function dirtyFiles(projekt: string): Promise<string[]> {
  const tracked = lines(await git(projekt, ['diff', '--name-only', '--no-renames', 'HEAD']))
  const untracked = lines(await git(projekt, ['ls-files', '--others', '--exclude-standard']))
  return [...new Set([...tracked, ...untracked])]
}

export async function headCommit(projekt: string): Promise<string> {
  return git(projekt, ['rev-parse', 'HEAD'])
}

export async function commitPaths(projekt: string, paths: string[], message: string): Promise<string> {
  await git(projekt, ['add', '--', ...paths])
  await git(projekt, ['commit', '-q', '-m', message, '--', ...paths])
  return headCommit(projekt)
}

export async function commitAll(projekt: string, message: string): Promise<string> {
  await git(projekt, ['add', '-A'])
  await git(projekt, ['commit', '-q', '-m', message])
  return headCommit(projekt)
}

export async function changedSince(projekt: string, base: string): Promise<string[]> {
  // --no-renames: ein umbenannter Test erscheint sonst nur mit dem Zielpfad,
  // und der Gate übersähe, dass ein geschützter Pfad verschwunden ist.
  const tracked = lines(await git(projekt, ['diff', '--name-only', '--no-renames', base]))
  const untracked = lines(await git(projekt, ['ls-files', '--others', '--exclude-standard']))
  return [...new Set([...tracked, ...untracked])]
}

export function checksums(projekt: string, files: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of files) {
    try {
      out[f] = crypto.createHash('sha256').update(fs.readFileSync(path.join(projekt, f))).digest('hex')
    } catch {
      // fehlt → fehlt im Ergebnis; decideGate wertet das als Abweichung
    }
  }
  return out
}

/** Achtung: git reset --hard + clean -fd. Läuft nur mit cwd = projekt. */
export async function savePatchAndReset(projekt: string, base: string, patchFile: string): Promise<void> {
  // Untracked erst in den Index (intent-to-add), damit der Patch sie enthält.
  await git(projekt, ['add', '-N', '.'])
  const patch = await git(projekt, ['diff', base])
  fs.mkdirSync(path.dirname(patchFile), { recursive: true })
  fs.writeFileSync(patchFile, patch + '\n', 'utf-8')
  await git(projekt, ['reset', '-q', '--hard', base])
  await git(projekt, ['clean', '-fdq'])
}
