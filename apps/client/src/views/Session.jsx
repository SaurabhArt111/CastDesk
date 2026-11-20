import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import Icon from '../components/Icon.jsx';
import { Modal, Segmented } from '../components/common.jsx';
import { DirectSurface, TrackpadSurface, PenSurface } from './Surfaces.jsx';
import KeyboardPanel from './KeyboardPanel.jsx';
import ArrangementEditor from './ArrangementEditor.jsx';
import { isElectron, bridge } from '../lib/platform.js';
import { FrameSink, detectDecoders } from '../lib/decoder.js';
import { PURPOSES, PROJECT_MODES, purposeById } from '../lib/purposes.js';
import { setImmersive } from '../lib/systembars.js';

const QUALITY = [
  { value: 'low', label: 'Fast', maxFps: 30, maxWidth: 1280, quality: 0.5 },
  { value: 'balanced', label: 'Balanced', maxFps: 30, maxWidth: 1920, quality: 0.7 },
  { value: 'high', label: 'Sharp', maxFps: 60, maxWidth: 2560, quality: 0.85 },
];

/** Tablets (and bigger) get a trackpad under the keyboard; phones get the keyboard alone. */
function useTablet() {
  const q = '(min-width: 600px) and (min-height: 480px)';
  const [yes, setYes] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setYes(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return yes;
}

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
  const [extendErr, setExtendErr] = useState(null);
  const [retry, setRetry] = useState(0);
  const tablet = useTablet();
  const isWin = session.host?.platform === 'win32';

  // full screen: no clock or battery bar over the picture while a session is open
  useEffect(() => {
    setImmersive(true);
    return () => setImmersive(false);
  }, []);

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
    setExtendErr(null);
    conn.extend(true, { w: Math.max(w, h), h: Math.min(w, h) });
    return () => conn.extend(false);
  }, [conn, isExtend, retry]);

  useEffect(() => {
    const off1 = conn.on('extend-result', (m) => {
      if (m.ok) {
        setExtendErr(null);
        toast('Extended display ready', 'ok');
      } else setExtendErr({ message: m.error || 'Could not extend', code: m.code || null });
    });
    const off3 = conn.on('project-result', (m) => (m.ok ? toast('Display mode changed', 'ok') : toast(m.error || 'Could not change the display mode', 'error')));
    const off2 = conn.on('arrange-result', (m) => !m.ok && toast(m.error || 'Could not move display', 'error'));
    return () => {
      off1();
      off2();
      off3();
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
  else if (purpose.id === 'keyboard') {
    body = tablet && canControl ? (
      <div className="kbd-split">
        <KeyboardPanel conn={conn} haptics={prefs.haptics} />
        <TrackpadSurface conn={conn} prefs={prefs} compact />
      </div>
    ) : (
      <KeyboardPanel conn={conn} haptics={prefs.haptics} />
    );
  }
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
        {isExtend && !myDisplay && !extendErr && <div className="stage-wait">Creating the extra screen…</div>}
      </Screen>
    );
  }

  return (
    <div className={`session purpose-${purpose.id} ${hud ? '' : 'hud-off'}`}>
      <div className="session-body">{body}</div>

      {isExtend && extendErr && !myDisplay && (
        <div className="extend-err" role="alert">
          <h3>Can&apos;t extend yet</h3>
          <p>{extendErr.message}</p>
          {extendErr.code === 'no-driver' && (
            <ol>
              <li>On the computer open <b>CastDesk → Home → Project</b>.</li>
              <li>Tap <b>Install virtual screen</b> and allow the administrator prompt (once).</li>
              <li>Come back here and tap <b>Try again</b>.</li>
            </ol>
          )}
          <div className="extend-err-actions">
            <button className="btn lime" onClick={() => setRetry((n) => n + 1)}>Try again</button>
            <button className="btn" onClick={() => choose('mirror')}>Mirror instead</button>
          </div>
        </div>
      )}

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
            {isWin && canControl && (
              <button className="hud-btn" onClick={() => setSheet(sheet === 'project' ? null : 'project')} aria-label="Project (Win+P)" title="Project (Win+P)">
                <Icon name="monitor" size={18} />
              </button>
            )}
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
      {sheet === 'project' && (
        <div className="sheet" role="menu">
          <p className="sheet-title">Project <kbd className="kbd-chip">Win</kbd><kbd className="kbd-chip">P</kbd></p>
          {PROJECT_MODES.map((m) => (
            <button key={m.id} role="menuitem" className="sheet-row" disabled={m.local} onClick={() => { conn.project(m.id); setSheet(null); }}>
              <span className="sheet-ico tint-mint"><Icon name={m.icon} size={18} /></span>
              <span className="sheet-text"><strong>{m.title}</strong><small>{m.local ? 'Only on the computer' : m.hint}</small></span>
            </button>
          ))}
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
