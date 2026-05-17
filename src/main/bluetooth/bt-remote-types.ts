/**
 * Types for the multi-device BT Remote system.
 * Supports multiple BT remotes (AB Shutter, Satechi R2, etc.)
 * with configurable per-button shortcut mapping.
 */

/** A single button on a BT remote */
export interface ButtonDef {
  id: string
  label: string
  usagePage: number
  usage: number
  reportID?: number
}

/** Device profile — stored as JSON in ~/.config/cipher-mux/bt-remotes/ */
export interface DeviceProfile {
  vendorId: string
  productId: string
  name: string
  mode?: string
  buttons: ButtonDef[]
  /** Maps button.id → shortcut combo (e.g. "Cmd+Shift+W") | "passthrough" | "disabled" */
  mapping: Record<string, string>
}

/** Raw HID event from the Swift bridge (--multi protocol) */
export interface BridgeHidEvent {
  device: string        // "vid:pid" e.g. "1915:eeee"
  usagePage: number
  usage: number
  value: number         // 1 = press, 0 = release
}

/** Device connection event from the Swift bridge */
export interface BridgeDeviceEvent {
  event: 'connected' | 'disconnected'
  device: string        // "vid:pid"
  name?: string
}

/** Legacy relay event from --relay mode (AB Shutter compat) */
export interface BridgeLegacyEvent {
  button: 'big' | 'small'
  action: 'clear' | 'submit'
}

/** Resolved action after mapping lookup */
export interface ResolvedAction {
  type: 'shortcut' | 'passthrough' | 'disabled' | 'unmapped'
  combo?: string        // e.g. "Cmd+Shift+W" — only for type='shortcut'
  buttonId: string
  deviceId: string
}

/** Connection status for a device */
export interface DeviceStatus {
  deviceId: string      // "vid:pid"
  profileName: string
  connected: boolean
}

/** Config shape for btRemotes in ConfigStore */
export interface BtRemotesConfig {
  enabled: boolean
  /** Profile directory path override (default: ~/.config/cipher-mux/bt-remotes/) */
  profileDir?: string
}
