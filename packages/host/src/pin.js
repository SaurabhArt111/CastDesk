import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PIN_LENGTH, PIN_TTL_MS, PIN_MAX_ATTEMPTS } from '@castdesk/shared';

/**
 * One-time pairing PIN. It rotates after a successful pairing, after it
 * expires, and after too many wrong guesses - so brute-forcing the 10^6
 * space is not practical even for an active attacker on the LAN.
 */
export class PinManager extends EventEmitter {
  constructor({ length = PIN_LENGTH, ttl = PIN_TTL_MS, maxAttempts = PIN_MAX_ATTEMPTS } = {}) {
    super();
    this.length = length;
    this.ttl = ttl;
    this.maxAttempts = maxAttempts;
    this.rotate('init');
  }

  #generate() {
    return String(crypto.randomInt(0, 10 ** this.length)).padStart(this.length, '0');
  }

  rotate(reason = 'manual') {
    this.pin = this.#generate();
    this.expiresAt = Date.now() + this.ttl;
    this.attempts = 0;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.rotate('expired'), this.ttl);
    this.timer.unref?.();
    this.emit('change', this.snapshot(), reason);
    return this.pin;
  }

  snapshot() {
    return { pin: this.pin, expiresAt: this.expiresAt, attemptsLeft: Math.max(0, this.maxAttempts - this.attempts) };
  }

  /** The PIN to use for a new key exchange (rotates first if it has expired). */
  current() {
    if (Date.now() > this.expiresAt) this.rotate('expired');
    return this.pin;
  }

  /** Record the outcome of a pairing attempt. Returns attempts remaining. */
  record(success) {
    if (success) {
      this.rotate('paired');
      return this.maxAttempts;
    }
    this.attempts++;
    const left = this.maxAttempts - this.attempts;
    if (left <= 0) this.rotate('locked');
    else this.emit('change', this.snapshot(), 'attempt');
    return Math.max(0, left);
  }

  stop() {
    clearTimeout(this.timer);
  }
}
