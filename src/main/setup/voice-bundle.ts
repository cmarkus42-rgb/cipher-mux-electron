import fs from 'node:fs'
import path from 'node:path'

export interface DeployOptions {
  resourcesPath: string
  modelsDir: string
  voiceName: string
}

/**
 * Deploy bundled Piper voice model from app resources to user models directory.
 * Returns true if a copy was performed, false if skipped or unavailable.
 */
export function deployBundledVoice(opts: DeployOptions): boolean {
  const voiceDirName = `vits-piper-${opts.voiceName}`
  const srcDir = path.join(opts.resourcesPath, 'voices', voiceDirName)
  const destDir = path.join(opts.modelsDir, voiceDirName)

  // Skip if bundled voice not present (dev mode without predist)
  if (!fs.existsSync(srcDir)) {
    console.log(`[voice-bundle] Bundled voice not found at ${srcDir} — skipping`)
    return false
  }

  // Replace symlinks with real copies; skip if already a real directory
  const destModel = path.join(destDir, 'model.onnx')
  if (fs.existsSync(destDir)) {
    const stat = fs.lstatSync(destDir)
    if (stat.isSymbolicLink()) {
      console.log(`[voice-bundle] Replacing symlink at ${destDir} with real copy`)
      fs.rmSync(destDir, { recursive: true, force: true })
    } else if (fs.existsSync(destModel)) {
      console.log(`[voice-bundle] Voice already deployed at ${destDir}`)
      return false
    }
  }

  console.log(`[voice-bundle] Deploying ${opts.voiceName} to ${destDir}...`)
  fs.mkdirSync(destDir, { recursive: true })
  copyDirRecursive(srcDir, destDir)
  console.log(`[voice-bundle] Voice deployed successfully`)
  return true
}

export interface VoiceRecommendation {
  name: string
  language: string
  label: string
}

const RECOMMENDED_VOICES: VoiceRecommendation[] = [
  { name: 'de_DE-dii-high', language: 'de', label: 'German (dii, high quality)' },
  { name: 'en_US-lessac-medium', language: 'en', label: 'English (lessac, medium quality)' },
]

const LANGUAGE_VOICE_DEFAULTS: Record<string, string> = {
  de: 'de_DE-cipher_adult-medium',
  en: 'en_US-lessac-medium',
}

/**
 * Get recommended voices for download after initial install.
 * These are suggestions, not mandatory.
 */
export function getRecommendedDownloads(): VoiceRecommendation[] {
  return [...RECOMMENDED_VOICES]
}

/**
 * Get the default Piper voice for a UI language.
 * Returns null for unsupported languages.
 */
export function getDefaultVoiceForLanguage(language: string): string | null {
  return LANGUAGE_VOICE_DEFAULTS[language] ?? null
}

function copyDirRecursive(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true })
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}
