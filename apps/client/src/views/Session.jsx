import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, Segmented } from '../components/common.jsx';
import { DirectSurface, TrackpadSurface, PenSurface } from './Surfaces.jsx';
import KeyboardPanel from './KeyboardPanel.jsx';
import ArrangementEditor from './ArrangementEditor.jsx';
import { isElectron, bridge } from '../lib/platform.js';

const MODES = [
  { value: 'direct', icon: 'touch', label: 'Touch' },
  { value: 'trackpad', icon: 'trackpad', label: 'Trackpad' },
  { value: 'pen', icon: 'pen', label: 'Pen' },
  { value: 'keyboard', icon: 'keyboard', label: 'Keys' },
];
const QUALITY = [
  { value: 'low', label: 'Fast', maxFps: 30, maxWidth: 1280, quality: 0.5 },
  { value: 'balanced', label: 'Balanced', maxFps: 30, maxWidth: 1920, quality: 0.7 },
  { value: 'high', label: 'Sharp', maxFps: 60, maxWidth: 2560, quality: 0.85 },
];

function fit(cw, ch, w, h, mode) {
  if (!w || !h || mode === 'stretch') return { w: cw, h: ch };
  const s = Math.min(cw / w, ch / h);
  return { w: Math.floor(w * s), h: Math.floor(h * s) };
}

export default function Session() {
  const { session, prefs, setPrefs, disconnect, identity, toast } = useApp();
  const conn = session.conn;
  const displays = session.displays || [];
  const canControl = session.perms?.control;

  const [displayId, setDisplayId] = useState(null);
  const [mode, setMode] = useState(() => (matchMedia('(pointer: coarse)').matches ? 'trackpad' : 'direct'));
  const [barOpen, setBarOpen] = useState(true);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [frameSize, setFrameSize] = useState({ w: 16, h: 9 });
  const [stats, setStats] = useState({ fps: 0 });
  const [stageBox, setStageBox] = useState({ w: 0, h: 0 });

  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const fpsCount = useRef(0);

  const myDisplay = displays.find((d) => d.owner === identity.id);
  const active = displays.find((d) => d.id === displayId);

  // pick a display: my extended one if it exists, else the primary
  useEffect(() => {
    if (!displays.length) return;
    if (myDisplay && displayId !== myDisplay.id && !displays.some((d) => d.id === displayId)) setDisplayId(myDisplay.id);
    else if (displayId == null || !displays.some((d) => d.id === displayId)) setDisplayId((displays.find((d) => d.primary) || displays[0]).id);
  }, [displays, displayId, myDisplay]);

  useEffect(() => {
    if (myDisplay) setDisplayId(myDisplay.id);
  }, [myDisplay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // subscribe to the chosen display's frames
  useEffect(() => {
    if (displayId == null) return undefined;
    conn.subscribe(displayId, { maxFps: prefs.maxFps, maxWidth: prefs.maxWidth, quality: prefs.quality });
    return () => conn.unsubscribe(displayId);
  }, [conn, displayId, prefs.maxFps, prefs.maxWidth, prefs.quality]);

  // draw frames; decode only the newest while a decode is in flight
  useEffect(() => {
    let latest = null;
    let busy = false;
    const draw = async () => {
      busy = true;
      while (latest) {
        const f = latest;
        latest = null;
        try {
          const bmp = await createImageBitmap(new Blob([f.data], { type: 'image/jpeg' }));
          const c = canvasRef.current;
          if (c) {
            if (c.width !== bmp.width || c.height !== bmp.height) {
              c.width = bmp.width;
              c.height = bmp.height;
              setFrameSize({ w: bmp.width, h: bmp.height });
            }
            c.getContext('2d').drawImage(bmp, 0, 0);
            fpsCount.current++;
          }
          bmp.close();
        } catch {
          /* corrupt frame: skip */
        }
      }
      busy = false;
    };
    const off = conn.on('frame', (f) => {
      if (f.displayId !== displayId) return;
      latest = f;
      if (!busy) draw();
    });
    const timer = setInterval(() => {
      setStats({ fps: fpsCount.current });
      fpsCount.current = 0;
    }, 1000);
    return () => {
      off();
      clearInterval(timer);
    };
  }, [conn, displayId]);

  // measure the area available to the picture
  useEffect(() => {
    const el = wrapRef.current;
    const ro = new ResizeObserver(() => setStageBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStageBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, [mode]);

  // hardware keyboard -> host
  useEffect(() => {
    if (!canControl || !prefs.captureKeyboard) return undefined;
    const handler = (down) => (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.code === 'F11') return;
      e.preventDefault();
      if (e.repeat && !down) return;
      conn.input({ k: 'key', code: e.code, down });
    };
    const kd = handler(true);
    const ku = handler(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [conn, canControl, prefs.captureKeyboard]);

  // extend result feedback
  useEffect(() => {
    const off1 = conn.on('extend-result', (m) => (m.ok ? toast('Extended display ready', 'ok') : toast(m.error || 'Could not extend', 'error')));
    const off2 = conn.on('arrange-result', (m) => !m.ok && toast(m.error || 'Could not move display', 'error'));
    return () => {
      off1();
      off2();
    };
  }, [conn, toast]);

  const toggleExtend = useCallback(() => {
    if (myDisplay) return conn.extend(false);
    const w = Math.min(3840, Math.round((screen.width || 1280) * (window.devicePixelRatio > 1.5 ? 1 : 1)));
    const h = Math.min(2160, Math.round(screen.height || 720));
    conn.extend(true, { w: Math.max(w, h), h: Math.min(w, h) });
  }, [conn, myDisplay]);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const stageSize = (() => {
    const box = { ...stageBox };
    return fit(box.w, box.h, frameSize.w, frameSize.h, prefs.fitMode);
  })();
  const q = QUALITY.find((x) => x.maxWidth === prefs.maxWidth && x.maxFps === prefs.maxFps)?.value || 'balanced';

  const stage = (
    <div className="stage-box" ref={wrapRef}>
      <div className="stage" style={{ width: stageSize.w, height: stageSize.h }}>
        <canvas ref={canvasRef} className={`remote ${mode === 'pen' ? 'dim' : ''}`} />
        {canControl && mode === 'direct' && <DirectSurface conn={conn} displayId={displayId} prefs={prefs} />}
        {canControl && mode === 'pen' && <PenSurface conn={conn} displayId={displayId} />}
        {!active && <div className="stage-wait">Waiting for the screen…</div>}
      </div>
    </div>
  );

  return (
    <div className={`session mode-${mode}`}>
      <header className={`session-bar ${barOpen ? '' : 'collapsed'}`}>
        <button className="icon-btn" onClick={disconnect} aria-label="Disconnect" title="Disconnect">
          <Icon name="close" />
        </button>
        {barOpen && (
          <>
            <div className="session-title">
              <strong>{session.host?.name}</strong>
              <small>{session.rtt != null ? `${session.rtt} ms` : 'connected'}{prefs.showStats ? ` · ${stats.fps} fps · ${frameSize.w}×${frameSize.h}` : ''}{!canControl ? ' · view only' : ''}</small>
            </div>
            {displays.length > 1 && (
              <select className="select compact" value={displayId ?? ''} onChange={(e) => setDisplayId(Number(e.target.value))} aria-label="Display">
                {displays.map((d, i) => (
                  <option key={d.id} value={d.id}>
                    {d.virtual ? (d.owner === identity.id ? 'Extended (this device)' : d.name) : `Display ${i + 1}`}
                    {d.primary ? ' ★' : ''}
                  </option>
                ))}
              </select>
            )}
            {canControl && (
              <div className="mode-switch" role="radiogroup" aria-label="Input mode">
                {MODES.map((m) => (
                  <button key={m.value} role="radio" aria-checked={mode === m.value} className={mode === m.value ? 'on' : ''} onClick={() => setMode(m.value)} title={m.label}>
                    <Icon name={m.icon} size={18} />
                    <span>{m.label}</span>
                  </button>
                ))}
              </div>
            )}
            <button className={`icon-btn ${myDisplay ? 'on' : ''}`} onClick={toggleExtend} title={myDisplay ? 'Stop extending' : 'Use this device as an extra screen'} disabled={!canControl}>
              <Icon name={myDisplay ? 'extend' : 'mirror'} />
            </button>
            {myDisplay && (
              <button className="icon-btn" onClick={() => setArrangeOpen(true)} title="Arrange displays">
                <Icon name="layout" />
              </button>
            )}
            <button className="icon-btn" onClick={fullscreen} title="Full screen">
              <Icon name="fullscreen" />
            </button>
          </>
        )}
        <button className="icon-btn" onClick={() => setBarOpen((v) => !v)} aria-label={barOpen ? 'Hide toolbar' : 'Show toolbar'}>
          <Icon name="more" />
        </button>
      </header>

      <div className="session-body">
        {stage}
        {canControl && mode === 'trackpad' && <TrackpadSurface conn={conn} prefs={prefs} />}
        {canControl && mode === 'keyboard' && <KeyboardPanel conn={conn} haptics={prefs.haptics} />}
      </div>

      {barOpen && (
        <footer className="session-foot">
          <Segmented label="Quality" value={q} onChange={(v) => { const o = QUALITY.find((x) => x.value === v); setPrefs({ maxFps: o.maxFps, maxWidth: o.maxWidth, quality: o.quality }); }} options={QUALITY.map(({ value, label }) => ({ value, label }))} />
          <Segmented label="Fit" value={prefs.fitMode} onChange={(v) => setPrefs({ fitMode: v })} options={[{ value: 'fit', label: 'Fit' }, { value: 'stretch', label: 'Stretch' }]} />
          {canControl && (
            <label className="check">
              <input type="checkbox" checked={prefs.captureKeyboard} onChange={(e) => setPrefs({ captureKeyboard: e.target.checked })} />
              Send my keyboard
            </label>
          )}
        </footer>
      )}

      {arrangeOpen && (
        <Modal title="Arrange displays" onClose={() => setArrangeOpen(false)} wide>
          <p className="muted">Drag your device&apos;s screen (＋) to where it physically sits. Paneo remembers this for next time.</p>
          <ArrangementEditor displays={displays} editable={(d) => d.owner === identity.id} onCommit={(id, x, y) => conn.arrange(x, y)} highlight={(d) => d.owner === identity.id} />
          {isElectron && (
            <div className="modal-actions">
              <button className="btn" onClick={() => bridge.moveToDisplay?.(0)}>
                Show this window on my other monitor
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
