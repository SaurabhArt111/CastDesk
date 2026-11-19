/**
 * Wire protocol helpers.
 *
 * Control traffic is JSON text frames. Video frames are binary:
 *
 *   byte 0      frame type (FRAME.VIDEO_JPEG)
 *   byte 1      display id (0-255)
 *   bytes 2-3   width  (uint16 BE)
 *   bytes 4-5   height (uint16 BE)
 *   bytes 6-9   sequence number (uint32 BE)
 *   bytes 10..  payload (JPEG)
 */
import { FRAME, FRAME_HEADER_BYTES } from './constants.js';
import { hmacHex, utf8, concat, randomHex, timingSafeEqual } from './bytes.js';

/** Message type names. */
export const MSG = Object.freeze({
  HELLO: 'hello',
  WELCOME: 'welcome',
  AUTH: 'auth',
  AUTH_OK: 'auth-ok',
  AUTH_FAIL: 'auth-fail',
  PAIR_START: 'pair-start',
  PAIR_Y: 'pair-y',
  PAIR_CONFIRM: 'pair-confirm',
  PAIR_OK: 'pair-ok',
  PAIR_FAIL: 'pair-fail',
  DISPLAYS: 'displays',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  INPUT: 'input',
  PING: 'ping',
  PONG: 'pong',
  PERM: 'perm',
  BYE: 'bye',
  DEMAND: 'demand', // host -> local capture source
  KEYFRAME: 'keyframe', // viewer -> host, host -> source: please send a fresh key frame
});

export function encodeFrame({ type = FRAME.VIDEO_JPEG, displayId, width, height, seq, data }) {
  const payload = data instanceof Uint8Array ? data : new Uint8Array(data);
  const out = new Uint8Array(FRAME_HEADER_BYTES + payload.length);
  const dv = new DataView(out.buffer);
  dv.setUint8(0, type);
  dv.setUint8(1, displayId & 0xff);
  dv.setUint16(2, width & 0xffff);
  dv.setUint16(4, height & 0xffff);
  dv.setUint32(6, seq >>> 0);
  out.set(payload, FRAME_HEADER_BYTES);
  return out;
}

export function decodeFrame(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length < FRAME_HEADER_BYTES) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  return {
    type: dv.getUint8(0),
    displayId: dv.getUint8(1),
    width: dv.getUint16(2),
    height: dv.getUint16(4),
    seq: dv.getUint32(6),
    data: u8.subarray(FRAME_HEADER_BYTES),
  };
}

export function parseMessage(raw) {
  try {
    const m = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    return m && typeof m === 'object' && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}

/* ---------------- trusted-device (no PIN) mutual authentication ---------------- */

/**
 * After the first PIN pairing both sides hold a 256-bit device secret.
 * Reconnecting is a mutual HMAC challenge-response, so no PIN is needed and the
 * secret never crosses the wire again.
 */
export const newNonce = () => randomHex(16);

export function authProof(secretHex, role, hostNonce, clientNonce, deviceId) {
  return hmacHex(secretHex, utf8(`castdesk-auth-v1|${role}|${deviceId}|${hostNonce}|${clientNonce}`));
}

export function verifyProof(secretHex, role, hostNonce, clientNonce, deviceId, proof) {
  return typeof proof === 'string' && timingSafeEqual(authProof(secretHex, role, hostNonce, clientNonce, deviceId), proof);
}

/* ------------------------------ input validation ------------------------------ */

const BUTTONS = new Set(['left', 'right', 'middle', 'back', 'forward']);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const unit = (v) => clamp(num(v), 0, 1);

/**
 * Whitelist + clamp an untrusted input message from a client. Returns a clean
 * object or null. The host never injects anything that did not pass through here.
 */
export function sanitizeInput(m) {
  if (!m || typeof m !== 'object') return null;
  const base = {};
  if (typeof m.display === 'number') base.display = m.display & 0xff;
  switch (m.k) {
    case 'move':
      return { ...base, k: 'move', x: unit(m.x), y: unit(m.y) };
    case 'rel':
      return { k: 'rel', dx: clamp(num(m.dx), -2000, 2000), dy: clamp(num(m.dy), -2000, 2000) };
    case 'down':
    case 'up':
      if (!BUTTONS.has(m.button)) return null;
      return { ...base, k: m.k, button: m.button, ...(m.x !== undefined ? { x: unit(m.x), y: unit(m.y) } : {}) };
    case 'click':
      if (!BUTTONS.has(m.button)) return null;
      return { k: 'click', button: m.button, count: clamp(Math.round(num(m.count, 1)), 1, 3) };
    case 'wheel':
      return { k: 'wheel', dx: clamp(num(m.dx), -5000, 5000), dy: clamp(num(m.dy), -5000, 5000), ctrl: !!m.ctrl };
    case 'key':
      if (typeof m.code !== 'string' || m.code.length > 32) return null;
      return { k: 'key', code: m.code, down: !!m.down };
    case 'text':
      if (typeof m.text !== 'string') return null;
      return { k: 'text', text: m.text.slice(0, 256) };
    case 'pen':
      return {
        ...base,
        k: 'pen',
        x: unit(m.x),
        y: unit(m.y),
        pressure: unit(m.pressure),
        down: !!m.down,
        eraser: !!m.eraser,
        tiltX: clamp(num(m.tiltX), -90, 90),
        tiltY: clamp(num(m.tiltY), -90, 90),
      };
    case 'gesture':
      return ['swipe-left', 'swipe-right', 'swipe-up', 'swipe-down'].includes(m.name) ? { k: 'gesture', name: m.name } : null;
    default:
      return null;
  }
}

export function joinBytes(...p) {
  return concat(...p);
}
