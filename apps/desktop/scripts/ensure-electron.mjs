// "Error: Electron failed to install correctly" almost always means the postinstall download
// was interrupted or skipped (flaky network, `--ignore-scripts`, antivirus). Repair it automatically.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let dir;
try {
  dir = path.dirname(require.resolve('electron/package.json'));
} catch {
  console.error('Electron is not installed. Run `npm install` in the repository root.');
  process.exit(1);
}
const marker = path.join(dir, 'path.txt');
const healthy = () => {
  try {
    const rel = fs.readFileSync(marker, 'utf8').trim();
    return fs.existsSync(path.join(dir, 'dist', rel));
  } catch {
    return false;
  }
};

if (!healthy()) {
  console.log('Electron binary is missing - downloading it now (one time, ~100 MB)...');
  const r = spawnSync(process.execPath, [path.join(dir, 'install.js')], { stdio: 'inherit', cwd: dir });
  if (r.status !== 0 || !healthy()) {
    console.error('\nCould not download Electron. Check your internet connection / proxy, then run:\n  node node_modules/electron/install.js\n(The Paneo app itself never needs the internet - only this one-time download does.)');
    process.exit(1);
  }
  console.log('Electron is ready.');
}
