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
- **`apps/desktop`** — Electron main process: settings, tray, IPC, permission checks, autostart, adb forwarder, the approval dialog; the renderer is the same React app as on phones, with a `window.castdesk` bridge exposed by `preload.cjs`.
- **`apps/client`** — React app. `AppContext` holds connection state, auto-connect to paired hosts (with a suppress-list so manual disconnects stick), deep links, theme and preferences. Capacitor wraps it for Android.
- **`apps/site`** — static React site.

## Screen capture

Capture runs in a **hidden window of its own** (the same web bundle opened with `?capture=1`), not in the UI window. Encoding therefore never competes with the UI for a thread, and it keeps its full speed while the main window sits in the tray. It uses `getDisplayMedia` (the portable, permission-aware route on Windows, macOS and Linux); the main process answers the request with the display the host chose (`capture:prepare`). The capture window connects to the host over a loopback-only endpoint (`/source?token=…`).

Capture is **demand-driven**: the host sends `demand` messages (which displays, fps, max width, quality, and whether video and/or JPEG is wanted) based on what the connected viewers asked for. Nothing is captured when nobody is watching, and nothing is captured for the Trackpad, Keyboard and Pen purposes, which need no picture.

### Video pipeline

- The capture source reports which codecs it can encode (`source-caps`); each viewer lists which it can decode in `subscribe.codecs`.
- One encoder runs per display. The host picks the codec most viewers support (H.264 first, then VP8); any viewer that cannot decode it receives JPEG frames instead.
- Encoding uses WebCodecs `VideoEncoder` in real-time mode (hardware accelerated where the OS offers it) at roughly 0.05-0.12 bits per pixel, a few Mbit/s instead of the tens JPEG needs.
- A key frame is sent every 4 s and whenever a viewer joins, switches codec, or reports trouble (`keyframe` message). The host holds back delta frames from a viewer until that viewer has a key frame.
- Back-pressure: if a viewer's socket backs up, the host drops frames for it, marks it as needing a key frame, and asks the source for one once it drains. The viewer does the same if its decoder falls behind. The picture stays current instead of drifting into the past.
- The viewer paints only the newest decoded picture once per display refresh.

## Video frame format

Binary WebSocket messages, 10-byte big-endian header followed by the payload:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 1 | frame type: `0x01` JPEG, `0x02` video key frame, `0x03` video delta frame |
| 1 | 1 | display id |
| 2 | 2 | width |
| 4 | 2 | height |
| 6 | 4 | sequence number |

For `0x02` the payload starts with one codec byte (`1` = H.264 Annex-B, constrained baseline L4.2; `2` = VP8) followed by the encoded chunk. `0x03` payloads are the raw encoded chunk.

## Extend on Windows (Win+P)

Windows has no API to create a monitor, so Extend uses the system's own Project panel (`DisplaySwitch.exe /extend`) and hands the device the second screen that appears. If Windows has only one screen, the optional **virtual screen** (Amyuni's signed `usbmmidd` indirect display driver, installed once with an administrator prompt from CastDesk) plugs in a monitor first. Releasing the screen detaches a virtual monitor with `/internal` (no prompt); a real second monitor is never switched off. Paired devices may choose PC screen only / Duplicate / Extend; "Second screen only" is local-only because it blanks the PC.

## Purposes

A connection is for exactly one thing at a time, chosen by the user (Home or Preferences, switchable in the session toolbar): **Mirror**, **Extend**, **Trackpad**, **Keyboard** or **Pen pad**. Mirror and Extend show the screen (Extend first asks the host for a virtual display); the others are single full-screen surfaces. The pen pad can optionally show the screen faintly underneath.

## Input

Viewer → host `input` messages are validated by `sanitizeInput` (allow-listed kinds, clamped numeric ranges, bounded strings) and permission-checked (`control`) before reaching the `InputInjector`. The injector applies sub-pixel accumulation to relative moves, converts wheel deltas to notches, maps DOM key codes to native keys, and turns three-finger swipes into OS shortcuts. On disconnect every held key/button is released.

## Displays and "Extend"

`DisplayManager` lists real displays through the Electron/OS APIs and can create a *virtual* display through a provider:

- **Linux/X11** — `xrandr` logical monitors (experimental).
- **Windows** — PowerShell `ChangeDisplaySettingsEx` for arrangement.
- **macOS** — `displayplacer` for arrangement.
- **Any OS** — a user-configured command template (`{w} {h} {x} {y} {name}`) to call a virtual-display driver's CLI.

Creating a monitor requires a driver the OS trusts; CastDesk does not ship one. Without a provider, Extend falls back to Mirror and reports why. Each device's arrangement is stored in the trust store, and `restoreFor()` re-creates the extended display and position on trusted reconnect.

## Discovery and USB

- mDNS (`_castdesk._tcp`, via `bonjour-service`) and a UDP broadcast beacon on 7421 for networks where mDNS is blocked.
- Mobile: native mDNS through `capacitor-zeroconf`, QR scanning, `castdesk://connect?...` deep links.
- USB on Android: the host runs `adb reverse tcp:7420 tcp:7420`; the phone probes `127.0.0.1:7420`.
- USB on iOS / USB tethering / computer-to-computer links appear as ordinary network interfaces and are found by LAN discovery.
