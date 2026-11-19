import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { randomHex } from '@castdesk/shared';

/**
 * Persistent list of paired ("trusted") devices.
 *
 * Each record holds the 256-bit device secret created during PIN pairing.
 * The file is written 0600; when a `codec` is supplied (Electron's
 * safeStorage -> OS keychain / DPAPI) the secrets are encrypted at rest too.
 */
export class TrustStore extends EventEmitter {
  /**
   * @param {string} dir
   * @param {{codec?: {encode(s:string):string, decode(s:string):string}}} [opts]
   */
  constructor(dir, { codec } = {}) {
    super();
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, 'trust.json');
    this.codec = codec || null;
    this.data = { version: 1, hostId: randomHex(8), devices: {} };
    this.#load();
  }

  get hostId() {
    return this.data.hostId;
  }

  #load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (parsed && parsed.devices && parsed.hostId) this.data = parsed;
    } catch {
      /* first run */
    }
    this.save();
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  #decode(rec) {
    if (!rec) return null;
    const secret = rec.enc && this.codec ? this.codec.decode(rec.secret) : rec.secret;
    return { ...rec, secret };
  }

  /** All devices, without secrets (safe to hand to a UI). */
  list() {
    return Object.values(this.data.devices).map(({ secret, enc, ...rest }) => rest);
  }

  /** One device including its decoded secret (host-internal use only). */
  get(id) {
    return this.#decode(this.data.devices[id]);
  }

  has(id) {
    return Boolean(this.data.devices[id]);
  }

  add({ id, name, platform, secretHex, perms = ['view', 'control'] }) {
    const enc = Boolean(this.codec);
    this.data.devices[id] = {
      id,
      name: String(name || 'Unknown device').slice(0, 64),
      platform: String(platform || 'unknown').slice(0, 24),
      secret: enc ? this.codec.encode(secretHex) : secretHex,
      enc,
      perms,
      autoConnect: true,
      pairedAt: Date.now(),
      lastSeen: Date.now(),
      arrangement: null,
    };
    this.save();
    this.emit('change');
    return this.list().find((d) => d.id === id);
  }

  update(id, patch) {
    const rec = this.data.devices[id];
    if (!rec) return null;
    const { secret, enc, id: _id, ...safe } = patch;
    Object.assign(rec, safe);
    this.save();
    this.emit('change');
    return this.list().find((d) => d.id === id);
  }

  touch(id) {
    const rec = this.data.devices[id];
    if (rec) {
      rec.lastSeen = Date.now();
      this.save();
    }
  }

  remove(id) {
    if (!this.data.devices[id]) return false;
    delete this.data.devices[id];
    this.save();
    this.emit('change');
    return true;
  }
}
