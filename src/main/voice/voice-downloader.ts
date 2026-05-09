import * as fs from 'fs'
import * as path from 'path'
import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'

const HF_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main'
const BUNDLED_DATASETS = ['cipher_adult']

export interface DownloadProgress {
  voice: string
  file: string
  percent: number
  bytesDownloaded: number
  bytesTotal: number
}

export interface ParsedVoiceName {
  locale: string
  language: string
  dataset: string
  quality: string
}

/**
 * Parse a voice name triplet (locale-dataset-quality) into components.
 * Example: "de_DE-thorsten-medium" -> { locale: "de_DE", language: "de", dataset: "thorsten", quality: "medium" }
 */
export function parseVoiceName(name: string): ParsedVoiceName | null {
  // Format: <locale>-<dataset>-<quality>
  // locale is xx_XX, quality is the last segment, dataset is everything in between
  const match = name.match(/^([a-z]{2}_[A-Z]{2})-(.+)-(low|medium|high|x_low|x_high)$/)
  if (!match) return null

  const [, locale, dataset, quality] = match
  return {
    locale,
    language: locale.split('_')[0],
    dataset,
    quality,
  }
}

/**
 * Build the HuggingFace download URL for a piper voice file.
 */
export function buildDownloadUrl(locale: string, dataset: string, quality: string, filename: string): string {
  const language = locale.split('_')[0]
  return `${HF_BASE}/${language}/${locale}/${dataset}/${quality}/${filename}`
}

/**
 * Download a piper voice (model.onnx + model.onnx.json) from HuggingFace.
 * Uses curl with --continue-at - for resume support.
 * Emits 'progress' events on the returned EventEmitter.
 * Resolves when complete, rejects on error (with cleanup).
 */
export function downloadVoice(name: string, piperModelsDir: string): { emitter: EventEmitter; promise: Promise<void> } {
  const emitter = new EventEmitter()
  const parsed = parseVoiceName(name)

  const promise = (async () => {
    if (!parsed) {
      throw new Error(`Invalid voice name format: ${name}. Expected: locale-dataset-quality (e.g. de_DE-thorsten-medium)`)
    }

    const voiceDir = path.join(piperModelsDir, `vits-piper-${name}`)
    fs.mkdirSync(voiceDir, { recursive: true })

    const files = ['model.onnx', 'model.onnx.json']

    try {
      for (const file of files) {
        const url = buildDownloadUrl(parsed.locale, parsed.dataset, parsed.quality, file)
        const destPath = path.join(voiceDir, file)

        await downloadFile(url, destPath, (progress) => {
          emitter.emit('progress', {
            voice: name,
            file,
            ...progress,
          } satisfies DownloadProgress)
        })
      }
    } catch (err) {
      // Cleanup on failure
      try {
        fs.rmSync(voiceDir, { recursive: true, force: true })
      } catch {
        // ignore cleanup errors
      }
      throw err
    }
  })()

  return { emitter, promise }
}

/**
 * Delete an installed voice. Refuses to delete bundled voices.
 */
export function deleteVoice(name: string, piperModelsDir: string): void {
  if (BUNDLED_DATASETS.some(b => name.includes(b))) {
    throw new Error(`Cannot delete bundled voice: ${name}`)
  }

  const voiceDir = path.join(piperModelsDir, `vits-piper-${name}`)
  if (!fs.existsSync(voiceDir)) {
    throw new Error(`Voice not found: ${name} (directory does not exist)`)
  }

  fs.rmSync(voiceDir, { recursive: true, force: true })
}

function downloadFile(
  url: string,
  destPath: string,
  onProgress: (p: { percent: number; bytesDownloaded: number; bytesTotal: number }) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Use curl with resume support and progress output
    const args = [
      '--location',
      '--fail',
      '--continue-at', '-',
      '--output', destPath,
      '--write-out', '%{size_download}/%{size_upload}',
      '--progress-bar',
      url,
    ]

    const proc = execFile('curl', args, { maxBuffer: 10 * 1024 * 1024 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(`Download failed for ${url}: ${err.message}\n${stderr}`))
        return
      }
      // Final progress
      onProgress({ percent: 100, bytesDownloaded: 0, bytesTotal: 0 })
      resolve()
    })

    // Parse curl progress from stderr
    if (proc.stderr) {
      let lastPercent = 0
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        // curl progress bar format: ###  xx.x%
        const match = text.match(/(\d+\.?\d*)%/)
        if (match) {
          const percent = Math.round(parseFloat(match[1]))
          if (percent > lastPercent) {
            lastPercent = percent
            onProgress({ percent, bytesDownloaded: 0, bytesTotal: 0 })
          }
        }
      })
    }
  })
}
