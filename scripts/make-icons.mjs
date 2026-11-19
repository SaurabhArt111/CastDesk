// Renders apps/client/public/icon.svg to PNG icons (installer + tray + site) using the system Chrome.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'apps/client/public/icon.svg'), 'utf8');
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
const page = await browser.newPage();
const targets = [
  ['apps/desktop/build/icon.png', 1024],
  ['apps/site/public/icon-512.png', 512],
  ['apps/site/public/apple-touch-icon.png', 180],
  ['apps/site/public/favicon-32.png', 32],
];
for (const [file, size] of targets) {
  await page.setViewport({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  const out = path.join(root, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: true });
  console.log('wrote', file);
}

// Android launcher icons: legacy square/round + adaptive foreground (safe zone) per density
const res = path.join(root, 'apps/client/android/app/src/main/res');
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const fg = (size) => `<body style="margin:0;background:transparent;display:grid;place-items:center;width:${size}px;height:${size}px"><div style="width:${size * 0.62}px;height:${size * 0.62}px">${svg.replace('<svg ', `<svg width="${size * 0.62}" height="${size * 0.62}" `).replace(/<rect width="512" height="512"[^>]*\/>/g, '')}</div></body>`;
for (const [d, k] of Object.entries(dens)) {
  const dir = path.join(res, `mipmap-${d}`);
  const legacy = Math.round(48 * k);
  const adaptive = Math.round(108 * k);
  await page.setViewport({ width: legacy, height: legacy });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${legacy}" height="${legacy}" `)}</body>`);
  await page.screenshot({ path: path.join(dir, 'ic_launcher.png'), omitBackground: true });
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${legacy}px;height:${legacy}px;border-radius:50%;overflow:hidden">${svg.replace('<svg ', `<svg width="${legacy}" height="${legacy}" `)}</div></body>`);
  await page.screenshot({ path: path.join(dir, 'ic_launcher_round.png'), omitBackground: true });
  await page.setViewport({ width: adaptive, height: adaptive });
  await page.setContent(fg(adaptive));
  await page.screenshot({ path: path.join(dir, 'ic_launcher_foreground.png'), omitBackground: true });
  console.log('android icons', d);
}
await browser.close();
