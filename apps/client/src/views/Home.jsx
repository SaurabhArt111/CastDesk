import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useApp } from '../state/AppContext.jsx';
import Icon, { DeviceIcon } from '../components/Icon.jsx';
import { Badge, EmptyState, Logo, Switch, Modal, PinInput } from '../components/common.jsx';
import { canHost, bridge, platformLabel, isNative, isElectron } from '../lib/platform.js';
import { fmtCountdown, timeAgo, copyText } from '../lib/format.js';
import { buildConnectLink, parseConnectLink, scanQr } from '../lib/discovery.js';

/* --------------------------------- QR --------------------------------- */
function Qr({ text, size = 156 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current && text) QRCode.toCanvas(ref.current, text, { width: size, margin: 1, color: { dark: '#0b1020', light: '#ffffff' } }).catch(() => {});
  }, [text, size]);
  return <canvas ref={ref} className="qr" width={size} height={size} aria-label="QR code to connect" />;
}

/* ------------------------------ small helpers ------------------------------ */
function RefreshButton({ onRefresh, label = 'Refresh', iconOnly = false }) {
  const [spin, setSpin] = useState(false);
  const go = async () => {
    if (spin) return;
    setSpin(true);
    const minWait = new Promise((r) => setTimeout(r, 900));
    try {
      await Promise.all([onRefresh?.(), minWait]);
    } finally {
      setSpin(false);
    }
  };
  return (
    <button className={`btn small ${iconOnly ? 'icon-only' : ''}`} onClick={go} title={label} aria-label={label}>
      <Icon name="refresh" size={15} className={spin ? 'spin' : ''} />
      {!iconOnly && <span>{spin ? 'Scanning…' : label}</span>}
    </button>
  );
}

function CopyButton({ text, label = 'Copy', done = 'Copied' }) {
  const { toast } = useApp();
  const [ok, setOk] = useState(false);
  return (
    <button
      className="btn small"
      onClick={async () => {
        const good = await copyText(text);
        setOk(good);
        if (!good) toast('Could not copy', 'error');
        setTimeout(() => setOk(false), 1400);
      }}
    >
      <Icon name={ok ? 'check' : 'copy'} size={14} /> {ok ? done : label}
    </button>
  );
}

const PIN_TTL = 5 * 60 * 1000;

/* ------------------------- host: pair a new device ------------------------- */
function PairCard() {
  const { hostState: hs, toast } = useApp();
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  if (!hs) return <section className="card hero-card"><p className="muted">Starting…</p></section>;

  const { info, pin, settings } = hs;
  const addrs = info.addresses || [];
  const digits = (pin.pin || '').padEnd(6, '·').split('');
  const left = Math.max(0, pin.expiresAt - now);
  const pct = Math.min(100, (left / PIN_TTL) * 100);
  const qrText = buildConnectLink({ addresses: addrs.map((a) => a.address), port: info.port, pin: pin.pin, id: info.id, name: info.name });
  const accepting = settings.allowIncoming;
  const newPin = async () => {
    setBusy(true);
    try {
      await bridge.rotatePin();
    } catch {
      toast('Could not create a new PIN', 'error');
    }
    setTimeout(() => setBusy(false), 500);
  };

  return (
    <section className="card hero-card">
      <div className="card-head">
        <div>
          <span className="eyebrow">Pair a device</span>
          <h2 className="hero-title">Enter this PIN on your other device</h2>
        </div>
        <Badge tone={accepting ? 'ok' : 'warn'} icon={accepting ? 'check' : 'lock'}>{accepting ? 'Ready' : 'Not accepting'}</Badge>
      </div>

      <div className="pair-body">
        <div className="pair-pin">
          <div className="pin-tiles" aria-live="polite" aria-label={`PIN ${pin.pin}`}>
            {digits.map((d, i) => <span key={i} className="pin-tile">{d}</span>)}
          </div>
          <div className="pin-timer" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
            <i style={{ width: `${pct}%` }} className={pct < 20 ? 'low' : ''} />
          </div>
          <div className="pin-meta">
            <span className="muted small">Expires in {fmtCountdown(left)} · {pin.attemptsLeft} tries left</span>
          </div>
          <div className="pin-actions">
            <button className="btn primary small" onClick={newPin} disabled={busy}>
              <Icon name="refresh" size={15} className={busy ? 'spin' : ''} /> New PIN
            </button>
            <CopyButton text={pin.pin} label="Copy PIN" />
          </div>
        </div>
        <div className="qr-wrap">
          <Qr text={qrText} size={148} />
          <span className="muted small">Or scan with Paneo on a phone</span>
        </div>
      </div>

      <p className="muted small hero-note">You only do this once per device. After that it reconnects by itself — no PIN.</p>

      <div className="addr-list">
        <span className="eyebrow">Open in any browser (iPhone, iPad, other computers)</span>
        {addrs.map((a) => {
          const url = `http://${a.address}:${info.port}`;
          return (
            <div className="addr-row" key={a.address}>
              {a.usb ? <Badge tone="accent" icon="usb">USB</Badge> : <Badge icon="wifi">LAN</Badge>}
              <code>{url}</code>
              <small className="muted">{a.iface}</small>
              <CopyButton text={url} />
            </div>
          );
        })}
        {!addrs.length && (
          <p className="muted small">No network found yet. Join Wi-Fi or Ethernet, or plug in a phone with USB tethering. No internet is needed.</p>
        )}
      </div>
    </section>
  );
}

function StatusStrip() {
  const { hostState: hs, capture } = useApp();
  if (!hs) return null;
  const { inputAvailable, adb } = hs;
  const usbDetail = adb.devices.length ? `${adb.devices.length} phone linked` : adb.available ? 'ready' : 'adb not found';
  return (
    <div className="pill-row">
      <Pill ok={capture.connected} label="Screen capture" detail={capture.error || (capture.connected ? (capture.capturing?.length ? 'streaming' : 'ready') : 'starting')} />
      <Pill ok={inputAvailable} label="Remote input" detail={inputAvailable ? 'ready' : 'see Permissions'} />
      <Pill ok={adb.available} label="USB (Android)" detail={usbDetail} />
    </div>
  );
}

function Pill({ ok, label, detail }) {
  return (
    <span className={`pill ${ok ? 'ok' : 'off'}`}>
      <span className="dot" />
      <b>{label}</b>
      <small>{detail}</small>
    </span>
  );
}

function SwitchRows() {
  const { hostState: hs } = useApp();
  if (!hs) return null;
  const { settings } = hs;
  return (
    <section className="card">
      <div className="rows">
        <Switch checked={settings.allowIncoming} onChange={(v) => bridge.setSettings({ allowIncoming: v })} label="Allow other devices to connect" hint="Turn off to stop all incoming connections." />
        <Switch checked={settings.allowControl} onChange={(v) => bridge.setSettings({ allowControl: v })} label="Allow remote control" hint="Keyboard, mouse, touch and pen from connected devices." />
      </div>
    </section>
  );
}

/* --------------------- host: devices on this computer --------------------- */
function UsbSection() {
  const { hostState: hs, refreshDiscovery } = useApp();
  const adb = hs?.adb;
  if (!adb) return null;
  const list = adb.list || [];
  return (
    <div className="section">
      <h3 className="section-title"><Icon name="usb" size={16} /> USB cable</h3>
      {!adb.available && (
        <div className="notice warn">
          <Icon name="warn" size={18} />
          <div>
            <strong>Android USB tool (adb) not found</strong>
            <p>Phones can still connect over <b>USB tethering</b> (Settings → Hotspot &amp; tethering → USB tethering). For the automatic cable link, install Android platform-tools and make sure <code>adb</code> is on your PATH.</p>
            <div className="notice-actions">
              <button className="btn small" onClick={() => bridge.openExternal('https://developer.android.com/tools/releases/platform-tools')}><Icon name="download" size={14} /> Get platform-tools</button>
              <RefreshButton onRefresh={refreshDiscovery} label="Check again" />
            </div>
          </div>
        </div>
      )}
      {adb.available && !list.length && (
        <p className="muted small hint-line">No phone detected on USB. Plug it in, then turn on <b>USB debugging</b> (Settings → Developer options).</p>
      )}
      {list.map((d) => (
        <div key={d.serial} className="device">
          <span className="device-icon"><DeviceIcon platform="android" /></span>
          <span className="device-main">
            <strong>{d.model || d.serial}</strong>
            <small>
              {d.linked ? 'Linked through the cable — open Paneo on the phone'
                : d.state === 'unauthorized' ? 'Waiting for you to tap “Allow USB debugging” on the phone'
                : d.state === 'offline' ? 'Offline — unplug and plug the cable again'
                : `State: ${d.state}`}
            </small>
          </span>
          {d.linked ? <Badge tone="ok" icon="check">Linked</Badge> : <Badge tone="warn" icon="warn">{d.state === 'unauthorized' ? 'Needs approval' : d.state}</Badge>}
        </div>
      ))}
    </div>
  );
}

function ConnectedSection() {
  const { hostState: hs } = useApp();
  const clients = hs?.clients || [];
  return (
    <div className="section">
      <h3 className="section-title"><Icon name="signal" size={16} /> Connected now</h3>
      {!clients.length && <p className="muted small hint-line">Nothing is connected right now.</p>}
      {clients.map((c) => (
        <div className="device" key={c.id}>
          <span className="device-icon"><DeviceIcon platform={c.device.platform} /></span>
          <span className="device-main">
            <strong>{c.device.name}</strong>
            <small>{c.ip} · {c.perms.includes('control') ? 'can control' : 'view only'}</small>
          </span>
          <button className="btn small" onClick={() => bridge.disconnectClient(c.id)}>Disconnect</button>
        </div>
      ))}
    </div>
  );
}

function TrustedSection() {
  const { hostState } = useApp();
  const list = hostState?.trusted || [];
  const online = new Set((hostState?.clients || []).map((c) => c.device.id));
  return (
    <div className="section">
      <h3 className="section-title"><Icon name="shield" size={16} /> Paired devices</h3>
      {!list.length && <p className="muted small hint-line">Nothing paired yet. Enter the PIN on a phone, tablet or computer and it will appear here.</p>}
      {list.map((d) => {
        const canControl = d.perms.includes('control');
        return (
          <div className="device" key={d.id}>
            <span className="device-icon"><DeviceIcon platform={d.platform} /></span>
            <span className="device-main">
              <strong>{d.name}</strong>
              <small>{online.has(d.id) ? 'Connected now' : `Last seen ${timeAgo(d.lastSeen)}`}{d.arrangement?.extend ? ' · extended display remembered' : ''}</small>
            </span>
            <label className="check">
              <input type="checkbox" checked={canControl} onChange={(e) => bridge.setPermissions(d.id, e.target.checked ? ['view', 'control'] : ['view'])} /> Control
            </label>
            <button className="btn small danger" onClick={() => bridge.revoke(d.id)}>Remove</button>
          </div>
        );
      })}
    </div>
  );
}

function HostDevices() {
  const { refreshDiscovery } = useApp();
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Devices</h2>
          <p className="muted small">Phones and tablets find this computer by themselves — just open Paneo on them.</p>
        </div>
        <RefreshButton onRefresh={refreshDiscovery} label="Refresh" />
      </div>
      <ConnectedSection />
      <UsbSection />
      <TrustedSection />
    </section>
  );
}

/* ----------------------------- nearby computers ----------------------------- */
function Nearby({ title }) {
  const { peers, hosts, connectToPeer, session, refreshDiscovery } = useApp();
  const offline = Object.values(hosts).filter((h) => !peers.some((p) => p.id === h.id));
  const busy = session?.status === 'connecting';
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          <p className="muted small"><span className="pulse" /> Searching Wi-Fi, Ethernet &amp; USB</p>
        </div>
        <RefreshButton onRefresh={refreshDiscovery} />
      </div>
      {!peers.length && !offline.length && (
        <EmptyState icon="wifi" title="No computers found yet">
          Open Paneo on the computer you want to use, on the same network — or plug it in with a USB cable. No internet needed. Tap Refresh to look again.
        </EmptyState>
      )}
      <ul className="device-list">
        {peers.map((p) => {
          const saved = hosts[p.id];
          return (
            <li key={p.id + p.addresses[0]} className="device">
              <span className="device-icon"><DeviceIcon platform={p.platform} /></span>
              <span className="device-main">
                <strong>{p.name}</strong>
                <small>{platformLabel(p.platform)} · {p.addresses[0]}</small>
              </span>
              {p.via === 'usb' && <Badge tone="accent" icon="usb">USB</Badge>}
              {saved && <Badge tone="ok" icon="shield">Paired</Badge>}
              <button className="btn primary" disabled={busy} onClick={() => connectToPeer(p)}>{saved ? 'Connect' : 'Pair'}</button>
            </li>
          );
        })}
        {offline.map((h) => (
          <li key={h.id} className="device offline">
            <span className="device-icon"><DeviceIcon platform={h.platform} /></span>
            <span className="device-main">
              <strong>{h.name}</strong>
              <small>Not in range · seen {timeAgo(h.lastConnected)}</small>
            </span>
            <Badge tone="ok" icon="shield">Paired</Badge>
            <button className="btn" disabled={busy} onClick={() => connectToPeer({ ...h, addresses: h.addresses || [], id: h.id })}>Try</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* --------------------------- manual / QR connect --------------------------- */
function ManualConnect() {
  const { connect, toast } = useApp();
  const [value, setValue] = useState('');
  const go = () => {
    const link = parseConnectLink(value);
    if (link) return connect({ addresses: link.addresses, port: link.port, hostId: link.hostId, name: link.name }, { pin: link.pin });
    const m = /^\s*([\w.\-]+)(?::(\d+))?\s*$/.exec(value);
    if (!m) return toast('Enter an address like 192.168.1.20 or 192.168.1.20:7420', 'error');
    return connect({ addresses: [m[1]], port: Number(m[2]) || 7420 });
  };
  const scan = async () => {
    try {
      const text = await scanQr();
      const link = text && parseConnectLink(text);
      if (!link) return toast('That QR code is not a Paneo code', 'error');
      connect({ addresses: link.addresses, port: link.port, hostId: link.hostId, name: link.name }, { pin: link.pin });
    } catch (e) {
      toast(e.message || 'Could not scan', 'error');
    }
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Connect another way</h2></div>
      {isNative && (
        <button className="btn primary wide-btn" onClick={scan}><Icon name="qr" size={18} /> Scan QR code</button>
      )}
      <label className="field-label" htmlFor="addr">Or type the address shown on the computer</label>
      <div className="inline-form">
        <input id="addr" className="input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="192.168.1.20" onKeyDown={(e) => e.key === 'Enter' && go()} inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
        <button className="btn primary" onClick={go} disabled={!value.trim()}>Connect</button>
      </div>
      <p className="muted small hint-line">
        <Icon name="usb" size={14} /> USB: plug in the cable. Android uses USB debugging or USB tethering; iPhone/iPad use Personal Hotspot over USB.
      </p>
    </section>
  );
}

/* ----------------------- paired hosts (viewer side) ----------------------- */
function PairedHosts() {
  const { hosts, forgetHost, patchHost } = useApp();
  const list = Object.values(hosts);
  if (!list.length) return null;
  return (
    <section className="card">
      <div className="card-head"><h2>Paired computers</h2></div>
      <div className="rows">
        {list.map((h) => (
          <div className="row" key={h.id}>
            <span className="row-text">
              <span className="row-title"><DeviceIcon platform={h.platform} size={16} /> {h.name}</span>
              <span className="row-hint">Last connected {timeAgo(h.lastConnected)}</span>
            </span>
            <label className="check"><input type="checkbox" checked={h.auto !== false} onChange={(e) => patchHost(h.id, { auto: e.target.checked })} /> Auto-connect</label>
            <button className="icon-btn" title="Forget" onClick={() => forgetHost(h.id)}><Icon name="trash" size={16} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------- PIN dialog --------------------------------- */
export function PinDialog() {
  const { pinRequest, setPinRequest, connect } = useApp();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPin(''); setBusy(false); }, [pinRequest]);
  if (!pinRequest) return null;
  const submit = async (v) => {
    setBusy(true);
    await connect(pinRequest.target, { pin: v });
    setBusy(false);
  };
  return (
    <Modal title={`Pair with ${pinRequest.name || 'device'}`} onClose={() => setPinRequest(null)}>
      <p className="muted">Enter the 6-digit PIN shown on that device. You only need to do this once.</p>
      <PinInput value={pin} onChange={setPin} onComplete={submit} invalid={Boolean(pinRequest.error) && !pinRequest.pending} />
      {pinRequest.pending && <p className="muted" role="status">PIN accepted. Waiting for you to approve on {pinRequest.name || 'the other device'}…</p>}
      {pinRequest.error && !pinRequest.pending && <p className="error-text" role="alert">{pinRequest.error}{pinRequest.attemptsLeft != null && !pinRequest.locked ? ` (${pinRequest.attemptsLeft} tries left)` : ''}</p>}
      <div className="modal-actions">
        <button className="btn" onClick={() => setPinRequest(null)}>Cancel</button>
        <button className="btn primary" disabled={pin.length !== 6 || busy} onClick={() => submit(pin)}>{busy ? 'Pairing…' : 'Pair'}</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------- Home ---------------------------------- */
export default function Home() {
  const { setView, session, hostState } = useApp();
  return (
    <div className="home">
      <header className="topbar">
        <Logo />
        <nav>
          {canHost && <button className="btn ghost" onClick={() => setView('layout')}><Icon name="layout" size={16} /> <span className="nav-label">Display layout</span></button>}
          <button className="btn ghost" onClick={() => setView('permissions')}><Icon name="shield" size={16} /> <span className="nav-label">Permissions</span></button>
          <button className="btn ghost" onClick={() => setView('settings')}><Icon name="settings" size={16} /> <span className="nav-label">Settings</span></button>
        </nav>
      </header>
      {session?.status === 'connecting' && <div className="banner">Connecting…</div>}
      {canHost ? (
        <main className="home-grid host">
          <div className="stack">
            <PairCard />
            <StatusStrip />
            <SwitchRows />
          </div>
          <div className="stack">
            <HostDevices />
            <Nearby title="Use another computer's screen" />
            <PairedHosts />
          </div>
        </main>
      ) : (
        <main className="home-grid viewer">
          <div className="stack">
            <Nearby title="Computers" />
            <PairedHosts />
          </div>
          <div className="stack">
            <ManualConnect />
          </div>
        </main>
      )}
      <PinDialog />
    </div>
  );
}
