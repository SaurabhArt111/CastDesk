// Static hosts need a fallback so deep links like /guide work on refresh.
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('dist');
fs.copyFileSync(path.join(dist, 'index.html'), path.join(dist, '404.html')); // GitHub Pages
console.log('postbuild: wrote 404.html SPA fallback');
