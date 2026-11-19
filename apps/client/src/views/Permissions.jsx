import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import Icon from '../components/Icon.jsx';
import { Badge } from '../components/common.jsx';
import { bridge, isElectron, isNative, osName } from '../lib/platform.js';

const TONE = { granted: 'ok', missing: 'warn', info: 'neutral', unknown: 'neutral' };
const TEXT = { granted: 'Allowed', missing: 'Needs attention', info: 'Info', unknown: 'Not checked' };

/** What Paneo needs on each platform, whether it has it, and a one-tap way to fix it. */
export default function Permissions() {
  const { setView, toast } = useApp();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (isElectron) setItems(await bridge.getPermissions());
    else if (isNative) {
      const out = [];
      try {
        const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
        const { camera } = await BarcodeScanner.checkPermissions();
        out.push({ id: 'camera', title: 'Camera', description: 'Only used to scan the QR code on your computer. Nothing is recorded.', status: camera === 'granted' ? 'granted' : 'missing', action: camera === 'granted' ? null : { label: 'Allow camera' } });
      } catch {
        out.push({ id: 'camera', title: 'Camera', description: 'Used to scan the pairing QR code.', status: 'unknown' });
      }
      out.push({ id: 'network', title: 'Local network', description: osName === 'ios' ? 'iOS asks for “Local Network” access the first time. Choose Allow so nearby computers can be found.' : 'Nearby-device discovery uses Wi-Fi multicast. No special prompt on Android, but Wi-Fi must be on (or USB tethering / USB debugging connected).', status: 'info' });
      out.push({ id: 'usb', title: 'USB connection', description: 'Android: enable Developer options → USB debugging and plug in, or turn on USB tethering. iPhone/iPad: plug in and enable Personal Hotspot.', status: 'info' });
      setItems(out);
    } else {
      setItems([{ id: 'web', title: 'Browser', description: 'The browser version needs no permissions. Keyboard capture works while this tab is focused.', status: 'granted' }]);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const act = async (item) => {
    setBusy(true);
    try {
      if (isElectron) {
        const res = await bridge.fixPermission(item.id);
        if (res?.message) toast(res.message, res.ok === false ? 'error' : 'ok');
      } else if (item.id === 'camera') {
        const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
        await BarcodeScanner.requestPermissions();
      }
    } finally {
      setBusy(false);
      setTimeout(refresh, 600);
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn ghost" onClick={() => setView('home')}><Icon name="back" size={16} /> Back</button>
        <h1>Permissions</h1>
        <button className="btn ghost" onClick={refresh}><Icon name="refresh" size={16} /> Re-check</button>
      </header>
      <main className="page-body">
        <p className="muted">Paneo asks only for what it needs, and says why. Nothing leaves your network.</p>
        {items.map((it) => (
          <section className="card perm" key={it.id}>
            <div className="card-head">
              <div>
                <h2>{it.title}</h2>
                <p className="muted">{it.description}</p>
              </div>
              <Badge tone={TONE[it.status]} icon={it.status === 'granted' ? 'check' : undefined}>{TEXT[it.status]}</Badge>
            </div>
            {it.action && it.status !== 'granted' && (
              <button className="btn primary" disabled={busy} onClick={() => act(it)}>{it.action.label}</button>
            )}
          </section>
        ))}
      </main>
    </div>
  );
}
