/**
 * Trackpad gesture engine.
 *
 * Feed it raw pointer events (down / move / up with pixel coordinates and a
 * millisecond timestamp) and it emits host input commands:
 *
 *   1 finger move            -> {k:'rel'}     cursor movement with acceleration
 *   1 finger tap             -> {k:'click', button:'left'}
 *   tap, then touch + drag   -> {k:'down'} ... {k:'rel'} ... {k:'up'}  (drag & drop)
 *   2 finger move            -> {k:'wheel'}   scroll (natural scrolling optional)
 *   2 finger pinch           -> {k:'wheel', ctrl:true} zoom
 *   2 finger tap             -> {k:'click', button:'right'}
 *   3 finger tap             -> {k:'click', button:'middle'}
 *   3 finger swipe           -> {k:'gesture', name:'swipe-left|right|up|down'}
 *
 * It is pure logic with no DOM access, so it is unit-tested in Node.
 */
export class TrackpadEngine {
  constructor(emit, options = {}) {
    this.emit = emit;
    this.o = {
      sensitivity: 1.4,
      acceleration: true,
      scrollSpeed: 1,
      naturalScroll: true,
      tapMs: 240,
      tapSlop: 10,
      dragWindowMs: 320,
      swipeDistance: 80,
      ...options,
    };
    this.pointers = new Map();
    this.lastTapAt = -Infinity;
    this.reset();
  }

  setOptions(o) {
    Object.assign(this.o, o);
  }

  reset() {
    this.pointers.clear();
    this.dragging = false;
    this.dragCandidate = false;
    this.maxFingers = 0;
    this.moved = false;
    this.startAt = 0;
    this.swipe = { x: 0, y: 0 };
  }

  pointerDown(id, x, y, t) {
    if (this.pointers.size === 0) {
      this.startAt = t;
      this.maxFingers = 0;
      this.moved = false;
      this.swipe = { x: 0, y: 0 };
      this.dragCandidate = t - this.lastTapAt <= this.o.dragWindowMs;
    } else {
      this.dragCandidate = false;
    }
    this.pointers.set(id, { x, y, sx: x, sy: y });
    this.maxFingers = Math.max(this.maxFingers, this.pointers.size);
    if (this.pointers.size === 2) this.#initTwoFinger();
  }

  pointerMove(id, x, y) {
    const p = this.pointers.get(id);
    if (!p) return;
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > this.o.tapSlop) this.moved = true;

    const n = this.pointers.size;
    if (n === 1) {
      if (this.dragCandidate && !this.dragging && this.moved) {
        this.dragging = true;
        this.emit({ k: 'down', button: 'left' });
      }
      const speed = Math.hypot(dx, dy);
      const gain = this.o.sensitivity * (this.o.acceleration ? Math.min(1 + speed * 0.06, 3) : 1);
      if (dx || dy) this.emit({ k: 'rel', dx: dx * gain, dy: dy * gain });
    } else if (n === 2) {
      this.#twoFinger();
    } else if (n >= 3) {
      this.swipe.x += dx / n;
      this.swipe.y += dy / n;
    }
  }

  pointerUp(id, x, y, t) {
    if (!this.pointers.has(id)) return;
    this.pointers.delete(id);
    if (this.pointers.size === 2) this.#initTwoFinger();
    if (this.pointers.size > 0) return;

    if (this.dragging) {
      this.dragging = false;
      this.emit({ k: 'up', button: 'left' });
    } else if (!this.moved && t - this.startAt <= this.o.tapMs) {
      const button = this.maxFingers >= 3 ? 'middle' : this.maxFingers === 2 ? 'right' : 'left';
      this.emit({ k: 'click', button, count: 1 });
      this.lastTapAt = this.maxFingers === 1 ? t : -Infinity;
    } else if (this.maxFingers >= 3) {
      const { x: sx, y: sy } = this.swipe;
      if (Math.max(Math.abs(sx), Math.abs(sy)) >= this.o.swipeDistance) {
        const name = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'swipe-right' : 'swipe-left') : sy > 0 ? 'swipe-down' : 'swipe-up';
        this.emit({ k: 'gesture', name });
      }
    }
    this.maxFingers = 0;
    this.dragCandidate = false;
  }

  pointerCancel() {
    if (this.dragging) this.emit({ k: 'up', button: 'left' });
    this.reset();
  }

  #initTwoFinger() {
    const [a, b] = [...this.pointers.values()];
    // restart movement baselines so earlier one-finger travel doesn't leak in
    for (const p of [a, b]) {
      p.sx = p.x;
      p.sy = p.y;
    }
    this.g2 = { mode: null, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
    this.g2.start = { ...this.g2 };
  }

  /**
   * Two fingers are either scrolling (both move together: the centroid travels)
   * or pinching (they move apart/together: the distance changes). The mode is
   * decided once enough movement has accumulated and then locked for the gesture.
   */
  #twoFinger() {
    const g = this.g2;
    if (!g) return;
    const [a, b] = [...this.pointers.values()];
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    if (!g.mode) {
      const C = Math.hypot(cx - g.start.cx, cy - g.start.cy);
      const D = Math.abs(dist - g.start.dist) / 2;
      const both = [a, b].every((p) => Math.hypot(p.x - p.sx, p.y - p.sy) >= 3);
      const travelled = Math.max(C, D);
      if (!((both && travelled >= 6) || travelled >= 24)) return;
      g.mode = D > C * 1.4 ? 'zoom' : 'scroll';
      g.cx = g.start.cx;
      g.cy = g.start.cy;
      g.dist = g.start.dist;
    }
    if (g.mode === 'zoom') {
      this.emit({ k: 'wheel', dx: 0, dy: -(dist - g.dist) * 4, ctrl: true });
    } else {
      const sign = this.o.naturalScroll ? -1 : 1;
      const s = this.o.scrollSpeed * 3;
      this.emit({ k: 'wheel', dx: sign * (cx - g.cx) * s, dy: sign * (cy - g.cy) * s, ctrl: false });
    }
    g.cx = cx;
    g.cy = cy;
    g.dist = dist;
  }
}
