// src/renderer/components/RemoteSettingsTab.tsx
import { useState, useEffect, useCallback } from 'preact/hooks'

const api = (window as any).cipherMux

interface ButtonDef {
  id: string
  label: string
}

interface DeviceProfile {
  vendorId: string
  productId: string
  name: string
  mode?: string
  buttons: ButtonDef[]
  mapping: Record<string, string>
}

interface DeviceStatus {
  deviceId: string
  profileName: string
  connected: boolean
}

interface RemoteSettingsTabProps {
  registeredShortcuts?: Array<{ combo: string; label: string }>
}

/** Available actions for the keybind dropdown */
function buildActionOptions(shortcuts: Array<{ combo: string; label: string }>): Array<{ value: string; label: string }> {
  const options = [
    { value: 'passthrough', label: 'Passthrough (Original)' },
    { value: 'disabled', label: 'Disabled' },
  ]
  for (const s of shortcuts) {
    options.push({ value: s.combo, label: `${s.label} (${s.combo})` })
  }
  return options
}

export function RemoteSettingsTab({ registeredShortcuts = [] }: RemoteSettingsTabProps) {
  const [profiles, setProfiles] = useState<DeviceProfile[]>([])
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const data = await api.btRemote.getMapping()
      setProfiles(data.profiles ?? [])
      setDevices(data.devices ?? [])
    } catch (err) {
      console.error('[RemoteSettings] Failed to load:', err)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Listen for device changes
  useEffect(() => {
    const unsub = api.btRemote.onDevices?.((devs: DeviceStatus[]) => {
      setDevices(devs)
    })
    return unsub
  }, [])

  const handleMappingChange = useCallback(async (
    profile: DeviceProfile,
    buttonId: string,
    action: string,
  ) => {
    await api.btRemote.setMapping(profile.vendorId, profile.productId, buttonId, action)
    // Update local state
    setProfiles(prev => prev.map(p =>
      p.vendorId === profile.vendorId && p.productId === profile.productId
        ? { ...p, mapping: { ...p.mapping, [buttonId]: action } }
        : p,
    ))
  }, [])

  const actionOptions = buildActionOptions(registeredShortcuts)

  if (loading) {
    return <div class="settings-section"><p style={{ opacity: 0.5 }}>Loading...</p></div>
  }

  if (profiles.length === 0) {
    return (
      <div class="settings-section">
        <p style={{ opacity: 0.5 }}>No BT remote profiles found.</p>
      </div>
    )
  }

  return (
    <div class="settings-section">
      {profiles.map(profile => {
        const isConnected = devices.some(
          d => d.connected && d.profileName === profile.name,
        )
        return (
          <div key={`${profile.vendorId}:${profile.productId}`} style={{ marginBottom: '1.5rem' }}>
            <div class="settings-section__title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {profile.name}
              {profile.mode && <span style={{ opacity: 0.5, fontSize: '0.85em' }}>({profile.mode})</span>}
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: isConnected ? 'var(--color-success, #4caf50)' : 'var(--color-text-dim, #888)',
                display: 'inline-block',
                marginLeft: 4,
              }} title={isConnected ? 'Connected' : 'Disconnected'} />
            </div>
            <table class="shortcut-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '4px 8px', opacity: 0.6 }}>Button</th>
                  <th style={{ textAlign: 'left', padding: '4px 8px', opacity: 0.6 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {profile.buttons.map(button => (
                  <tr key={button.id}>
                    <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                      {button.label}
                    </td>
                    <td style={{ padding: '4px 8px' }}>
                      <select
                        value={profile.mapping[button.id] ?? 'disabled'}
                        onChange={(e) => handleMappingChange(profile, button.id, (e.target as HTMLSelectElement).value)}
                        style={{
                          background: 'var(--color-bg-elevated)',
                          color: 'var(--color-text)',
                          border: '1px solid var(--color-border)',
                          borderRadius: 4,
                          padding: '3px 6px',
                          fontSize: '0.85rem',
                          width: '100%',
                          maxWidth: 300,
                        }}
                      >
                        {actionOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                        {/* Show current value if it's not in the standard options */}
                        {profile.mapping[button.id] &&
                          !actionOptions.some(o => o.value === profile.mapping[button.id]) && (
                          <option value={profile.mapping[button.id]}>
                            {profile.mapping[button.id]} (custom)
                          </option>
                        )}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
