/**
 * POSIX shell-escape a file path for safe insertion into zsh/bash.
 * Wraps the path in single quotes and escapes embedded single quotes
 * using the '\'' idiom (end quote, escaped quote, start quote).
 */
export function shellEscapePath(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'"
}

/**
 * Shell-escape multiple file paths and join them space-separated.
 */
export function shellEscapePaths(paths: string[]): string {
  return paths.map(shellEscapePath).join(' ')
}
