# Downloads folder

Put your finished installers here and visitors can download them straight from the **Download** page:

```
CastDesk-Setup-1.0.0-x64.exe      Windows installer
CastDesk-Portable-1.0.0.exe       Windows portable
CastDesk-1.0.0.apk                Android
CastDesk-1.0.0-universal.dmg      macOS
CastDesk-1.0.0-x86_64.AppImage    Linux
```

- Use these exact names (they match the website) and each file appears on the right card, with its size and SHA-256.
- Any other file you add (any name) shows up under **More downloads**.
- Files that are not here fall back to your GitHub Releases link.
- `npm run build:site` includes this folder. If you upload files to the live server by hand instead, run
  `npm run downloads:index -w @castdesk/site -- /path/to/live/downloads` to refresh `files.json`.
- GitHub rejects single files over 100 MB; for large installers use GitHub Releases or a normal web host.
