import { isNative } from './platform.js';

const COLORS = { dark: '#0B1020', light: '#F4F6FF' };

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
