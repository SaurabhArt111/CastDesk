// Rename the product everywhere:   node scripts/rename.mjs <OldName> <NewName>
// e.g.  node scripts/rename.mjs CastDesk Skylane
// Replaces Old/old/OLD with New/new/NEW in every text file, renames the Android package folder,
// and keeps the real GitHub repository URL untouched (edit apps/site/src/data/site.js for that).
// Afterwards run:  npm install
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [oldName, newName] = process.argv.slice(2);
if (!oldName || !newName || !/^[A-Za-z][A-Za-z0-9]*$/.test(newName)) {
  console.error('usage: node scripts/rename.mjs <OldName> <NewName>   (letters and digits only)');
  process.exit(1);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['node_modules', '.git', 'dist', 'release', '.gradle']);
const textExt = /\.(js|jsx|mjs|cjs|json|md|html|css|xml|gradle|java|kt|properties|yml|yaml|txt|svg|nsh|plist|webmanifest|desktop|bat|ps1|sh|cfg|toml)$/i;
const pairs = [[oldName, newName], [oldName.toLowerCase(), newName.toLowerCase()], [oldName.toUpperCase(), newName.toUpperCase()]];
const keep = /(github\.com\/[A-Za-z0-9_-]+\/)(?:[A-Za-z0-9._-]+)/g; // real repo URLs are protected
let changed = 0;

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) walk(path.join(dir, e.name));
      continue;
    }
    if (e.name === 'package-lock.json' || !textExt.test(e.name)) continue;
    const file = path.join(dir, e.name);
    const before = fs.readFileSync(file, 'utf8');
    const urls = [];
    let s = before.replace(keep, (m) => { urls.push(m); return `@@URL${urls.length - 1}@@`; });
    for (const [a, b] of pairs) s = s.split(a).join(b);
    s = s.replace(/@@URL(\d+)@@/g, (_, i) => urls[Number(i)]);
    if (s !== before) {
      fs.writeFileSync(file, s);
      changed++;
    }
  }
}
walk(root);

// Android package folder:  java/app/<old>/mobile -> java/app/<new>/mobile
const javaRoot = path.join(root, 'apps/client/android/app/src/main/java/app');
const oldDir = path.join(javaRoot, oldName.toLowerCase());
if (fs.existsSync(oldDir)) fs.renameSync(oldDir, path.join(javaRoot, newName.toLowerCase()));
console.log(`Renamed ${oldName} -> ${newName} in ${changed} files. Now run: npm install`);
