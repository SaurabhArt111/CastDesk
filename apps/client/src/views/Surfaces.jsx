import { useEffect, useMemo, useRef } from 'react';
import { TrackpadEngine } from '@castdesk/shared';
import { vibrate } from '../lib/format.js';
import Icon from '../components/Icon.jsx';

const BUTTONS = { 0: 'left', 1: 'middle', 2: 'right' };

/** Coalesce high-rate pointer moves to one send per animation frame. */
function useRafSender() {
  const pending = useRef(null);
  const raf = useRef(0);
  return (fn) => {
    pending.current = fn;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const f = pending.current;
      pending.current = null;
      f?.();
    });
  };
}

/* ------------------------------------------------------------------ */
/* DIRECT: touch / mouse acts exactly where you touch the picture      */
/* ------------------------------------------------------------------ */
export function DirectSurface({ conn, displayId, prefs }) {
  const ref = useRef(null);
  const st = useRef({ touches: new Map(), mode: 'idle', startT: 0, long: null, button: null });
  const rafSend = useRafSender();

  const norm = (e) => {
    const r = ref.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const send = (e) => conn.input({ display: displayId, ...e });

  useEffect(() => {
    const el = ref.current;
    const onWheel = (e) => {
      e.preventDefault();
      conn.input({ k: 'wheel', dx: e.deltaX, dy: e.deltaY, ctrl: e.ctrlKey });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [conn]);

  const down = (e) => {
    ref.current.setPointerCapture(e.pointerId);
    const s = st.current;
    if (e.pointerType !== 'touch') {
      s.button = BUTTONS[e.button] || 'left';
      send({ k: 'down', button: s.button, ...norm(e) });
      return;
    }
    s.touches.set(e.pointerId, { cx: e.clientX, cy: e.clientY, sx: e.clientX, sy: e.clientY, p: norm(e) });
    if (s.touches.size === 1) {
      s.mode = 'pending';
      s.startT = performance.now();
      s.long = setTimeout(() => {
        if (st.current.mode === 'pending') {
          st.current.mode = 'done';
          const t = [...st.current.touches.values()][0];
          send({ k: 'move', ...t.p });
          send({ k: 'click', button: 'right', count: 1 });
          vibrate(prefs.haptics);
        }
      }, 550);
    } else {
      clearTimeout(s.long);
      s.mode = 'scroll';
    }
  };

  const move = (e) => {
    const s = st.current;
    if (e.pointerType !== 'touch') {
      const p = norm(e);
      rafSend(() => send({ k: 'move', ...p }));
      return;
    }
    const t = s.touches.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.cx;
    const dy = e.clientY - t.cy;
    t.cx = e.clientX;
    t.cy = e.clientY;
    const p = norm(e);
    if (s.mode === 'pending' && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) > 10) {
      clearTimeout(s.long);
      s.mode = 'drag';
      send({ k: 'down', button: 'left', ...t.p });
    }
    if (s.mode === 'drag') rafSend(() => send({ k: 'move', ...p }));
    else if (s.mode === 'scroll') {
      const sign = prefs.naturalScroll ? -1 : 1;
      conn.input({ k: 'wheel', dx: (sign * dx * 3) / s.touches.size, dy: (sign * dy * 3) / s.touches.size, ctrl: false });
    }
  };

  const up = (e) => {
    const s = st.current;
    if (e.pointerType !== 'touch') {
      send({ k: 'up', button: s.button || 'left', ...norm(e) });
      return;
    }
    const t = s.touches.get(e.pointerId);
    s.touches.delete(e.pointerId);
    if (s.touches.size > 0) return;
    clearTimeout(s.long);
    if (s.mode === 'pending' && t) {
      send({ k: 'move', ...norm(e) });
      send({ k: 'click', button: 'left', count: 1 });
      vibrate(prefs.haptics);
    } else if (s.mode === 'drag') send({ k: 'up', button: 'left', ...norm(e) });
    s.mode = 'idle';
  };

  return (
    <div
      ref={ref}
      className="surface surface-direct"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}

/* ------------------------------------------------------------------ */
/* TRACKPAD: relative movement + gestures, like a laptop trackpad       */
/* ------------------------------------------------------------------ */
export function TrackpadSurface({ conn, prefs, compact = false }) {
  const engine = useMemo(
    () =>
      new TrackpadEngine((cmd) => {
        conn.input(cmd);
        if (cmd.k === 'click' || cmd.k === 'gesture') vibrate(prefs.haptics);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conn],
  );
  useEffect(() => {
    engine.setOptions({ sensitivity: prefs.sensitivity, acceleration: prefs.acceleration, naturalScroll: prefs.naturalScroll, scrollSpeed: prefs.scrollSpeed });
  }, [engine, prefs.sensitivity, prefs.acceleration, prefs.naturalScroll, prefs.scrollSpeed]);

  const held = useRef(new Set());
  const btn = (button) => ({
    onPointerDown: (e) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      held.current.add(button);
      conn.input({ k: 'down', button });
      vibrate(prefs.haptics);
    },
    onPointerUp: () => {
      if (held.current.delete(button)) conn.input({ k: 'up', button });
    },
    onPointerCancel: () => {
      if (held.current.delete(button)) conn.input({ k: 'up', button });
    },
  });

  return (
    <div className={`pad ${compact ? 'compact' : ''}`}>
      <div
        className="surface surface-trackpad"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          engine.pointerDown(e.pointerId, e.clientX, e.clientY, e.timeStamp);
        }}
        onPointerMove={(e) => engine.pointerMove(e.pointerId, e.clientX, e.clientY, e.timeStamp)}
        onPointerUp={(e) => engine.pointerUp(e.pointerId, e.clientX, e.clientY, e.timeStamp)}
        onPointerCancel={() => engine.pointerCancel()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="pad-hint">
          <Icon name="trackpad" size={30} />
          <span>Move with one finger · tap to click</span>
          {!compact && <span>Two fingers scroll · two-finger tap right-clicks</span>}
          {!compact && <span>Tap, then drag to drag-and-drop · three fingers swipe</span>}
        </div>
      </div>
      <div className="pad-buttons">
        <button {...btn('left')}>Left</button>
        <button {...btn('middle')} className="narrow" aria-label="Middle click">
          <Icon name="cursor" size={16} />
        </button>
        <button {...btn('right')}>Right</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PEN: absolute graphics-tablet style with pressure                    */
/* ------------------------------------------------------------------ */
export function PenSurface({ conn, displayId }) {
  const ref = useRef(null);
  const rafSend = useRafSender();
  const contact = useRef(false);

  const emit = (e, down) => {
    const r = ref.current.getBoundingClientRect();
    const msg = {
      k: 'pen',
      display: displayId,
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      pressure: down ? (e.pressure > 0 ? e.pressure : 0.5) : 0,
      down,
      eraser: (e.buttons & 32) !== 0,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0,
    };
    if (down === contact.current && down) rafSend(() => conn.input(msg));
    else conn.input(msg);
    contact.current = down;
  };

  return (
    <div
      ref={ref}
      className="surface surface-pen"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        emit(e, true);
      }}
      onPointerMove={(e) => emit(e, e.buttons > 0 && contact.current)}
      onPointerUp={(e) => emit(e, false)}
      onPointerCancel={(e) => emit(e, false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pad-hint pen-hint">
        <Icon name="pen" size={26} />
        <span>This surface is your drawing tablet</span>
      </div>
    </div>
  );
}
