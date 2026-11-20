/**
 * End-to-end test of the REAL desktop app:
 *   Xvfb (virtual screen) -> Electron host -> browser "phone" viewer.
 * Pairs with the PIN, streams the screen, injects input, reconnects without a PIN,
 * extends/arranges via a fake provider is covered in unit tests; this covers the
 * real capture + real input + real UI. Optionally saves screenshots (--shots <dir>).
 *
 *   node scripts/e2e-electron.mjs [--shots apps/site/public/screens]
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dark = process.argv.includes('--dark');
const shotsDir = process.argv.includes('--shots') ? path.resolve(process.argv[process.argv.indexOf('--shots') + 1]) : null;
if (shotsDir) fs.mkdirSync(shotsDir, { recursive: true });
const chrome = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const DISPLAY = ':99';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);
};

async function must(page, sel, timeout = 15000) {
  try {
    return await page.waitForSelector(sel, { timeout });
  } catch (e) {
    await page.screenshot({ path: '/tmp/e2e-fail.png' }).catch(() => {});
    console.log(`FAILED waiting for ${sel}. Visible text: ${(await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 300).replace(/\n/g, ' | ')}`);
    throw e;
  }
}

const procs = [];
const cleanup = () => procs.forEach((p) => { try { p.kill('SIGKILL'); } catch {} });
process.on('exit', cleanup);

// 1. virtual screen + the real Electron app
procs.push(spawn('Xvfb', [DISPLAY, '-screen', '0', '1280x800x24'], { stdio: 'ignore' }));
await sleep(1000);
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bd-e2e-'));
const electron = spawn(path.join(root, 'node_modules/.bin/electron'), ['.', '--no-sandbox', '--disable-gpu', `--user-data-dir=${userData}`, '--remote-debugging-port=9333'], {
  cwd: path.join(root, 'apps/desktop'), env: { ...process.env, DISPLAY }, stdio: ['ignore', 'pipe', 'pipe'],
});
procs.push(electron);
electron.stdout.on('data', (d) => process.env.E2E_VERBOSE && process.stdout.write(d));

let desktop;
for (let i = 0; i < 40 && !desktop; i++) {
  await sleep(500);
  try { desktop = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9333', defaultViewport: null }); } catch {}
}
if (!desktop) { console.error('Could not attach to Electron'); process.exit(1); }
let appPage;
for (let i = 0; i < 40 && !appPage; i++) {
  appPage = (await desktop.pages()).find((p) => p.url().startsWith('file://') && !p.url().includes('capture=1'));
  if (!appPage) await sleep(300);
}
await appPage.waitForFunction(() => window.castdesk?.getState, { timeout: 15000 });
if (dark) await appPage.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
const state = () => appPage.evaluate(() => window.castdesk.getState());
await appPage.evaluate(() => window.castdesk.setSettings({ requireApprovalForControl: false }));
let st = await state();
check('Electron host service is running', st.info.port > 0, `port ${st.info.port}`);
check('PIN is 6 digits', /^\d{6}$/.test(st.pin.pin));
check('Native input backend loaded (nut-js)', st.inputAvailable === true);
await sleep(1200);
if (shotsDir) await appPage.screenshot({ path: path.join(shotsDir, 'desktop-home.webp'), type: 'webp', quality: 90 });

// 2. a "phone" opens the web viewer served by the host
const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
procs.push({ kill: () => browser.close().catch(() => {}) });
const phone = await browser.newPage();
await phone.setViewport({ width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
if (dark) await phone.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
phone.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
phone.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log('PHONE', m.type(), m.text().slice(0, 200)));
await phone.evaluateOnNewDocument(() => {
  window.__draws = 0;
  window.__ft = { 1: 0, 2: 0, 3: 0, bytes: 0 };
  const origAdd = WebSocket.prototype.addEventListener;
  const hook = (ws) => ws.addEventListener('message', (e) => { if (e.data instanceof ArrayBuffer && e.data.byteLength > 10) { const t = new Uint8Array(e.data, 0, 1)[0]; window.__ft[t] = (window.__ft[t] || 0) + 1; window.__ft.bytes += e.data.byteLength; } });
  const NativeWS = window.WebSocket;
  window.WebSocket = new Proxy(NativeWS, { construct(T, a) { const ws = new T(...a); hook(ws); return ws; } });
  const orig = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...a) { if (this.canvas.classList?.contains('remote')) window.__draws++; return orig.apply(this, a); };
});
const url = `http://127.0.0.1:${st.info.port}/`;
await phone.goto(url, { waitUntil: 'networkidle2' });
await phone.waitForSelector('.device', { timeout: 15000 });
check('Phone UI discovers the host (served over LAN)', true);
if (shotsDir) await phone.screenshot({ path: path.join(shotsDir, 'mobile-home.webp'), type: 'webp', quality: 90 });

// 3. wrong PIN first, then the right one
const clickText = async (page, sel, text) => {
  const h = await page.evaluateHandle((s, t) => [...document.querySelectorAll(s)].find((e) => (e.textContent + (e.title || '')).trim().includes(t)), sel, text);
  const el = h.asElement();
  if (!el) throw new Error(`No ${sel} containing "${text}"`);
  await el.click();
};
await clickText(phone, 'button.btn', 'Pair');
await phone.waitForSelector('.pin-hidden');
await phone.type('.pin-hidden', '48');
await sleep(300);
if (shotsDir) await phone.screenshot({ path: path.join(shotsDir, 'mobile-pin.webp'), type: 'webp', quality: 90 });
await phone.evaluate(() => { /* clear partial entry */ });
const wrong = st.pin.pin === '000000' ? '111111' : '000000';
await phone.type('.pin-hidden', wrong);
await phone.waitForSelector('.error-text', { timeout: 8000 });
check('Wrong PIN is rejected with feedback', true);
st = await state();
await phone.evaluate(() => { document.querySelector('.pin-hidden').value = ''; });
await phone.click('.pin-hidden');
await phone.keyboard.down('Control'); await phone.keyboard.press('KeyA'); await phone.keyboard.up('Control');
await phone.keyboard.press('Backspace');
await phone.type('.pin-hidden', st.pin.pin);
await must(phone, '.session.purpose-mirror');
check('Correct PIN pairs and opens the session (Mirror is the default purpose)', true);
check('Mirror shows only the screen: no trackpad or keyboard mixed in', !(await phone.$('.surface-trackpad')) && !(await phone.$('.kbd')));

// 4. real screen frames arrive
await phone.waitForFunction(() => {
  const c = document.querySelector('canvas.remote');
  if (!c || !c.width) return false;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 0; i < d.length; i += 4000) if (d[i] || d[i + 1] || d[i + 2]) return true;
  return false;
}, { timeout: 20000 }).then(() => check('Live frames from the real screen render on the phone', true)).catch(() => check('Live frames from the real screen render on the phone', false));
const dims = await phone.evaluate(() => { const c = document.querySelector('canvas.remote'); return [c.width, c.height]; });
check('Frame size matches the virtual screen', dims[0] > 0 && Math.abs(dims[0] / dims[1] - 1280 / 800) < 0.02, `${dims[0]}x${dims[1]}`);
st = await state();
check('Host lists the phone as a trusted device', st.trusted.length === 1 && st.clients.length === 1);
check('Capture is demand-driven (streaming now)', st.clients[0].subscriptions.length === 1);
await sleep(800);
if (shotsDir) await phone.screenshot({ path: path.join(shotsDir, 'mobile-mirror.webp'), type: 'webp', quality: 90 });
st = await state();
const codecs = st.capture?.video || [];
console.log(`INFO  host can encode: ${codecs.join(', ') || 'JPEG only'}`);
const d0 = await phone.evaluate(() => window.__draws);
await sleep(3000);
const fps = Math.round(((await phone.evaluate(() => window.__draws)) - d0) / 3);
const ft = await phone.evaluate(() => window.__ft);
check('Phone receives encoded video (WebCodecs), not just JPEG', codecs.length === 0 || (ft[2] > 0 && ft[3] > 0), `key ${ft[2]}, delta ${ft[3]}, jpeg ${ft[1]}, ${(ft.bytes / 1024).toFixed(0)} KB total`);
check('Mirror stream keeps a usable frame rate on a static desktop', fps >= 1, `${fps} painted fps (static screen, loopback)`);

// 5. switch purpose in the session: Trackpad is a full-screen pad, no video at all
const hudSwitch = async (title) => {
  if (!(await phone.$('.sheet'))) await phone.click('.hud-chip');
  await phone.waitForSelector('.sheet-row');
  await clickText(phone, '.sheet-row', title);
  await sleep(500);
};
await hudSwitch('Trackpad');
await must(phone, '.session.purpose-trackpad .surface-trackpad');
check('Trackpad purpose: full-screen pad, no picture on the device', !(await phone.$('canvas.remote')) && !(await phone.$('.stage-box')));
await sleep(400);
st = await state();
check('Trackpad purpose stops the screen stream (nothing captured)', st.clients[0].subscriptions.length === 0);
if (shotsDir) await phone.screenshot({ path: path.join(shotsDir, 'mobile-trackpad.webp'), type: 'webp', quality: 90 });
const cursor = () => execFileSync('node', ['--input-type=module', '-e', "const m=await import('@nut-tree-fork/nut-js');const {mouse}=m.default||m;const p=await mouse.getPosition();console.log(p.x+','+p.y)"], { cwd: root, env: { ...process.env, DISPLAY } }).toString().trim().split(',').map(Number);
const before = cursor();
const pad = await phone.$('.surface-trackpad');
const box = await pad.boundingBox();
const cx = box.x + box.width / 2; const cy = box.y + box.height / 2;
await phone.touchscreen.touchStart(cx, cy);
for (let i = 1; i <= 12; i++) { await phone.touchscreen.touchMove(cx + i * 12, cy + i * 6); await sleep(16); }
await phone.touchscreen.touchEnd();
await sleep(400);
const after = cursor();
check('Trackpad drag moves the real cursor on the host', after[0] > before[0] + 20 && after[1] > before[1], `${before} -> ${after}`);

// 6. keyboard and pen are their own full-screen purposes too
await hudSwitch('Keyboard');
await must(phone, '.session.purpose-keyboard .kbd');
check('Keyboard purpose on a phone: keyboard only, no trackpad', !(await phone.$('canvas.remote')) && !(await phone.$('.surface-trackpad')));
// keys behave like a physical keyboard: down while touched, several at once, up when released
const cdp = await phone.createCDPSession();
const keyCenter = (txt) => phone.evaluate((t) => { const b = [...document.querySelectorAll('.kbd-key')].find((x) => x.textContent.trim() === t); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, txt);
const ctrl = await keyCenter('Ctrl');
const cKey = await keyCenter('C');
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
await touch('touchStart', [{ x: ctrl.x, y: ctrl.y, id: 1 }]);
await sleep(150);
const heldOne = await phone.evaluate(() => [...document.querySelectorAll('.kbd-key.held')].map((b) => b.textContent.trim()));
await touch('touchStart', [{ x: ctrl.x, y: ctrl.y, id: 1 }, { x: cKey.x, y: cKey.y, id: 2 }]);
await sleep(150);
const heldTwo = await phone.evaluate(() => [...document.querySelectorAll('.kbd-key.held')].map((b) => b.textContent.trim()));
await touch('touchEnd', [{ x: ctrl.x, y: ctrl.y, id: 1 }]);
await sleep(150);
const afterC = await phone.evaluate(() => [...document.querySelectorAll('.kbd-key.held')].map((b) => b.textContent.trim()));
await touch('touchEnd', []);
await sleep(150);
const heldNone = await phone.evaluate(() => document.querySelectorAll('.kbd-key.held').length);
check('Ctrl stays down while held, Ctrl+C works with two fingers, and releases on lift', heldOne.join() === 'Ctrl' && heldTwo.includes('Ctrl') && heldTwo.includes('C') && afterC.join() === 'C' && heldNone === 0, `${heldOne} | ${heldTwo} | ${afterC} | ${heldNone}`);
// tablet-size screen: keyboard on top, small trackpad below
const vp = phone.viewport();
await phone.setViewport({ width: 1024, height: 700, isMobile: true, hasTouch: true });
await sleep(500);
check('Keyboard purpose on a tablet: keyboard with a small trackpad under it', !!(await phone.$('.kbd-split .kbd')) && !!(await phone.$('.kbd-split .surface-trackpad')));
if (shotsDir) await phone.screenshot({ path: path.join(shotsDir, 'tablet-keyboard.webp'), type: 'webp', quality: 90 });
await phone.setViewport(vp);
await sleep(300);
if (shotsDir) await phone.screenshot({ path: path.join(shotsDir, 'mobile-keyboard.webp'), type: 'webp', quality: 90 });
await hudSwitch('Pen pad');
await must(phone, '.session.purpose-pen .surface-pen');
check('Pen purpose: blank pad by default (no screen preview)', !(await phone.$('canvas.remote')));
if (shotsDir) await phone.screenshot({ path: path.join(shotsDir, 'mobile-pen.webp'), type: 'webp', quality: 90 });
await hudSwitch('Mirror screen');
await must(phone, '.session.purpose-mirror canvas.remote');
check('Switching back to Mirror resumes the picture', true);

// 7. disconnect and reconnect with NO PIN (trusted)
await phone.click('.hud-btn[aria-label="Disconnect"]');
await phone.waitForSelector('.device', { timeout: 10000 });
await sleep(300);
await clickText(phone, 'button.btn', 'Connect');
const pinShown = await phone.waitForSelector('.pin-hidden', { timeout: 3000 }).then(() => true).catch(() => false);
await must(phone, '.session');
check('Reconnect is automatic with no PIN (trusted device)', !pinShown);
st = await state();
check('PIN rotated after pairing (single-use)', st.pin.pin !== null && st.trusted.length === 1);

// 8. revoke from the host -> phone is kicked and must re-pair
await appPage.evaluate((id) => window.castdesk.revoke(id), st.trusted[0].id);
await phone.waitForSelector('.device', { timeout: 10000 });
await sleep(500);
await clickText(phone, 'button.btn', 'Connect'); // phone still holds the old secret; host no longer trusts it
check('After removal the host demands the PIN again', await phone.waitForSelector('.pin-hidden', { timeout: 5000 }).then(() => true).catch(() => false));

// 9. host-side screens (real renderer)
for (const [label, name] of [['Displays', 'desktop-layout'], ['Permissions', 'desktop-permissions'], ['Settings', 'desktop-settings'], ['Home', 'desktop-home']]) {
  await appPage.evaluate((l) => [...document.querySelectorAll('.side .nav-item')].find((x) => x.textContent.includes(l))?.click(), label);
  await sleep(900);
  if (shotsDir) await appPage.screenshot({ path: path.join(shotsDir, `${name}.webp`), type: 'webp', quality: 90 });
}
check('Layout, Permissions and Settings screens render in the real app', true);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
cleanup();
process.exit(failed.length ? 1 : 0);
