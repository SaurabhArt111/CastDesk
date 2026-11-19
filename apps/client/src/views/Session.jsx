import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, Segmented } from '../components/common.jsx';
import { DirectSurface, TrackpadSurface, PenSurface } from './Surfaces.jsx';
import KeyboardPanel from './KeyboardPanel.jsx';
import ArrangementEditor from './ArrangementEditor.jsx';
import { isElectron, bridge } from '../lib/platform.js';
import { FrameSink, detectDecoders } from '../lib/decoder.js';
import { PURPOSES, purposeById } from '../lib/purposes.js';

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

/** The remote screen as a picture. Mounted only for purposes that need video. */
function Screen({ conn, displayId, prefs, touch, penDim, onStats, children }) {
  const canvasRef = useRef(null);
  const boxRef = useRef(null);
  const [size, setSize] = useState({ w: 16, h: 9 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [decoders, setDecoders] = useState(null);

  useEffect(() => {
    let live = true;
    detectDecoders().then((d) => live && setDecoders(d));
    return () => {
      live = false;
    };
  }, []);

  // subscribe once we know which codecs this device can decode
  useEffect(() => {
    if (displayId == null || decoders == null) return undefined;
    conn.subscribe(displayId, { maxFps: prefs.maxFps, maxWidth: prefs.maxWidth, quality: prefs.quality, codecs: decoders });
    return () => conn.unsubscribe(displayId);
  }, [conn, displayId, decoders, prefs.maxFps, prefs.maxWidth, prefs.quality]);

  useEffect(() => {
    if (displayId == null) return undefined;
    const sink = new FrameSink(canvasRef.current, {
      onSize: (w, h) => setSize({ w, h }),
      onNeedKey: () => conn.requestKey(displayId),
    });
    const off = conn.on('frame', (f) => f.displayId === displayId && sink.push(f));
    const timer = setInterval(() => onStats?.(sink.takePainted()), 1000);
    return () => {
      off();
      clearInterval(timer);
      sink.close();
    };
  }, [conn, displayId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = boxRef.current;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  const st = fit(box.w, box.h, size.w, size.h, prefs.fitMode);
  return (
    <div className="stage-box" ref={boxRef}>
      <div className="stage" style={{ width: st.w, height: st.h }}>
        <canvas ref={canvasRef} className={`remote ${penDim ? 'dim' : ''}`} />
        {touch && <DirectSurface conn={conn} displayId={displayId} prefs={prefs} />}
        {children}
      </div>
    </div>
  );
}

export default function Session() {
  const { session, prefs, setPrefs, disconnect, identity, toast } = useApp();
  const conn = session.conn;
  const displays = session.displays || [];
  const canControl = !!session.perms?.control;

  const [purposeId, setPurposeId] = useState(prefs.purpose);
  const [displayId, setDisplayId] = useState(null);
  const [hud, setHud] = useState(true);
  const [sheet, setSheet] = useState(null); // 'purpose' | 'quality' | null
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [fps, setFps] = useState(0);

  // a purpose that needs control falls back to mirror when the host has not granted it
  const wanted = purposeById(purposeId);
  const purpose = wanted.needsControl && !canControl ? purposeById('mirror') : wanted;
  const myDisplay = displays.find((d) => d.owner === identity.id);
  const isExtend = purpose.id === 'extend';
  const showVideo = purpose.needsVideo || (purpose.id === 'pen' && prefs.penPreview);

  // choose a display: mirror/pen -> primary; extend -> my own virtual display
  useEffect(() => {
    if (!displays.length) return;
    if (isExtend) {
      if (myDisplay) setDisplayId(myDisplay.id);
    } else if (displayId == null || !displays.some((d) => d.id === displayId) || displays.find((d) => d.id === displayId)?.owner === identity.id) {
      setDisplayId((displays.find((d) => d.primary) || displays[0]).id);
    }
  }, [displays, isExtend, myDisplay?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // extend: create the virtual screen when entering, remove it when leaving
  useEffect(() => {
    if (!isExtend) return undefined;
    const w = Math.min(3840, Math.round(screen.width || 1280));
    const h = Math.min(2160, Math.round(screen.height || 720));
    conn.extend(true, { w: Math.max(w, h), h: Math.min(w, h) });
    return () => conn.extend(false);
  }, [conn, isExtend]);

  useEffect(() => {
    const off1 = conn.on('extend-result', (m) => (m.ok ? toast('Extended display ready', 'ok') : toast(m.error || 'Could not extend', 'error')));
    const off2 = conn.on('arrange-result', (m) => !m.ok && toast(m.error || 'Could not move display', 'error'));
    return () => {
      off1();
      off2();
    };
  }, [conn, toast]);

  // hardware keyboard -> host (not while the on-screen keyboard purpose owns typing)
  useEffect(() => {
    if (!canControl || !prefs.captureKeyboard || purpose.id === 'keyboard') return undefined;
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
  }, [conn, canControl, prefs.captureKeyboard, purpose.id]);

  const choose = useCallback((id) => {
    setPurposeId(id);
    setPrefs({ purpose: id });
    setSheet(null);
  }, [setPrefs]);

  const fullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const q = QUALITY.find((x) => x.maxWidth === prefs.maxWidth && x.maxFps === prefs.maxFps)?.value || 'balanced';

  let body;
  if (purpose.id === 'trackpad') body = <TrackpadSurface conn={conn} prefs={prefs} />;
  else if (purpose.id === 'keyboard') body = <KeyboardPanel conn={conn} haptics={prefs.haptics} />;
  else if (purpose.id === 'pen' && !showVideo) {
    body = (
      <div className="pen-full">
        <PenSurface conn={conn} displayId={displayId} />
      </div>
    );
  } else if (purpose.id === 'pen') {
    body = (
      <Screen conn={conn} displayId={displayId} prefs={prefs} penDim onStats={setFps}>
        <PenSurface conn={conn} displayId={displayId} />
      </Screen>
    );
  } else {
    body = (
      <Screen conn={conn} displayId={displayId} prefs={prefs} touch={canControl && prefs.touchControl} onStats={setFps}>
        {isExtend && !myDisplay && <div className="stage-wait">Creating the extra screen…</div>}
      </Screen>
    );
  }

  return (
    <div className={`session purpose-${purpose.id} ${hud ? '' : 'hud-off'}`}>
      <div className="session-body">{body}</div>

      <div className={`hud ${hud ? 'open' : ''}`}>
        {hud && (
          <div className="hud-bar">
            <button className="hud-btn" onClick={disconnect} aria-label="Disconnect" title="Disconnect">
              <Icon name="close" size={18} />
            </button>
            <div className="hud-title">
              <strong>{session.host?.name}</strong>
              <small>
                {purpose.title}
                {session.rtt != null ? ` · ${session.rtt} ms` : ''}
                {prefs.showStats && showVideo ? ` · ${fps} fps` : ''}
                {!canControl ? ' · view only' : ''}
              </small>
            </div>
            <button className="hud-chip" onClick={() => setSheet(sheet === 'purpose' ? null : 'purpose')}>
              <Icon name={purpose.icon} size={16} />
              <span>Switch</span>
            </button>
            {showVideo && (
              <button className="hud-btn" onClick={() => setSheet(sheet === 'quality' ? null : 'quality')} aria-label="Quality" title="Quality">
                <Icon name="signal" size={18} />
              </button>
            )}
            {isExtend && myDisplay && (
              <button className="hud-btn" onClick={() => setArrangeOpen(true)} aria-label="Arrange displays" title="Arrange displays">
                <Icon name="layout" size={18} />
              </button>
            )}
            <button className="hud-btn" onClick={fullscreen} aria-label="Full screen" title="Full screen">
              <Icon name="fullscreen" size={18} />
            </button>
          </div>
        )}
        <button className="hud-toggle" onClick={() => { setHud((v) => !v); setSheet(null); }} aria-label={hud ? 'Hide toolbar' : 'Show toolbar'}>
          <Icon name="more" size={18} />
        </button>
      </div>

      {sheet === 'purpose' && (
        <div className="sheet" role="menu">
          {PURPOSES.map((p) => {
            const locked = p.needsControl && !canControl;
            return (
              <button key={p.id} role="menuitemradio" aria-checked={p.id === purpose.id} className={`sheet-row ${p.id === purpose.id ? 'on' : ''}`} disabled={locked} onClick={() => choose(p.id)}>
                <span className={`sheet-ico tint-${p.tint}`}><Icon name={p.icon} size={18} /></span>
                <span className="sheet-text">
                  <strong>{p.title}</strong>
                  <small>{locked ? 'Needs “allow control” on the computer' : p.hint}</small>
                </span>
              </button>
            );
          })}
        </div>
      )}
      {sheet === 'quality' && (
        <div className="sheet sheet-quality">
          <Segmented label="Quality" value={q} onChange={(v) => { const o = QUALITY.find((x) => x.value === v); setPrefs({ maxFps: o.maxFps, maxWidth: o.maxWidth, quality: o.quality }); }} options={QUALITY.map(({ value, label }) => ({ value, label }))} />
          <Segmented label="Fit" value={prefs.fitMode} onChange={(v) => setPrefs({ fitMode: v })} options={[{ value: 'fit', label: 'Fit' }, { value: 'stretch', label: 'Stretch' }]} />
          {displays.length > 1 && !isExtend && (
            <select className="select compact" value={displayId ?? ''} onChange={(e) => setDisplayId(Number(e.target.value))} aria-label="Display">
              {displays.filter((d) => d.owner !== identity.id).map((d, i) => (
                <option key={d.id} value={d.id}>{d.virtual ? d.name : `Display ${i + 1}`}{d.primary ? ' ★' : ''}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {arrangeOpen && (
        <Modal title="Arrange displays" onClose={() => setArrangeOpen(false)} wide>
          <p className="muted">Drag your device&apos;s screen (＋) to where it physically sits. CastDesk remembers this for next time.</p>
          <ArrangementEditor displays={displays} editable={(d) => d.owner === identity.id} onCommit={(id, x, y) => conn.arrange(x, y)} highlight={(d) => d.owner === identity.id} />
          {isElectron && (
            <div className="modal-actions">
              <button className="btn" onClick={() => bridge.moveToDisplay?.(0)}>Show this window on my other monitor</button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
