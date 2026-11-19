import { Capacitor } from '@capacitor/core';

/** Where is this UI running? One codebase ships to all of these. */
export const bridge = typeof window !== 'undefined' ? window.paneo || null : null; // Electron preload bridge
export const isElectron = Boolean(bridge);
export const isNative = !isElectron && Capacitor.isNativePlatform();
export const isWeb = !isElectron && !isNative;

/** 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web' */
export const osName = (() => {
  if (isElectron) return { win32: 'windows', darwin: 'macos', linux: 'linux' }[bridge.platform] || 'linux';
  if (isNative) return Capacitor.getPlatform();
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/win/i.test(navigator.platform)) return 'windows';
  if (/mac/i.test(navigator.platform)) return 'macos';
  return 'web';
})();

/** Only the desktop app can share its screen and accept connections. */
export const canHost = isElectron;
export const isMobileOS = osName === 'android' || osName === 'ios';
export const hasTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function deviceKind(platform) {
  if (platform === 'android' || platform === 'ios') return 'phone';
  return 'monitor';
}

export const platformLabel = (p) =>
  ({ windows: 'Windows', win32: 'Windows', macos: 'macOS', darwin: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS', web: 'Browser' }[p] || 'Device');

/** Served by a Paneo host (PWA)? Then that host is our default connection target. */
export const servedByHost = isWeb && /^https?:$/.test(location.protocol) && !['5173', '4173'].includes(location.port) && location.hostname !== '';
