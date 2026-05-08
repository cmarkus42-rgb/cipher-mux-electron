interface UpdateDialogProps {
  version: string
  currentVersion: string
  releaseUrl: string
  downloadUrl: string | null
  releaseNotes: string
  onDismiss: () => void
  onDownload: () => void
}

export function UpdateDialog({
  version, currentVersion,
  releaseNotes, onDismiss, onDownload,
}: UpdateDialogProps) {
  return (
    <div class="overlay" onClick={(e) => {
      if ((e.target as HTMLElement) === (e.currentTarget as HTMLElement)) onDismiss()
    }}>
      <div class="dialog update-dialog">
        <h2>Update Available</h2>
        <p class="update-dialog__versions">
          {currentVersion} &rarr; <strong>{version}</strong>
        </p>
        {releaseNotes && (
          <div class="update-dialog__notes">
            <pre>{releaseNotes.slice(0, 500)}</pre>
          </div>
        )}
        <div class="dialog__actions">
          <button class="btn btn--secondary" onClick={onDismiss}>
            Later
          </button>
          <button class="btn btn--primary" onClick={onDownload}>
            Download
          </button>
        </div>
      </div>
    </div>
  )
}
