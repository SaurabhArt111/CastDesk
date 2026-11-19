/**
 * Repairs a broken install. The classic Windows/macOS failure is
 *   "Cannot find native binding ... @rolldown/binding-win32-x64-msvc"
 * which is npm bug #4828: a lockfile made on another OS skips this OS's optional native packages.
 * Fix = delete node_modules and the lockfile, install again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
console.log('Removing node_modules and package-lock.json ...');
for (const dir of [root, ...['apps', 'packages'].flatMap((g) => fs.readdirSync(path.join(root, g)).map((n) => path.join(root, g, n)))]) {
  fs.rmSync(path.join(dir, 'node_modules'), { recursive: true, force: true });
}
fs.rmSync(path.join(root, 'package-lock.json'), { force: true });
console.log('Installing (a few minutes) ...');
const r = spawnSync('npm', ['install'], { cwd: root, stdio: 'inherit', shell: true });
process.exit(r.status ?? 1);
