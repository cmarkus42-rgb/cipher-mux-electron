export interface UpdateInfo {
  version: string
  currentVersion: string
  releaseUrl: string
  downloadUrl: string | null
  releaseNotes: string
  publishedAt: string
}

export type UpdateMode = 'notify' | 'auto' | 'disabled'

export interface UpdateConfig {
  mode: UpdateMode
  lastCheck: string | null
  dismissedVersion: string | null
}
