import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { deployBundledVoice } from '../../src/main/setup/voice-bundle'

describe('voice-bundle', () => {
  let tmpDir: string
  let srcDir: string
  let destDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-bundle-test-'))
    srcDir = path.join(tmpDir, 'resources', 'voices', 'vits-piper-de_DE-cipher_adult-medium')
    destDir = path.join(tmpDir, 'models', 'piper')
    // Create fake bundled voice
    fs.mkdirSync(srcDir, { recursive: true })
    fs.writeFileSync(path.join(srcDir, 'model.onnx'), 'fake-onnx-data')
    fs.writeFileSync(path.join(srcDir, 'model.onnx.json'), '{"test":true}')
    fs.writeFileSync(path.join(srcDir, 'tokens.txt'), 'a b c')
    const espeakDir = path.join(srcDir, 'espeak-ng-data')
    fs.mkdirSync(espeakDir)
    fs.writeFileSync(path.join(espeakDir, 'phontab'), 'data')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('copies voice model to dest when not present', () => {
    const result = deployBundledVoice({
      resourcesPath: path.join(tmpDir, 'resources'),
      modelsDir: destDir,
      voiceName: 'de_DE-cipher_adult-medium',
    })
    assert.equal(result, true)
    const voiceDir = path.join(destDir, 'vits-piper-de_DE-cipher_adult-medium')
    assert.ok(fs.existsSync(path.join(voiceDir, 'model.onnx')))
    assert.ok(fs.existsSync(path.join(voiceDir, 'model.onnx.json')))
    assert.ok(fs.existsSync(path.join(voiceDir, 'tokens.txt')))
    assert.ok(fs.existsSync(path.join(voiceDir, 'espeak-ng-data', 'phontab')))
  })

  it('skips copy when voice already exists', () => {
    const voiceDir = path.join(destDir, 'vits-piper-de_DE-cipher_adult-medium')
    fs.mkdirSync(voiceDir, { recursive: true })
    fs.writeFileSync(path.join(voiceDir, 'model.onnx'), 'existing')

    const result = deployBundledVoice({
      resourcesPath: path.join(tmpDir, 'resources'),
      modelsDir: destDir,
      voiceName: 'de_DE-cipher_adult-medium',
    })
    assert.equal(result, false)
    assert.equal(fs.readFileSync(path.join(voiceDir, 'model.onnx'), 'utf-8'), 'existing')
  })

  it('returns false when bundled voice not found in resources', () => {
    const result = deployBundledVoice({
      resourcesPath: '/nonexistent/path',
      modelsDir: destDir,
      voiceName: 'de_DE-cipher_adult-medium',
    })
    assert.equal(result, false)
  })
})
