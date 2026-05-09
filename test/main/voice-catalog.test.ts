import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

// We test the catalog module in isolation — mock the filesystem
describe('voice-catalog', () => {
  const tmpDir = path.join(os.tmpdir(), `cipher-mux-voice-catalog-test-${Date.now()}`)
  const piperDir = path.join(tmpDir, 'models', 'piper')

  before(() => {
    fs.mkdirSync(piperDir, { recursive: true })
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('listInstalled', () => {
    it('returns empty array when no voices installed', async () => {
      const { listInstalled } = await import('../../src/main/voice/voice-catalog')
      const result = listInstalled(piperDir)
      assert.deepStrictEqual(result, [])
    })

    it('detects voice with model.onnx and model.onnx.json', async () => {
      // Create a fake voice directory
      const voiceDir = path.join(piperDir, 'vits-piper-de_DE-cipher_adult-medium')
      fs.mkdirSync(voiceDir, { recursive: true })
      fs.writeFileSync(path.join(voiceDir, 'model.onnx'), 'fake-model-data')
      fs.writeFileSync(path.join(voiceDir, 'model.onnx.json'), JSON.stringify({
        audio: { sample_rate: 22050 },
        language: { code: 'de_DE', name_english: 'German' },
        piper_version: '1.0.0',
        dataset: 'cipher_adult',
        quality: 'medium',
      }))

      const { listInstalled } = await import('../../src/main/voice/voice-catalog')
      const result = listInstalled(piperDir)

      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].name, 'de_DE-cipher_adult-medium')
      assert.strictEqual(result[0].locale, 'de_DE')
      assert.strictEqual(result[0].language, 'de')
      assert.strictEqual(result[0].quality, 'medium')
      assert.strictEqual(result[0].sampleRate, 22050)
      assert.strictEqual(result[0].modelPath, path.join(voiceDir, 'model.onnx'))
      assert.strictEqual(result[0].isBundled, true) // cipher_adult is bundled
    })

    it('detects non-bundled voice', async () => {
      const voiceDir = path.join(piperDir, 'vits-piper-en_US-lessac-high')
      fs.mkdirSync(voiceDir, { recursive: true })
      fs.writeFileSync(path.join(voiceDir, 'model.onnx'), 'fake-model-data')
      fs.writeFileSync(path.join(voiceDir, 'model.onnx.json'), JSON.stringify({
        audio: { sample_rate: 44100 },
        language: { code: 'en_US', name_english: 'English' },
        dataset: 'lessac',
        quality: 'high',
      }))

      const { listInstalled } = await import('../../src/main/voice/voice-catalog')
      const result = listInstalled(piperDir)

      const lessac = result.find(v => v.name === 'en_US-lessac-high')
      assert.ok(lessac, 'should find lessac voice')
      assert.strictEqual(lessac.locale, 'en_US')
      assert.strictEqual(lessac.language, 'en')
      assert.strictEqual(lessac.quality, 'high')
      assert.strictEqual(lessac.sampleRate, 44100)
      assert.strictEqual(lessac.isBundled, false)
    })

    it('skips directories without model.onnx', async () => {
      const incompleteDir = path.join(piperDir, 'vits-piper-fr_FR-siwis-medium')
      fs.mkdirSync(incompleteDir, { recursive: true })
      // Only json, no .onnx file
      fs.writeFileSync(path.join(incompleteDir, 'model.onnx.json'), '{}')

      const { listInstalled } = await import('../../src/main/voice/voice-catalog')
      const result = listInstalled(piperDir)
      const siwis = result.find(v => v.name.includes('siwis'))
      assert.strictEqual(siwis, undefined)
    })

    it('skips directories not matching vits-piper- prefix', async () => {
      const wrongDir = path.join(piperDir, 'some-other-dir')
      fs.mkdirSync(wrongDir, { recursive: true })
      fs.writeFileSync(path.join(wrongDir, 'model.onnx'), 'data')
      fs.writeFileSync(path.join(wrongDir, 'model.onnx.json'), JSON.stringify({
        audio: { sample_rate: 22050 },
        language: { code: 'xx' },
      }))

      const { listInstalled } = await import('../../src/main/voice/voice-catalog')
      const result = listInstalled(piperDir)
      const other = result.find(v => v.name === 'some-other-dir')
      assert.strictEqual(other, undefined)
    })

    it('handles malformed model.onnx.json gracefully', async () => {
      const badDir = path.join(piperDir, 'vits-piper-de_DE-bad_json-low')
      fs.mkdirSync(badDir, { recursive: true })
      fs.writeFileSync(path.join(badDir, 'model.onnx'), 'data')
      fs.writeFileSync(path.join(badDir, 'model.onnx.json'), 'not valid json {{')

      const { listInstalled } = await import('../../src/main/voice/voice-catalog')
      const result = listInstalled(piperDir)
      const bad = result.find(v => v.name.includes('bad_json'))
      assert.strictEqual(bad, undefined)
    })
  })
})
