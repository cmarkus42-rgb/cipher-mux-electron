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

  // Skip if already deployed
  if (fs.existsSync(path.join(destDir, 'model.onnx'))) {
    console.log(`[voice-bundle] Voice already deployed at ${destDir}`)
    return false
  }

  console.log(`[voice-bundle] Deploying ${opts.voiceName} to ${destDir}...`)
  fs.mkdirSync(destDir, { recursive: true })
  copyDirRecursive(srcDir, destDir)
  console.log(`[voice-bundle] Voice deployed successfully`)
  return true
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
