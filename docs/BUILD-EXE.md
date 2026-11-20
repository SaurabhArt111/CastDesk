# Make the Windows .exe

You build the installer **on Windows**. CastDesk uses native input libraries, and they are built for the system you run `npm install` on.

## The 3-minute way

1. Install **Node.js LTS** from <https://nodejs.org> (tick the default options).
2. Download or clone the project, e.g. `git clone https://github.com/SaurabhArt111/Paneo` and open the folder.
3. Double-click **`scripts\build-exe.bat`**.

When it finishes, `apps\desktop\release` opens with two files:

| File | What it is |
| --- | --- |
| `CastDesk-Setup-1.0.0-x64.exe` | Installer: Start-menu entry, uninstaller, autostart option. Give this to people. |
| `CastDesk-Portable-1.0.0.exe` | Runs from anywhere, nothing installed. Good for a USB stick. |

## Put it on your website

Copy `CastDesk-Setup-1.0.0-x64.exe` (and your `.apk`, `.dmg`, ...) into **`apps/site/public/downloads/`**, then `npm run build:site`. The site's Download page offers whatever is in that folder, with size and checksum. Details: `apps/site/public/downloads/README.md`.

## The same thing by hand

In a terminal (PowerShell or cmd) in the project folder:

```bat
npm install
npm run build:exe
```

`npm run build:exe` builds the app UI and then packs the installer.

## If something goes wrong

| Message | Fix |
| --- | --- |
| `Cannot create symbolic link ... A required privilege is not held by the client` (while downloading `winCodeSign`) | Turn on **Developer Mode** (Settings → System → For developers), or run the terminal **as Administrator**, then build again. |
| `Cannot find native binding` / `@rolldown/binding-win32-x64-msvc` (npm bug #4828) | Run `npm run fix-install` (deletes `node_modules` and the lockfile, installs again). `build-exe.bat` does this for you automatically. |
| `'node' is not recognized` | Install Node.js, then open a **new** terminal. |
| `Electron failed to install correctly` | Run `node apps\desktop\scripts\ensure-electron.mjs`. It re-downloads Electron. |
| Build is slow the first time | Normal: it downloads Electron (~100 MB) and the packaging tools once. |
| Antivirus deletes the exe | Unsigned apps look unfamiliar to Windows. See "SmartScreen" below. |

## SmartScreen: "Windows protected your PC"

An unsigned installer shows this warning. Click **More info → Run anyway**. To remove the warning for everyone you need a code-signing certificate (paid). Set `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` before building and it signs automatically.

## Let GitHub build it for you (no Windows PC needed)

1. Create the repo and push:

   ```bash
   git init
   git add .
   git commit -m "CastDesk 1.0.0"
   git branch -M main
   git remote add origin https://github.com/SaurabhArt111/Paneo.git
   git push -u origin main
   ```

2. Tag a release, which starts the build for Windows, macOS and Linux:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. In ~15 minutes the **Releases** page of the repo has the `.exe`, `.msi`, `.dmg`, `.AppImage`, `.deb` and the Android `.apk`. The download buttons on the website point there.

## Run without building

```bat
npm install
npm run dev:desktop
```

`dev:desktop` builds the app UI first, then starts it.

The first launch asks Windows Firewall to allow CastDesk on **private networks**. Say yes, or other devices cannot reach it.
