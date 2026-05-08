import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compareVersions, parseGitHubRelease } from '../../src/main/updater/update-checker'

describe('update-checker', () => {
  describe('compareVersions', () => {
    it('detects newer version', () => {
      assert.equal(compareVersions('1.0.0', '0.9.99'), 1)
    })

    it('detects same version', () => {
      assert.equal(compareVersions('0.9.99', '0.9.99'), 0)
    })

    it('detects older version', () => {
      assert.equal(compareVersions('0.9.98', '0.9.99'), -1)
    })

    it('handles versions with v prefix', () => {
      assert.equal(compareVersions('v1.0.0', 'v0.9.99'), 1)
    })

    it('handles versions with build metadata', () => {
      assert.equal(compareVersions('0.9.99+23', '0.9.99'), 0)
    })

    it('compares major correctly', () => {
      assert.equal(compareVersions('2.0.0', '1.9.99'), 1)
    })

    it('compares minor correctly', () => {
      assert.equal(compareVersions('1.1.0', '1.0.99'), 1)
    })
  })

  describe('parseGitHubRelease', () => {
    it('parses a valid release with DMG asset', () => {
      const release = {
        tag_name: 'v1.0.0',
        html_url: 'https://github.com/user/repo/releases/tag/v1.0.0',
        body: '## Changes\n- Feature A',
        published_at: '2026-05-08T12:00:00Z',
        assets: [
          {
            name: 'cipher-mux-1.0.0-arm64.dmg',
            browser_download_url: 'https://github.com/user/repo/releases/download/v1.0.0/cipher-mux-1.0.0-arm64.dmg',
          },
        ],
      }
      const result = parseGitHubRelease(release, '0.9.99')
      assert.ok(result)
      assert.equal(result!.version, '1.0.0')
      assert.equal(result!.currentVersion, '0.9.99')
      assert.ok(result!.downloadUrl?.includes('.dmg'))
      assert.equal(result!.releaseNotes, '## Changes\n- Feature A')
    })

    it('returns null for older release', () => {
      const release = {
        tag_name: 'v0.9.0',
        html_url: 'https://github.com/user/repo/releases/tag/v0.9.0',
        body: 'Old',
        published_at: '2026-01-01T00:00:00Z',
        assets: [],
      }
      const result = parseGitHubRelease(release, '0.9.99')
      assert.equal(result, null)
    })

    it('returns null for same version', () => {
      const release = {
        tag_name: 'v0.9.99',
        html_url: 'https://github.com/user/repo/releases/tag/v0.9.99',
        body: 'Same',
        published_at: '2026-05-01T00:00:00Z',
        assets: [],
      }
      const result = parseGitHubRelease(release, '0.9.99')
      assert.equal(result, null)
    })

    it('handles release without DMG asset', () => {
      const release = {
        tag_name: 'v1.0.0',
        html_url: 'https://github.com/user/repo/releases/tag/v1.0.0',
        body: 'No DMG',
        published_at: '2026-05-08T00:00:00Z',
        assets: [
          { name: 'source.tar.gz', browser_download_url: 'https://example.com/source.tar.gz' },
        ],
      }
      const result = parseGitHubRelease(release, '0.9.99')
      assert.ok(result)
      assert.equal(result!.downloadUrl, null)
      assert.equal(result!.releaseUrl, 'https://github.com/user/repo/releases/tag/v1.0.0')
    })

    it('strips build metadata from current version', () => {
      const release = {
        tag_name: 'v1.0.0',
        html_url: 'https://github.com/user/repo/releases/tag/v1.0.0',
        body: 'New',
        published_at: '2026-05-08T00:00:00Z',
        assets: [],
      }
      const result = parseGitHubRelease(release, '0.9.99+23')
      assert.ok(result)
      assert.equal(result!.currentVersion, '0.9.99')
    })
  })
})
