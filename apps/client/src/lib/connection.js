import {
  MSG, PROTOCOL_VERSION, Speke, newNonce, authProof, verifyProof, decodeFrame, parseMessage, toHex,
} from '@castdesk/shared';
import { osName } from './platform.js';

export class ConnectError extends Error {
  constructor(code, message, extra = {}) {
    super(message || code);
    this.code = code;
    Object.assign(this, extra);
  }
}

/** Open the first WebSocket that succeeds among several candidate addresses (LAN, USB link, ...). */
function openFirst(addresses, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sockets = [];
    let settled = false;
    let failed = 0;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      for (const s of sockets) if (s !== v) try { s.close(); } catch { /* ignore */ }
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, new ConnectError('unreachable', 'Could not reach the device. Check you are on the same network or USB link.')), timeoutMs);
    for (const address of addresses) {
      let ws;
      try {
        ws = new WebSocket(`ws://${address}:${port}/ws`);
      } catch {
        if (++failed === addresses.length) finish(reject, new ConnectError('unreachable'));
        continue;
      }
      ws.binaryType = 'arraybuffer';
      sockets.push(ws);
      ws.onopen = () => finish(resolve, Object.assign(ws, { address }));
      ws.onerror = () => {
        if (++failed === addresses.length) finish(reject, new ConnectError('unreachable', 'Could not reach the device. Check you are on the same network or USB link.'));
      };
    }
  });
}

/**
 * A live connection to a CastDesk host: handshake (PIN pairing or trusted
 * auto-auth), then frames in / input out.
 */
export class HostConnection {
  constructor({ identity, getSecret, onPending }) {
    this.identity = identity;
    this.onPending = onPending;
    this.getSecret = getSecret;
    this.handlers = new Map();
    this.inbox = [];
    this.waiters = [];
    this.live = false;
    this.pendingRel = { dx: 0, dy: 0 };
    this.pendingWheel = { dx: 0, dy: 0, ctrl: false };
    this.flushTimer = null;
    this.rtt = null;
  }

  on(evt, fn) {
    if (!this.handlers.has(evt)) this.handlers.set(evt, new Set());
    this.handlers.get(evt).add(fn);
    return () => this.handlers.get(evt)?.delete(fn);
  }
  #emit(evt, ...a) {
    for (const fn of this.handlers.get(evt) || []) fn(...a);
  }

  /* ----------------------------- handshake ----------------------------- */

  #wait(types, ms = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new ConnectError('timeout', 'The device did not answer in time.')), ms);
      const check = () => {
        const i = this.inbox.findIndex((m) => types.includes(m.t));
        if (i >= 0) {
          clearTimeout(timer);
          resolve(this.inbox.splice(i, 1)[0]);
          return true;
        }
        if (this.closedEarly) {
          clearTimeout(timer);
          reject(new ConnectError('closed', 'The connection was closed.'));
          return true;
        }
        return false;
      };
      if (!check()) this.waiters.push(check);
    });
  }

  #route(ev) {
    if (typeof ev.data !== 'string') {
      const f = decodeFrame(ev.data);
      if (f) this.#emit('frame', f);
      return;
    }
    const m = parseMessage(ev.data);
    if (!m) return;
    if (m.t === 'pair-pending') {
      this.onPending?.(m);
      return;
    }
    if (!this.live) {
      this.inbox.push(m);
      this.waiters = this.waiters.filter((w) => !w());
    } else this.#dispatch(m);
  }

  #dispatch(m) {
    switch (m.t) {
      case MSG.DISPLAYS: this.#emit('displays', m.list); break;
      case MSG.PERM: this.#emit('perm', m); break;
      case MSG.PONG: this.rtt = Math.round(performance.now() - m.ts); this.#emit('rtt', this.rtt); break;
      case MSG.BYE: this.byeReason = m.reason; break;
      case 'extend-result': this.#emit('extend-result', m); break;
      case 'project-result': this.#emit('project-result', m); break;
      case 'arrange-result': this.#emit('arrange-result', m); break;
    }
  }

  /**
   * Connect and authenticate.
   * - known host that still trusts us: silent mutual auth, no PIN
   * - otherwise needs `pin` (throws ConnectError('need-pin') when absent)
   * Resolves with { hostId, hostName, platform, secret|null, perms, address, trustedLogin }
   */
  async connect({ addresses, port, pin, timeoutMs = 5000 }) {
    const ws = await openFirst(addresses, port, timeoutMs);
    this.ws = ws;
    this.address = ws.address;
    ws.onmessage = (ev) => this.#route(ev);
    ws.onclose = () => {
      this.closedEarly = !this.live;
      this.waiters = this.waiters.filter((w) => !w());
      const was = this.live;
      this.live = false;
      clearInterval(this.pingTimer);
      this.#emit('closed', this.byeReason || (was ? 'lost' : 'closed'));
    };

    try {
      this.#send({ t: MSG.HELLO, v: PROTOCOL_VERSION, deviceId: this.identity.id, name: this.identity.name, platform: osName });
      const welcome = await this.#wait([MSG.WELCOME, MSG.BYE]);
      if (welcome.t === MSG.BYE) throw new ConnectError(welcome.reason === 'not-accepting' ? 'not-accepting' : 'refused', 'This device is not accepting connections right now.');
      const saved = this.getSecret(welcome.hostId);
      let secret = null;
      let perms;

      if (welcome.trusted && saved) {
        const cn = newNonce();
        this.#send({ t: MSG.AUTH, nonce: cn, proof: authProof(saved, 'client', welcome.nonce, cn, this.identity.id) });
        const res = await this.#wait([MSG.AUTH_OK, MSG.AUTH_FAIL, MSG.BYE]);
        if (res.t !== MSG.AUTH_OK) throw new ConnectError(res.reason === 'throttled' ? 'throttled' : 'auth-failed', 'Trusted sign-in was refused. Pair again with the PIN.', { stale: true });
        if (!verifyProof(saved, 'server', welcome.nonce, cn, this.identity.id, res.proof)) throw new ConnectError('server-auth', 'The device could not prove its identity.');
      } else {
        if (!pin) throw new ConnectError('need-pin', 'Enter the PIN shown on the other device.', { hostName: welcome.hostName, revoked: Boolean(saved) });
        const sp = new Speke({ pin, role: 'client', context: `${this.identity.id}|${welcome.hostId}` });
        this.#send({ t: MSG.PAIR_START, X: sp.publicHex });
        const y = await this.#wait([MSG.PAIR_Y, MSG.BYE]);
        if (y.t !== MSG.PAIR_Y || !sp.derive(y.Y)) throw new ConnectError('refused', 'Pairing was refused.');
        this.#send({ t: MSG.PAIR_CONFIRM, mac: sp.mac('client') });
        const res = await this.#wait([MSG.PAIR_OK, MSG.PAIR_FAIL, MSG.BYE]);
        if (res.t === MSG.PAIR_FAIL) {
          throw new ConnectError(res.reason === 'locked' ? 'locked' : 'bad-pin', res.reason === 'locked' ? 'Too many wrong PINs. A new PIN has been generated.' : 'That PIN is not right.', { attemptsLeft: res.attemptsLeft });
        }
        if (res.t !== MSG.PAIR_OK || !sp.verify('server', res.mac)) throw new ConnectError('server-auth', 'The device could not prove it knows the PIN.');
        const opened = sp.open(res.sealed);
        if (!opened) throw new ConnectError('server-auth', 'Pairing data was corrupted.');
        secret = toHex(opened);
        perms = res.perms;
      }

      this.live = true;
      for (const m of this.inbox.splice(0)) this.#dispatch(m);
      this.pingTimer = setInterval(() => this.#send({ t: MSG.PING, ts: performance.now() }), 2000);
      return { hostId: welcome.hostId, hostName: welcome.hostName, platform: welcome.platform, secret, perms, address: ws.address, trustedLogin: !secret };
    } catch (err) {
      this.close();
      throw err;
    }
  }

  /* ------------------------------ live API ------------------------------ */

  #send(o) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  subscribe(display, { maxFps = 30, maxWidth = 1920, quality = 0.7, codecs = [] } = {}) {
    this.#send({ t: MSG.SUBSCRIBE, display, maxFps, maxWidth, quality, codecs });
  }
  /** Ask the host for a fresh key frame (after a decode error or a dropped frame). */
  requestKey(display) {
    this.#send({ t: MSG.KEYFRAME, display });
  }
  unsubscribe(display) {
    this.#send({ t: MSG.UNSUBSCRIBE, display });
  }
  /** Windows Win+P: internal | clone | extend */
  project(mode) {
    this.#send({ t: 'project', mode });
  }
  extend(on, { w = 1280, h = 720 } = {}) {
    this.#send({ t: 'extend', on, w, h });
  }
  arrange(x, y) {
    this.#send({ t: 'arrange', x, y });
  }

  /** Send an input event. Relative motion and wheel are coalesced to ~120 Hz to keep latency low and traffic small. */
  input(e) {
    if (e.k === 'rel') {
      this.pendingRel.dx += e.dx;
      this.pendingRel.dy += e.dy;
      return this.#scheduleFlush();
    }
    if (e.k === 'wheel') {
      this.pendingWheel.dx += e.dx;
      this.pendingWheel.dy += e.dy;
      this.pendingWheel.ctrl = e.ctrl;
      return this.#scheduleFlush();
    }
    this.#flushNow();
    this.#send({ t: MSG.INPUT, e });
  }

  #scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.#flushNow(), 8);
  }
  #flushNow() {
    clearTimeout(this.flushTimer);
    this.flushTimer = null;
    const r = this.pendingRel;
    if (r.dx || r.dy) this.#send({ t: MSG.INPUT, e: { k: 'rel', dx: r.dx, dy: r.dy } });
    r.dx = r.dy = 0;
    const w = this.pendingWheel;
    if (w.dx || w.dy) this.#send({ t: MSG.INPUT, e: { k: 'wheel', dx: w.dx, dy: w.dy, ctrl: w.ctrl } });
    w.dx = w.dy = 0;
  }

  close() {
    clearInterval(this.pingTimer);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
