import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { download, extract } from '../usb/platform-tools.js';

/** Amyuni "USB Mobile Monitor" indirect display driver: small, signed, free, what several remote-desktop tools ship. */
export const IDD_URL = () => process.env.CASTDESK_IDD_URL || 'https://www.amyuni.com/downloads/usbmmidd_v2.zip';

function findInstaller(dir) {
  const walk = (d, depth) => {
    if (depth > 2 || !fs.existsSync(d)) return null;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isFile() && e.name.toLowerCase() === 'deviceinstaller64.exe') return p;
      if (e.isDirectory()) {
        const r = walk(p, depth + 1);
        if (r) return r;
      }
    }
    return null;
  };
  return walk(dir, 0);
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Run a program with administrator rights (Windows shows its normal UAC prompt). */
export function runElevated(file, args, cwd) {
  const script = `try { $p = Start-Process -FilePath ${q(file)} -ArgumentList ${args.map(q).join(',')} -WorkingDirectory ${q(cwd)} -Verb RunAs -Wait -PassThru -WindowStyle Hidden; exit $p.ExitCode } catch { Write-Error $_.Exception.Message; exit 1223 }`;
  return new Promise((resolve, reject) => {
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 180000 }, (err, _o, stderr) => {
      if (!err) return resolve();
      if (err.code === 1223 || /canceled by the user/i.test(String(stderr))) return reject(Object.assign(new Error('Administrator permission was declined.'), { code: 'uac-declined' }));
      reject(new Error(`Driver tool failed (${err.code ?? 'error'}). ${String(stderr).trim().split('\n')[0] || ''}`.trim()));
    });
  });
}

/**
 * Optional virtual monitor for "Extend" when the PC has only one real screen.
 * Installing needs administrator rights once; afterwards Windows' own Project panel (Win+P)
 * controls how the virtual screen is used, exactly like a second monitor.
 */
export class WindowsVirtualDriver {
  constructor({ dir }) {
    this.dir = dir;
    this.marker = path.join(dir, 'idd-installed.json');
  }

  installerPath() {
    return findInstaller(this.dir);
  }

  installed() {
    return fs.existsSync(this.marker) && Boolean(this.installerPath());
  }

  async install({ onProgress } = {}) {
    fs.mkdirSync(this.dir, { recursive: true });
    const zip = path.join(this.dir, 'usbmmidd.zip');
    try {
      await download(IDD_URL(), zip, onProgress);
      await extract(zip, this.dir, 'win32');
    } finally {
      fs.rmSync(zip, { force: true });
    }
    const exe = this.installerPath();
    if (!exe) throw new Error('The download did not contain the display driver.');
    await runElevated(exe, ['install', 'usbmmidd.inf', 'usbmmidd'], path.dirname(exe));
    fs.writeFileSync(this.marker, JSON.stringify({ at: Date.now() }));
  }

  /** Plug in one virtual monitor (asks for administrator permission). */
  async plug() {
    const exe = this.installerPath();
    if (!exe) throw new Error('Virtual display driver is not installed');
    await runElevated(exe, ['enableidd', '1'], path.dirname(exe));
  }

  async unplug() {
    const exe = this.installerPath();
    if (exe) await runElevated(exe, ['enableidd', '0'], path.dirname(exe));
  }
}
