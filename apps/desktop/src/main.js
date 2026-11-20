import { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, session, desktopCapturer, shell, safeStorage, dialog, Notification } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { HostService, DisplayManager, AdbForwarder, setAutostart, installPlatformTools, WindowsVirtualDriver } from '@castdesk/host';
import { DEFAULT_SETTINGS } from '@castdesk/shared';
import { getPermissions, fixPermission } from './permissions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const hiddenLaunch = process.argv.includes('--hidden');
const noSandbox = process.argv.includes('--no-sandbox');

/* ----------------------------- settings ----------------------------- */
const HOST_DEFAULTS = {
  ...DEFAULT_SETTINGS,
  allowControl: true,
  advertise: true,
  firstRunDone: false,
  virtualCommands: { create: '', remove: '' },
};
let settings = { ...HOST_DEFAULTS };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try {
    settings = { ...HOST_DEFAULTS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    /* first run */
  }
}
const saveSettings = () => fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));

/* ------------------------------- state ------------------------------- */
let host;
let adb;
let captureWin = null;
let win = null;
let tray = null;
let quitting = false;
let pendingCaptureNativeId = null;
const usbDevices = new Map();
let usbList = []; // every phone adb can see, including ones still waiting for "Allow USB debugging"
let iddInstall = { state: 'idle', pct: 0, error: null };
let iddDriver = null;
let adbAvailable = false;
let adbInstall = { state: 'idle', pct: 0, error: null };
let adbError = null;

const webRoot = () => (isDev ? path.resolve(here, '../../client/dist') : path.join(process.resourcesPath, 'client'));
const iconPath = () => path.join(here, '..', 'build', 'icon.png');

function secretCodec() {
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  return {
    encode: (s) => safeStorage.encryptString(s).toString('base64'),
    decode: (s) => safeStorage.decryptString(Buffer.from(s, 'base64')),
  };
}

/** Electron reports DIPs; capture and input use physical pixels on Windows. */
function nativeDisplays() {
  const primary = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, i) => {
    const r = process.platform === 'win32' ? screen.dipToScreenRect(null, d.bounds) : d.bounds;
    return {
      nativeId: String(d.id),
      name: d.label && d.label !== 'Unknown' ? d.label : `Display ${i + 1}`,
      x: r.x, y: r.y, w: r.width, h: r.height,
      scale: d.scaleFactor,
      primary: d.id === primary,
    };
  });
}

async function approveControl(device) {
  if (!settings.requireApprovalForControl) return true;
  const parent = win && !win.isDestroyed() ? win : undefined;
  const ask = dialog.showMessageBox(parent, {
    type: 'question',
    buttons: ['Allow control', 'View only'],
    defaultId: 1,
    cancelId: 1,
    title: 'New device paired',
    message: `Allow “${device.name}” to control this computer?`,
    detail: 'It will be able to move the mouse and type. You can change this any time in CastDesk.',
  });
  const timeout = new Promise((r) => setTimeout(() => r({ response: 1 }), 60_000));
  return (await Promise.race([ask, timeout])).response === 0;
}

/* ------------------------------ host service ------------------------------ */
async function startHost() {
  host = new HostService({
    dataDir: app.getPath('userData'),
    name: settings.deviceName || os.hostname(),
    port: settings.port,
    version: app.getVersion(),
    webRoot: webRoot(),
    codec: secretCodec(),
    settings: {
      allowIncoming: settings.allowIncoming,
      allowControl: settings.allowControl,
      advertise: settings.advertiseOnNetwork && settings.advertise,
      defaultAllowControl: settings.defaultAllowControl,
    },
    displays: (store) => {
      iddDriver = process.platform === 'win32' ? new WindowsVirtualDriver({ dir: path.join(app.getPath('userData'), 'tools', 'display-driver') }) : null;
      return new DisplayManager({ store, nativeList: async () => nativeDisplays(), virtualCommands: settings.virtualCommands, driver: iddDriver });
    },
    approveControl,
    needsApproval: () => settings.requireApprovalForControl,
  });
  const push = throttle(pushState, 120);
  for (const ev of ['pin', 'trusted', 'clients', 'displays', 'ready', 'source', 'source-status']) host.on(ev, push);
  host.on('peers', (p) => win?.webContents.send('peers', p));
  host.on('log', (lvl, msg) => console.log(`[host:${lvl}] ${msg}`));
  host.on('paired', (d) => new Notification({ title: 'Device paired', body: `${d.name} can now connect to this computer without a PIN.` }).show());
  host.on('client', (c) => c.trusted && new Notification({ title: 'Connected', body: `${c.device.name} connected.` }).show());
  await host.start();
  for (const ev of ['display-added', 'display-removed', 'display-metrics-changed']) screen.on(ev, () => host.displays.refresh());
  startAdb();
  updateTrayMenu();
}

async function startAdb() {
  adb?.stop();
  adb = null;
  if (!settings.usbAutoForward) return;
  adb = new AdbForwarder({ toolsDir: path.join(app.getPath('userData'), 'tools') });
  adbAvailable = await adb.available();
  adbError = adb.lastError;
  adb.on('device', (d) => {
    usbDevices.set(d.serial, d);
    pushState();
    new Notification({ title: 'Phone connected over USB', body: `${d.model} is linked through the cable.` }).show();
    adb.launchApp(d.serial).catch(() => {});
  });
  adb.on('list', (list) => {
    usbList = list;
    pushState();
  });
  adb.on('gone', (d) => {
    usbDevices.delete(d.serial);
    pushState();
  });
  if (adbAvailable) adb.start(host.port);
  pushState();
}

function buildState() {
  return {
    version: app.getVersion(),
    platform: process.platform,
    info: host.info(),
    pin: host.pin.snapshot(),
    trusted: host.store.list(),
    clients: host.clients(),
    displays: host.displays.current(),
    settings,
    inputAvailable: host.input.available,
    adb: { available: adbAvailable, error: adbError, install: adbInstall, enabled: settings.usbAutoForward, devices: [...usbDevices.values()], list: usbList.map((d) => ({ ...d, linked: usbDevices.has(d.serial) })) },
    caps: host.displays.capabilities(),
    capture: { ...host.sourceStatus, video: host.sourceCaps.video },
    idd: iddDriver ? { installed: iddDriver.installed(), install: iddInstall } : null,
  };
}
function pushState() {
  if (host && win && !win.isDestroyed()) win.webContents.send('state', buildState());
  updateTrayMenu();
}
function throttle(fn, ms) {
  let t = null;
  return () => {
    if (t) return;
    t = setTimeout(() => {
      t = null;
      fn();
    }, ms);
  };
}

/* -------------------------------- settings apply -------------------------------- */
async function applyAutostart() {
  if (process.platform === 'linux') {
    await setAutostart(settings.autostart, { exec: process.execPath, args: isDev ? [app.getAppPath()] : [], hidden: settings.startMinimized });
  } else {
    app.setLoginItemSettings({ openAtLogin: settings.autostart, openAsHidden: settings.startMinimized, args: settings.startMinimized ? ['--hidden'] : [] });
  }
}

async function setSettings(patch) {
  const prev = settings;
  settings = { ...settings, ...patch };
  saveSettings();
  host.configure({
    ...(patch.allowIncoming !== undefined && { allowIncoming: settings.allowIncoming }),
    ...(patch.allowControl !== undefined && { allowControl: settings.allowControl }),
    ...(patch.defaultAllowControl !== undefined && { defaultAllowControl: settings.defaultAllowControl }),
    ...(patch.advertise !== undefined && { advertise: settings.advertise }),
    ...(patch.deviceName && { name: settings.deviceName }),
  });
  if ('autostart' in patch || 'startMinimized' in patch) await applyAutostart().catch((e) => console.warn('autostart', e.message));
  if ('usbAutoForward' in patch && patch.usbAutoForward !== prev.usbAutoForward) await startAdb();
  if ('virtualCommands' in patch) host.displays.setVirtualCommands(settings.virtualCommands);
  pushState();
  return settings;
}

/* -------------------------------------- window -------------------------------------- */
function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 360,
    minHeight: 560,
    show: false,
    backgroundColor: '#0d2a2d',
    title: 'CastDesk',
    icon: fs.existsSync(iconPath()) ? iconPath() : undefined,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: !noSandbox ? true : false,
      nodeIntegration: false,
    },
  });
  win.removeMenu?.();
  const index = path.join(webRoot(), 'index.html');
  if (isDev && process.env.CASTDESK_DEV_URL) win.loadURL(process.env.CASTDESK_DEV_URL);
  else win.loadFile(index);
  win.once('ready-to-show', () => {
    if (!(hiddenLaunch && settings.startMinimized)) win.show();
  });
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault(); // keep serving in the tray
      win.hide();
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://') && !url.startsWith(process.env.CASTDESK_DEV_URL || 'file://')) e.preventDefault();
  });
}

/**
 * Screen capture + video encoding lives in its own hidden window so it never competes with the
 * UI for a thread, and keeps running at full speed while the main window is hidden in the tray.
 */
function createCaptureWindow() {
  if (captureWin && !captureWin.isDestroyed()) return;
  captureWin = new BrowserWindow({
    show: false,
    width: 320,
    height: 240,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: !noSandbox,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  const q = { capture: '1', port: String(host.port), token: host.sourceToken };
  if (isDev && process.env.CASTDESK_DEV_URL) {
    const u = new URL(process.env.CASTDESK_DEV_URL);
    for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    captureWin.loadURL(u.toString());
  } else {
    captureWin.loadFile(path.join(webRoot(), 'index.html'), { query: q });
  }
  captureWin.webContents.on('render-process-gone', () => {
    captureWin = null;
    setTimeout(() => !quitting && host && createCaptureWindow(), 1000);
  });
  captureWin.on('closed', () => {
    captureWin = null;
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) createWindow();
  win.show();
  win.focus();
}

function updateTrayMenu() {
  if (!tray || !host) return;
  const clients = host.clients().length;
  tray.setToolTip(`CastDesk — ${clients ? `${clients} connected` : 'ready'}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open CastDesk', click: showWindow },
      { type: 'separator' },
      { label: `PIN: ${host.pin.pin.slice(0, 3)} ${host.pin.pin.slice(3)}`, enabled: false },
      { label: 'New PIN', click: () => host.pin.rotate('manual') },
      { type: 'separator' },
      { label: 'Accept connections', type: 'checkbox', checked: settings.allowIncoming, click: (i) => setSettings({ allowIncoming: i.checked }) },
      { label: 'Allow remote control', type: 'checkbox', checked: settings.allowControl, click: (i) => setSettings({ allowControl: i.checked }) },
      { label: 'Start with computer', type: 'checkbox', checked: settings.autostart, click: (i) => setSettings({ autostart: i.checked }) },
      { type: 'separator' },
      { label: 'Quit CastDesk', click: () => { quitting = true; app.quit(); } },
    ]),
  );
}

function createTray() {
  let img = fs.existsSync(iconPath()) ? nativeImage.createFromPath(iconPath()) : nativeImage.createEmpty();
  if (!img.isEmpty()) img = img.resize({ width: process.platform === 'darwin' ? 18 : 22 });
  tray = new Tray(img);
  tray.on('click', showWindow);
}

/* ----------------------------------- IPC ----------------------------------- */
function registerIpc() {
  ipcMain.handle('app:openExternal', (_e, url) => (typeof url === 'string' && /^https:\/\//.test(url) ? shell.openExternal(url) : undefined));
  ipcMain.on('app:hostname', (e) => { e.returnValue = os.hostname(); });
  ipcMain.handle('state:get', () => buildState());
  ipcMain.handle('peers:get', () => host.discovery.peers());
  ipcMain.handle('settings:set', (_e, patch) => setSettings(sanitizeSettings(patch)));
  ipcMain.handle('pin:rotate', () => host.pin.rotate('manual'));
  ipcMain.handle('scan:refresh', async () => {
    host.discovery.refresh();
    if (adb) adb.locate();
    adbAvailable = adb ? await adb.available() : false;
    adbError = adb?.lastError || null;
    if (adb && adbAvailable) {
      if (!adb.timer) adb.start(host.port);
      await adb.scan();
    }
    pushState();
    return true;
  });
  ipcMain.handle('display:project', async (_e, mode) => {
    try {
      await host.displays.project(String(mode));
      pushState();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('idd:install', async () => {
    if (!iddDriver) return { ok: false, error: 'Only needed on Windows' };
    if (iddInstall.state === 'working') return { ok: false, error: 'Already installing' };
    iddInstall = { state: 'working', pct: 0, error: null };
    pushState();
    try {
      await iddDriver.install({ onProgress: (pct) => { iddInstall = { ...iddInstall, pct }; pushState(); } });
      iddInstall = { state: 'idle', pct: 0, error: null };
      pushState();
      return { ok: true };
    } catch (err) {
      iddInstall = { state: 'error', pct: 0, error: err.message };
      pushState();
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('usb:installAdb', async () => {
    if (adbInstall.state === 'downloading') return { ok: false, error: 'Already downloading' };
    adbInstall = { state: 'downloading', pct: 0, error: null };
    pushState();
    try {
      await installPlatformTools(path.join(app.getPath('userData'), 'tools'), {
        onProgress: (pct) => {
          adbInstall = { ...adbInstall, pct };
          pushState();
        },
      });
      adbInstall = { state: 'idle', pct: 0, error: null };
      if (!settings.usbAutoForward) await setSettings({ usbAutoForward: true });
      else await startAdb();
      return { ok: true };
    } catch (err) {
      adbInstall = { state: 'error', pct: 0, error: err.message };
      pushState();
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('trusted:revoke', (_e, id) => host.revoke(String(id)));
  ipcMain.handle('trusted:perms', (_e, id, perms) => host.setPermissions(String(id), perms.filter((p) => ['view', 'control'].includes(p))));
  ipcMain.handle('client:disconnect', (_e, id) => host.disconnect(String(id)));
  ipcMain.handle('layout:apply', async (_e, items) => {
    try {
      await host.displays.applyLayout(items.map((i) => ({ id: Number(i.id), x: Math.round(i.x), y: Math.round(i.y) })));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ipcMain.handle('permissions:get', () => getPermissions({ host, settings, app }));
  ipcMain.handle('permissions:fix', (_e, id) => fixPermission(id, { host, app }));
  ipcMain.handle('capture:prepare', async (_e, displayId) => {
    const target = host.displays.items.find((d) => d.id === Number(displayId));
    if (!target) return { ok: false, error: 'Display not found' };
    const perm = process.platform === 'darwin' ? (await import('electron')).systemPreferences.getMediaAccessStatus('screen') : 'granted';
    if (perm !== 'granted') {
      desktopCapturer.getSources({ types: ['screen'] }).catch(() => {}); // triggers the macOS prompt
      return { ok: false, error: 'Allow Screen Recording for CastDesk in System Settings → Privacy & Security, then reconnect.' };
    }
    pendingCaptureNativeId = target.nativeId;
    return { ok: true };
  });
  ipcMain.handle('window:moveToDisplay', (_e, index) => {
    const d = screen.getAllDisplays()[Number(index)] || screen.getPrimaryDisplay();
    win.setBounds(d.bounds);
    win.setFullScreen(true);
  });
}

/** Only accept known, correctly typed settings from the renderer. */
function sanitizeSettings(p) {
  const out = {};
  const bool = ['autostart', 'startMinimized', 'allowIncoming', 'allowControl', 'defaultAllowControl', 'requireApprovalForControl', 'advertise', 'usbAutoForward', 'advertiseOnNetwork'];
  for (const k of bool) if (typeof p[k] === 'boolean') out[k] = p[k];
  if (typeof p.deviceName === 'string') out.deviceName = p.deviceName.slice(0, 40);
  if (Number.isInteger(p.port) && p.port >= 1024 && p.port <= 65535) out.port = p.port;
  if (p.virtualCommands && typeof p.virtualCommands === 'object') {
    out.virtualCommands = { create: String(p.virtualCommands.create || '').slice(0, 500), remove: String(p.virtualCommands.remove || '').slice(0, 500) };
  }
  return out;
}

/* ----------------------------------- boot ----------------------------------- */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { /* stay alive in the tray */ });
  app.on('activate', showWindow);

  app.whenReady().then(async () => {
    loadSettings();
    const ses = session.defaultSession;
    // Screen capture for our own window only: pick the display the host asked for.
    ses.setDisplayMediaRequestHandler(
      async (_request, callback) => {
        const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
        const pick = sources.find((s) => s.display_id === pendingCaptureNativeId) || sources[0];
        callback(pick ? { video: pick } : {});
      },
      { useSystemPicker: false },
    );
    ses.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'display-capture', 'fullscreen'].includes(permission)));

    registerIpc();
    await startHost();
    createTray();
    createCaptureWindow();
    createWindow();

    if (!settings.firstRunDone) {
      settings.firstRunDone = true;
      saveSettings();
      await applyAutostart().catch(() => {});
      new Notification({ title: 'CastDesk will start with your computer', body: 'So your devices reconnect automatically. Change this in Preferences.' }).show();
    }
  });

  app.on('will-quit', () => {
    adb?.stop();
    host?.stop();
  });
}
