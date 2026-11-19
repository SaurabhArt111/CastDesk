/**
 * Single place to edit when you publish: repository, version, and file names.
 * The file names below match what `electron-builder` and the GitHub Actions
 * release workflow produce (see .github/workflows/release.yml).
 */
export const SITE = {
  name: 'Paneo',
  tagline: 'Every screen. One desk.',
  version: '1.0.0',
  repo: 'https://github.com/paneo/paneo',
  get releases() {
    return `${this.repo}/releases`;
  },
  get base() {
    return `${this.repo}/releases/download/v${this.version}`;
  },
  port: 7420,
};

const v = SITE.version;

/** Download catalogue. `primary` marks the recommended file for that OS. */
export const DOWNLOADS = [
  {
    id: 'windows',
    os: 'Windows',
    icon: 'window',
    requires: 'Windows 10 or 11 · 64-bit Intel/AMD or ARM',
    note: 'The installer adds the Windows Firewall rule for you and can start Paneo with Windows.',
    files: [
      { label: 'Installer', ext: '.exe', file: `Paneo-Setup-${v}-x64.exe`, detail: '64-bit Intel / AMD', primary: true },
      { label: 'Installer (ARM)', ext: '.exe', file: `Paneo-Setup-${v}-arm64.exe`, detail: 'Windows on ARM' },
      { label: 'MSI package', ext: '.msi', file: `Paneo-${v}-x64.msi`, detail: 'For IT deployment' },
      { label: 'Portable', ext: '.exe', file: `Paneo-Portable-${v}.exe`, detail: 'No install, run from anywhere' },
    ],
  },
  {
    id: 'macos',
    os: 'macOS',
    icon: 'laptop',
    requires: 'macOS 12 or later · Apple silicon and Intel (universal)',
    note: 'macOS will ask for Screen Recording and Accessibility the first time. Paneo explains each prompt.',
    files: [
      { label: 'Disk image', ext: '.dmg', file: `Paneo-${v}-universal.dmg`, detail: 'Drag to Applications', primary: true },
      { label: 'Zip archive', ext: '.zip', file: `Paneo-${v}-mac-universal.zip`, detail: 'Same app, zipped' },
    ],
  },
  {
    id: 'linux',
    os: 'Linux',
    icon: 'terminal',
    requires: 'X11 session recommended (Wayland: mirroring only) · x86-64',
    note: 'AppImage runs on most distributions: make it executable and double-click.',
    files: [
      { label: 'AppImage', ext: '.AppImage', file: `Paneo-${v}-x86_64.AppImage`, detail: 'Any distribution', primary: true },
      { label: 'Debian / Ubuntu', ext: '.deb', file: `paneo_${v}_amd64.deb`, detail: 'sudo apt install ./file.deb' },
      { label: 'Fedora / openSUSE', ext: '.rpm', file: `paneo-${v}.x86_64.rpm`, detail: 'sudo dnf install ./file.rpm' },
    ],
  },
  {
    id: 'android',
    os: 'Android',
    icon: 'phone',
    requires: 'Android 7.0 or later · phones, tablets, Chromebooks',
    note: 'Sideload the APK (allow “Install unknown apps” for your browser or file manager once).',
    files: [{ label: 'APK', ext: '.apk', file: `Paneo-${v}.apk`, detail: 'Phones & tablets', primary: true }],
  },
  {
    id: 'ios',
    os: 'iPhone & iPad',
    icon: 'tablet',
    requires: 'iOS / iPadOS 15 or later · Safari',
    note: 'No App Store build yet. The web app works today: open your PC’s address in Safari and tap Share → Add to Home Screen.',
    files: [],
    web: true,
  },
  {
    id: 'web',
    os: 'Any browser',
    icon: 'globe',
    requires: 'Chrome, Edge, Firefox, Safari — Smart TVs & kiosks too',
    note: 'The desktop app serves the viewer itself. Nothing to install on the second device — type the address shown in Paneo.',
    files: [],
    web: true,
  },
];

export const NAV = [
  { to: '/', label: 'Home' },
  { to: '/download', label: 'Download' },
  { to: '/guide', label: 'Guide' },
  { to: '/gallery', label: 'Screenshots' },
  { to: '/preferences', label: 'Preferences' },
  { to: '/about', label: 'About' },
  { to: '/source', label: 'Source' },
];

export function detectOS() {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/mac/i.test(navigator.platform || ua)) return 'macos';
  if (/linux|x11|cros/i.test(ua)) return 'linux';
  return 'windows';
}

export const FAQ = [
  {
    q: 'Does it need the internet?',
    a: 'No. Paneo only talks between your own devices: over Wi-Fi or Ethernet on the same network, over a USB cable, or on a network with no internet at all (a router with the WAN unplugged, a phone hotspot with mobile data off, a USB-C cable). It has no accounts, no cloud relay and no telemetry. The website you are reading is the only thing that needs the internet — to download the app.',
  },
  {
    q: 'How is this different from a remote-desktop app?',
    a: 'Remote desktop tools are built to reach a computer across the internet. Paneo is built for the desk: a second screen, a trackpad, a keyboard or a pen tablet for the computer next to you, with low latency and automatic reconnection. Everything stays on your local network or cable.',
  },
  {
    q: 'What is “Mirror” versus “Extend”?',
    a: 'Mirror shows an existing display of your computer on the other device. Extend adds a brand-new virtual monitor to your computer and shows that on the other device, so it behaves like a real second screen you can drag windows onto. Mirroring works everywhere out of the box. Extending needs a virtual-display driver on the host computer — see the guide for the one-time setup on Windows and macOS. On Linux with X11 Paneo can create the monitor itself (experimental).',
  },
  {
    q: 'Do I have to type a PIN every time?',
    a: 'No. The first connection between two devices asks for a one-time 6-digit PIN. After that the devices remember each other with a secret key and reconnect automatically — no PIN — the moment they see each other. You can remove a device from the host any time and it will have to pair again.',
  },
  {
    q: 'Is the PIN safe on a shared Wi-Fi?',
    a: 'The PIN is never sent over the network, not even hashed. Paneo uses a password-authenticated key exchange (SPEKE), so someone recording the traffic cannot test PIN guesses offline. A wrong guess costs one of five attempts, after which the PIN is replaced with a new one, and a PIN is single-use and expires after five minutes.',
  },
  {
    q: 'Is the video encrypted?',
    a: 'Version 1.0 authenticates devices and protects pairing, but the screen frames and input travel over a plain local connection. Use it on networks you trust, or over a USB cable. Encrypted transport is the top item on the roadmap — see Security.',
  },
  {
    q: 'Can my phone or tablet be a trackpad, keyboard or graphics tablet?',
    a: 'Yes. Touch mode taps exactly where you touch the picture. Trackpad mode behaves like a laptop trackpad with tap-to-click, two-finger scroll, pinch-zoom, drag-and-drop and three-finger swipes. Pen mode maps the whole surface to the screen like a drawing tablet and sends pressure and tilt. Keys mode is a full keyboard with Ctrl, Alt, Shift and Win/Cmd that stay held for shortcuts.',
  },
  {
    q: 'Does pen pressure work in Photoshop, Krita, and similar apps?',
    a: 'Paneo sends position, pressure, tilt and eraser state. Today the host injects the pen as a precise mouse with the stylus button mapped to the left button; true pressure-sensitive injection needs a native pen driver on each OS (Windows Ink injection, a Wacom-style virtual tablet) and is on the roadmap. Drawing, handwriting and precise pointing work now.',
  },
  {
    q: 'Which devices can connect to which?',
    a: 'PC ↔ PC, Mac ↔ PC, phone or tablet → PC or Mac, and any browser → PC or Mac. A computer running the desktop app can share its screen and also view another computer. Phones and tablets view and control. Only the desktop app shares a screen.',
  },
  {
    q: 'How do I connect over USB?',
    a: 'Android: enable USB debugging and plug in — Paneo sets up an adb tunnel and opens the app on the phone. Or turn on USB tethering. iPhone and iPad: plug in and turn on Personal Hotspot — the cable becomes a network link. Computer to computer: use a USB networking cable or USB-Ethernet adapters, or Thunderbolt/USB4 networking. The guide has step-by-step instructions.',
  },
  {
    q: 'Will it start by itself when I log in?',
    a: 'Yes, if you want it to: Paneo starts in the system tray at login (you can turn this off in Preferences) so your paired devices connect the moment you sit down. It uses the OS’s own login-item mechanism: Task Scheduler-free, no background service, no admin rights.',
  },
  {
    q: 'What permissions does it ask for, and why?',
    a: 'On macOS: Screen Recording (to share the screen), Accessibility (to let a paired device control it) and Local Network (to find devices). On Windows: a firewall rule (the installer adds it). On Android: Camera only to scan the pairing QR code (optional), plus the network and Wi-Fi state permissions needed for discovery. The Permissions screen in the app checks each one and gives you a button to fix it.',
  },
  {
    q: 'Is it free? Is it open source?',
    a: 'Yes and yes. Paneo is released under the MIT license. The whole stack — desktop app, Android app, protocol, this website — is in one repository.',
  },
];
