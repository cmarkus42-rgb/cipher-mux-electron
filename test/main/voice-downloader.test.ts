import { describe, it, before, after, mock, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { EventEmitter } from 'node:events'

describe('voice-downloader', () => {
  const tmpDir = path.join(os.tmpdir(), `cipher-mux-voice-dl-test-${Date.now()}`)
  const piperDir = path.join(tmpDir, 'models', 'piper')

  before(() => {
    fs.mkdirSync(piperDir, { recursive: true })
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('buildDownloadUrl', () => {
    it('constructs correct HuggingFace URL for a voice', async () => {
      const { buildDownloadUrl } = await import('../../src/main/voice/voice-downloader')
      const url = buildDownloadUrl('de_DE', 'thorsten', 'medium', 'model.onnx')
      assert.strictEqual(
        url,
        'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/model.onnx'
      )
    })

    it('extracts language from locale correctly', async () => {
      const { buildDownloadUrl } = await import('../../src/main/voice/voice-downloader')
      const url = buildDownloadUrl('en_US', 'lessac', 'high', 'model.onnx.json')
      assert.ok(url.includes('/en/en_US/lessac/high/model.onnx.json'))
    })
  })

  describe('deleteVoice', () => {
    it('deletes voice directory', async () => {
      const voiceDir = path.join(piperDir, 'vits-piper-en_GB-alba-medium')
      fs.mkdirSync(voiceDir, { recursive: true })
      fs.writeFileSync(path.join(voiceDir, 'model.onnx'), 'data')
      fs.writeFileSync(path.join(voiceDir, 'model.onnx.json'), '{}')

      const { deleteVoice } = await import('../../src/main/voice/voice-downloader')
      deleteVoice('en_GB-alba-medium', piperDir)

      assert.strictEqual(fs.existsSync(voiceDir), false)
    })

    it('throws when trying to delete bundled cipher_adult voice', async () => {
      const voiceDir = path.join(piperDir, 'vits-piper-de_DE-cipher_adult-medium')
      fs.mkdirSync(voiceDir, { recursive: true })

      const { deleteVoice } = await import('../../src/main/voice/voice-downloader')
      assert.throws(
        () => deleteVoice('de_DE-cipher_adult-medium', piperDir),
        /bundled/i
      )
    })

    it('throws when voice directory does not exist', async () => {
      const { deleteVoice } = await import('../../src/main/voice/voice-downloader')
      assert.throws(
        () => deleteVoice('xx_XX-nonexist-low', piperDir),
        /not found|not exist/i
      )
    })
  })

  describe('parseVoiceName', () => {
    it('parses locale-dataset-quality triplet', async () => {
      const { parseVoiceName } = await import('../../src/main/voice/voice-downloader')
      const parsed = parseVoiceName('de_DE-thorsten-medium')
      assert.deepStrictEqual(parsed, {
        locale: 'de_DE',
        language: 'de',
        dataset: 'thorsten',
        quality: 'medium',
      })
    })

    it('handles multi-word dataset names with underscores', async () => {
      const { parseVoiceName } = await import('../../src/main/voice/voice-downloader')
      const parsed = parseVoiceName('en_US-hfc_female-medium')
      assert.ok(parsed, 'should parse successfully')
      assert.strictEqual(parsed!.locale, 'en_US')
      assert.strictEqual(parsed!.dataset, 'hfc_female')
      assert.strictEqual(parsed!.quality, 'medium')
    })

    it('returns null for invalid name format', async () => {
      const { parseVoiceName } = await import('../../src/main/voice/voice-downloader')
      const parsed = parseVoiceName('invalid')
      assert.strictEqual(parsed, null)
    })
  })
})
