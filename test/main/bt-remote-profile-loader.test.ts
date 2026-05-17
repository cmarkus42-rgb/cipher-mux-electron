import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { ProfileLoader, normalizeHex } from '../../src/main/bluetooth/profile-loader'
import type { DeviceProfile } from '../../src/main/bluetooth/bt-remote-types'

describe('ProfileLoader', () => {
  let tmpDir: string

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bt-remote-test-'))
  })

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates profile directory on init', () => {
    const dir = path.join(tmpDir, 'profiles')
    const loader = new ProfileLoader(dir)
    loader.init()
    assert.ok(fs.existsSync(dir))
  })

  it('loads profiles from disk', () => {
    const dir = path.join(tmpDir, 'load-test')
    fs.mkdirSync(dir, { recursive: true })

    const profile: DeviceProfile = {
      vendorId: '0x1915',
      productId: '0xEEEE',
      name: 'Test Remote',
      buttons: [
        { id: 'btn-a', label: 'Button A', usagePage: 7, usage: 82 },
      ],
      mapping: { 'btn-a': 'Cmd+Shift+W' },
    }
    fs.writeFileSync(path.join(dir, 'test.json'), JSON.stringify(profile))

    const loader = new ProfileLoader(dir)
    const profiles = loader.loadAll()
    assert.equal(profiles.length, 1)
    assert.equal(profiles[0].name, 'Test Remote')
    assert.equal(profiles[0].buttons.length, 1)
  })

  it('findByDevice matches with hex normalization', () => {
    const dir = path.join(tmpDir, 'find-test')
    fs.mkdirSync(dir, { recursive: true })

    const profile: DeviceProfile = {
      vendorId: '0x1915',
      productId: '0xEEEE',
      name: 'Satechi R2',
      buttons: [],
      mapping: {},
    }
    fs.writeFileSync(path.join(dir, 'satechi.json'), JSON.stringify(profile))

    const loader = new ProfileLoader(dir)
    const found = loader.findByDevice('1915', 'eeee')
    assert.ok(found)
    assert.equal(found!.name, 'Satechi R2')
  })

  it('findByDevice returns undefined for unknown device', () => {
    const dir = path.join(tmpDir, 'find-missing')
    fs.mkdirSync(dir, { recursive: true })

    const loader = new ProfileLoader(dir)
    const found = loader.findByDevice('dead', 'beef')
    assert.equal(found, undefined)
  })

  it('saves and overwrites profile', () => {
    const dir = path.join(tmpDir, 'save-test')
    fs.mkdirSync(dir, { recursive: true })

    const profile: DeviceProfile = {
      vendorId: '0x248A',
      productId: '0x8266',
      name: 'AB Shutter',
      buttons: [
        { id: 'big', label: 'Big', usagePage: 12, usage: 233 },
      ],
      mapping: { big: 'disabled' },
    }

    const loader = new ProfileLoader(dir)
    loader.save(profile)
    assert.ok(fs.existsSync(path.join(dir, 'ab-shutter.json')))

    // Overwrite
    profile.mapping.big = 'Cmd+C'
    loader.save(profile)

    const reloaded = loader.findByDevice('0x248A', '0x8266')
    assert.equal(reloaded!.mapping.big, 'Cmd+C')
  })

  it('updateMapping changes a specific button', () => {
    const dir = path.join(tmpDir, 'update-test')
    fs.mkdirSync(dir, { recursive: true })

    const profile: DeviceProfile = {
      vendorId: '0x1915',
      productId: '0xEEEE',
      name: 'Satechi R2',
      buttons: [
        { id: 'dpad-up', label: 'D-Pad Up', usagePage: 7, usage: 82 },
      ],
      mapping: { 'dpad-up': 'Cmd+Shift+W' },
    }
    fs.writeFileSync(path.join(dir, 'satechi-r2.json'), JSON.stringify(profile))

    const loader = new ProfileLoader(dir)
    const ok = loader.updateMapping('1915', 'eeee', 'dpad-up', 'Cmd+Shift+S')
    assert.ok(ok)

    const updated = loader.findByDevice('1915', 'eeee')
    assert.equal(updated!.mapping['dpad-up'], 'Cmd+Shift+S')
  })

  it('updateMapping returns false for unknown device', () => {
    const dir = path.join(tmpDir, 'update-missing')
    fs.mkdirSync(dir, { recursive: true })

    const loader = new ProfileLoader(dir)
    const ok = loader.updateMapping('dead', 'beef', 'btn', 'Cmd+C')
    assert.equal(ok, false)
  })

  it('ignores invalid JSON files', () => {
    const dir = path.join(tmpDir, 'invalid-test')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'bad.json'), 'not json')
    fs.writeFileSync(path.join(dir, 'incomplete.json'), '{"name": "x"}')

    const loader = new ProfileLoader(dir)
    const profiles = loader.loadAll()
    assert.equal(profiles.length, 0)
  })
})

describe('normalizeHex', () => {
  it('strips 0x prefix', () => {
    assert.equal(normalizeHex('0x1915'), '1915')
  })

  it('lowercases', () => {
    assert.equal(normalizeHex('0xEEEE'), 'eeee')
  })

  it('handles bare hex', () => {
    assert.equal(normalizeHex('248a'), '248a')
  })
})
