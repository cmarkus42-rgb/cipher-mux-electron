import * as fs from 'fs'
import * as path from 'path'

export interface InstalledVoice {
  name: string
  locale: string
  language: string
  quality: string
  sampleRate: number
  modelPath: string
  isBundled: boolean
}

const VITS_PIPER_PREFIX = 'vits-piper-'
const BUNDLED_DATASETS = ['cipher_adult', 'dii']

interface PiperModelJson {
  audio?: { sample_rate?: number }
  language?: { code?: string; name_english?: string }
  dataset?: string
  quality?: string
}

/**
 * Scan a piper models directory for installed voices.
 * Each voice lives in a directory named vits-piper-<name> containing model.onnx and model.onnx.json.
 */
export function listInstalled(piperModelsDir: string): InstalledVoice[] {
  if (!fs.existsSync(piperModelsDir)) return []

  const entries = fs.readdirSync(piperModelsDir, { withFileTypes: true })
  const voices: InstalledVoice[] = []

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
    if (!entry.name.startsWith(VITS_PIPER_PREFIX)) continue

    const voiceDir = path.join(piperModelsDir, entry.name)
    const voiceName = entry.name.slice(VITS_PIPER_PREFIX.length)

    // Support both naming conventions: model.onnx (bundled) and <voiceName>.onnx (HuggingFace)
    let modelPath = path.join(voiceDir, 'model.onnx')
    let metaPath = path.join(voiceDir, 'model.onnx.json')
    if (!fs.existsSync(modelPath)) {
      modelPath = path.join(voiceDir, `${voiceName}.onnx`)
      metaPath = path.join(voiceDir, `${voiceName}.onnx.json`)
    }

    if (!fs.existsSync(modelPath)) continue
    if (!fs.existsSync(metaPath)) continue

    let meta: PiperModelJson
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'))
    } catch {
      continue
    }

    const locale = meta.language?.code ?? extractLocaleFromName(voiceName)
    const language = locale.split('_')[0]
    const quality = meta.quality ?? extractQualityFromName(voiceName)
    const sampleRate = meta.audio?.sample_rate ?? 22050
    const dataset = meta.dataset ?? ''
    const isBundled = BUNDLED_DATASETS.some(b => dataset.includes(b) || voiceName.includes(b))

    voices.push({
      name: voiceName,
      locale,
      language,
      quality,
      sampleRate,
      modelPath,
      isBundled,
    })
  }

  return voices
}

function extractLocaleFromName(name: string): string {
  // name format: locale-dataset-quality, e.g. de_DE-thorsten-medium
  const match = name.match(/^([a-z]{2}_[A-Z]{2})/)
  return match ? match[1] : 'unknown'
}

function extractQualityFromName(name: string): string {
  const parts = name.split('-')
  return parts[parts.length - 1] ?? 'medium'
}

export interface CatalogVoice {
  name: string
  locale: string
  language: string
  quality: string
  downloadSize: number
  installed: boolean
}

const VOICES_JSON_URL = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/voices.json'
let cachedCatalog: CatalogVoice[] | null = null

/**
 * Fetch the full Piper voices catalog from HuggingFace.
 * Results are cached for the lifetime of the process.
 * Optionally filter by query string (matches name or locale).
 */
export async function fetchCatalog(query?: string): Promise<CatalogVoice[]> {
  if (!cachedCatalog) {
    const res = await fetch(VOICES_JSON_URL)
    if (!res.ok) throw new Error(`Failed to fetch voices catalog: ${res.status}`)
    const data = await res.json() as Record<string, any>

    cachedCatalog = []
    for (const [key, value] of Object.entries(data)) {
      // key format: "en_US-lessac-medium" or similar
      const locale = value?.language?.code ?? key.split('-')[0] ?? ''
      const language = locale.split('_')[0]
      const quality = value?.quality ?? 'medium'
      const files = value?.files ?? {}
      const modelFile = Object.values(files).find((f: any) => f?.size_bytes) as any
      cachedCatalog.push({
        name: key,
        locale,
        language,
        quality,
        downloadSize: modelFile?.size_bytes ?? 0,
        installed: false,
      })
    }
  }

  let results = cachedCatalog
  if (query) {
    const q = query.toLowerCase()
    results = results.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.locale.toLowerCase().includes(q) ||
      v.language.toLowerCase().includes(q)
    )
  }
  return results
}
