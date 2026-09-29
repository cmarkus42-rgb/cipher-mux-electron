# BT Shutter / Bluetooth Remote Control

Bluetooth-Fernbedienungen (AB Shutter 3, CamKix, etc.) steuern cipher-mux Sessions.

```
BT Remote → macOS HID → ab-shutter-bridge (Swift) → JSON stdout → BtShutterManager (TS) → ipc-hub → tmux sendKeys
```

## Komponenten

- **Swift Bridge:** `/Users/Shared/Nextcloud/Claude/ab-shutter-bridge/ABShutterBridge.swift` (Quellcode)
- **Compiled Binary:** `assets/bin/ab-shutter-bridge` (via `extraResources` nach `Contents/Resources/bin/`)
- **TS Manager:** `src/main/bluetooth/bt-shutter-manager.ts` — spawnt Binary als Child-Process, parst JSON-Events
- **Integration:** `src/main/ipc-hub.ts` → `startBtShutter()` / `stopBtShutter()`

## macOS 26+ HID-Zugriff

**`kIOHIDOptionsTypeSeizeDevice` funktioniert NICHT mehr** auf macOS Tahoe (26.x) für
adhoc-signierte Binaries. Apple hat die Anforderungen verschärft — `kIOReturnNotPermitted`
(-536870207) auch mit korrekten TCC-Einträgen.

**Lösung (seit v0.9.11):** Zwei-Stufen-Ansatz:

1. `IOHIDManagerOpen` mit `kIOHIDOptionsTypeNone` (non-exclusive) — funktioniert ohne spezielle Signatur
2. `CGEventTap` auf `.cgSessionEventTap` suppressed NX_SYSDEFINED Events (Subtype 8 = Media Keys), während der HID-Callback aktiv ist

**CGEvent-Feld-Mapping (macOS 26, verifiziert):**

- Field 99 = NX_SYSDEFINED Subtype (8 = `NX_SUBTYPE_AUX_CONTROL_BUTTONS`)
- Field 87 = Media Key Data (keyCode + flags encoded)
- `.mouseEventNumber` (Field 0) enthält NICHT data1 für SYSDEFINED Events — das war der ursprüngliche Bug

## Binary bauen

```bash
cd /Users/Shared/Nextcloud/Claude/ab-shutter-bridge
swiftc ABShutterBridge.swift -o ab-shutter-bridge -framework IOKit -framework Foundation
cp ab-shutter-bridge /path/to/cipher-mux-electron/assets/bin/
```

NICHT `codesign -fs -` ausführen — das erzeugt explicit adhoc (flags=0x2) statt linker-signed
(flags=0x20002). Der Compiler erzeugt automatisch linker-signed, was für TCC-Erkennung sauberer ist.

## Button-Mapping

| BT Button | HID Usage | Default Action | Relay JSON |
|-----------|-----------|---------------|------------|
| BIG (Vol+) | 0xE9 (Consumer Page 0x0C) | Clear input (Ctrl+U) | `{"button":"big","action":"clear"}` |
| SMALL (Vol-) | 0xEA (Consumer Page 0x0C) | Submit (Enter) | `{"button":"small","action":"submit"}` |

## Permissions (macOS System Settings)

- **Eingabeüberwachung (Input Monitoring):** ab-shutter-bridge Binary UND cipher-mux.app
- **Bedienungshilfen (Accessibility):** ab-shutter-bridge Binary (für CGEventTap)

Bei jedem neuen Binary (Neukompilierung) fragt macOS erneut nach — das ist korrekt, da sich der
Code-Hash ändert.

## Erweiterung: Neue BT Remotes

Alle gängigen BT Camera Shutter Remotes nutzen dasselbe HID Consumer Control Protokoll
(Usage Page 0x0C, Volume Up/Down). Die Bridge ist bereits generisch: ohne VID/PID-Filter matched
sie JEDES Consumer Control Device. Für neue Remote-Typen mit anderen HID Usages:
`inputCallback` in `ABShutterBridge.swift` erweitern, neues Usage-Mapping hinzufügen.
