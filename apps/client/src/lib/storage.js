import { randomHex, DEFAULT_SETTINGS } from '@paneo/shared';
import { isElectron, isNative, osName, bridge } from './platform.js';

const NS = 'paneo.';
const read = (k, d) => {
  try {
    const v = localStorage.getItem(NS + k);
    return v === null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(NS + k, JSON.stringify(v));
  } catch {
    /* storage unavailable (private mode) - keep running in memory */
  }
};

function defaultName() {
  if (isElectron) return bridge.hostname || 'My computer';
  if (isNative) return osName === 'ios' ? 'iPhone / iPad' : 'Android device';
  return `Browser (${osName})`;
}

/** Stable per-install identity used when pairing with hosts. */
export function getIdentity() {
  let id = read('identity');
  if (!id?.id) {
    id = { id: randomHex(12), name: defaultName() };
    write('identity', id);
  }
  return id;
}
export const saveIdentity = (id) => write('identity', id);

/** Viewer-side preferences (the host-side ones live in the desktop app's main process). */
export const PREF_DEFAULTS = {
  theme: DEFAULT_SETTINGS.theme,
  maxFps: DEFAULT_SETTINGS.maxFps,
  maxWidth: DEFAULT_SETTINGS.maxWidth,
  quality: DEFAULT_SETTINGS.quality,
  autoConnectTrusted: true,
  naturalScroll: true,
  sensitivity: 1.4,
  scrollSpeed: 1,
  acceleration: true,
  captureKeyboard: true,
  haptics: true,
  keepAwake: true,
  showStats: false,
  fitMode: 'fit',
  onboarded: false,
};
export const loadPrefs = () => ({ ...PREF_DEFAULTS, ...read('prefs', {}) });
export const savePrefs = (p) => write('prefs', p);

/** Hosts this device has paired with (holds each host's long-term secret). */
export const loadHosts = () => read('hosts', {});
export const saveHosts = (h) => write('hosts', h);
