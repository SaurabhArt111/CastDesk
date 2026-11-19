/**
 * Marketing screenshots of the REAL desktop UI populated with sample data
 * (nearby devices, paired devices, three displays incl. an extended one).
 * The client is loaded in Chrome with a fake `window.paneo` bridge - the same
 * surface the Electron preload exposes - so every pixel is the shipping UI.
 *
 *   node scripts/screenshots-mock.mjs apps/site/public/screens
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || 'screens');
fs.mkdirSync(out, { recursive: true });
const dist = path.join(root, 'apps/client/dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let f = path.join(dist, req.url === '/' ? 'index.html' : decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(f)) f = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(4999, r));
// a stand-in capture endpoint so the host panel shows "Screen capture: idle" like the real app
const fakeSource = new WebSocketServer({ port: 7420 });

const now = Date.now();
const mock = {
  platform: 'win32',
  hostname: 'STUDIO-PC',
  state: {
    version: '1.0.0', platform: 'win32',
    info: { id: 'a1b2c3d4e5f60789', name: 'STUDIO-PC', platform: 'win32', port: 7420, sourceToken: 'x', addresses: [
      { address: '169.254.46.12', iface: 'Ethernet 3 (USB RNDIS)', usb: true },
      { address: '192.168.1.24', iface: 'Wi-Fi', usb: false },
    ] },
    pin: { pin: '482913', expiresAt: now + 4 * 60 * 1000 + 22 * 1000, attemptsLeft: 5 },
    trusted: [
      { id: 'p2', name: 'iPad Air', platform: 'ios', perms: ['view', 'control'], pairedAt: now - 9 * 86400e3, lastSeen: now - 3600e3, arrangement: { extend: true, x: 2560, y: 0 } },
      { id: 'p3', name: 'Living-room TV', platform: 'web', perms: ['view'], pairedAt: now - 20 * 86400e3, lastSeen: now - 86400e3 * 2, arrangement: null },
    ],
    displays: [
      { id: 0, name: 'Main 4K', x: 0, y: 0, w: 2560, h: 1440, primary: true, virtual: false, scale: 1.5 },
      { id: 1, name: 'Side monitor', x: -1920, y: 180, w: 1920, h: 1080, primary: false, virtual: false, scale: 1 },
      { id: 2, name: 'iPad Air', x: 2560, y: 0, w: 1640, h: 1180, primary: false, virtual: true, owner: 'p2', scale: 1 },
    ],
    settings: { deviceName: '', autostart: true, startMinimized: true, autoConnectTrusted: true, advertiseOnNetwork: true, allowIncoming: true, requireApprovalForControl: true, defaultAllowControl: true, usbAutoForward: true, port: 7420, advertise: true, allowControl: true, virtualCommands: { create: '', remove: '' } },
    inputAvailable: true,
    adb: { available: true, devices: [{ serial: 'ABC', model: 'Pixel_9_Pro' }], list: [{ serial: 'ABC', state: 'device', model: 'Pixel_9_Pro', linked: true }, { serial: 'XYZ', state: 'unauthorized', model: 'Galaxy_Tab_S9', linked: false }] },
    caps: { provider: 'win32-displaysettings', arrange: true, virtual: false, note: 'Repositioning uses ChangeDisplaySettingsEx. A virtual monitor needs an installed Indirect Display Driver.' },
  },
  peers: [
    { id: 'n2', name: 'MacBook Pro', platform: 'darwin', port: 7420, addresses: ['192.168.1.52'], via: 'mdns' },
    { id: 'n3', name: 'Studio laptop', platform: 'win32', port: 7420, addresses: ['192.168.1.67'], via: 'mdns' },
  ],
  permissions: [
    { id: 'firewall', title: 'Windows Firewall', description: 'Other devices connect to this PC on TCP 7420 and find it with mDNS (UDP 5353) and UDP 7421. The installer adds the rule.', status: 'granted', action: null },
    { id: 'uac', title: 'Controlling elevated windows', description: 'Windows blocks input into apps running as Administrator unless Paneo is also run as administrator. Mirroring always works.', status: 'info', action: null },
    { id: 'input', title: 'Remote input', description: 'Mouse, keyboard, touch and pen input from paired devices can be injected on this computer.', status: 'granted', action: null },
    { id: 'autostart', title: 'Start with this computer', description: 'Paneo runs quietly in the tray after you sign in so devices reconnect automatically.', status: 'granted', action: null },
  ],
};

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.5 });
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: process.env.LIGHT ? 'light' : 'dark' }]);
await page.evaluateOnNewDocument((m) => {
  localStorage.setItem('paneo.hosts', JSON.stringify({
    n2: { id: 'n2', name: 'MacBook Pro', platform: 'darwin', secret: 'x', addresses: ['192.168.1.52'], port: 7420, lastConnected: Date.now() - 3600e3, auto: true },
  }));
  localStorage.setItem('paneo.prefs', JSON.stringify({ autoConnectTrusted: false }));
  const noop = () => () => {};
  window.paneo = {
    platform: m.platform, hostname: m.hostname,
    getState: async () => m.state, onState: noop,
    getPeers: async () => m.peers, onPeers: (cb) => { setTimeout(() => cb(m.peers), 50); return () => {}; },
    setSettings: async () => m.state.settings, rotatePin: async () => {}, refreshScan: async () => true, revoke: async () => {}, setPermissions: async () => {},
    disconnectClient: async () => {}, applyLayout: async () => ({ ok: true }), getPermissions: async () => m.permissions,
    fixPermission: async () => ({ ok: true }), prepareCapture: async () => ({ ok: false }), moveToDisplay: async () => {}, openExternal: () => {},
  };
}, mock);
await page.goto('http://127.0.0.1:4999/', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 700));
const shot = (name) => page.screenshot({ path: path.join(out, `${name}.webp`), type: 'webp', quality: 90 });
const nav = async (label) => {
  await page.evaluate((l) => [...document.querySelectorAll('button')].find((b) => b.textContent.includes(l))?.click(), label);
  await new Promise((r) => setTimeout(r, 600));
};
await shot('desktop-home');
await nav('Display layout'); await shot('desktop-layout');
await nav('Back'); await nav('Permissions'); await shot('desktop-permissions');
await nav('Back'); await nav('Settings'); await shot('desktop-settings');
await browser.close();
server.close();
fakeSource.close();
console.log('wrote mock screenshots to', out);
