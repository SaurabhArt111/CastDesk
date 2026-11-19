import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import Icon from '../components/Icon.jsx';
import ArrangementEditor from './ArrangementEditor.jsx';
import { bridge } from '../lib/platform.js';
import { DeviceIcon } from '../components/Icon.jsx';

/** The host's own display arrangement, like Windows "Display settings". */
export default function DisplayLayout() {
  const { hostState, setView, toast } = useApp();
  const displays = hostState?.displays || [];
  const caps = hostState?.caps;
  const [busy, setBusy] = useState(false);

  const commit = async (id, x, y) => {
    setBusy(true);
    const res = await bridge.applyLayout([{ id, x, y }]);
    setBusy(false);
    if (!res.ok) toast(res.error, 'error');
    else toast('Display moved', 'ok');
  };

  const extended = displays.filter((d) => d.virtual);
  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost" onClick={() => setView('home')}><Icon name="back" size={16} /> Back</button>
        <h1>Display layout</h1>
        <span />
      </header>
      <main className="page-body">
        <p className="muted">
          Arrange screens the way they sit on your desk. Drag a screen and it snaps flush to its neighbour — just like Windows display settings.
          Positions of extended devices are remembered, so they reappear in the same place when they reconnect.
        </p>
        <section className="card">
          <ArrangementEditor displays={displays} onCommit={commit} height={340} />
          {busy && <p className="muted small">Applying…</p>}
          {caps && !caps.arrange && <p className="error-text">{caps.note}</p>}
          {caps?.arrange && <p className="muted small">Using: {caps.provider}. {caps.note}</p>}
        </section>
        <section className="card">
          <div className="card-head"><h2>Extended devices</h2></div>
          {!extended.length && <p className="muted">No device is extending this computer right now. On another device, open a session and tap the extend button.</p>}
          {extended.map((d) => {
            const owner = hostState.trusted.find((t) => t.id === d.owner);
            return (
              <div className="row" key={d.id}>
                <span className="row-text"><span className="row-title"><DeviceIcon platform={owner?.platform} size={16} /> {owner?.name || d.name}</span><span className="row-hint">{d.w}×{d.h} at {d.x}, {d.y}</span></span>
              </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}
