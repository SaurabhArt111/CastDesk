/**
 * SPEKE-style password-authenticated key exchange for PIN pairing.
 *
 * Why not just send the PIN? A 6-digit PIN has only 1,000,000 values. If we
 * sent a hash of it, anyone sniffing the LAN could brute-force it offline in
 * milliseconds. With SPEKE the PIN only selects the generator of a
 * Diffie-Hellman group, so an eavesdropper learns nothing that lets them test
 * PIN guesses offline; an active attacker gets exactly one guess per attempt,
 * and the host locks the PIN after PIN_MAX_ATTEMPTS failures.
 *
 * Group: RFC 3526 group 14 (2048-bit MODP safe prime). Pure BigInt, no deps.
 */
import { sha256, hmacSha256, concat, utf8, toHex, fromHex, randomBytes, timingSafeEqual } from './bytes.js';

const P = BigInt('0xffffffffffffffffc90fdaa22168c234c4c6628b80dc1cd129024e088a67cc74020bbea63b139b22514a08798e3404ddef9519b3cd3a431b302b0a6df25f14374fe1356d6d51c245e485b576625e7ec6f44c42e9a637ed6b0bff5cb6f406b7edee386bfb5a899fa5ae9f24117c4b1fe649286651ece45b3dc2007cb8a163bf0598da48361c55d39a69163fa8fd24cf5f83655d23dca3ad961c62f356208552bb9ed529077096966d670c354e4abc9804f1746c08ca18217c32905e462e36ce3be39e772c180e86039b2783a2ec07a28fb5c55df06f4c52c9de2bcbf6955817183995497cea956ae515d2261898fa051015728e5a8aacaa68ffffffffffffffff');
const Q = (P - 1n) / 2n;
const BYTES = 256;

function modPow(base, exp, mod) {
  let result = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod;
    e >>= 1n;
    b = (b * b) % mod;
  }
  return result;
}

const bytesToBig = (u8) => BigInt('0x' + (toHex(u8) || '0'));
const bigToHex = (n) => n.toString(16).padStart(BYTES * 2, '0');

/** Map a PIN to a generator inside the prime-order subgroup. */
export function pinToGenerator(pin, context = '') {
  const parts = [];
  for (let i = 0; i < 9; i++) {
    parts.push(sha256(concat(utf8(`paneo-speke-v1|${context}|${pin}|`), Uint8Array.of(i))));
  }
  const h = bytesToBig(concat(...parts)) % P;
  const g = modPow(h, 2n, P); // squaring lands in the order-q subgroup
  if (g <= 1n) throw new Error('Degenerate generator');
  return g;
}

function validElement(y) {
  if (y <= 1n || y >= P - 1n) return false;
  return modPow(y, Q, P) === 1n; // must lie in the prime-order subgroup
}

export class Speke {
  /**
   * @param {{pin:string, role:'client'|'server', context?:string}} opts
   * context binds the exchange to both device ids so transcripts can't be replayed elsewhere.
   */
  constructor({ pin, role, context = '' }) {
    if (!/^\d{4,12}$/.test(String(pin))) throw new Error('PIN must be digits');
    this.role = role;
    this.context = context;
    this.g = pinToGenerator(String(pin), context);
    this.x = bytesToBig(randomBytes(32)) | 1n;
    this.X = modPow(this.g, this.x, P);
    this.key = null;
  }

  /** Public value to send to the peer (hex). */
  get publicHex() {
    return bigToHex(this.X);
  }

  /** Complete the exchange with the peer's public value. Returns false if it is invalid. */
  derive(peerHex) {
    let Y;
    try {
      if (typeof peerHex !== 'string' || peerHex.length !== BYTES * 2) return false;
      Y = bytesToBig(fromHex(peerHex));
    } catch {
      return false;
    }
    if (!validElement(Y)) return false;
    const shared = modPow(Y, this.x, P);
    const [cx, sy] = this.role === 'client' ? [this.X, Y] : [Y, this.X];
    this.key = sha256(
      concat(utf8('paneo-session-v1|' + this.context + '|'), fromHex(bigToHex(cx)), fromHex(bigToHex(sy)), fromHex(bigToHex(shared))),
    );
    return true;
  }

  mac(label) {
    if (!this.key) throw new Error('Key exchange not complete');
    return toHex(hmacSha256(this.key, utf8('mac|' + label)));
  }

  verify(label, macHex) {
    return typeof macHex === 'string' && timingSafeEqual(this.mac(label), macHex);
  }

  /** Encrypt-then-MAC a short secret (the long-term device key) under the session key. */
  seal(secretBytes) {
    if (!this.key) throw new Error('Key exchange not complete');
    const secret = secretBytes instanceof Uint8Array ? secretBytes : fromHex(secretBytes);
    const stream = keystream(this.key, secret.length);
    const ct = secret.map((b, i) => b ^ stream[i]);
    const tag = hmacSha256(this.key, concat(utf8('seal|'), ct));
    return { ct: toHex(ct), tag: toHex(tag) };
  }

  open({ ct, tag }) {
    if (!this.key) throw new Error('Key exchange not complete');
    const ctb = fromHex(ct);
    const expect = toHex(hmacSha256(this.key, concat(utf8('seal|'), ctb)));
    if (!timingSafeEqual(expect, tag)) return null;
    const stream = keystream(this.key, ctb.length);
    return ctb.map((b, i) => b ^ stream[i]);
  }
}

function keystream(key, length) {
  const out = new Uint8Array(Math.ceil(length / 32) * 32);
  for (let i = 0; i * 32 < length; i++) {
    out.set(hmacSha256(key, concat(utf8('stream|'), Uint8Array.of(i >> 8, i & 255))), i * 32);
  }
  return out.subarray(0, length);
}
