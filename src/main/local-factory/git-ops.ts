import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { spawn, execFile } from 'child_process'
import { promisify } from 'util'
import { runCommand, getEnhancedPath } from '../util/exec-util'

/**
 * git und Shell für den Läufer. Alles, was der Gate prüft, kommt von hier —
 * nicht aus dem, was der Worker berichtet.
 */

/**
 * Die Shell für Testbefehle: zsh, wie im Terminal des Users (macOS-Standard,
 * dort kommt node/npm aus dem Profil). Wo es keine zsh gibt — die Linux-CI —
 * `/bin/sh`; ein fest verdrahtetes /bin/zsh ließ dort jeden runShell-Aufruf
 * mit ENOENT scheitern.
 */
export function loginShell(exists: (p: string) => boolean = fs.existsSync): string {
  return exists('/bin/zsh') ? '/bin/zsh' : '/bin/sh'
}

export async function runShell(
  cmd: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ exitCode: number | null; output: string }> {
  return new Promise(resolve => {
    // -l: der Testbefehl soll dieselbe Umgebung sehen wie im Terminal (node,
    // npm, flutter aus dem Profil-PATH).
    // detached: eigene Prozessgruppe, damit der Timeout auch Enkelprozesse
    // (npm test, a && b) trifft und nicht nur die Shell.
    const child = spawn(loginShell(), ['-lc', cmd], {
      cwd,
      env: { ...process.env, PATH: getEnhancedPath() },
      detached: true,
    })
    let output = ''
    let done = false
    const finish = (exitCode: number | null, extra = ''): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ exitCode, output: output + extra })
    }
    child.stdout.on('data', d => { output += d })
    child.stderr.on('data', d => { output += d })
    const timer = setTimeout(() => {
      try { process.kill(-child.pid!, 'SIGKILL') } catch { /* Gruppe schon weg */ }
      finish(null)
    }, timeoutMs)
    child.on('close', code => finish(code))
    child.on('error', err => finish(null, String(err)))
  })
}

export function toRepoRelative(projekt: string, p: string): string {
  const rel = path.isAbsolute(p) ? path.relative(projekt, p) : p
  return rel.replace(/^\.\//, '')
}

const git = (projekt: string, args: string[]): Promise<string> =>
  runCommand('git', args, { cwd: projekt, timeout: 30_000 })

const lines = (s: string): string[] => s.split('\n').map(l => l.trim()).filter(Boolean)

// core.quotepath=off: sonst maskiert git Nicht-ASCII-Namen als "\303\244.txt",
// und der Vergleich mit den geschützten Pfaden schlägt still fehl.
const NO_QUOTE = ['-c', 'core.quotepath=off']

/**
 * Liegt die Datei unter einem `sauberkeitIgnoriert`-Eintrag (L15)? Ein Eintrag trifft
 * sich selbst — Datei, Verzeichnis oder Symlink — und alles darunter. Gerade der
 * Symlink zählt: `node_modules` als Link erscheint ohne Schrägstrich, und ein
 * gitignore `node_modules/` erfasst ihn nicht.
 */
export function istIgnoriert(datei: string, eintraege: readonly string[]): boolean {
  const d = datei.replace(/^\.\//, '')
  return eintraege.some(e => {
    const n = e.replace(/^\.\//, '').replace(/\/+$/, '')
    return n !== '' && (d === n || d.startsWith(n + '/'))
  })
}

/** Pathspecs, die ignorierte Einträge aus `git add` heraushalten. */
const ohne = (ausnahmen: readonly string[]): string[] =>
  ausnahmen.map(e => e.replace(/^\.\//, '').replace(/\/+$/, '')).filter(Boolean).map(e => `:(exclude,literal)${e}`)

export async function dirtyFiles(projekt: string): Promise<string[]> {
  const tracked = lines(await git(projekt, [...NO_QUOTE, 'diff', '--name-only', '--no-renames', 'HEAD']))
  const untracked = lines(await git(projekt, [...NO_QUOTE, 'ls-files', '--others', '--exclude-standard']))
  return [...new Set([...tracked, ...untracked])]
}

/** Ausgecheckter Branch; „HEAD“ bei losgelöstem HEAD. */
export async function currentBranch(projekt: string): Promise<string> {
  return git(projekt, ['rev-parse', '--abbrev-ref', 'HEAD'])
}

export async function headCommit(projekt: string): Promise<string> {
  return git(projekt, ['rev-parse', 'HEAD'])
}

// --no-verify (Ruling R14): Hooks des Ziel-Repos (z. B. husky mit Tests) würden
// den absichtlich roten Abnahmetest-Commit blockieren. Die Qualitätsprüfung ist
// der Gate, nicht der Hook.
export async function commitPaths(projekt: string, paths: string[], message: string): Promise<string> {
  await git(projekt, ['add', '--', ...paths])
  await git(projekt, ['commit', '-q', '--no-verify', '-m', message, '--', ...paths])
  return headCommit(projekt)
}

/**
 * Grüner Abschluss (R14): alles seit `base` — auch Commits, die der Worker
 * selbst gemacht hat — wird zu genau einem Commit. Gibt bewusst keinen Hash
 * zurück: der Läufer muss den Versuch direkt nach dem erfolgreichen commit als
 * entschieden markieren, bevor ein weiterer Aufruf (headCommit) scheitern kann.
 */
export async function commitAll(projekt: string, base: string, message: string, ausnahmen: readonly string[] = []): Promise<void> {
  await git(projekt, ['reset', '-q', '--soft', base])
  await git(projekt, ['add', '-A', '--', '.', ...ohne(ausnahmen)])
  await git(projekt, ['commit', '-q', '--no-verify', '-m', message])
}

export async function changedSince(projekt: string, base: string): Promise<string[]> {
  // --no-renames: ein umbenannter Test erscheint sonst nur mit dem Zielpfad,
  // und der Gate übersähe, dass ein geschützter Pfad verschwunden ist.
  const tracked = lines(await git(projekt, [...NO_QUOTE, 'diff', '--name-only', '--no-renames', base]))
  const untracked = lines(await git(projekt, [...NO_QUOTE, 'ls-files', '--others', '--exclude-standard']))
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

const execFileP = promisify(execFile)

export async function isRepoRoot(projekt: string): Promise<boolean> {
  try {
    const top = await git(projekt, ['rev-parse', '--show-toplevel'])
    return fs.realpathSync(top) === fs.realpathSync(projekt)
  } catch {
    return false
  }
}

/**
 * Achtung: git reset --hard + clean -fd. Läuft nur, wenn projekt die Repo-Wurzel ist.
 * `ausnahmen` (sauberkeitIgnoriert) bleiben liegen und stehen nicht im Patch — sonst
 * löschte clean die vorbereitete Umgebung (L15).
 */
export async function savePatchAndReset(projekt: string, base: string, patchFile: string, ausnahmen: readonly string[] = []): Promise<void> {
  // reset --hard würde sonst ein umschließendes Repo komplett zurücksetzen.
  if (!(await isRepoRoot(projekt))) {
    throw new Error(`projekt ist nicht die Wurzel eines git-Repos: ${projekt}`)
  }
  // Untracked erst in den Index (intent-to-add), damit der Patch sie enthält.
  await git(projekt, ['add', '-N', '--', '.', ...ohne(ausnahmen)])
  // Eigener Aufruf: großer Puffer, --binary, unbeschnitten.
  // encoding 'buffer': der Patch wird roh geschrieben. Ein UTF-8-Umweg machte
  // aus jedem Nicht-UTF-8-Byte (Latin-1-Text) ein U+FFFD, und der Patch ließe
  // sich nicht mehr anwenden.
  const { stdout } = await execFileP('git', ['diff', '--binary', base], {
    cwd: projekt,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, PATH: getEnhancedPath() },
    encoding: 'buffer',
  })
  fs.mkdirSync(path.dirname(patchFile), { recursive: true })
  fs.writeFileSync(patchFile, stdout)
  await git(projekt, ['reset', '-q', '--hard', base])
  // -e: verankertes Ignoriermuster je Eintrag; clean lässt es dann stehen.
  const behalten = ausnahmen.map(e => e.replace(/^\.\//, '').replace(/\/+$/, '')).filter(Boolean).flatMap(e => ['-e', `/${e}`])
  await git(projekt, ['clean', '-fdq', ...behalten])
}

/** Eine hinzugefügte Zeile im Baum seit `base` (L16b). */
export interface NeueZeile {
  datei: string
  zeile: number
  text: string
}

/**
 * Was seit `base` hinzugekommen ist, Zeile für Zeile: aus `git diff -U0` nur die
 * +-Zeilen (der `+++`-Kopf zählt nicht), dazu neue, ungetrackte Textdateien ganz.
 * Gelöschte Zeilen zählen nicht — wer ein Muster entfernt, verstößt nicht dagegen.
 */
export async function hinzugefuegteZeilen(projekt: string, base: string, ausnahmen: readonly string[] = []): Promise<NeueZeile[]> {
  // --text/--no-textconv: Attribute des Repos (binary, diff=…) dürfen keine Zeilen verstecken.
  const { stdout } = await execFileP('git', [...NO_QUOTE, 'diff', '-U0', '--no-renames', '--no-color', '--no-ext-diff', '--text', '--no-textconv',
    // Feste Präfixe: diff.noprefix/mnemonicPrefix des Repos dürfen den Kopf nicht umformen.
    '--src-prefix=a/', '--dst-prefix=b/', base], {
    cwd: projekt, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PATH: getEnhancedPath() },
  })
  const out: NeueZeile[] = []
  let datei: string | null = null
  let nr = 0
  // Kopfzeilen gibt es nur zwischen „diff --git“ und dem ersten @@ — danach ist
  // jede +-Zeile Inhalt, auch eine, die mit „++ “ beginnt.
  let imKopf = false
  for (const l of stdout.split('\n')) {
    if (l.startsWith('diff --git ')) { datei = null; imKopf = true; continue }
    if (imKopf && l.startsWith('+++ ')) {
      // Bei Leerzeichen im Namen hängt git einen Tab an den Kopf.
      const p = unquote(l.slice(4).replace(/\t$/, ''))
      datei = p === '/dev/null' ? null : p.replace(/^b\//, '')
      continue
    }
    const hunk = l.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) { nr = Number(hunk[1]); imKopf = false; continue }
    if (imKopf) continue
    if (datei && l.startsWith('+')) {
      if (!istIgnoriert(datei, ausnahmen)) out.push({ datei, zeile: nr, text: l.slice(1) })
      nr++
    }
  }
  const neu = lines(await git(projekt, [...NO_QUOTE, 'ls-files', '--others', '--exclude-standard']))
  for (const f of neu) {
    if (istIgnoriert(f, ausnahmen)) continue
    let buf: Buffer
    try {
      if (!fs.statSync(path.join(projekt, f)).isFile()) continue
      buf = fs.readFileSync(path.join(projekt, f))
    } catch { continue }
    // Auch mit NUL-Bytes gelesen: ein einzelnes NUL machte die Datei sonst unsichtbar.
    const text = buf.toString('utf-8').split('\n')
    if (text.at(-1) === '') text.pop()
    text.forEach((t, i) => out.push({ datei: f, zeile: i + 1, text: t }))
  }
  return out
}

const ESCAPES: Record<string, number> = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 }

/** Pfad aus einem diff-Kopf: git setzt Namen mit `"`, `\\` oder Steuerzeichen C-artig in Anführungszeichen. */
function unquote(p: string): string {
  if (!p.startsWith('"') || !p.endsWith('"')) return p
  const bytes: number[] = []
  const inner = p.slice(1, -1)
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i]
    if (c !== '\\') { bytes.push(...Buffer.from(c, 'utf-8')); continue }
    const n = inner[i + 1]
    const okt = inner.slice(i + 1, i + 4)
    if (/^[0-7]{3}$/.test(okt)) { bytes.push(parseInt(okt, 8)); i += 3 }
    else if (n in ESCAPES) { bytes.push(ESCAPES[n]); i += 1 }
    else bytes.push(92)
  }
  return Buffer.from(bytes).toString('utf-8')
}

/** Umfang eines Commits für die Bilanz: Dateien und Zeilen (hinzu + weg). Binärdateien zählen als Datei, nicht als Zeilen. */
export async function diffStat(projekt: string, from: string, to: string): Promise<{ dateien: number; zeilen: number }> {
  const out = lines(await git(projekt, [...NO_QUOTE, 'diff', '--numstat', '--no-renames', from, to]))
  let zeilen = 0
  for (const l of out) {
    const [add, del] = l.split('\t')
    zeilen += (Number(add) || 0) + (Number(del) || 0)
  }
  return { dateien: out.length, zeilen }
}
