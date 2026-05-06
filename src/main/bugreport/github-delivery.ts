/**
 * GitHub Delivery — open a pre-filled GitHub Issue in the user's browser,
 * or create one directly via `gh` CLI if available.
 */
import { shell } from 'electron'
import { runCommand } from '../util/exec-util'
import { configStore } from '../config/config-store'

const DEFAULT_REPO = 'cmarkus42-rgb/cipher-mux-electron'

export interface GitHubDeliveryResult {
  ok: boolean
  method: 'browser' | 'gh-cli' | 'skipped'
  issueUrl?: string
  error?: string
}

interface DeliveryPayload {
  title: string
  body: string
  labels: string[]
}

/**
 * Check if `gh` CLI is available and authenticated.
 */
async function isGhAvailable(): Promise<boolean> {
  try {
    const result = await runCommand('gh', ['auth', 'status'], { timeout: 5000 })
    return result.includes('Logged in')
  } catch {
    return false
  }
}

/**
 * Create a GitHub Issue via `gh` CLI.
 */
async function createViaGhCli(repo: string, payload: DeliveryPayload): Promise<string> {
  const args = [
    'issue', 'create',
    '--repo', repo,
    '--title', payload.title,
    '--body', payload.body,
  ]
  for (const label of payload.labels) {
    args.push('--label', label)
  }
  const result = await runCommand('gh', args, { timeout: 15_000 })
  // gh issue create prints the issue URL on success
  const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+/)
  return urlMatch?.[0] ?? result.trim()
}

/**
 * Open a pre-filled GitHub Issue in the user's default browser.
 */
function openInBrowser(repo: string, payload: DeliveryPayload): void {
  const params = new URLSearchParams({
    title: payload.title,
    body: payload.body,
    labels: payload.labels.join(','),
  })
  const url = `https://github.com/${repo}/issues/new?${params.toString()}`
  shell.openExternal(url)
}

/**
 * Map severity to GitHub labels.
 */
function severityToLabels(severity?: string, tags?: string[]): string[] {
  const labels = ['bug']
  if (severity) {
    const s = severity.toLowerCase()
    if (s === 'critical' || s === 'high') labels.push(`priority:${s}`)
  }
  if (tags) {
    for (const tag of tags.slice(0, 3)) {
      labels.push(tag.toLowerCase().replace(/\s+/g, '-'))
    }
  }
  return labels
}

/**
 * Deliver a bug report to GitHub. Tries `gh` CLI first, falls back to browser.
 *
 * @param title - Issue title
 * @param body - Issue body (markdown)
 * @param severity - Bug severity for label mapping
 * @param tags - Additional tags for labels
 */
export async function deliverToGitHub(
  title: string,
  body: string,
  severity?: string,
  tags?: string[],
): Promise<GitHubDeliveryResult> {
  const delivery = configStore.get('bugreportDelivery')
  if (!delivery || delivery.mode !== 'github') {
    return { ok: true, method: 'skipped' }
  }

  const repo = delivery.githubRepo || DEFAULT_REPO
  const labels = severityToLabels(severity, tags)
  const payload: DeliveryPayload = { title, body, labels }

  // Try gh CLI first — direct, no browser switch
  const ghAvailable = await isGhAvailable()
  if (ghAvailable) {
    try {
      const issueUrl = await createViaGhCli(repo, payload)
      console.log(`[GitHubDelivery] Issue created via gh CLI: ${issueUrl}`)
      return { ok: true, method: 'gh-cli', issueUrl }
    } catch (err) {
      console.warn('[GitHubDelivery] gh CLI failed, falling back to browser:', (err as Error).message)
    }
  }

  // Fallback: open pre-filled issue in browser
  try {
    openInBrowser(repo, payload)
    return { ok: true, method: 'browser' }
  } catch (err) {
    const error = (err as Error).message
    console.error('[GitHubDelivery] Browser fallback failed:', error)
    return { ok: false, method: 'browser', error }
  }
}
