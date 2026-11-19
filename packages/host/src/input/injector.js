import { toDesktopPoint, desktopBounds } from '@paneo/shared';
import { domCodeToKeyName } from './keymap.js';

const NOTCH = 40; // wheel "pixels" per scroll notch

/** Shortcuts for 3-finger swipes, per host OS. */
const GESTURE_KEYS = {
  win32: {
    'swipe-up': ['LeftSuper', 'Tab'],
    'swipe-down': ['LeftSuper', 'D'],
    'swipe-left': ['LeftControl', 'LeftSuper', 'Right'],
    'swipe-right': ['LeftControl', 'LeftSuper', 'Left'],
  },
  darwin: {
    'swipe-up': ['LeftControl', 'Up'],
    'swipe-down': ['LeftControl', 'Down'],
    'swipe-left': ['LeftControl', 'Right'],
    'swipe-right': ['LeftControl', 'Left'],
  },
  linux: {
    'swipe-up': ['LeftSuper'],
    'swipe-down': ['LeftSuper', 'D'],
    'swipe-left': ['LeftControl', 'LeftAlt', 'Right'],
    'swipe-right': ['LeftControl', 'LeftAlt', 'Left'],
  },
};

/** Adapter around @nut-tree-fork/nut-js. Loaded lazily so the app still runs when it is unavailable. */
export async function createNutBackend() {
  const mod = await import('@nut-tree-fork/nut-js');
  const { mouse, keyboard, Key, Button, Point } = mod.default || mod;
  mouse.config.autoDelayMs = 0;
  keyboard.config.autoDelayMs = 0;
  const btn = (b) => ({ left: Button.LEFT, right: Button.RIGHT, middle: Button.MIDDLE }[b]);
  return {
    name: 'nut-js',
    setPosition: (x, y) => mouse.setPosition(new Point(x, y)),
    getPosition: async () => {
      const p = await mouse.getPosition();
      return { x: p.x, y: p.y };
    },
    press: async (b) => btn(b) !== undefined && mouse.pressButton(btn(b)),
    release: async (b) => btn(b) !== undefined && mouse.releaseButton(btn(b)),
    scroll: async (notchesX, notchesY) => {
      if (notchesY > 0) await mouse.scrollDown(notchesY);
      else if (notchesY < 0) await mouse.scrollUp(-notchesY);
      if (notchesX > 0) await mouse.scrollRight(notchesX);
      else if (notchesX < 0) await mouse.scrollLeft(-notchesX);
    },
    keyDown: async (name) => Key[name] !== undefined && keyboard.pressKey(Key[name]),
    keyUp: async (name) => Key[name] !== undefined && keyboard.releaseKey(Key[name]),
    type: (text) => keyboard.type(text),
  };
}

/**
 * Turns sanitized input events from a viewer into real mouse / keyboard input
 * on this machine. Backend is pluggable so it can be unit-tested.
 */
export class InputInjector {
  constructor({ backend = null, platform = process.platform } = {}) {
    this.platform = platform;
    this.backend = backend;
    this.error = null;
    this.pos = null;
    this.frac = { x: 0, y: 0 };
    this.scrollAcc = { x: 0, y: 0 };
    this.buttons = new Set();
    this.keys = new Set();
    this.penDown = false;
    this.ready = backend ? Promise.resolve() : this.#init();
    this.queue = Promise.resolve();
  }

  async #init() {
    try {
      this.backend = await createNutBackend();
    } catch (e) {
      this.error = e.message;
    }
  }

  get available() {
    return Boolean(this.backend);
  }

  /** Serialise events so button-down / move / button-up never interleave out of order. */
  handle(e, displays) {
    const run = () => this.#handle(e, displays);
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async #handle(e, displays) {
    await this.ready;
    if (!this.backend) throw new Error(`Input injection unavailable (${this.error || 'no backend'})`);
    const b = this.backend;

    switch (e.k) {
      case 'move':
        await this.#absolute(displays, e.display, e.x, e.y);
        break;
      case 'rel': {
        if (!this.pos) this.pos = await b.getPosition();
        this.frac.x += e.dx;
        this.frac.y += e.dy;
        const mx = Math.trunc(this.frac.x);
        const my = Math.trunc(this.frac.y);
        this.frac.x -= mx;
        this.frac.y -= my;
        if (!mx && !my) break;
        const bounds = desktopBounds(displays);
        const x = Math.min(bounds.x + bounds.w - 1, Math.max(bounds.x, this.pos.x + mx));
        const y = Math.min(bounds.y + bounds.h - 1, Math.max(bounds.y, this.pos.y + my));
        this.pos = { x, y };
        await b.setPosition(x, y);
        break;
      }
      case 'down':
        if (e.x !== undefined) await this.#absolute(displays, e.display, e.x, e.y);
        this.buttons.add(e.button);
        await b.press(e.button);
        break;
      case 'up':
        if (e.x !== undefined) await this.#absolute(displays, e.display, e.x, e.y);
        this.buttons.delete(e.button);
        await b.release(e.button);
        break;
      case 'click':
        for (let i = 0; i < e.count; i++) {
          await b.press(e.button);
          await b.release(e.button);
        }
        break;
      case 'wheel':
        await this.#wheel(e);
        break;
      case 'key': {
        const name = domCodeToKeyName(e.code);
        if (!name) break;
        if (e.down) {
          this.keys.add(name);
          await b.keyDown(name);
        } else {
          this.keys.delete(name);
          await b.keyUp(name);
        }
        break;
      }
      case 'text':
        await b.type(e.text);
        break;
      case 'pen': {
        await this.#absolute(displays, e.display, e.x, e.y);
        const btn = e.eraser ? 'right' : 'left';
        if (e.down && !this.penDown) {
          this.penDown = btn;
          await b.press(btn);
        } else if (!e.down && this.penDown) {
          await b.release(this.penDown);
          this.penDown = false;
        }
        break;
      }
      case 'gesture': {
        const combo = GESTURE_KEYS[this.platform]?.[e.name];
        if (!combo) break;
        for (const k of combo) await b.keyDown(k);
        for (const k of [...combo].reverse()) await b.keyUp(k);
        break;
      }
    }
  }

  async #absolute(displays, displayId, nx, ny) {
    const d = displays.find((x) => x.id === displayId) || displays.find((x) => x.primary) || displays[0];
    if (!d) return;
    const p = toDesktopPoint(d, nx, ny);
    this.pos = p;
    this.frac = { x: 0, y: 0 };
    await this.backend.setPosition(p.x, p.y);
  }

  async #wheel(e) {
    this.scrollAcc.x += e.dx;
    this.scrollAcc.y += e.dy;
    const nx = Math.trunc(this.scrollAcc.x / NOTCH);
    const ny = Math.trunc(this.scrollAcc.y / NOTCH);
    if (!nx && !ny) return;
    this.scrollAcc.x -= nx * NOTCH;
    this.scrollAcc.y -= ny * NOTCH;
    const mod = this.platform === 'darwin' ? 'LeftSuper' : 'LeftControl';
    if (e.ctrl) await this.backend.keyDown(mod);
    try {
      await this.backend.scroll(nx, ny);
    } finally {
      if (e.ctrl) await this.backend.keyUp(mod);
    }
  }

  /** Release anything still held (called when a controlling client disconnects). */
  async releaseAll() {
    await this.ready;
    if (!this.backend) return;
    for (const b of this.buttons) await this.backend.release(b).catch(() => {});
    for (const k of this.keys) await this.backend.keyUp(k).catch(() => {});
    if (this.penDown) await this.backend.release(this.penDown).catch(() => {});
    this.buttons.clear();
    this.keys.clear();
    this.penDown = false;
  }
}
