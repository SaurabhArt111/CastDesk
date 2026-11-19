# Architecture

```
 ┌──────────────── host computer ────────────────┐            ┌── viewer (phone / tablet / PC / browser) ──┐
 │ Electron renderer  Capturer (getDisplayMedia) │            │ React app (Capacitor or PWA)               │
 │        │ JPEG frames over loopback WS          │            │  Home · Session · Settings · Layout        │
 │        ▼                                       │  WebSocket │  TrackpadEngine (gestures)                 │
 │ HostService ── ClientSession (per viewer) ◀────┼────────────┼─▶ Connection (hello/auth/pair, frames, input)
 │  ├ PIN + TrustStore (SPEKE, device secrets)    │  one TCP   │  Discovery (mDNS, QR, deep link, USB probe)│
 │  ├ Input injector (nut-js, pluggable)          │  port 7420 └────────────────────────────────────────────┘
 │  ├ DisplayManager (xrandr / PowerShell / displayplacer / command hook)
 │  ├ Discovery (mDNS + UDP beacon)   ├ AdbForwarder (USB)
 └───────────────────────────────────────────────┘
```

## Packages

- **`packages/shared`** — dependency-free ESM used by every other part: constants, byte helpers (pure-JS SHA-256/HMAC verified against test vectors and `node:crypto`), `Speke` (PIN key exchange), protocol (frame encoding, message validation, input sanitising), `TrackpadEngine` (touch → pointer/gesture events), layout maths (`snapDisplay`, `isConnected`, `hasOverlap`, `normalizeLayout`, `fitToBox`).
- **`packages/host`** — `HostService` owns an HTTP server (serves the client build as a PWA plus `/api/info` and `/api/ping`) and a WebSocket server. Each connection is a `ClientSession`, a small state machine: hello → (pair | auth) → ready. Other modules: `TrustStore` (device secrets, per-device permissions and display arrangement, 0600, optionally encrypted via a codec supplied by Electron `safeStorage`), `PinManager`, `DisplayManager`, `InputInjector`, discovery and USB.
- **`apps/desktop`** — Electron main process: settings, tray, IPC, permission checks, autostart, adb forwarder, the approval dialog; the renderer is the same React app as on phones, with a `window.paneo` bridge exposed by `preload.cjs`.
- **`apps/client`** — React app. `AppContext` holds connection state, auto-connect to paired hosts (with a suppress-list so manual disconnects stick), deep links, theme and preferences. Capacitor wraps it for Android.
- **`apps/site`** — static React site.

## Screen capture

Capture happens in the Electron renderer (`getDisplayMedia`), because that is the portable, permission-aware route on Windows, macOS and Linux. The main process answers the request with the display the host chose (`capture:prepare`). The renderer connects to the host over a loopback-only endpoint (`/source?token=…`) and sends JPEG frames.

Capture is **demand-driven**: the host sends `demand` messages (which displays, fps, max width, quality) based on what the connected viewers asked for, and nothing is encoded when nobody is watching. Viewers send frames at most as fast as the slowest client can take them: the host drops frames for a client whose socket `bufferedAmount` is high.

## Video frame format

Binary WebSocket messages, 10-byte big-endian header followed by a JPEG:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 1 | frame type (`0x01` = JPEG) |
| 1 | 1 | display id |
| 2 | 2 | width |
| 4 | 2 | height |
| 6 | 4 | sequence number |

## Input

Viewer → host `input` messages are validated by `sanitizeInput` (allow-listed kinds, clamped numeric ranges, bounded strings) and permission-checked (`control`) before reaching the `InputInjector`. The injector applies sub-pixel accumulation to relative moves, converts wheel deltas to notches, maps DOM key codes to native keys, and turns three-finger swipes into OS shortcuts. On disconnect every held key/button is released.

## Displays and "Extend"

`DisplayManager` lists real displays through the Electron/OS APIs and can create a *virtual* display through a provider:

- **Linux/X11** — `xrandr` logical monitors (experimental).
- **Windows** — PowerShell `ChangeDisplaySettingsEx` for arrangement.
- **macOS** — `displayplacer` for arrangement.
- **Any OS** — a user-configured command template (`{w} {h} {x} {y} {name}`) to call a virtual-display driver's CLI.

Creating a monitor requires a driver the OS trusts; Paneo does not ship one. Without a provider, Extend falls back to Mirror and reports why. Each device's arrangement is stored in the trust store, and `restoreFor()` re-creates the extended display and position on trusted reconnect.

## Discovery and USB

- mDNS (`_paneo._tcp`, via `bonjour-service`) and a UDP broadcast beacon on 7421 for networks where mDNS is blocked.
- Mobile: native mDNS through `capacitor-zeroconf`, QR scanning, `paneo://connect?...` deep links.
- USB on Android: the host runs `adb reverse tcp:7420 tcp:7420`; the phone probes `127.0.0.1:7420`.
- USB on iOS / USB tethering / computer-to-computer links appear as ordinary network interfaces and are found by LAN discovery.
