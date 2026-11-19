/**
 * Display arrangement maths - the same behaviour as the Windows
 * "Display settings" screen: monitors are rectangles on one shared desktop,
 * they may never overlap, and each one must touch another along an edge.
 *
 * A display is { id, name, x, y, w, h, primary? } in desktop pixels.
 */

export const rectRight = (r) => r.x + r.w;
export const rectBottom = (r) => r.y + r.h;

export function overlaps(a, b) {
  return a.x < rectRight(b) && rectRight(a) > b.x && a.y < rectBottom(b) && rectBottom(a) > b.y;
}

/** Do two rectangles share part of an edge (touching, with positive overlap)? */
export function touches(a, b) {
  const vOverlap = Math.min(rectBottom(a), rectBottom(b)) - Math.max(a.y, b.y);
  const hOverlap = Math.min(rectRight(a), rectRight(b)) - Math.max(a.x, b.x);
  if ((rectRight(a) === b.x || rectRight(b) === a.x) && vOverlap > 0) return true;
  if ((rectBottom(a) === b.y || rectBottom(b) === a.y) && hOverlap > 0) return true;
  return false;
}

export function isConnected(displays) {
  if (displays.length <= 1) return true;
  const seen = new Set([displays[0].id]);
  const queue = [displays[0]];
  while (queue.length) {
    const cur = queue.pop();
    for (const d of displays) {
      if (!seen.has(d.id) && touches(cur, d)) {
        seen.add(d.id);
        queue.push(d);
      }
    }
  }
  return seen.size === displays.length;
}

export function hasOverlap(displays) {
  for (let i = 0; i < displays.length; i++)
    for (let j = i + 1; j < displays.length; j++) if (overlaps(displays[i], displays[j])) return true;
  return false;
}

export function desktopBounds(displays) {
  if (!displays.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...displays.map((d) => d.x));
  const y = Math.min(...displays.map((d) => d.y));
  return {
    x,
    y,
    w: Math.max(...displays.map(rectRight)) - x,
    h: Math.max(...displays.map(rectBottom)) - y,
  };
}

/**
 * Snap `moving` (at its proposed x/y) so it sits flush against the closest
 * neighbour without overlapping anything. Edges snap-align (top/top, bottom/bottom,
 * left/left, right/right) when within `align` pixels, otherwise the proposed
 * offset along the shared edge is kept.
 */
export function snapDisplay(moving, others, { align = 60, minShared = 100 } = {}) {
  if (!others.length) return { x: moving.x, y: moving.y };
  const candidates = [];
  const add = (x, y) => candidates.push({ x: Math.round(x), y: Math.round(y) });

  for (const o of others) {
    const sharedY = (y) => Math.min(Math.max(y, o.y - moving.h + minShared), rectBottom(o) - minShared);
    const sharedX = (x) => Math.min(Math.max(x, o.x - moving.w + minShared), rectRight(o) - minShared);
    const alignY = (y) => {
      for (const t of [o.y, rectBottom(o) - moving.h, o.y + (o.h - moving.h) / 2]) if (Math.abs(y - t) <= align) return t;
      return sharedY(y);
    };
    const alignX = (x) => {
      for (const t of [o.x, rectRight(o) - moving.w, o.x + (o.w - moving.w) / 2]) if (Math.abs(x - t) <= align) return t;
      return sharedX(x);
    };
    add(rectRight(o), alignY(moving.y)); // to the right of o
    add(o.x - moving.w, alignY(moving.y)); // to the left of o
    add(alignX(moving.x), rectBottom(o)); // below o
    add(alignX(moving.x), o.y - moving.h); // above o
  }

  const valid = candidates.filter((c) => !others.some((o) => overlaps({ ...moving, ...c }, o)));
  const pool = valid.length ? valid : candidates;
  pool.sort((a, b) => Math.hypot(a.x - moving.x, a.y - moving.y) - Math.hypot(b.x - moving.x, b.y - moving.y));
  return pool[0];
}

/** Shift the whole arrangement so the primary display's top-left is (0,0), like Windows. */
export function normalizeLayout(displays) {
  const primary = displays.find((d) => d.primary) || displays[0];
  if (!primary) return displays;
  return displays.map((d) => ({ ...d, x: d.x - primary.x, y: d.y - primary.y }));
}

/** Convert normalised (0..1) coordinates on a display into absolute desktop pixels. */
export function toDesktopPoint(display, nx, ny) {
  return {
    x: Math.round(display.x + Math.min(1, Math.max(0, nx)) * (display.w - 1)),
    y: Math.round(display.y + Math.min(1, Math.max(0, ny)) * (display.h - 1)),
  };
}

/** Which display contains a desktop point (or the nearest one). */
export function displayAt(displays, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const d of displays) {
    const dx = Math.max(d.x - x, 0, x - (rectRight(d) - 1));
    const dy = Math.max(d.y - y, 0, y - (rectBottom(d) - 1));
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      best = d;
      bestDist = dist;
    }
  }
  return best;
}

/** Fit all displays into a box (for the arrangement editor). Returns {scale, ox, oy}. */
export function fitToBox(displays, boxW, boxH, pad = 24) {
  const b = desktopBounds(displays);
  if (!b.w || !b.h) return { scale: 1, ox: 0, oy: 0 };
  // leave room around the bounds so displays can be dragged outward
  const spanW = b.w * 1.35;
  const spanH = b.h * 1.35;
  const scale = Math.min((boxW - pad * 2) / spanW, (boxH - pad * 2) / spanH);
  return {
    scale,
    ox: (boxW - b.w * scale) / 2 - b.x * scale,
    oy: (boxH - b.h * scale) / 2 - b.y * scale,
  };
}
