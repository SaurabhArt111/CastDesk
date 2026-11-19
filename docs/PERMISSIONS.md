# Permissions

Paneo asks only for what a feature needs and explains each prompt. The desktop app has a **Permissions** screen that checks all of these and offers a "Fix" button that opens the right system page.

## macOS (host)

| Permission | Needed for | Declared in |
| --- | --- | --- |
| Screen Recording | Capturing the display | system prompt on first capture; `capture:prepare` triggers it |
| Accessibility | Injecting mouse and keyboard from a paired device | `NSAppleEventsUsageDescription`, `entitlements.mac.plist` |
| Local Network | Bonjour discovery and connections | `NSLocalNetworkUsageDescription`, `NSBonjourServices` (`_paneo._tcp`) |

After granting Screen Recording, quit and reopen Paneo.

## Windows (host)

- **Firewall** — the NSIS installer (`build/installer.nsh`) adds an inbound rule for private networks (TCP 7420, UDP 7421 and 5353). The Permissions screen can re-add it (needs UAC).
- **Elevated windows** — Windows blocks input into windows of higher integrity (UAC prompts, admin tools). Run Paneo as administrator for those sessions.
- **Autostart** — standard login item, `HKCU\…\Run` fallback. No admin rights.

## Linux (host)

- **X11** — required for input injection. Under Wayland, mirroring works (via the portal picker) but synthetic input is blocked by the compositor.
- **Firewall** — allow TCP 7420 and UDP 5353/7421 from your LAN (e.g. `ufw`).
- **Autostart** — `~/.config/autostart/paneo.desktop`.

## Android (viewer)

Declared in `apps/client/android/app/src/main/AndroidManifest.xml`:

| Permission | Why |
| --- | --- |
| `INTERNET` | Open sockets to the computer (local network or USB tunnel) |
| `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE` | Detect the network for discovery |
| `CHANGE_WIFI_MULTICAST_STATE` | Receive mDNS multicast |
| `NEARBY_WIFI_DEVICES` (`neverForLocation`) | Local discovery on Android 13+ without location |
| `ACCESS_LOCAL_NETWORK` | Local-network access prompt on newer Android versions |
| `CAMERA` (optional) | Scan the pairing QR code |
| `VIBRATE` | Haptic feedback on taps |
| `WAKE_LOCK` | Keep the screen awake during a session |

Cleartext HTTP/WS to local addresses is permitted by `network_security_config.xml` because the host speaks plain WebSocket on the LAN.

## iOS / iPadOS (web app)

Safari asks for Local Network access the first time the page contacts the computer. Add the page to the Home Screen for a full-screen experience. There is no native iOS build yet.

## What Paneo never requests

Location, contacts, microphone, photos/storage, accounts or any internet permission beyond local sockets.
