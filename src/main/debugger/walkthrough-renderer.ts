export interface WalkthroughEntry {
  filePath: string
  lineRange: string
  explanation: string
}

/**
 * WalkthroughRenderer — generates linear walkthrough markdown for reviewed fixes.
 */
export class WalkthroughRenderer {
  /** Render a walkthrough from file change entries. */
  render(entries: WalkthroughEntry[], title: string): string {
    const lines: string[] = []

    lines.push(`# Linear Walkthrough: ${title}`)
    lines.push('')

    if (entries.length === 0) {
      lines.push('Keine Aenderungen in diesem Fix.')
      return lines.join('\n')
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      lines.push(`## ${i + 1}. \`${entry.filePath}\` (Zeilen ${entry.lineRange})`)
      lines.push('')
      lines.push(entry.explanation)
      lines.push('')
    }

    return lines.join('\n')
  }
}
