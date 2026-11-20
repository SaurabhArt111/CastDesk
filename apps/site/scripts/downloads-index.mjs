// Rebuild downloads/files.json for a folder you filled by hand:  node scripts/downloads-index.mjs <folder>
import fs from 'node:fs';
import path from 'node:path';
import { buildManifest } from '../vite-plugins/downloads.js';

const dir = path.resolve(process.argv[2] || 'dist/downloads');
fs.mkdirSync(dir, { recursive: true });
const list = await buildManifest(dir);
fs.writeFileSync(path.join(dir, 'files.json'), JSON.stringify(list));
console.log(`Indexed ${list.length} file(s) in ${dir}`);
for (const f of list) console.log(`  ${f.name}  ${(f.size / 1048576).toFixed(1)} MB`);
