import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  sha256Hex, hmacHex, toHex, fromHex, Speke, encodeFrame, decodeFrame, sanitizeInput,
  authProof, verifyProof, newNonce, snapDisplay, isConnected, hasOverlap, normalizeLayout,
  toDesktopPoint, TrackpadEngine, FRAME,
} from '../src/index.js';

test('sha256 matches official vectors and node:crypto', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 1000, 70000]) {
    const buf = crypto.randomBytes(n);
    assert.equal(sha256Hex(buf), crypto.createHash('sha256').update(buf).digest('hex'), `len ${n}`);
  }
});

test('hmac-sha256 matches RFC 4231 + node:crypto (long keys too)', () => {
  assert.equal(
    hmacHex('Jefe', 'what do ya want for nothing?'),
    '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
  );
  const key = crypto.randomBytes(131);
  const msg = crypto.randomBytes(500);
  assert.equal(hmacHex(key, msg), crypto.createHmac('sha256', key).update(msg).digest('hex'));
});

test('SPEKE: same PIN yields same key, wrong PIN does not', () => {
  const ctx = 'device-a|host-b';
  const c = new Speke({ pin: '482913', role: 'client', context: ctx });
  const s = new Speke({ pin: '482913', role: 'server', context: ctx });
  assert.ok(s.derive(c.publicHex));
  assert.ok(c.derive(s.publicHex));
  assert.equal(toHex(c.key), toHex(s.key));
  assert.ok(s.verify('client', c.mac('client')));
  assert.ok(!s.verify('server', c.mac('client')));

  const bad = new Speke({ pin: '000000', role: 'client', context: ctx });
  const s2 = new Speke({ pin: '482913', role: 'server', context: ctx });
  assert.ok(s2.derive(bad.publicHex));
  assert.ok(bad.derive(s2.publicHex));
  assert.notEqual(toHex(bad.key), toHex(s2.key));
  assert.ok(!s2.verify('client', bad.mac('client')));
});

test('SPEKE rejects invalid peer values and seals secrets', () => {
  const s = new Speke({ pin: '123456', role: 'server' });
  assert.equal(s.derive('00'.repeat(256)), false);
  assert.equal(s.derive('ff'.repeat(256)), false);
  assert.equal(s.derive('zz'), false);
  const c = new Speke({ pin: '123456', role: 'client' });
  s.derive(c.publicHex);
  c.derive(s.publicHex);
  const secret = crypto.randomBytes(32);
  const sealed = s.seal(secret);
  assert.deepEqual(Buffer.from(c.open(sealed)), secret);
  sealed.tag = sealed.tag.replace(/.$/, sealed.tag.endsWith('0') ? '1' : '0');
  assert.equal(c.open(sealed), null);
});

test('trusted-device mutual auth proofs', () => {
  const secret = toHex(crypto.randomBytes(32));
  const hn = newNonce();
  const cn = newNonce();
  const proof = authProof(secret, 'client', hn, cn, 'dev1');
  assert.ok(verifyProof(secret, 'client', hn, cn, 'dev1', proof));
  assert.ok(!verifyProof(secret, 'server', hn, cn, 'dev1', proof));
  assert.ok(!verifyProof(secret, 'client', hn, cn, 'dev2', proof));
  assert.ok(!verifyProof(toHex(crypto.randomBytes(32)), 'client', hn, cn, 'dev1', proof));
});

test('frame encode/decode roundtrip', () => {
  const data = crypto.randomBytes(1234);
  const f = decodeFrame(encodeFrame({ displayId: 3, width: 1920, height: 1080, seq: 4000000000, data }));
  assert.equal(f.type, FRAME.VIDEO_JPEG);
  assert.equal(f.displayId, 3);
  assert.equal(f.width, 1920);
  assert.equal(f.height, 1080);
  assert.equal(f.seq, 4000000000);
  assert.deepEqual(Buffer.from(f.data), data);
  assert.equal(decodeFrame(new Uint8Array(3)), null);
});

test('sanitizeInput whitelists and clamps', () => {
  assert.deepEqual(sanitizeInput({ k: 'move', x: 5, y: -2 }), { k: 'move', x: 1, y: 0 });
  assert.equal(sanitizeInput({ k: 'down', button: 'evil' }), null);
  assert.equal(sanitizeInput({ k: 'exec', cmd: 'rm -rf /' }), null);
  assert.equal(sanitizeInput({ k: 'key', code: 'x'.repeat(100) }), null);
  assert.equal(sanitizeInput({ k: 'text', text: 'a'.repeat(1000) }).text.length, 256);
  assert.equal(sanitizeInput({ k: 'rel', dx: 1e9, dy: NaN }).dx, 2000);
  assert.equal(sanitizeInput({ k: 'rel', dx: 1e9, dy: NaN }).dy, 0);
  assert.equal(sanitizeInput(null), null);
});

test('layout: snapping keeps displays touching and non-overlapping', () => {
  const main = { id: 1, x: 0, y: 0, w: 1920, h: 1080, primary: true };
  const other = { id: 2, x: 1950, y: 40, w: 1280, h: 720 };
  const p = snapDisplay(other, [main]);
  assert.equal(p.x, 1920);
  assert.ok(!hasOverlap([main, { ...other, ...p }]));
  assert.ok(isConnected([main, { ...other, ...p }]));
  // dropping on top of the primary snaps outward, never overlapping
  const onTop = snapDisplay({ id: 3, x: 100, y: 100, w: 800, h: 600 }, [main]);
  assert.ok(!hasOverlap([main, { id: 3, w: 800, h: 600, ...onTop }]));
  // above-aligned
  const above = snapDisplay({ id: 4, x: 30, y: -700, w: 1280, h: 720 }, [main]);
  assert.equal(above.y, -720);
  assert.equal(above.x, 0); // aligns left edge within threshold
  assert.ok(!isConnected([main, { id: 5, x: 5000, y: 0, w: 100, h: 100 }]));
});

test('layout: normalize + desktop point mapping', () => {
  const n = normalizeLayout([{ id: 1, x: 100, y: 50, w: 10, h: 10, primary: true }, { id: 2, x: 110, y: 50, w: 10, h: 10 }]);
  assert.deepEqual([n[0].x, n[0].y, n[1].x, n[1].y], [0, 0, 10, 0]);
  assert.deepEqual(toDesktopPoint({ x: 1920, y: 0, w: 1280, h: 720 }, 0, 0), { x: 1920, y: 0 });
  assert.deepEqual(toDesktopPoint({ x: 1920, y: 0, w: 1280, h: 720 }, 1, 1), { x: 3199, y: 719 });
});

function engine(opts) {
  const out = [];
  return { out, e: new TrackpadEngine((c) => out.push(c), { acceleration: false, sensitivity: 1, ...opts }) };
}

test('trackpad: tap, right-click, middle-click', () => {
  let { e, out } = engine();
  e.pointerDown(1, 10, 10, 0);
  e.pointerUp(1, 10, 10, 100);
  assert.deepEqual(out, [{ k: 'click', button: 'left', count: 1 }]);

  ({ e, out } = engine());
  e.pointerDown(1, 10, 10, 0);
  e.pointerDown(2, 50, 10, 5);
  e.pointerUp(2, 50, 10, 90);
  e.pointerUp(1, 10, 10, 100);
  assert.deepEqual(out, [{ k: 'click', button: 'right', count: 1 }]);

  ({ e, out } = engine());
  e.pointerDown(1, 0, 0, 0);
  e.pointerDown(2, 20, 0, 1);
  e.pointerDown(3, 40, 0, 2);
  e.pointerUp(3, 40, 0, 80);
  e.pointerUp(2, 20, 0, 85);
  e.pointerUp(1, 0, 0, 90);
  assert.deepEqual(out, [{ k: 'click', button: 'middle', count: 1 }]);
});

test('trackpad: move, scroll, tap-drag', () => {
  let { e, out } = engine();
  e.pointerDown(1, 0, 0, 0);
  e.pointerMove(1, 20, 5);
  e.pointerUp(1, 20, 5, 500);
  assert.deepEqual(out, [{ k: 'rel', dx: 20, dy: 5 }]);

  ({ e, out } = engine());
  e.pointerDown(1, 0, 100, 0);
  e.pointerDown(2, 40, 100, 0);
  e.pointerMove(1, 0, 120, 10); // both fingers swipe down -> natural scroll => negative wheel dy
  e.pointerMove(2, 40, 120, 10);
  const w = out.filter((c) => c.k === 'wheel');
  assert.ok(w.length >= 1 && w.every((c) => c.dy < 0 && !c.ctrl));
  assert.equal(Math.round(w.reduce((n, c) => n + c.dy, 0)), -60);

  ({ e, out } = engine());
  e.pointerDown(1, 0, 0, 0);
  e.pointerUp(1, 0, 0, 80); // tap
  e.pointerDown(1, 0, 0, 200); // quick second touch
  e.pointerMove(1, 40, 0, 210);
  e.pointerUp(1, 40, 0, 300);
  assert.deepEqual(out.map((c) => c.k), ['click', 'down', 'rel', 'up']);
});

test('trackpad: pinch zoom and three-finger swipe', () => {
  let { e, out } = engine();
  e.pointerDown(1, 100, 100, 0);
  e.pointerDown(2, 200, 100, 0);
  e.pointerMove(1, 90, 100, 10); // fingers spread apart
  e.pointerMove(2, 210, 100, 10);
  assert.ok(out.length === 1 && out[0].ctrl && out[0].dy < 0, JSON.stringify(out));

  ({ e, out } = engine());
  e.pointerDown(1, 0, 0, 0);
  e.pointerDown(2, 20, 0, 0);
  e.pointerDown(3, 40, 0, 0);
  for (const id of [1, 2, 3]) e.pointerMove(id, 200 + id, 0, 50);
  for (const id of [1, 2, 3]) e.pointerUp(id, 200 + id, 0, 400);
  assert.deepEqual(out, [{ k: 'gesture', name: 'swipe-right' }]);
});
