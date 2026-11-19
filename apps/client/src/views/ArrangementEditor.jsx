import { useEffect, useMemo, useRef, useState } from 'react';
import { fitToBox, snapDisplay, desktopBounds } from '@castdesk/shared';

/**
 * Drag-and-drop display arrangement, modelled on Windows "Display settings":
 * rectangles on one shared desktop, edges snap flush, no overlaps.
 * `editable(display)` decides which rectangles can be dragged.
 * `onCommit(id, x, y)` receives the snapped desktop position on drop.
 */
export default function ArrangementEditor({ displays, editable = () => true, onCommit, height = 300, highlight }) {
  const boxRef = useRef(null);
  const [size, setSize] = useState({ w: 600, h: height });
  const [drag, setDrag] = useState(null); // {id, x, y}

  useEffect(() => {
    const el = boxRef.current;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const view = useMemo(() => fitToBox(displays, size.w, size.h), [displays, size]);
  const shown = displays.map((d) => (drag?.id === d.id ? { ...d, x: drag.x, y: drag.y } : d));

  const start = (e, d) => {
    if (!editable(d)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ id: d.id, x: d.x, y: d.y, ox: e.clientX, oy: e.clientY, bx: d.x, by: d.y });
  };
  const move = (e) => {
    if (!drag) return;
    setDrag((s) => ({ ...s, x: Math.round(s.bx + (e.clientX - s.ox) / view.scale), y: Math.round(s.by + (e.clientY - s.oy) / view.scale) }));
  };
  const end = () => {
    if (!drag) return;
    const d = displays.find((x) => x.id === drag.id);
    const snapped = snapDisplay({ ...d, x: drag.x, y: drag.y }, displays.filter((x) => x.id !== d.id));
    setDrag(null);
    if (snapped.x !== d.x || snapped.y !== d.y) onCommit?.(d.id, snapped.x, snapped.y);
  };

  const b = desktopBounds(shown);
  return (
    <div className="arrange" ref={boxRef} style={{ height }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {shown.map((d, i) => (
        <div
          key={d.id}
          className={`arrange-display ${d.primary ? 'primary' : ''} ${d.virtual ? 'virtual' : ''} ${editable(d) ? 'editable' : ''} ${drag?.id === d.id ? 'dragging' : ''} ${highlight?.(d) ? 'highlight' : ''}`}
          style={{ left: d.x * view.scale + view.ox, top: d.y * view.scale + view.oy, width: d.w * view.scale, height: d.h * view.scale }}
          onPointerDown={(e) => start(e, d)}
        >
          <span className="arrange-num">{d.virtual ? '＋' : i + 1}</span>
          <span className="arrange-name">{d.name}</span>
          <span className="arrange-res">{d.w}×{d.h}</span>
        </div>
      ))}
      <span className="arrange-note">
        {b.w}×{b.h} desktop · drag to reposition, edges snap together
      </span>
    </div>
  );
}
