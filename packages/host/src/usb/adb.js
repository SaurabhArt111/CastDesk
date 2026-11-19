import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DEFAULT_PORT } from '@castdesk/shared';
import { installedAdbPath } from './platform-tools.js';

const run = (bin, args, timeout = 8000) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { timeout, windowsHide: true }, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve(stdout)));
  });

/** Locate adb: explicit path, ANDROID_HOME/SDK, then PATH. */
export function findAdb(explicit, toolsDir) {
  const exe = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const candidates = [
    explicit,
    toolsDir && installedAdbPath(toolsDir),
    process.env.ANDROID_HOME && path.join(process.env.ANDROID_HOME, 'platform-tools', exe),
    process.env.ANDROID_SDK_ROOT && path.join(process.env.ANDROID_SDK_ROOT, 'platform-tools', exe),
    path.join(os.homedir(), 'Android', 'Sdk', 'platform-tools', exe),
    path.join(os.homedir(), 'Library', 'Android', 'sdk', 'platform-tools', exe),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'platform-tools', exe),
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'adb';
}

/**
 * USB connection for Android: when a phone with USB debugging is plugged in,
 * run `adb reverse tcp:PORT tcp:PORT` so the phone's own localhost:PORT reaches
 * this PC. The phone then connects to 127.0.0.1 - over the USB cable, with no
 * Wi-Fi, router or internet involved. (USB *tethering* needs no adb at all: the
 * tethered link is just another network interface and is found by Discovery.)
 */
export class AdbForwarder extends EventEmitter {
  constructor({ adbPath, toolsDir, intervalMs = 3000 } = {}) {
    super();
    this.toolsDir = toolsDir;
    this.adb = findAdb(adbPath, toolsDir);
    this.lastError = null;
    this.intervalMs = intervalMs;
    this.known = new Map();
    this.busy = false;
    this.lastList = '';
  }

  /** Re-resolve the adb binary (after the in-app install put one in toolsDir). */
  locate() {
    this.adb = findAdb(undefined, this.toolsDir);
    return this.adb;
  }

  async available() {
    try {
      await run(this.adb, ['version']);
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = e.code === 'ENOENT' ? 'adb is not installed' : String(e.stderr || e.message || e).trim().split('\n')[0];
      return false;
    }
  }

  static parseDevices(out) {
    return out
      .split('\n')
      .slice(1)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [serial, state, ...rest] = l.split(/\s+/);
        const model = (rest.find((r) => r.startsWith('model:')) || '').slice(6) || serial;
        return { serial, state, model };
      });
  }

  async start(port) {
    this.port = port;
    this.stop();
    // A stale adb server from another version (Android Studio, a vendor tool) makes `adb devices`
    // fail silently. Starting it explicitly gives a clean daemon of *our* adb.
    await run(this.adb, ['start-server'], 15000).catch(() => {});
    this.#tick();
    this.timer = setInterval(() => this.#tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }

  /** Re-check connected phones right now (Refresh button). */
  scan() {
    return this.#tick();
  }

  async #tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      const devices = AdbForwarder.parseDevices(await run(this.adb, ['devices', '-l']));
      const key = JSON.stringify(devices);
      if (key !== this.lastList) {
        this.lastList = key;
        this.emit('list', devices);
      }
      const online = new Set();
      for (const d of devices) {
        if (d.state === 'unauthorized') {
          this.emit('unauthorized', d);
          continue;
        }
        if (d.state !== 'device') continue;
        online.add(d.serial);
        if (!this.known.has(d.serial)) {
          await this.reverse(d.serial);
          this.known.set(d.serial, d);
          this.emit('device', d);
        }
      }
      for (const serial of [...this.known.keys()]) {
        if (!online.has(serial)) {
          this.emit('gone', this.known.get(serial));
          this.known.delete(serial);
        }
      }
      this.lastError = null;
    } catch (e) {
      this.lastError = String(e.stderr || e.message || e).trim().split('\n')[0];
      if (/version|daemon|server/i.test(this.lastError)) run(this.adb, ['kill-server']).catch(() => {}); // next tick restarts it
    } finally {
      this.busy = false;
    }
  }

  /** The phone always dials 127.0.0.1:DEFAULT_PORT; map it to wherever the host really listens. */
  reverse(serial) {
    return run(this.adb, ['-s', serial, 'reverse', `tcp:${DEFAULT_PORT}`, `tcp:${this.port}`]);
  }

  /** Open the CastDesk Android app and tell it to connect through the USB tunnel. */
  launchApp(serial) {
    return run(this.adb, [
      '-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW',
      '-d', `castdesk://connect?host=127.0.0.1\\&port=${DEFAULT_PORT}\\&transport=usb`,
    ]);
  }
}
