import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import {
  Speke, MSG, FRAME, newNonce, authProof, verifyProof, encodeFrame, decodeFrame, parseMessage, randomHex, toHex,
} from '@castdesk/shared';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { installPlatformTools, extractCommand, AdbForwarder } from '../src/index.js';
import { HostService, DisplayManager, InputInjector, setAutostart, isAutostart, domCodeToKeyName } from '../src/index.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'castdesk-test-'));

function fakeBackend() {
  const calls = [];
  const rec = (n) => async (...a) => void calls.push([n, ...a]);
  return {
    calls,
    backend: {
      name: 'fake',
      setPosition: rec('pos'), getPosition: async () => ({ x: 100, y: 100 }),
      press: rec('press'), release: rec('release'), scroll: rec('scroll'),
      keyDown: rec('keyDown'), keyUp: rec('keyUp'), type: rec('type'),
    },
  };
}

class FakeProvider {
  constructor() {
    this.caps = { list: true, arrange: true, virtual: true, note: '' };
    this.name = 'fake';
    this.mons = [{ nativeId: 'M1', name: 'Main', x: 0, y: 0, w: 1920, h: 1080, primary: true }];
    this.log = [];
  }
  async list() { return this.mons.map((m) => ({ ...m })); }
  async createVirtual({ w, h, x, y }) { this.mons.push({ nativeId: 'V1', name: 'Virtual', x, y, w, h }); this.log.push('create'); return 'V1'; }
  async removeVirtual(id) { this.mons = this.mons.filter((m) => m.nativeId !== id); this.log.push('remove'); }
  async arrange(items) { for (const it of items) Object.assign(this.mons.find((m) => m.nativeId === it.nativeId), { x: it.x, y: it.y }); this.log.push('arrange'); }
}

/** Minimal protocol client used to exercise the host end to end. */
class TestClient {
  constructor(port, { deviceId = randomHex(8), name = 'Test Phone', secret = null } = {}) {
    this.port = port; this.deviceId = deviceId; this.name = name; this.secret = secret;
    this.msgs = []; this.frames = []; this.waiters = [];
  }
  open() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('close', () => { this.closed = true; this.#flush(); });
      this.ws.on('message', (d, bin) => {
        if (bin) this.frames.push(decodeFrame(d));
        else this.msgs.push(parseMessage(d));
        this.#flush();
      });
    });
  }
  send(o) { this.ws.send(JSON.stringify(o)); }
  #flush() { this.waiters = this.waiters.filter((w) => !w()); }
  next(t, ms = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timeout waiting for ${t}; got ${this.msgs.map((m) => m.t)}`)), ms);
      const check = () => {
        const i = this.msgs.findIndex((m) => m.t === t);
        if (i >= 0) { clearTimeout(timer); resolve(this.msgs.splice(i, 1)[0]); return true; }
        if (this.closed) { clearTimeout(timer); reject(new Error(`closed while waiting for ${t}`)); return true; }
        return false;
      };
      if (!check()) this.waiters.push(check);
    });
  }
  waitFrames(n, ms = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout waiting for frames')), ms);
      const check = () => (this.frames.length >= n ? (clearTimeout(timer), resolve(this.frames), true) : false);
      if (!check()) this.waiters.push(check);
    });
  }
  async hello() {
    this.send({ t: MSG.HELLO, deviceId: this.deviceId, name: this.name, platform: 'android' });
    return this.next(MSG.WELCOME);
  }
  async pair(pin, welcome) {
    const w = welcome || (await this.hello());
    const sp = new Speke({ pin, role: 'client', context: `${this.deviceId}|${w.hostId}` });
    this.send({ t: MSG.PAIR_START, X: sp.publicHex });
    const y = await this.next(MSG.PAIR_Y);
    assert.ok(sp.derive(y.Y));
    this.send({ t: MSG.PAIR_CONFIRM, mac: sp.mac('client') });
    const res = await Promise.race([this.next(MSG.PAIR_OK), this.next(MSG.PAIR_FAIL)]);
    if (res.t === MSG.PAIR_OK) {
      assert.ok(sp.verify('server', res.mac), 'server proves PIN knowledge');
      this.secret = toHex(sp.open(res.sealed));
    }
    return res;
  }
  async auth(welcome) {
    const w = welcome || (await this.hello());
    const cn = newNonce();
    this.send({ t: MSG.AUTH, nonce: cn, proof: authProof(this.secret, 'client', w.nonce, cn, this.deviceId) });
    const res = await Promise.race([this.next(MSG.AUTH_OK), this.next(MSG.AUTH_FAIL)]);
    if (res.t === MSG.AUTH_OK) assert.ok(verifyProof(this.secret, 'server', w.nonce, cn, this.deviceId, res.proof));
    return res;
  }
  close() { this.ws.close(); }
}

async function setup(t, opts = {}) {
  const dir = tmp();
  const fb = fakeBackend();
  const provider = new FakeProvider();
  const host = new HostService({
    dataDir: dir, name: 'Test PC', port: 0, discovery: false,
    input: new InputInjector({ backend: fb.backend, platform: 'linux' }),
    displays: (store) => new DisplayManager({ store, provider }),
    ...opts,
  });
  const port = await host.start();
  const done = () => host.stop();
  t.after(done);
  return { host, port, dir, fb, provider, done };
}

test('PIN pairing then PIN-less trusted reconnect', async (t) => {
  const { host, port, done } = await setup(t, );
  const c = new TestClient(port);
  await c.open();
  const welcome = await c.hello();
  assert.equal(welcome.trusted, false);
  assert.equal(welcome.hostName, 'Test PC');
  const ok = await c.pair(host.pin.current(), welcome);
  assert.equal(ok.t, MSG.PAIR_OK);
  assert.deepEqual(ok.perms, ['view', 'control']);
  assert.ok(c.secret && c.secret.length === 64);
  const displays = await c.next(MSG.DISPLAYS);
  assert.equal(displays.list.length, 1);
  assert.equal(host.store.list().length, 1);
  assert.equal(host.clients().length, 1);
  c.close();

  // second connection: no PIN
  const c2 = new TestClient(port, { deviceId: c.deviceId, secret: c.secret });
  await c2.open();
  const w2 = await c2.hello();
  assert.equal(w2.trusted, true);
  assert.equal((await c2.auth(w2)).t, MSG.AUTH_OK);
  await c2.next(MSG.DISPLAYS);

  // wrong secret is refused
  const c3 = new TestClient(port, { deviceId: c.deviceId, secret: randomHex(32) });
  await c3.open();
  assert.equal((await c3.auth()).t, MSG.AUTH_FAIL);
  c2.close();
  await done();
});

test('wrong PIN is refused, attempts are limited, PIN rotates when locked', async (t) => {
  const { host, port, done } = await setup(t, );
  const real = host.pin.current();
  const wrong = real === '000000' ? '111111' : '000000';
  let lastLeft;
  for (let i = 0; i < 5; i++) {
    const c = new TestClient(port);
    await c.open();
    const res = await c.pair(wrong);
    assert.equal(res.t, MSG.PAIR_FAIL);
    lastLeft = res.attemptsLeft;
  }
  assert.equal(lastLeft, 0);
  assert.notEqual(host.pin.current(), real, 'PIN rotated after lockout');
  assert.equal(host.store.list().length, 0);
  await done();
});

test('PIN is single-use: rotates after a successful pairing', async (t) => {
  const { host, port, done } = await setup(t, );
  const pin = host.pin.current();
  const a = new TestClient(port);
  await a.open();
  assert.equal((await a.pair(pin)).t, MSG.PAIR_OK);
  assert.notEqual(host.pin.current(), pin);
  const b = new TestClient(port);
  await b.open();
  assert.equal((await b.pair(pin)).t, MSG.PAIR_FAIL);
  await done();
});

test('frame relay: demand reaches the source, frames reach subscribed viewers only', async (t) => {
  const { host, port, done } = await setup(t, );
  const viewer = new TestClient(port);
  await viewer.open();
  await viewer.pair(host.pin.current());
  const { list } = await viewer.next(MSG.DISPLAYS);

  // source needs the token and loopback
  const bad = new WebSocket(`ws://127.0.0.1:${port}/source?token=nope`);
  await new Promise((r) => { bad.on('error', r); bad.on('close', r); });

  const src = new WebSocket(`ws://127.0.0.1:${port}/source?token=${host.sourceToken}`);
  const demands = [];
  src.on('message', (d, bin) => !bin && demands.push(parseMessage(d)));
  await new Promise((r) => src.on('open', r));

  viewer.send({ t: MSG.SUBSCRIBE, display: list[0].id, maxFps: 30, maxWidth: 1280, quality: 0.6 });
  await new Promise((r) => setTimeout(r, 150));
  const lastDemand = demands.at(-1);
  assert.equal(lastDemand.t, MSG.DEMAND);
  assert.equal(lastDemand.displays[0].id, list[0].id);
  assert.equal(lastDemand.displays[0].maxWidth, 1280);

  const jpeg = crypto.randomBytes(5000);
  src.send(encodeFrame({ displayId: list[0].id, width: 1280, height: 720, seq: 1, data: jpeg }));
  const frames = await viewer.waitFrames(1);
  assert.equal(frames[0].width, 1280);
  assert.deepEqual(Buffer.from(frames[0].data), jpeg);

  // a second viewer that did not subscribe gets nothing, but a late subscriber gets the cached frame
  const late = new TestClient(port);
  await late.open();
  await late.pair(host.pin.current());
  const d2 = await late.next(MSG.DISPLAYS);
  src.send(encodeFrame({ displayId: list[0].id, width: 1280, height: 720, seq: 2, data: jpeg }));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(late.frames.length, 0);
  late.send({ t: MSG.SUBSCRIBE, display: d2.list[0].id });
  await late.waitFrames(1);

  // unsubscribing everything clears demand
  viewer.send({ t: MSG.UNSUBSCRIBE, display: list[0].id });
  late.close();
  await new Promise((r) => setTimeout(r, 150));
  assert.deepEqual(demands.at(-1).displays, []);
  src.close();
  viewer.close();
  await done();
});

test('video codecs: encoded frames go to capable viewers, JPEG to the rest, key frames gate delta frames', async (t) => {
  const { host, port, done } = await setup(t);
  const modern = new TestClient(port);
  await modern.open();
  await modern.pair(host.pin.current());
  const { list } = await modern.next(MSG.DISPLAYS);
  const legacy = new TestClient(port);
  await legacy.open();
  await legacy.pair(host.pin.current());
  await legacy.next(MSG.DISPLAYS);

  const src = new WebSocket(`ws://127.0.0.1:${port}/source?token=${host.sourceToken}`);
  const inbox = [];
  src.on('message', (d, bin) => !bin && inbox.push(parseMessage(d)));
  await new Promise((r) => src.on('open', r));
  src.send(JSON.stringify({ t: 'source-caps', video: ['h264', 'vp8'] }));

  const id = list[0].id;
  modern.send({ t: MSG.SUBSCRIBE, display: id, maxFps: 30, codecs: ['vp8'] });
  legacy.send({ t: MSG.SUBSCRIBE, display: id, maxFps: 30 });
  await new Promise((r) => setTimeout(r, 200));
  const demand = inbox.filter((m) => m.t === MSG.DEMAND).at(-1);
  assert.equal(demand.displays[0].video, true);
  assert.equal(demand.displays[0].jpeg, true);
  assert.equal(demand.displays[0].codec, 'vp8');
  assert.ok(inbox.some((m) => m.t === MSG.KEYFRAME), 'a new video viewer triggers a key frame request');

  const chunk = crypto.randomBytes(800);
  // delta before any key frame must not reach the viewer
  src.send(encodeFrame({ type: FRAME.VIDEO_DELTA, displayId: id, width: 1280, height: 720, seq: 1, data: chunk }));
  src.send(encodeFrame({ type: FRAME.VIDEO_KEY, displayId: id, width: 1280, height: 720, seq: 2, data: Buffer.concat([Buffer.from([2]), chunk]) }));
  src.send(encodeFrame({ type: FRAME.VIDEO_DELTA, displayId: id, width: 1280, height: 720, seq: 3, data: chunk }));
  src.send(encodeFrame({ displayId: id, width: 1280, height: 720, seq: 4, data: chunk })); // JPEG
  await modern.waitFrames(2);
  await legacy.waitFrames(1);
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(modern.frames.map((f) => f.type), [FRAME.VIDEO_KEY, FRAME.VIDEO_DELTA]);
  assert.deepEqual(legacy.frames.map((f) => f.type), [FRAME.VIDEO_JPEG]);

  // a viewer asking for a key frame resets the chain
  modern.send({ t: MSG.KEYFRAME, display: id });
  await new Promise((r) => setTimeout(r, 100));
  src.send(encodeFrame({ type: FRAME.VIDEO_DELTA, displayId: id, width: 1280, height: 720, seq: 5, data: chunk }));
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(modern.frames.length, 2, 'delta after a resync request is held back until the next key frame');
  src.close();
  modern.close();
  legacy.close();
  await done();
});

test('input is injected only for devices with control permission', async (t) => {
  const { host, port, fb, done } = await setup(t, { settings: { defaultAllowControl: true } });
  const c = new TestClient(port);
  await c.open();
  await c.pair(host.pin.current());
  await c.next(MSG.DISPLAYS);
  assert.equal((await c.next(MSG.PERM)).control, true);
  c.send({ t: MSG.INPUT, e: { k: 'move', x: 0.5, y: 0.5 } });
  c.send({ t: MSG.INPUT, e: { k: 'click', button: 'left', count: 1 } });
  c.send({ t: MSG.INPUT, e: { k: 'key', code: 'KeyA', down: true } });
  c.send({ t: MSG.INPUT, e: { k: 'bogus' } });
  await new Promise((r) => setTimeout(r, 200));
  assert.deepEqual(fb.calls.map((x) => x[0]), ['pos', 'press', 'release', 'keyDown']);
  assert.deepEqual(fb.calls[0], ['pos', 960, 540]);

  // downgrade to view-only live
  host.setPermissions(c.deviceId, ['view']);
  const perm = await c.next(MSG.PERM);
  assert.equal(perm.control, false);
  const before = fb.calls.length;
  c.send({ t: MSG.INPUT, e: { k: 'click', button: 'left', count: 1 } });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(fb.calls.length, before);

  // global kill switch
  host.setPermissions(c.deviceId, ['view', 'control']);
  await c.next(MSG.PERM);
  host.configure({ allowControl: false });
  c.send({ t: MSG.INPUT, e: { k: 'click', button: 'left', count: 1 } });
  await new Promise((r) => setTimeout(r, 100));
  const afterKill = fb.calls.length;
  c.send({ t: MSG.INPUT, e: { k: 'click', button: 'left', count: 1 } });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(fb.calls.length, afterKill);
  await done();
});

test('revoking a device disconnects it and forgets the secret', async (t) => {
  const { host, port, done } = await setup(t, );
  const c = new TestClient(port);
  await c.open();
  await c.pair(host.pin.current());
  await c.next(MSG.DISPLAYS);
  host.revoke(c.deviceId);
  await c.next(MSG.BYE);
  const c2 = new TestClient(port, { deviceId: c.deviceId, secret: c.secret });
  await c2.open();
  assert.equal((await c2.hello()).trusted, false);
  await done();
});

test('allowIncoming=false refuses new sessions', async (t) => {
  const { host, port, done } = await setup(t, );
  host.configure({ allowIncoming: false });
  const c = new TestClient(port);
  await c.open();
  c.send({ t: MSG.HELLO, deviceId: c.deviceId, name: 'x', platform: 'web' });
  assert.equal((await c.next(MSG.BYE)).reason, 'not-accepting');
  await done();
});

test('extend: virtual display is created per device, snapped, remembered and restored on reconnect', async (t) => {
  const { host, port, provider, done } = await setup(t, );
  const c = new TestClient(port, { name: 'My iPad' });
  await c.open();
  await c.pair(host.pin.current());
  await c.next(MSG.DISPLAYS);

  c.send({ t: 'extend', on: true, w: 1280, h: 800 });
  const r = await c.next('extend-result');
  assert.equal(r.ok, true);
  const d1 = await c.next(MSG.DISPLAYS);
  const virt = d1.list.find((d) => d.virtual);
  assert.ok(virt);
  assert.equal(virt.owner, c.deviceId);
  assert.equal(virt.x, 1920); // placed to the right of the main display by default

  // drag it above the main display: snaps flush, aligned to the left edge
  c.send({ t: 'arrange', x: 40, y: -810 });
  assert.equal((await c.next('arrange-result')).ok, true);
  const mon = provider.mons.find((m) => m.nativeId === 'V1');
  assert.deepEqual([mon.x, mon.y], [0, -800]);
  assert.deepEqual(host.store.get(c.deviceId).arrangement, { extend: true, w: 1280, h: 800, x: 0, y: -800 });

  // disconnect: display removed but position remembered; reconnect (no PIN): restored in the same spot
  c.close();
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(provider.mons.length, 1);
  assert.equal(host.store.get(c.deviceId).arrangement.extend, true);
  const c2 = new TestClient(port, { deviceId: c.deviceId, secret: c.secret });
  await c2.open();
  assert.equal((await c2.auth()).t, MSG.AUTH_OK);
  await new Promise((r) => setTimeout(r, 1500));
  const back = provider.mons.find((m) => m.nativeId === 'V1');
  assert.ok(back, 'virtual display restored');
  assert.deepEqual([back.x, back.y], [0, -800]);
  c2.close();
  await done();
});

test('extend without a driver reports a clear error; host layout validates like Windows', async () => {
  const provider = new FakeProvider();
  provider.caps.virtual = false;
  const dm = new DisplayManager({ provider });
  await dm.refresh();
  await assert.rejects(dm.createVirtual('dev', {}), /virtual display driver/);

  provider.caps.virtual = true;
  await provider.createVirtual({ w: 1000, h: 800, x: 1920, y: 0 });
  await dm.refresh();
  const [main, virt] = dm.current();
  await assert.rejects(dm.applyLayout([{ id: virt.id, x: 100, y: 100 }]), /overlap/);
  await assert.rejects(dm.applyLayout([{ id: virt.id, x: 5000, y: 0 }]), /touch/);
  await dm.applyLayout([{ id: virt.id, x: -1000, y: 100 }]);
  assert.equal(dm.current().find((d) => d.id === virt.id).x, -1000);
  assert.equal(main.id !== virt.id, true);
});

class FakeWinProvider {
  constructor({ second = false } = {}) {
    this.caps = { list: true, arrange: true, virtual: false, project: true, note: '' };
    this.name = 'fake-win';
    this.hasSecond = second;
    this.mode = 'internal';
    this.calls = [];
  }
  async list() {
    const main = { nativeId: 'M1', name: 'Main', x: 0, y: 0, w: 1920, h: 1080, primary: true };
    const second = { nativeId: 'S1', name: 'Second', x: 1920, y: 0, w: 1280, h: 720 };
    return this.hasSecond && this.mode === 'extend' ? [main, second] : [main];
  }
  async project(mode) { this.mode = mode; this.calls.push(mode); }
  async arrange() {}
}

test('Win+P extend: uses an existing second screen, or plugs the virtual driver; reports clear errors', async () => {
  // 1. a real second monitor exists: Extend hands it to the device and leaves it alone afterwards
  const real = new FakeWinProvider({ second: true });
  const dm = new DisplayManager({ provider: real });
  await dm.refresh();
  const id = await dm.createVirtual('dev1', {});
  assert.deepEqual(real.calls, ['extend']);
  assert.equal(dm.current().find((d) => d.id === id).owner, 'dev1');
  await dm.removeVirtual('dev1');
  assert.deepEqual(real.calls, ['extend'], 'a real monitor is not switched off');
  assert.equal(dm.current().find((d) => d.id === id).owner, null);

  // 2. one screen, no driver: clear, coded error
  const one = new FakeWinProvider();
  const dm2 = new DisplayManager({ provider: one });
  await dm2.refresh();
  await assert.rejects(dm2.createVirtual('dev2', {}), (e) => e.code === 'no-driver' && /only one screen/.test(e.message));

  // 3. driver installed: plug the virtual monitor, extend, and detach with "PC screen only" when released
  const virt = new FakeWinProvider();
  const driver = { installed: () => true, plugged: 0, async plug() { this.plugged++; virt.hasSecond = true; } };
  const dm3 = new DisplayManager({ provider: virt, driver });
  await dm3.refresh();
  const vid = await dm3.createVirtual('dev3', {});
  assert.equal(driver.plugged, 1);
  assert.equal(dm3.current().find((d) => d.id === vid).owner, 'dev3');
  await dm3.removeVirtual('dev3');
  assert.equal(virt.calls.at(-1), 'internal');
  assert.equal(dm3.capabilities().driver.installed, true);
}, { timeout: 60000 });

test('project message: paired device can pick PC screen only / duplicate / extend, never "second screen only"', async (t) => {
  const provider = new FakeWinProvider({ second: true });
  const { host, port, done } = await setup(t, { displays: (store) => new DisplayManager({ store, provider }) });
  const c = new TestClient(port);
  await c.open();
  await c.pair(host.pin.current());
  c.send({ t: 'project', mode: 'external' });
  const bad = await c.next('project-result');
  assert.equal(bad.ok, false);
  c.send({ t: 'project', mode: 'clone' });
  const ok = await c.next('project-result');
  assert.equal(ok.ok, true);
  assert.deepEqual(provider.calls, ['clone']);
  c.close();
  await done();
}, { timeout: 30000 });

test('injector: relative moves accumulate sub-pixels and clamp; wheel notches; pen; release-all', async () => {
  const fb = fakeBackend();
  const inj = new InputInjector({ backend: fb.backend, platform: 'win32' });
  const displays = [{ id: 0, x: 0, y: 0, w: 1920, h: 1080, primary: true }];
  await inj.handle({ k: 'rel', dx: 0.4, dy: 0 }, displays); // nothing yet
  await inj.handle({ k: 'rel', dx: 0.7, dy: 0 }, displays); // 1.1 -> 1px
  assert.deepEqual(fb.calls.filter((c) => c[0] === 'pos').at(-1), ['pos', 101, 100]);
  await inj.handle({ k: 'rel', dx: -5000, dy: -5000 }, displays);
  assert.deepEqual(fb.calls.filter((c) => c[0] === 'pos').at(-1), ['pos', 0, 0]);

  await inj.handle({ k: 'wheel', dx: 0, dy: 30, ctrl: false }, displays);
  assert.equal(fb.calls.filter((c) => c[0] === 'scroll').length, 0);
  await inj.handle({ k: 'wheel', dx: 0, dy: 50, ctrl: false }, displays); // 80px -> 2 notches
  assert.deepEqual(fb.calls.filter((c) => c[0] === 'scroll').at(-1), ['scroll', 0, 2]);
  await inj.handle({ k: 'wheel', dx: 0, dy: -40, ctrl: true }, displays);
  assert.deepEqual(fb.calls.slice(-3).map((c) => c[0]), ['keyDown', 'scroll', 'keyUp']);

  await inj.handle({ k: 'pen', x: 0.5, y: 0.5, pressure: 0.5, down: true }, displays);
  await inj.handle({ k: 'key', code: 'ShiftLeft', down: true }, displays);
  fb.calls.length = 0;
  await inj.releaseAll();
  assert.deepEqual(fb.calls.map((c) => c[0]).sort(), ['keyUp', 'release']);

  await inj.handle({ k: 'gesture', name: 'swipe-up' }, displays);
  assert.ok(fb.calls.some((c) => c[0] === 'keyDown' && c[1] === 'LeftSuper'));
});

test('keymap covers letters, digits, arrows, numpad, F-keys', () => {
  assert.equal(domCodeToKeyName('KeyQ'), 'Q');
  assert.equal(domCodeToKeyName('Digit7'), 'Num7');
  assert.equal(domCodeToKeyName('ArrowUp'), 'Up');
  assert.equal(domCodeToKeyName('Numpad3'), 'NumPad3');
  assert.equal(domCodeToKeyName('F12'), 'F12');
  assert.equal(domCodeToKeyName('Enter'), 'Return');
  assert.equal(domCodeToKeyName('Nonsense'), null);
});

test('real nut-js key names exist for every mapped key (when nut-js is installed)', async (t) => {
  let nut;
  try { nut = await import('@nut-tree-fork/nut-js'); } catch { return t.skip('nut-js not installed'); }
  const { Key } = nut.default || nut;
  const codes = ['KeyA', 'Digit0', 'Enter', 'NumpadEnter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
    'CapsLock', 'ScrollLock', 'Pause', 'NumLock', 'PrintScreen', 'ContextMenu', 'ArrowLeft', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft',
    'AltRight', 'MetaLeft', 'MetaRight', 'Backquote', 'Minus', 'Equal', 'BracketLeft', 'BracketRight', 'Backslash', 'Semicolon', 'Quote', 'Comma', 'Period',
    'Slash', 'Numpad5', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal', 'F1', 'F24', 'AudioVolumeMute', 'MediaPlayPause'];
  for (const c of codes) {
    const n = domCodeToKeyName(c);
    assert.ok(n && Key[n] !== undefined, `${c} -> ${n}`);
  }
});

test('autostart writes and removes Linux .desktop and macOS LaunchAgent entries', async () => {
  const home = tmp();
  await setAutostart(true, { exec: '/opt/CastDesk/castdesk', home, platform: 'linux' });
  assert.equal(await isAutostart({ home, platform: 'linux' }), true);
  const desktop = fs.readFileSync(path.join(home, '.config/autostart/castdesk.desktop'), 'utf8');
  assert.match(desktop, /Exec=\/opt\/CastDesk\/castdesk --hidden/);
  await setAutostart(false, { home, platform: 'linux' });
  assert.equal(await isAutostart({ home, platform: 'linux' }), false);

  await setAutostart(true, { exec: '/Applications/CastDesk.app/Contents/MacOS/CastDesk', home, platform: 'darwin' });
  const plist = fs.readFileSync(path.join(home, 'Library/LaunchAgents/com.castdesk.app.plist'), 'utf8');
  assert.match(plist, /RunAtLoad/);
  assert.match(plist, /--hidden/);
  assert.equal(await isAutostart({ home, platform: 'darwin' }), true);
});

test('trust store persists, hides secrets from list(), and can encrypt at rest', () => {
  const dir = tmp();
  const codec = { encode: (s) => Buffer.from(s).toString('base64'), decode: (s) => Buffer.from(s, 'base64').toString() };
  const host = new HostService({ dataDir: dir, discovery: false });
  host.store.codec = codec;
  host.store.add({ id: 'dev-12345678', name: 'Phone', platform: 'android', secretHex: 'ab'.repeat(32) });
  assert.equal(host.store.list()[0].secret, undefined);
  assert.equal(host.store.get('dev-12345678').secret, 'ab'.repeat(32));
  const raw = JSON.parse(fs.readFileSync(path.join(dir, 'trust.json'), 'utf8'));
  assert.notEqual(raw.devices['dev-12345678'].secret, 'ab'.repeat(32));
  const again = new HostService({ dataDir: dir, discovery: false, codec });
  assert.equal(again.store.hostId, host.store.hostId);
  assert.equal(again.store.get('dev-12345678').secret, 'ab'.repeat(32));
  host.pin.stop(); again.pin.stop();
});

test('platform-tools installer downloads, unpacks and finds adb (local mirror)', async (t) => {
  if (process.platform === 'win32') return t.skip('uses unzip');
  try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); execFileSync('zip', ['-v'], { stdio: 'ignore' }); } catch { return t.skip('zip/unzip not installed'); }
  const src = tmp();
  fs.mkdirSync(path.join(src, 'platform-tools'));
  fs.writeFileSync(path.join(src, 'platform-tools', 'adb'), '#!/bin/sh\necho "Android Debug Bridge version 1.0.41"\n');
  execFileSync('zip', ['-qr', path.join(src, 'pt.zip'), 'platform-tools'], { cwd: src });
  const zip = fs.readFileSync(path.join(src, 'pt.zip'));
  const srv = http.createServer((req, res) => {
    if (req.url === '/redir') { res.writeHead(302, { location: '/pt.zip' }); return res.end(); }
    res.writeHead(200, { 'content-length': zip.length }); res.end(zip);
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  t.after(() => srv.close());
  process.env.CASTDESK_PLATFORM_TOOLS_URL = `http://127.0.0.1:${srv.address().port}/redir`;
  t.after(() => delete process.env.CASTDESK_PLATFORM_TOOLS_URL);
  const dir = tmp();
  const seen = [];
  const adbPath = await installPlatformTools(dir, { onProgress: (p) => seen.push(p) });
  assert.ok(fs.existsSync(adbPath));
  assert.ok(seen.at(-1) === 100);
  const fwd = new AdbForwarder({ toolsDir: dir });
  assert.equal(fwd.adb, adbPath);
  assert.equal(await fwd.available(), true);
  // a failing download reports a readable error
  process.env.CASTDESK_PLATFORM_TOOLS_URL = 'http://127.0.0.1:1/none.zip';
  await assert.rejects(installPlatformTools(tmp()), /Could not reach/);
});

test('adb parseDevices keeps unauthorized and offline phones visible', () => {
  const out = 'List of devices attached\nABC123\tunauthorized usb:1-1 transport_id:1\nXYZ\tdevice usb:1-2 product:p model:Pixel_8 device:d transport_id:2\n\n';
  const list = AdbForwarder.parseDevices(out);
  assert.deepEqual(list.map((d) => [d.serial, d.state, d.model]), [['ABC123', 'unauthorized', 'ABC123'], ['XYZ', 'device', 'Pixel_8']]);
});

test('unzip command: Windows uses PowerShell (never GNU tar, which breaks on C:\\ paths)', () => {
  const [cmd, args] = extractCommand('C:\\Users\\A B\\x.zip', 'C:\\Users\\A B\\out', 'win32');
  assert.equal(cmd, 'powershell');
  assert.match(args.at(-1), /Expand-Archive -LiteralPath 'C:\\Users\\A B\\x\.zip' -DestinationPath 'C:\\Users\\A B\\out' -Force/);
  assert.equal(extractCommand('a.zip', 'o', 'linux')[0], 'unzip');
  assert.equal(extractCommand('a.zip', 'o', 'darwin')[0], '/usr/bin/ditto');
});
