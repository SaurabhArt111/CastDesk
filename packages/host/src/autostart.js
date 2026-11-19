import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

const run = (bin, args) =>
  new Promise((resolve, reject) => execFile(bin, args, { windowsHide: true }, (e, out) => (e ? reject(e) : resolve(out))));

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';

const q = (s) => `"${String(s).replace(/"/g, '\\"')}"`;

function targets({ id, home }) {
  return {
    mac: path.join(home, 'Library', 'LaunchAgents', `com.${id}.app.plist`),
    linux: path.join(home, '.config', 'autostart', `${id}.desktop`),
  };
}

/**
 * Cross-platform "start when I log in". Electron's own
 * app.setLoginItemSettings() is used on Windows/macOS in the desktop app;
 * this module covers Linux and headless installs, and is unit-testable
 * because `home` can be redirected.
 */
export async function setAutostart(enabled, { id = 'paneo', name = 'Paneo', exec, args = [], hidden = true, home = os.homedir(), platform = process.platform } = {}) {
  const fullArgs = hidden ? [...args, '--hidden'] : args;
  const t = targets({ id, home });

  if (platform === 'win32') {
    if (enabled) await run('reg', ['add', RUN_KEY, '/v', name, '/t', 'REG_SZ', '/d', [q(exec), ...fullArgs].join(' '), '/f']);
    else await run('reg', ['delete', RUN_KEY, '/v', name, '/f']).catch(() => {});
    return;
  }

  const file = platform === 'darwin' ? t.mac : t.linux;
  if (!enabled) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (platform === 'darwin') {
    const items = [exec, ...fullArgs].map((a) => `    <string>${String(a).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</string>`).join('\n');
    fs.writeFileSync(
      file,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.${id}.app</string>
  <key>ProgramArguments</key><array>
${items}
  </array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict></plist>
`,
    );
  } else {
    fs.writeFileSync(
      file,
      `[Desktop Entry]
Type=Application
Name=${name}
Exec=${[exec, ...fullArgs].map((a) => (/\s/.test(a) ? q(a) : a)).join(' ')}
X-GNOME-Autostart-enabled=true
Hidden=false
NoDisplay=false
Comment=Start ${name} when you log in
`,
    );
  }
}

export async function isAutostart({ id = 'paneo', name = 'Paneo', home = os.homedir(), platform = process.platform } = {}) {
  if (platform === 'win32') {
    try {
      const out = await run('reg', ['query', RUN_KEY, '/v', name]);
      return out.includes(name);
    } catch {
      return false;
    }
  }
  const t = targets({ id, home });
  return fs.existsSync(platform === 'darwin' ? t.mac : t.linux);
}
