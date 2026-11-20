import { isNative, isElectron } from './platform.js';

const COLORS = { dark: '#0D2A2D', light: '#E9EFEC' };

/**
 * Keep the system status bar readable: light icons/clock on the dark theme, dark ones on the light theme.
 * (Without this Android keeps the icons of the *system* theme, which can be dark-on-dark.)
 */
export async function applySystemBars(dark) {
  const color = dark ? COLORS.dark : COLORS.light;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  if (!isNative) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style.Dark = light content for dark backgrounds
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    await StatusBar.setBackgroundColor({ color }).catch(() => {});
  } catch (e) {
    console.warn('status bar unavailable', e);
  }
}

/**
 * Immersive mode for live sessions: hides the Android status bar (clock, battery, icons) so the
 * picture or keyboard gets the whole screen. Swipe from the top edge to peek at it.
 */
export async function setImmersive(on) {
  if (!isElectron && !isNative) {
    // plain browser / PWA on a phone or tablet
    if (on) document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  if (!isNative) return;
  try {
    const { StatusBar } = await import('@capacitor/status-bar');
    if (on) {
      await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      await StatusBar.hide();
    } else {
      await StatusBar.show();
      await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    }
  } catch (e) {
    console.warn('immersive mode unavailable', e);
  }
}
