# CastDesk

**Every screen. One desk.** Mirror, extend and control screens between PCs, Macs, phones, tablets and browsers over **USB or your local network — no internet, no account, no cloud.**

- **Mirror or extend** a display to another device.
- **You choose what a device is for**: Mirror, Extend, Trackpad, Keyboard or Pen pad. Each is its own full-screen experience (a trackpad is only a trackpad; it never shares the screen with a video).
- **Windows Win+P built in**: Duplicate / Extend / PC screen only from CastDesk or from a paired phone. If the PC has one monitor, one click installs a virtual screen so Extend still works.
- **Smooth over Wi-Fi**: H.264 / VP8 hardware-accelerated video via WebCodecs, with a JPEG fallback for old browsers.
- **Pair once with a 6-digit PIN**, then devices reconnect automatically with no PIN (Continuity-style).
- **PC ↔ PC** mirror or extend; every desktop install can host and view.
- **Arrange displays** by drag-and-drop with Windows-style snapping; each device's position is remembered.
- **Autostart** in the tray on Windows, macOS and Linux.
- **Permission checker** with one-click fixes (macOS Screen Recording / Accessibility / Local Network, Windows firewall, Linux Wayland/X11, Android).
- **Landing, download, guide, preferences, about and source pages** — React + Vite + plain CSS (`apps/site`).

MIT licensed. See [`docs/`](docs) for architecture, protocol, permissions, build and security notes.

## Repository

| Path | What |
| --- | --- |
| `packages/shared` | Protocol, SPEKE PIN pairing, gesture engine, display-layout maths (plain ESM, no dependencies) |
| `packages/host` | Host service: HTTP + WebSocket server, trust store, input injection, display manager, USB (adb), discovery |
| `apps/desktop` | Electron shell: tray, permissions, autostart, screen capture, installers (electron-builder) |
| `apps/client` | React 19 + Vite app for phones/tablets/browsers, packaged with Capacitor (Android) and served as a PWA by the host |
| `apps/site` | Marketing / download / docs website |
| `scripts` | Icon generation, Electron end-to-end test, screenshot tools |
| `.github/workflows/release.yml` | Builds Windows, macOS, Linux installers and the Android APK, then publishes a release |

## Quick start

Requires Node.js 20+ (22 recommended).

```bash
npm install
npm test                  # unit + host integration tests
npm run build:client      # the phone/web app that the desktop serves
npm run dev:desktop       # run the desktop app
npm run dev:site          # run the website on http://localhost:5180
```

Headless host (servers, CI): `npm run host:headless`.

Installers and the APK: see [`docs/BUILD.md`](docs/BUILD.md). **Windows .exe in 3 minutes: [`docs/BUILD-EXE.md`](docs/BUILD-EXE.md)** (double-click `scripts/build-exe.bat`).

Host your own downloads: drop the installers in `apps/site/public/downloads/` and the website's Download page serves them.

Source: <https://github.com/SaurabhArt111/Paneo>

## What has been verified — and what hasn't

Verified automatically in a Linux environment:

- Shared (12), host (17) and desktop (4) test suites, including real WebSocket pairing, wrong-PIN lock-out, trusted reconnect, revoke, input whitelist and extend-display flow.
- End-to-end: the real Electron app under Xvfb, driven by a phone-sized Chrome (`node scripts/e2e-electron.mjs`): pairs with the PIN, streams live H.264/VP8 frames from the hidden capture window, switches between Mirror / Trackpad / Keyboard / Pen, moves the real cursor via the trackpad, reconnects with no PIN, revokes. Add `--shots <dir> [--dark]` to save UI screenshots.
- The packaged Linux build boots and serves `/api/info` and the PWA.
- Client and site production builds; site pages load without console errors at desktop and phone widths.

**Not verified here** (no Android SDK, Windows, macOS or iOS device was available — treat as untested until you run them):

- Building the Android APK, and running it on a device.
- Windows and macOS packaging and runtime, including display arrangement code and permission prompts.
- Real virtual-display creation (Extend) on Windows/macOS; this needs a third-party driver and a command configured in Settings. Linux/X11 creation via `xrandr` is experimental.
- iPhone/iPad (served as a web app only; no native build).

## Known limitations (v1.0)

- **The screen stream and input are not encrypted.** Pairing and reconnect are authenticated (SPEKE + HMAC) but frames travel as plain WebSocket data. Use on trusted networks or over USB. See [`docs/SECURITY.md`](docs/SECURITY.md).
- Video is JPEG over WebSocket — good for mirroring and office work, not for high-frame-rate video or games.
- Pen pressure/tilt are transmitted but injected as a plain pointer.
- No audio or clipboard sharing yet.
- Under Wayland the desktop can be mirrored but not controlled.

## License

MIT — see [LICENSE](LICENSE).
