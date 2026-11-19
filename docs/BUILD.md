# Building CastDesk

Requires Node.js 20+ (22 recommended). Run `npm install` once at the repository root.

## Develop

```bash
npm test                 # shared + host suites
npm run dev:client       # client UI in a browser (http://localhost:5173)
npm run build:client     # production client (the desktop app serves this)
npm run dev:desktop      # Electron app (needs the client build above)
npm run dev:site         # website on http://localhost:5180
npm run host:headless    # host service without a window
```

## Desktop installers

Just want the Windows `.exe`? Follow [`BUILD-EXE.md`](BUILD-EXE.md).

electron-builder builds for the OS it runs on. Run on the target OS (or use the GitHub workflow):

```bash
npm run build:desktop            # build client, then installers for this OS
npm run dist:win   -w @castdesk/desktop   # nsis (x64, arm64), msi, portable
npm run dist:mac   -w @castdesk/desktop   # dmg + zip (universal)
npm run dist:linux -w @castdesk/desktop   # AppImage, deb, rpm
```

Output: `apps/desktop/release/`. File names:

| Platform | Files |
| --- | --- |
| Windows | `CastDesk-Setup-<v>-x64.exe`, `-arm64.exe`, `CastDesk-<v>-x64.msi`, `CastDesk-Portable-<v>.exe` |
| macOS | `CastDesk-<v>-universal.dmg`, `CastDesk-<v>-mac-universal.zip` |
| Linux | `CastDesk-<v>-x86_64.AppImage`, `castdesk_<v>_amd64.deb`, `castdesk-<v>.x86_64.rpm` |

Prerequisites: Linux `rpm` package for the rpm target; macOS universal builds need Xcode command-line tools; the msi target downloads WiX automatically.

### Signing

Unsigned builds work but trigger SmartScreen / Gatekeeper warnings. Provide certificates through the usual electron-builder environment variables (`CSC_LINK`, `CSC_KEY_PASSWORD`, `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`, and for macOS notarisation `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). The release workflow forwards the corresponding repository secrets.

## Android APK

Prerequisites: JDK 21 and the Android SDK (platform 36, build-tools). Set `ANDROID_HOME`.

```bash
npm run build:android            # vite build + cap sync android
cd apps/client/android
./gradlew assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease        # unsigned; sign with apksigner (see workflow)
```

The application id is `app.castdesk.mobile`. If you edit `capacitor.config.json` or add plugins, run `npx cap sync android` again. The manifest, network security config and icons under `android/app/src/main` are hand-maintained and are kept by `cap sync`.

## Website

```bash
npm run build:site               # → apps/site/dist
```

Static hosting needs a fallback to `index.html` for deep links; the build writes `404.html` (GitHub Pages) and `_redirects` (Netlify/Cloudflare Pages). Edit `apps/site/src/data/site.js` to set the repository URL and version used by the download buttons.

## Releases

Tag and push: `git tag v1.0.0 && git push --tags`. The workflow builds every artifact, writes `SHA256SUMS.txt`, and publishes a GitHub Release. Optional secrets: `CSC_*`, `WIN_CSC_*`, `APPLE_*`, `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`. Without a keystore the APK is debug-signed (fine for sideloading).

## Tests

```bash
npm test                          # unit + host integration
node scripts/e2e-electron.mjs     # real Electron app + phone-sized Chrome (needs Xvfb and Chrome)
node scripts/e2e-electron.mjs --dark --shots ./shots   # also save UI screenshots
```

## Troubleshooting

**`Cannot find native binding` (rolldown)** — npm bug #4828 on a machine whose OS differs from the one that made the lockfile. Run `npm run fix-install`.

**`ERR_FILE_NOT_FOUND ... dist/index.html`** — the UI was not built yet. `npm run dev:desktop` now builds it first.

**`Error: Electron failed to install correctly`** — the one-time Electron download (done by npm's postinstall) was interrupted or skipped. `npm run dev:desktop` now repairs this automatically; you can also run `node node_modules/electron/install.js`. A flaky network, a proxy, antivirus software, or `npm install --ignore-scripts` are the usual causes.

**The desktop window shows no PIN / QR code / "Display layout" button** — the preload bridge failed to load, so the UI thinks it is a normal web page. Check the window's DevTools console (Ctrl+Shift+I) for a preload error. A regression test (`apps/desktop/test/preload.test.js`) guards the most likely cause: modules that are unavailable in a sandboxed preload.

**A phone does not appear in the desktop's "Nearby" list** — by design, phones and tablets are *viewers*: they find the computer, not the other way round. The desktop shows phones that are plugged in (USB cable section), connected, or paired.
