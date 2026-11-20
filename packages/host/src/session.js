import {
  MSG, PROTOCOL_VERSION, PIN_MAX_ATTEMPTS, Speke, randomHex, newNonce, authProof, verifyProof,
  parseMessage, sanitizeInput, VIDEO_CODECS,
} from '@castdesk/shared';

const AUTH_TIMEOUT_MS = 20_000;
const clamp = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);

/**
 * One connected client (a viewer / controller). Walks the handshake:
 *
 *   hello -> welcome
 *     known device:   auth -> auth-ok                    (no PIN, mutual HMAC proof)
 *     new device:     pair-start -> pair-y -> pair-confirm -> pair-ok   (SPEKE with PIN)
 *   then: subscribe / unsubscribe / input / extend / arrange / ping
 */
export class ClientSession {
  constructor(host, ws, req) {
    this.host = host;
    this.ws = ws;
    this.id = randomHex(6);
    this.ip = req.socket.remoteAddress?.replace('::ffff:', '') || 'unknown';
    this.state = 'new';
    this.device = null; // { id, name, platform }
    this.perms = [];
    this.hostNonce = newNonce();
    this.subs = new Map(); // displayId -> { fps, maxWidth, quality, lastSent }
    this.speke = null;
    this.dropped = 0;

    this.authTimer = setTimeout(() => this.close('auth-timeout'), AUTH_TIMEOUT_MS);
    ws.on('message', (data, isBinary) => (isBinary ? null : this.#onText(data)));
    ws.on('close', () => this.#onClose());
    ws.on('error', () => {});
  }

  get authed() {
    return this.state === 'ready';
  }
  get canControl() {
    return this.authed && this.perms.includes('control') && this.host.settings.allowControl;
  }

  send(obj) {
    if (this.ws.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close(reason = 'closed') {
    try {
      this.send({ t: MSG.BYE, reason });
      this.ws.close(1000, reason);
    } catch {
      /* already closed */
    }
  }

  summary() {
    return {
      id: this.id,
      ip: this.ip,
      device: this.device,
      perms: this.perms,
      subscriptions: [...this.subs.keys()],
      since: this.since,
    };
  }

  #onClose() {
    clearTimeout(this.authTimer);
    const wasReady = this.authed;
    this.state = 'closed';
    this.subs.clear();
    this.host._removeSession(this, wasReady);
  }

  #onText(raw) {
    const m = parseMessage(raw);
    if (!m) return;
    try {
      switch (this.state) {
        case 'new':
          if (m.t === MSG.HELLO) this.#hello(m);
          break;
        case 'hello':
          if (m.t === MSG.AUTH) this.#auth(m);
          else if (m.t === MSG.PAIR_START) this.#pairStart(m);
          break;
        case 'pairing':
          if (m.t === MSG.PAIR_CONFIRM) this.#pairConfirm(m);
          break;
        case 'ready':
          this.#ready(m);
          break;
      }
    } catch (err) {
      this.host.emit('log', 'warn', `session ${this.id}: ${err.message}`);
      this.close('error');
    }
  }

  /* ---------------------------- handshake ---------------------------- */

  #hello(m) {
    if (!this.host.settings.allowIncoming) return this.close('not-accepting');
    if (this.host._throttled(this.ip)) {
      this.send({ t: MSG.AUTH_FAIL, reason: 'throttled' });
      return this.close('throttled');
    }
    if (typeof m.deviceId !== 'string' || !/^[a-zA-Z0-9_-]{8,64}$/.test(m.deviceId)) return this.close('bad-hello');
    this.device = {
      id: m.deviceId,
      name: String(m.name || 'Unknown device').slice(0, 64),
      platform: String(m.platform || 'unknown').slice(0, 24),
    };
    this.state = 'hello';
    this.send({
      t: MSG.WELCOME,
      v: PROTOCOL_VERSION,
      hostId: this.host.store.hostId,
      hostName: this.host.name,
      platform: this.host.platform,
      nonce: this.hostNonce,
      trusted: this.host.store.has(this.device.id),
    });
  }

  #auth(m) {
    const rec = this.host.store.get(this.device.id);
    const ok = rec && typeof m.nonce === 'string' && verifyProof(rec.secret, 'client', this.hostNonce, m.nonce, this.device.id, m.proof);
    if (!ok) {
      this.host._noteFailure(this.ip);
      this.send({ t: MSG.AUTH_FAIL, reason: rec ? 'bad-proof' : 'unknown-device' });
      return this.close('auth-failed');
    }
    this.host.store.touch(this.device.id);
    this.perms = rec.perms || ['view'];
    this.send({ t: MSG.AUTH_OK, proof: authProof(rec.secret, 'server', this.hostNonce, m.nonce, this.device.id) });
    this.#becomeReady(true);
  }

  #pairStart(m) {
    this.speke = new Speke({ pin: this.host.pin.current(), role: 'server', context: `${this.device.id}|${this.host.store.hostId}` });
    if (!this.speke.derive(m.X)) {
      this.host._noteFailure(this.ip);
      this.send({ t: MSG.PAIR_FAIL, reason: 'bad-key' });
      return this.close('bad-key');
    }
    this.state = 'pairing';
    this.send({ t: MSG.PAIR_Y, Y: this.speke.publicHex });
  }

  async #pairConfirm(m) {
    const ok = this.speke.verify('client', m.mac);
    if (!ok) {
      this.host._noteFailure(this.ip);
      const left = this.host.pin.record(false);
      this.send({ t: MSG.PAIR_FAIL, reason: left === 0 ? 'locked' : 'bad-pin', attemptsLeft: left });
      return this.close('bad-pin');
    }
    this.host.pin.record(true);
    const secretHex = randomHex(32);
    if (this.host.settings.defaultAllowControl && this.host.opts.approveControl && (this.host.opts.needsApproval ? this.host.opts.needsApproval() : true)) {
      this.send({ t: 'pair-pending', reason: 'approval' });
    }
    const perms = await this.host._decidePermissions(this.device);
    if (this.state === 'closed') return;
    this.host.store.add({ ...this.device, secretHex, perms });
    this.perms = perms;
    this.send({
      t: MSG.PAIR_OK,
      mac: this.speke.mac('server'),
      sealed: this.speke.seal(secretHex),
      perms,
      hostId: this.host.store.hostId,
      hostName: this.host.name,
    });
    this.host.emit('paired', { ...this.device, perms });
    this.#becomeReady(false);
  }

  #becomeReady(trusted) {
    clearTimeout(this.authTimer);
    this.state = 'ready';
    this.since = Date.now();
    this.host._addSession(this, trusted);
    this.send({ t: MSG.PERM, perms: this.perms, control: this.canControl });
    this.send({ t: MSG.DISPLAYS, list: this.host.displays.current() });
  }

  /* --------------------------- authenticated --------------------------- */

  #ready(m) {
    switch (m.t) {
      case MSG.PING:
        this.send({ t: MSG.PONG, ts: m.ts });
        break;
      case MSG.SUBSCRIBE: {
        const id = m.display & 0xff;
        if (!this.host.displays.has(id)) return;
        const codecs = Array.isArray(m.codecs) ? m.codecs.filter((c) => VIDEO_CODECS.includes(c)) : [];
        this.subs.set(id, {
          fps: clamp(m.maxFps, 1, 60, 30),
          maxWidth: clamp(m.maxWidth, 320, 7680, 1920),
          quality: clamp(m.quality, 0.2, 0.95, 0.7),
          codecs,
          mode: 'jpeg', // decided by the host in _demandChanged()
          hasKey: false,
          lastSent: 0,
        });
        this.host._demandChanged();
        this.host._sendLastFrame(this, id);
        break;
      }
      case MSG.KEYFRAME: {
        const sub = this.subs.get(m.display & 0xff);
        if (sub) {
          sub.hasKey = false;
          this.host._requestKey(m.display & 0xff);
        }
        break;
      }
      case MSG.UNSUBSCRIBE:
        this.subs.delete(m.display & 0xff);
        this.host._demandChanged();
        break;
      case MSG.INPUT: {
        if (!this.canControl) return;
        const clean = sanitizeInput(m.e);
        if (clean) this.host.input.handle(clean, this.host.displays.current()).catch((e) => this.host.emit('log', 'warn', `input: ${e.message}`));
        break;
      }
      case 'extend':
        if (this.canControl) this.host._extend(this, m);
        break;
      case 'arrange':
        if (this.canControl) this.host._arrange(this, m);
        break;
      case 'project':
        if (this.canControl) this.host._project(this, m);
        break;
    }
  }
}

export { PIN_MAX_ATTEMPTS };
