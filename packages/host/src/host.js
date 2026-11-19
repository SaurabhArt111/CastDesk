import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { WebSocketServer } from 'ws';
import { DEFAULT_PORT, DEFAULT_SETTINGS, MSG, PROTOCOL_VERSION, FRAME_HEADER_BYTES, randomHex, parseMessage } from '@paneo/shared';
import { TrustStore } from './trust-store.js';
import { PinManager } from './pin.js';
import { Discovery } from './discovery.js';
import { ClientSession } from './session.js';
import { DisplayManager } from './displays/index.js';
import { InputInjector } from './input/injector.js';
import { getLocalAddresses } from './net-info.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain',
};
const MAX_BUFFERED = 1.5 * 1024 * 1024; // drop frames for clients whose socket backs up

/**
 * The host: owns the HTTP/WebSocket server, pairing PIN, trust store,
 * discovery, display list and input injection. The capture source (Electron
 * renderer) connects to `/source` on loopback and pushes JPEG frames, which
 * are fanned out to subscribed viewers. Nothing here needs the internet.
 */
export class HostService extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.dataDir
   * @param {string} [opts.name]
   * @param {number} [opts.port]
   * @param {string} [opts.webRoot]   static dir for the browser/PWA viewer
   * @param {object} [opts.codec]     secret encryption (Electron safeStorage)
   * @param {object|((store)=>object)} [opts.displays]  DisplayManager, or a factory receiving the TrustStore
   * @param {object} [opts.input]     InputInjector instance
   * @param {(device)=>Promise<boolean>} [opts.approveControl]
   */
  constructor(opts) {
    super();
    this.opts = opts;
    this.name = opts.name || os.hostname();
    this.platform = opts.platform || process.platform;
    this.version = opts.version || '1.0.0';
    this.store = new TrustStore(opts.dataDir, { codec: opts.codec });
    this.pin = new PinManager();
    this.displays = typeof opts.displays === 'function' ? opts.displays(this.store) : opts.displays || new DisplayManager({ store: this.store });
    this.input = opts.input || new InputInjector();
    this.discovery = new Discovery();
    this.settings = {
      allowIncoming: true,
      allowControl: true,
      advertise: true,
      defaultAllowControl: DEFAULT_SETTINGS.defaultAllowControl,
      ...opts.settings,
    };
    this.sessions = new Set();
    this.source = null;
    this.sourceToken = randomHex(16);
    this.lastFrames = new Map();
    this.failures = new Map();
    this.port = 0;

    this.pin.on('change', (snap, reason) => this.emit('pin', snap, reason));
    this.store.on('change', () => this.emit('trusted', this.store.list()));
    this.displays.on('change', () => {
      this.#broadcast({ t: MSG.DISPLAYS, list: this.displays.current() });
      this._demandChanged();
      this.emit('displays', this.displays.current());
    });
    this.discovery.on('peers', (p) => this.emit('peers', p));
    this.discovery.on('error', (e) => this.emit('log', 'warn', `discovery: ${e.message}`));
  }

  /* ------------------------------ lifecycle ------------------------------ */

  async start() {
    await this.displays.refresh();
    this.server = http.createServer((req, res) => this.#http(req, res));
    this.clientWss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
    this.sourceWss = new WebSocketServer({ noServer: true, maxPayload: 32 * 1024 * 1024 });
    this.server.on('upgrade', (req, socket, head) => this.#upgrade(req, socket, head));

    const base = this.opts.port ?? DEFAULT_PORT;
    this.port = await this.#listen(base);
    this.#startDiscovery();
    this.emit('ready', this.info());
    return this.port;
  }

  #listen(base) {
    return new Promise((resolve, reject) => {
      let attempt = 0;
      const tryPort = (port) => {
        const onError = (err) => {
          if (err.code === 'EADDRINUSE' && base !== 0 && attempt < 10) {
            attempt++;
            tryPort(base + attempt);
          } else reject(err);
        };
        this.server.once('error', onError);
        this.server.listen(port, '0.0.0.0', () => {
          this.server.off('error', onError);
          resolve(this.server.address().port);
        });
      };
      tryPort(base);
    });
  }

  #startDiscovery() {
    if (this.opts.discovery === false) return;
    this.discovery.start({ id: this.store.hostId, name: this.name, platform: this.platform, port: this.port, advertise: this.settings.advertise });
  }

  async stop() {
    this.pin.stop();
    this.discovery.stop();
    for (const s of this.sessions) s.close('host-stopped');
    this.source?.close();
    for (const c of this.clientWss?.clients || []) c.terminate();
    for (const c of this.sourceWss?.clients || []) c.terminate();
    this.clientWss?.close();
    this.sourceWss?.close();
    if (this.server) {
      const closed = new Promise((r) => this.server.close(() => r()));
      this.server.closeAllConnections?.();
      await closed;
    }
  }

  /** Update live settings (from the UI). */
  configure(patch) {
    Object.assign(this.settings, patch);
    if ('advertise' in patch && this.port) this.#startDiscovery();
    if (patch.name) {
      this.name = patch.name;
      if (this.port) this.#startDiscovery();
    }
    if (patch.allowIncoming === false) for (const s of [...this.sessions]) s.close('not-accepting');
    if (patch.allowControl === false) for (const s of this.sessions) s.send({ t: MSG.PERM, perms: s.perms, control: false });
    if (patch.allowControl === true) for (const s of this.sessions) s.send({ t: MSG.PERM, perms: s.perms, control: s.canControl });
  }

  info() {
    return {
      id: this.store.hostId,
      name: this.name,
      platform: this.platform,
      version: this.version,
      protocol: PROTOCOL_VERSION,
      port: this.port,
      addresses: getLocalAddresses(),
      sourceToken: this.sourceToken,
    };
  }

  clients() {
    return [...this.sessions].map((s) => s.summary());
  }

  /* ------------------------------ trust admin ------------------------------ */

  revoke(deviceId) {
    for (const s of [...this.sessions]) if (s.device?.id === deviceId) s.close('revoked');
    return this.store.remove(deviceId);
  }

  setPermissions(deviceId, perms) {
    const rec = this.store.update(deviceId, { perms });
    for (const s of this.sessions) {
      if (s.device?.id === deviceId) {
        s.perms = perms;
        s.send({ t: MSG.PERM, perms, control: s.canControl });
      }
    }
    return rec;
  }

  disconnect(sessionId) {
    for (const s of this.sessions) if (s.id === sessionId) s.close('disconnected-by-host');
  }

  /* ---------------------------- HTTP + upgrade ---------------------------- */

  #http(req, res) {
    const url = new URL(req.url, 'http://x');
    const cors = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': '*' });
      return res.end();
    }
    if (url.pathname === '/api/info') {
      const { sourceToken, addresses, ...pub } = this.info();
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ app: 'paneo', ...pub }));
    }
    if (url.pathname === '/api/ping') {
      res.writeHead(200, cors);
      return res.end('pong');
    }
    this.#serveStatic(url.pathname, res);
  }

  #serveStatic(pathname, res) {
    const root = this.opts.webRoot;
    if (!root || !fs.existsSync(root)) {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('Paneo host is running. Open the Paneo app on your other device to connect.');
    }
    let rel = decodeURIComponent(pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    let file = path.normalize(path.join(root, rel));
    if (!file.startsWith(path.resolve(root))) {
      res.writeHead(403);
      return res.end();
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html'); // SPA fallback
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }

  #upgrade(req, socket, head) {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/ws') {
      this.clientWss.handleUpgrade(req, socket, head, (ws) => new ClientSession(this, ws, req));
    } else if (url.pathname === '/source') {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
      if (!local || url.searchParams.get('token') !== this.sourceToken) {
        socket.destroy();
        return;
      }
      this.sourceWss.handleUpgrade(req, socket, head, (ws) => this.#attachSource(ws));
    } else {
      socket.destroy();
    }
  }

  /* ------------------------------ capture source ------------------------------ */

  #attachSource(ws) {
    this.source?.close();
    this.source = ws;
    ws.on('message', (data, isBinary) => {
      if (isBinary) this.#relayFrame(data);
      else {
        const m = parseMessage(data);
        if (m?.t === 'source-error') this.emit('log', 'warn', `capture: ${m.message}`);
      }
    });
    ws.on('close', () => {
      if (this.source === ws) this.source = null;
    });
    this.emit('source', true);
    this._demandChanged();
  }

  #relayFrame(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.concat(data);
    if (buf.length < FRAME_HEADER_BYTES) return;
    const displayId = buf[1];
    this.lastFrames.set(displayId, buf);
    const now = Date.now();
    for (const s of this.sessions) {
      const sub = s.subs.get(displayId);
      if (!sub) continue;
      if (now - sub.lastSent < 1000 / sub.fps - 2) continue;
      if (s.ws.bufferedAmount > MAX_BUFFERED) {
        s.dropped++;
        continue;
      }
      sub.lastSent = now;
      s.ws.send(buf, { binary: true });
    }
  }

  _sendLastFrame(session, displayId) {
    const f = this.lastFrames.get(displayId);
    if (f && session.ws.readyState === 1) session.ws.send(f, { binary: true });
  }

  /** Tell the capture source which displays to capture and at what settings. */
  _demandChanged() {
    const want = new Map();
    for (const s of this.sessions) {
      for (const [id, sub] of s.subs) {
        const cur = want.get(id) || { id, fps: 0, maxWidth: 0, quality: 0 };
        cur.fps = Math.max(cur.fps, sub.fps);
        cur.maxWidth = Math.max(cur.maxWidth, sub.maxWidth);
        cur.quality = Math.max(cur.quality, sub.quality);
        want.set(id, cur);
      }
    }
    for (const id of [...this.lastFrames.keys()]) if (!want.has(id)) this.lastFrames.delete(id);
    const demand = { t: MSG.DEMAND, displays: [...want.values()], layout: this.displays.current() };
    this.emit('demand', demand);
    if (this.source?.readyState === 1) this.source.send(JSON.stringify(demand));
  }

  /* ------------------------------ session hooks ------------------------------ */

  _addSession(s, trusted) {
    this.sessions.add(s);
    // Apple-Continuity-style: a returning device gets its extended display back where it left it.
    if (trusted) this.displays.restoreFor(s.device.id).catch((e) => this.emit('log', 'warn', `restore display: ${e.message}`));
    this.emit('client', { ...s.summary(), trusted });
    this.emit('clients', this.clients());
  }

  _removeSession(s, wasReady) {
    this.sessions.delete(s);
    if (wasReady) {
      if (s.perms.includes('control')) this.input.releaseAll?.();
      const stillHere = [...this.sessions].some((o) => o.device?.id === s.device?.id);
      if (!stillHere) this.displays.removeVirtual(s.device.id, { remember: true }).catch(() => {});
      this._demandChanged();
      this.emit('clients', this.clients());
      this.emit('client-left', s.summary());
    }
  }

  #broadcast(obj) {
    for (const s of this.sessions) s.send(obj);
  }

  async _decidePermissions(device) {
    const perms = ['view'];
    let allow = this.settings.defaultAllowControl;
    if (allow && this.opts.approveControl) {
      try {
        allow = await this.opts.approveControl(device);
      } catch {
        allow = false;
      }
    }
    if (allow) perms.push('control');
    return perms;
  }

  _throttled(ip) {
    const f = this.failures.get(ip);
    return Boolean(f && f.count >= 10 && Date.now() < f.until);
  }

  _noteFailure(ip) {
    const f = this.failures.get(ip) || { count: 0, until: 0 };
    if (Date.now() > f.until) f.count = 0;
    f.count++;
    f.until = Date.now() + 60_000;
    this.failures.set(ip, f);
  }

  /* ------------------------- extend / arrange requests ------------------------- */

  async _extend(session, m) {
    try {
      if (m.on === false) await this.displays.removeVirtual(session.device.id);
      else await this.displays.createVirtual(session.device.id, { w: m.w, h: m.h, x: m.x, y: m.y, name: session.device.name });
    } catch (err) {
      session.send({ t: 'extend-result', ok: false, error: err.message });
      return;
    }
    session.send({ t: 'extend-result', ok: true });
  }

  async _arrange(session, m) {
    try {
      await this.displays.arrangeOwned(session.device.id, { x: m.x, y: m.y });
      session.send({ t: 'arrange-result', ok: true });
    } catch (err) {
      session.send({ t: 'arrange-result', ok: false, error: err.message });
    }
  }
}
