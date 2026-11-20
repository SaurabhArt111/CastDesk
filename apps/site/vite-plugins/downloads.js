import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SKIP = new Set(['README.md', 'files.json', '.gitkeep']);

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (c) => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

/** List every file in a downloads folder: [{ name, size, sha256 }]. */
export async function buildManifest(dir, { hash = true } = {}) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || SKIP.has(e.name) || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    out.push({ name: e.name, size: fs.statSync(full).size, sha256: hash ? await sha256(full) : null });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Anything you drop in `public/downloads/` is offered on the Download page.
 * The build writes `downloads/files.json`; the dev server answers it live.
 * (If you upload files to the *deployed* folder instead, run `npm run downloads:index -w @castdesk/site -- <that folder>`.)
 */
export default function downloadsManifest() {
  let publicDir = 'public';
  return {
    name: 'castdesk-downloads-manifest',
    configResolved(cfg) {
      publicDir = cfg.publicDir;
    },
    configureServer(server) {
      server.middlewares.use('/downloads/files.json', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(await buildManifest(path.join(publicDir, 'downloads'), { hash: false })));
      });
    },
    async closeBundle() {
      // runs after public/ has been copied into dist/
      const outDir = path.resolve('dist', 'downloads');
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, 'files.json'), JSON.stringify(await buildManifest(outDir)));
    },
  };
}
