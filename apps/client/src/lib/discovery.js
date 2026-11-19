import { Capacitor } from '@capacitor/core';
import { DEFAULT_PORT } from '@paneo/shared';
import { bridge, isElectron, isNative, servedByHost } from './platform.js';

/**
 * Finds hosts to connect to, per platform:
 *  - Desktop app: mDNS + UDP beacon via the Node host service (IPC).
 *  - Android/iOS app: Bonjour/NSD via the zeroconf plugin, plus a probe of
 *    127.0.0.1 which is where an `adb reverse` USB tunnel appears.
 *  - Browser (PWA): the host that served the page.
 * Manual IP entry and QR codes work everywhere.
 */
export function startDiscovery(onPeers) {
  const peers = new Map();
  const emit = () => onPeers([...peers.values()]);
  const stops = [];

  if (isElectron) {
    bridge.getPeers().then((p) => onPeers(p));
    stops.push(bridge.onPeers((p) => onPeers(p)));
  }

  let stopZ = isNative ? startZeroconf(peers, emit) : null;
  stops.push(() => stopZ?.());

  // USB tunnel / same-origin host probe
  const probeTargets = [];
  if (isNative) probeTargets.push({ address: '127.0.0.1', port: DEFAULT_PORT, via: 'usb' });
  if (servedByHost) probeTargets.push({ address: location.hostname, port: Number(location.port) || 80, via: 'web' });

  const probe = async () => {
    for (const t of probeTargets) {
      const key = `probe:${t.address}:${t.port}`;
      try {
        const info = await fetchInfo(t.address, t.port, 1200);
        if (!peers.has(key) || peers.get(key).id !== info.id) {
          peers.set(key, { id: info.id, name: info.name, platform: info.platform, port: t.port, addresses: [t.address], via: t.via });
          emit();
        }
      } catch {
        if (peers.delete(key)) emit();
      }
    }
  };
  if (probeTargets.length) {
    probe();
    const timer = setInterval(probe, 3000);
    stops.push(() => clearInterval(timer));
  }

  const stop = () => stops.forEach((s) => s?.());
  /** Ask again right now (the Refresh button). */
  stop.refresh = async () => {
    if (isElectron) {
      try {
        await bridge.refreshScan();
      } catch {
        /* ignore */
      }
    }
    if (isNative) {
      stopZ?.();
      stopZ = startZeroconf(peers, emit);
    }
    await probe?.();
  };
  return stop;
}

export async function fetchInfo(address, port, timeoutMs = 2000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${address}:${port}/api/info`, { signal: ctl.signal, cache: 'no-store' });
    const info = await res.json();
    if (info.app !== 'paneo') throw new Error('not paneo');
    return info;
  } finally {
    clearTimeout(timer);
  }
}

function startZeroconf(peers, emit) {
  let ZeroConf;
  let active = true;
  (async () => {
    try {
      ({ ZeroConf } = await import('capacitor-zeroconf'));
      await ZeroConf.watch({ type: '_paneo._tcp.', domain: 'local.' }, (res) => {
        const s = res.service || {};
        const txt = s.txtRecord || {};
        const key = `mdns:${s.name}`;
        if (res.action === 'removed') {
          if (peers.delete(key)) emit();
        } else if (res.action === 'resolved' && (s.ipv4Addresses || []).length) {
          peers.set(key, {
            id: txt.id || s.name,
            name: txt.name || s.name,
            platform: txt.platform || 'unknown',
            port: s.port,
            addresses: s.ipv4Addresses,
            via: 'mdns',
          });
          emit();
        }
      });
    } catch (e) {
      console.warn('zeroconf unavailable', e);
    }
  })();
  return () => {
    if (!active) return;
    active = false;
    ZeroConf?.close?.().catch?.(() => {});
  };
}

/** Parse paneo://connect?host=..&port=..&pin=..&id=.. (QR codes and USB deep links). */
export function parseConnectLink(text) {
  try {
    const u = new URL(text.trim());
    if (u.protocol !== 'paneo:') return null;
    const q = u.searchParams;
    const hosts = (q.get('host') || '').split(',').filter(Boolean);
    if (!hosts.length) return null;
    return { addresses: hosts, port: Number(q.get('port')) || DEFAULT_PORT, pin: q.get('pin') || undefined, hostId: q.get('id') || undefined, transport: q.get('transport') || undefined, name: q.get('name') || undefined };
  } catch {
    return null;
  }
}

export function buildConnectLink({ addresses, port, pin, id, name }) {
  const q = new URLSearchParams({ host: addresses.join(','), port: String(port), id, name });
  if (pin) q.set('pin', pin);
  return `paneo://connect?${q.toString()}`;
}

export async function scanQr() {
  if (!Capacitor.isNativePlatform()) throw new Error('QR scanning is available in the mobile app.');
  const { BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
  const { barcodes } = await BarcodeScanner.scan({ formats: ['QR_CODE'] });
  return barcodes?.[0]?.rawValue || null;
}
