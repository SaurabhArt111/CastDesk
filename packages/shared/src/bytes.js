/**
 * Tiny dependency-free byte helpers + SHA-256 + HMAC-SHA-256.
 *
 * These are implemented in plain JS on purpose: the browser WebCrypto API
 * (`crypto.subtle`) only exists in secure contexts, and Paneo web clients
 * are frequently served from plain `http://192.168.x.x` on a LAN. A pure-JS
 * implementation works everywhere (Node, Electron, Android WebView, Safari).
 * It is verified against the official test vectors in test/bytes.test.js.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export const utf8 = (s) => enc.encode(s);
export const fromUtf8 = (b) => dec.decode(b);

export function toBytes(x) {
  if (x instanceof Uint8Array) return x;
  if (typeof x === 'string') return utf8(x);
  if (x instanceof ArrayBuffer) return new Uint8Array(x);
  if (ArrayBuffer.isView(x)) return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  throw new TypeError('Expected string or bytes');
}

export function concat(...parts) {
  const arrs = parts.map(toBytes);
  const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of arrs) {
    out.set(a, o);
    o += a.length;
  }
  return out;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));
export function toHex(bytes) {
  const b = toBytes(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += HEX[b[i]];
  return s;
}

export function fromHex(hex) {
  if (typeof hex !== 'string' || hex.length % 2 || /[^0-9a-f]/i.test(hex)) {
    throw new TypeError('Invalid hex string');
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export function randomBytes(n) {
  const out = new Uint8Array(n);
  const c = globalThis.crypto;
  if (!c || !c.getRandomValues) throw new Error('No secure random source available');
  // getRandomValues is limited to 65536 bytes per call
  for (let o = 0; o < n; o += 65536) c.getRandomValues(out.subarray(o, Math.min(o + 65536, n)));
  return out;
}

export const randomHex = (n = 16) => toHex(randomBytes(n));

/** Constant-time comparison of two byte arrays / hex strings. */
export function timingSafeEqual(a, b) {
  const x = typeof a === 'string' ? utf8(a) : toBytes(a);
  const y = typeof b === 'string' ? utf8(b) : toBytes(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/* ------------------------------ SHA-256 ------------------------------ */

const K = new Uint32Array(64);
const H0 = new Uint32Array(8);
(function initConstants() {
  let n = 0;
  for (let c = 2; n < 64; c++) {
    let prime = true;
    for (let d = 2; d * d <= c; d++) {
      if (c % d === 0) {
        prime = false;
        break;
      }
    }
    if (!prime) continue;
    if (n < 8) H0[n] = Math.floor((Math.sqrt(c) % 1) * 2 ** 32);
    K[n] = Math.floor((Math.cbrt(c) % 1) * 2 ** 32);
    n++;
  }
})();

export function sha256(input) {
  const msg = toBytes(input);
  const len = msg.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000));
  dv.setUint32(total - 4, (len << 3) >>> 0);

  const h = Uint32Array.from(H0);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0;
      d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d;
    h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, h[i]);
  return out;
}

export function hmacSha256(key, message) {
  let k = toBytes(key);
  if (k.length > 64) k = sha256(k);
  const ipad = new Uint8Array(64).fill(0x36);
  const opad = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < k.length; i++) {
    ipad[i] ^= k[i];
    opad[i] ^= k[i];
  }
  return sha256(concat(opad, sha256(concat(ipad, message))));
}

export const sha256Hex = (x) => toHex(sha256(x));
export const hmacHex = (key, msg) => toHex(hmacSha256(key, msg));
