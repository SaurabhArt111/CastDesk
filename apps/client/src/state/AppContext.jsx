import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { HostConnection, ConnectError } from '../lib/connection.js';
import { startDiscovery, parseConnectLink } from '../lib/discovery.js';
import { Capturer } from '../lib/capturer.js';
import { applySystemBars } from '../lib/systembars.js';
import { getIdentity, saveIdentity, loadPrefs, savePrefs, loadHosts, saveHosts } from '../lib/storage.js';
import { bridge, isElectron, isNative } from '../lib/platform.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const AUTO_COOLDOWN_MS = 20_000;

export function AppProvider({ children }) {
  const [identity, setIdentity] = useState(getIdentity);
  const [prefs, setPrefsState] = useState(loadPrefs);
  const [hosts, setHostsState] = useState(loadHosts);
  const [peers, setPeers] = useState([]);
  const [hostState, setHostState] = useState(null); // desktop only: state of the local host service
  const [capture, setCapture] = useState({ connected: false, capturing: [] });
  const [session, setSession] = useState(null);
  const [pinRequest, setPinRequest] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [view, setView] = useState('home');

  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;
  const sessionRef = useRef(null);
  sessionRef.current = session;
  const connectingRef = useRef(false);
  const lastAuto = useRef(new Map());
  // hosts the user (or the host) just ended a session with: don't auto-reconnect until the device leaves and returns
  const suppressed = useRef(new Set());

  /* ------------------------------- toasts ------------------------------- */
  const toast = useCallback((message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  /* ------------------------------ preferences ------------------------------ */
  const setPrefs = useCallback((patch) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const renameDevice = useCallback((name) => {
    const next = { ...identity, name: name.trim().slice(0, 40) || identity.name };
    saveIdentity(next);
    setIdentity(next);
  }, [identity]);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
      applySystemBars(dark);
    };
    apply();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [prefs.theme]);

  /* ------------------------------- saved hosts ------------------------------- */
  const updateHosts = useCallback((fn) => {
    setHostsState((h) => {
      const next = fn(h);
      saveHosts(next);
      return next;
    });
  }, []);
  const forgetHost = useCallback((id) => updateHosts((h) => { const n = { ...h }; delete n[id]; return n; }), [updateHosts]);
  const patchHost = useCallback((id, patch) => updateHosts((h) => (h[id] ? { ...h, [id]: { ...h[id], ...patch } } : h)), [updateHosts]);

  /* --------------------------------- discovery --------------------------------- */
  const discoveryRef = useRef(null);
  useEffect(() => {
    const stop = startDiscovery(setPeers);
    discoveryRef.current = stop;
    return stop;
  }, []);
  const refreshDiscovery = useCallback(() => discoveryRef.current?.refresh?.(), []);

  /* ------------------------- desktop: local host service ------------------------- */
  useEffect(() => {
    if (!isElectron) return undefined;
    bridge.getState().then(setHostState);
    return bridge.onState(setHostState);
  }, []);

  const captureRef = useRef(null);
  const hostPort = hostState?.info?.port;
  const hostToken = hostState?.info?.sourceToken;
  useEffect(() => {
    if (!isElectron || !hostPort || !hostToken) return undefined;
    const c = new Capturer({ port: hostPort, token: hostToken, onStatus: (s) => setCapture((p) => ({ ...p, ...s })) });
    captureRef.current = c;
    c.start();
    return () => c.stop();
  }, [hostPort, hostToken]);

  /* ---------------------------------- connect ---------------------------------- */
  const disconnect = useCallback(() => {
    const hostId = sessionRef.current?.host?.id;
    if (hostId) suppressed.current.add(hostId);
    sessionRef.current?.conn.close();
    setSession(null);
    setView('home');
  }, []);

  const connect = useCallback(async (target, { pin, silent = false } = {}) => {
    if (connectingRef.current || sessionRef.current) return false;
    connectingRef.current = true;
    if (target.hostId) suppressed.current.delete(target.hostId);
    const conn = new HostConnection({
      identity,
      getSecret: (hostId) => hostsRef.current[hostId]?.secret,
      onPending: () => {
        setPinRequest((r) => (r ? { ...r, pending: true } : r));
        toast('Waiting for approval on the other device…');
      },
    });
    setSession({ status: 'connecting', target, conn, displays: [], perms: { control: false } });
    try {
      const res = await conn.connect({ addresses: target.addresses, port: target.port, pin });
      updateHosts((h) => ({
        ...h,
        [res.hostId]: {
          ...(h[res.hostId] || { auto: true }),
          id: res.hostId,
          name: res.hostName,
          platform: res.platform,
          secret: res.secret || h[res.hostId]?.secret,
          addresses: target.addresses,
          port: target.port,
          lastConnected: Date.now(),
        },
      }));
      conn.on('displays', (list) => setSession((s) => (s ? { ...s, displays: list } : s)));
      conn.on('perm', (p) => setSession((s) => (s ? { ...s, perms: p } : s)));
      conn.on('rtt', (rtt) => setSession((s) => (s ? { ...s, rtt } : s)));
      conn.on('closed', (reason) => {
        if (reason !== 'lost') suppressed.current.add(res.hostId);
        setSession((s) => (s?.conn === conn ? null : s));
        setView('home');
        const msg = { revoked: 'This device was removed from the host.', 'disconnected-by-host': 'The host ended the session.', 'host-stopped': 'The host app was closed.' }[reason];
        toast(msg || 'Disconnected', 'warn');
      });
      setSession((s) => ({ ...s, status: 'live', host: { id: res.hostId, name: res.hostName, platform: res.platform }, address: res.address }));
      setView('session');
      if (!silent || !res.trustedLogin) toast(res.trustedLogin ? `Connected to ${res.hostName}` : `Paired with ${res.hostName}`, 'ok');
      else toast(`Connected to ${res.hostName}`, 'ok');
      setPinRequest(null);
      return true;
    } catch (err) {
      setSession(null);
      if (err instanceof ConnectError && err.code === 'need-pin') {
        if (err.revoked && target.hostId) forgetHost(target.hostId);
        if (!silent) setPinRequest({ target, name: err.hostName || target.name, error: err.revoked ? 'This device no longer trusts you. Enter the new PIN.' : null });
      } else if (err instanceof ConnectError && (err.code === 'bad-pin' || err.code === 'locked')) {
        setPinRequest({ target, name: target.name, error: err.message, locked: err.code === 'locked', attemptsLeft: err.attemptsLeft });
      } else if (!silent) {
        toast(err.message || 'Could not connect', 'error');
      }
      return false;
    } finally {
      connectingRef.current = false;
    }
  }, [identity, toast, updateHosts, forgetHost]);

  /** Connect to a discovered peer or saved host (silent PIN-less login when already paired). */
  const connectToPeer = useCallback((peer, opts) => connect({ addresses: peer.addresses, port: peer.port, hostId: peer.id, name: peer.name }, opts), [connect]);

  /* ----------------- Continuity-style auto-connect to paired hosts ----------------- */
  useEffect(() => {
    if (!prefs.autoConnectTrusted || session || connectingRef.current || pinRequest) return;
    const now = Date.now();
    for (const id of [...suppressed.current]) if (!peers.some((p) => p.id === id)) suppressed.current.delete(id);
    for (const peer of peers) {
      if (suppressed.current.has(peer.id)) continue;
      const saved = hosts[peer.id];
      if (!saved || saved.auto === false) continue;
      if (now - (lastAuto.current.get(peer.id) || 0) < AUTO_COOLDOWN_MS) continue;
      lastAuto.current.set(peer.id, now);
      connectToPeer(peer, { silent: true });
      break;
    }
  }, [peers, hosts, prefs.autoConnectTrusted, session, pinRequest, connectToPeer]);

  /* ------------------ deep links: paneo://connect?... (QR, USB launch) ------------------ */
  useEffect(() => {
    if (!isNative) return undefined;
    let handle;
    (async () => {
      const { App } = await import('@capacitor/app');
      const open = (url) => {
        const l = parseConnectLink(url || '');
        if (l) connect({ addresses: l.addresses, port: l.port, hostId: l.hostId, name: l.name }, { pin: l.pin });
      };
      const launch = await App.getLaunchUrl();
      if (launch?.url) open(launch.url);
      handle = await App.addListener('appUrlOpen', (e) => open(e.url));
    })();
    return () => handle?.remove?.();
  }, [connect]);

  /* ----------------------------- keep screen awake ----------------------------- */
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !prefs.keepAwake) return undefined;
    let KeepAwake;
    (async () => {
      ({ KeepAwake } = await import('@capacitor-community/keep-awake'));
      if (session?.status === 'live') KeepAwake.keepAwake().catch(() => {});
      else KeepAwake.allowSleep().catch(() => {});
    })();
    return () => KeepAwake?.allowSleep().catch(() => {});
  }, [session?.status, prefs.keepAwake]);

  const value = useMemo(
    () => ({
      identity, renameDevice, prefs, setPrefs, hosts, forgetHost, patchHost, peers, refreshDiscovery, hostState, capture,
      session, connect, connectToPeer, disconnect, pinRequest, setPinRequest, toast, toasts, view, setView,
    }),
    [identity, renameDevice, prefs, setPrefs, hosts, forgetHost, patchHost, peers, refreshDiscovery, hostState, capture, session, connect, connectToPeer, disconnect, pinRequest, toast, toasts, view],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
