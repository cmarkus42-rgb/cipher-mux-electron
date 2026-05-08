import https from 'node:https'
import { APP_VERSION } from '../../shared/constants'
import type { UpdateInfo } from './update-types'

const GITHUB_REPO = 'ciphernom/cipher-mux-electron'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

/**
 * Compare two semver strings. Returns 1 if a > b, -1 if a < b, 0 if equal.
 * Strips leading 'v', build metadata (+NNN), and pre-release tags (-beta etc.).
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) =>
    v.replace(/^v/, '').replace(/\+.*$/, '').replace(/-.*$/, '').split('.').map(Number)
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

interface GitHubRelease {
  tag_name: string
  html_url: string
  body: string
  published_at: string
  assets: Array<{ name: string; browser_download_url: string }>
}

/**
 * Parse a GitHub release response into UpdateInfo, or null if not newer.
 */
export function parseGitHubRelease(release: GitHubRelease, currentVersion: string): UpdateInfo | null {
  const remoteVersion = release.tag_name.replace(/^v/, '')
  const cleanCurrent = currentVersion.replace(/^v/, '').replace(/\+.*$/, '')

  if (compareVersions(remoteVersion, cleanCurrent) <= 0) {
    return null
  }

  const dmgAsset = release.assets.find(a => a.name.endsWith('.dmg'))

  return {
    version: remoteVersion,
    currentVersion: cleanCurrent,
    releaseUrl: release.html_url,
    downloadUrl: dmgAsset?.browser_download_url ?? null,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at,
  }
}

/**
 * Check GitHub for a newer release. Returns UpdateInfo or null.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  const release = await fetchLatestRelease()
  if (!release) return null
  return parseGitHubRelease(release, APP_VERSION)
}

function fetchLatestRelease(): Promise<GitHubRelease | null> {
  return new Promise((resolve) => {
    const req = https.get(GITHUB_API, {
      headers: {
        'User-Agent': 'cipher-mux-electron',
        Accept: 'application/vnd.github.v3+json',
      },
      timeout: 10_000,
    }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null)
        res.resume()
        return
      }
      let data = ''
      res.on('data', (chunk: string) => { data += chunk })
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          resolve(null)
        }
      })
    })
    req.on('error', () => resolve(null))
    req.on('timeout', () => { req.destroy(); resolve(null) })
  })
}
