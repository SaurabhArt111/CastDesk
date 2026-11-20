import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { execFile } from 'node:child_process';

/** Google's official Android platform-tools (contains adb). Overridable for tests / mirrors. */
export function platformToolsUrl(platform = process.platform) {
  if (process.env.CASTDESK_PLATFORM_TOOLS_URL) return process.env.CASTDESK_PLATFORM_TOOLS_URL;
  const os = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'darwin' : 'linux';
  return `https://dl.google.com/android/repository/platform-tools-latest-${os}.zip`;
}

export const adbExeName = (platform = process.platform) => (platform === 'win32' ? 'adb.exe' : 'adb');

/** Path adb will have after a successful install into `dir`. */
export const installedAdbPath = (dir, platform = process.platform) => path.join(dir, 'platform-tools', adbExeName(platform));

export function download(url, file, onProgress, redirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('http://') ? http : https;
    const req = client.get(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        resolve(download(new URL(res.headers.location, url).toString(), file, onProgress, redirects - 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Download failed (HTTP ${res.statusCode}). Check that this computer can reach dl.google.com.`));
        return;
      }
      const total = Number(res.headers['content-length']) || 0;
      let got = 0;
      const out = fs.createWriteStream(file);
      res.on('data', (c) => {
        got += c.length;
        if (total) onProgress?.(Math.round((got / total) * 100));
      });
      res.pipe(out);
      out.on('finish', () => out.close(() => resolve()));
      out.on('error', reject);
      res.on('error', reject);
    });
    req.on('error', (e) => reject(new Error(`Could not reach the download server (${e.code || e.message}). This one-time download needs internet.`)));
  });
}

/**
 * How to unzip on each OS. Windows uses PowerShell's Expand-Archive: it is always there, and unlike a bare
 * `tar` it cannot be hijacked by Git-for-Windows' GNU tar, which reads "C:\\..." as a remote host ("resolve failed").
 */
export function extractCommand(zip, dir, platform = process.platform) {
  if (platform === 'win32') {
    const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
    return ['powershell', ['-NoProfile', '-NonInteractive', '-Command', `$ProgressPreference='SilentlyContinue'; Expand-Archive -LiteralPath ${q(zip)} -DestinationPath ${q(dir)} -Force`]];
  }
  if (platform === 'darwin') return ['/usr/bin/ditto', ['-x', '-k', zip, dir]];
  return ['unzip', ['-o', '-q', zip, '-d', dir]];
}

export function extract(zip, dir, platform = process.platform) {
  const [cmd, args] = extractCommand(zip, dir, platform);
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, timeout: 180000 }, (err, _o, stderr) =>
      err ? reject(new Error(`Could not unpack the download (${cmd}): ${String(stderr || err.message).trim().split('\n')[0]}`)) : resolve(),
    );
  });
}

/**
 * Download + unpack platform-tools into `dir`. Resolves to the adb path.
 * Only needs internet this one time; everything else in CastDesk works offline.
 */
export async function installPlatformTools(dir, { onProgress, platform = process.platform } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, 'platform-tools.zip');
  try {
    await download(platformToolsUrl(platform), zip, onProgress);
    await extract(zip, dir, platform);
  } finally {
    fs.rmSync(zip, { force: true });
  }
  const adbPath = installedAdbPath(dir, platform);
  if (!fs.existsSync(adbPath)) throw new Error('The download did not contain adb.');
  if (platform !== 'win32') fs.chmodSync(adbPath, 0o755);
  return adbPath;
}
