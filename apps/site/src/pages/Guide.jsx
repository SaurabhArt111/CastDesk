import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Callout, CodeBlock, DeviceFrame, PageHero } from '../components/Layout.jsx';
import { SITE } from '../data/site.js';

const TOC = [
  ['start', 'Quick start'],
  ['install', 'Install'],
  ['pair', 'Pair with a PIN'],
  ['auto', 'Automatic reconnect'],
  ['wifi', 'Connect over Wi-Fi / LAN'],
  ['usb', 'Connect over USB'],
  ['offline', 'No internet? No problem'],
  ['modes', 'Choose what a device is for'],
  ['gestures', 'Gesture cheat sheet'],
  ['mirror', 'Mirror a display'],
  ['extend', 'Extend (add a screen)'],
  ['layout', 'Arrange displays'],
  ['pc2pc', 'PC to PC'],
  ['autostart', 'Autostart'],
  ['permissions', 'Permissions'],
  ['firewall', 'Firewall & ports'],
  ['trouble', 'Troubleshooting'],
];

function Sec({ id, title, children }) {
  return (
    <section id={id} className="doc-sec">
      <h2><a href={`#${id}`} className="anchor" aria-hidden="true">#</a>{title}</h2>
      {children}
    </section>
  );
}

function useActive() {
  const [active, setActive] = useState('start');
  useEffect(() => {
    const els = TOC.map(([id]) => document.getElementById(id)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setActive(vis[0].target.id);
      },
      { rootMargin: '-90px 0px -65% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return active;
}

export default function Guide() {
  const active = useActive();
  return (
    <>
      <PageHero eyebrow="Documentation" title="The complete guide">
        From first install to USB, extended displays, permissions and troubleshooting.
      </PageHero>
      <div className="container doc-layout">
        <nav className="toc" aria-label="On this page">
          <b>On this page</b>
          {TOC.map(([id, label]) => (
            <a key={id} href={`#${id}`} className={active === id ? 'active' : ''}>{label}</a>
          ))}
        </nav>

        <article className="doc">
          <Sec id="start" title="Quick start">
            <ol className="num">
              <li><b>Install CastDesk</b> on the computer you want to share (<Link to="/download">download</Link>).</li>
              <li><b>Install CastDesk</b> on the phone, tablet or second computer — or just open the address shown in the host app in any browser.</li>
              <li>Open CastDesk on both. The computer appears under <b>Nearby</b>. Tap it, enter the <b>6-digit PIN</b> shown on the computer (or scan its QR code).</li>
              <li>Pick <b>Mirror</b> or <b>Extend</b>. You’re connected — and next time you won’t need the PIN.</li>
            </ol>
          </Sec>

          <Sec id="install" title="Install">
            <h3>Windows</h3>
            <p>Run <code>CastDesk-Setup-{SITE.version}-x64.exe</code>. The installer adds a Windows Firewall rule for private networks and offers to start CastDesk with Windows. No administrator account is needed for daily use afterwards.</p>
            <h3>macOS</h3>
            <p>Open the <code>.dmg</code> and drag CastDesk to Applications. On first launch macOS asks for <b>Screen Recording</b>, <b>Accessibility</b> and <b>Local Network</b>. See <a href="#permissions">Permissions</a>. If Gatekeeper complains because the build is unsigned, right-click the app → <b>Open</b>.</p>
            <h3>Linux</h3>
            <CodeBlock label="AppImage">{`chmod +x CastDesk-${SITE.version}-x86_64.AppImage\n./CastDesk-${SITE.version}-x86_64.AppImage`}</CodeBlock>
            <CodeBlock label="Debian / Ubuntu">{`sudo apt install ./castdesk_${SITE.version}_amd64.deb`}</CodeBlock>
            <p>Use an X11 session if you want to control the computer. Under Wayland the desktop can be mirrored, but the compositor does not allow other programs to inject input.</p>
            <h3>Android</h3>
            <p>Download <code>CastDesk-{SITE.version}.apk</code>, open it, and allow installing from that source when asked.</p>
            <h3>iPhone &amp; iPad, or any browser</h3>
            <p>Open the address shown in the host app (for example <code>http://192.168.1.20:{SITE.port}</code>). On iOS tap Share → <b>Add to Home Screen</b> for a full-screen app.</p>
          </Sec>

          <Sec id="pair" title="Pair with a one-time PIN">
            <p>The host app shows a <b>6-digit PIN</b> and a QR code. Enter the PIN on the other device once. If the PIN has expired or you want a fresh one, press <b>New PIN</b>. Both devices then store a secret key, and from then on they trust each other.</p>
            <div className="doc-fig"><DeviceFrame kind="phone" src="/screens/mobile-pin.webp" alt="Pairing sheet asking for the PIN" /></div>
            <ul>
              <li>A PIN works for <b>one</b> pairing and expires after <b>5 minutes</b>.</li>
              <li>After <b>5 wrong tries</b> a new PIN replaces it automatically.</li>
              <li>The PIN never crosses the network — not even as a hash (see <Link to="/security">Security</Link>).</li>
              <li>Scanning the QR code (or tapping a <code>castdesk://</code> link) fills in the address <i>and</i> the PIN.</li>
            </ul>
            <Callout tone="info" title="Approve new controllers">By default the host asks “Allow this device to control?” the first time. You can change this in <Link to="/preferences">Preferences</Link>.</Callout>
          </Sec>

          <Sec id="auto" title="Automatic reconnect — no PIN">
            <p>Paired devices appear in <b>My devices</b> with a <b>Connect</b> button, and when <i>Reconnect to paired devices automatically</i> is on (default), they connect as soon as they see each other. Behind the scenes the two devices prove they hold the shared key by answering a fresh challenge — nothing secret is sent.</p>
            <p>Disconnecting yourself (the ✕ in a session, or from the host) pauses auto-connect for that device until you connect again manually, so it won’t instantly reconnect behind your back. To remove a device entirely, choose <b>Remove</b> under <i>Paired devices</i> on the host — it must pair again with a new PIN.</p>
          </Sec>

          <Sec id="wifi" title="Connect over Wi-Fi or Ethernet">
            <p>Both devices must be on the same network. CastDesk announces itself with <b>Bonjour (mDNS)</b> and a small <b>UDP broadcast</b>, so it shows up without typing anything. If your network blocks discovery (some guest or corporate Wi-Fi isolates clients), connect by address: enter the host’s IP shown in the app, or scan the QR code.</p>
            <p>Tips for the smoothest picture: use 5 GHz Wi-Fi or wired Ethernet for the host; lower <i>Max resolution</i> or <i>Frame rate</i> under <Link to="/preferences">Video</Link> on weak links.</p>
          </Sec>

          <Sec id="usb" title="Connect over USB">
            <p>A cable has the lowest latency and needs no Wi-Fi. There are three routes:</p>
            <h3>Android phone or tablet — adb tunnel (recommended)</h3>
            <ol className="num">
              <li>On the phone: Settings → About phone → tap <b>Build number</b> seven times. Then Settings → System → Developer options → enable <b>USB debugging</b>.</li>
              <li>Plug the phone into the computer and accept the “Allow USB debugging?” prompt.</li>
              <li>Open CastDesk on the computer. It detects the phone, sets up a private tunnel, and the computer appears on the phone as <b>“This computer (USB)”</b>.</li>
            </ol>
            <p>The <b>Devices</b> panel on the computer lists every phone it can see on the cable and its state — <i>Linked</i>, or <i>Needs approval</i> if you still have to tap “Allow USB debugging” on the phone — and has a <b>Refresh</b> button to look again. If <code>adb</code> is missing it says so and links to the download.</p>
            <p>The tunnel uses Android’s own <code>adb reverse</code>, so the phone connects to <code>127.0.0.1</code> and no network is involved at all. CastDesk needs <code>adb</code> on the computer; it looks for it on your PATH and in the usual Android SDK locations. Install Android “platform-tools” if it isn’t found.</p>
            <CodeBlock label="Manual equivalent">{`adb reverse tcp:${SITE.port} tcp:${SITE.port}`}</CodeBlock>
            <h3>Android — USB tethering</h3>
            <p>Settings → Network → Hotspot &amp; tethering → <b>USB tethering</b>. The cable becomes a network and the host shows up under Nearby. No developer mode needed.</p>
            <h3>iPhone &amp; iPad</h3>
            <p>Plug in, then turn on <b>Personal Hotspot</b> (Settings → Personal Hotspot → Allow Others to Join). The computer sees a new network adapter; open the address shown in CastDesk in Safari. On Windows you need iTunes or Apple Devices installed for the USB network driver.</p>
            <h3>Computer to computer</h3>
            <p>Use a USB networking (“bridge”) cable, a pair of USB-Ethernet adapters connected with an Ethernet cable, or Thunderbolt/USB4 networking. All of these create an ordinary network link, which CastDesk discovers like any other.</p>
          </Sec>

          <Sec id="offline" title="No internet? No problem">
            <p>CastDesk never contacts a server. It works on a router with no WAN, on a phone hotspot with mobile data off, and over a bare cable. The only requirement is that the two devices can reach each other.</p>
          </Sec>

          <Sec id="modes" title="Choose what a device is for">
            <p>Pick one on the Home screen (or in Preferences) before you connect. You can switch from the toolbar during a session. Each choice is its own full-screen experience: a trackpad is only a trackpad, and never shares the screen with a video.</p>
            <div className="doc-fig"><DeviceFrame kind="phone" src="/screens/mobile-mirror.webp" alt="Mirror" /><DeviceFrame kind="phone" src="/screens/mobile-trackpad.webp" alt="Trackpad" /><DeviceFrame kind="phone" src="/screens/mobile-pen.webp" alt="Pen pad" /><DeviceFrame kind="phone" src="/screens/mobile-keyboard.webp" alt="Keyboard" /></div>
            <ul>
              <li><b>Mirror screen</b> — see the computer&apos;s screen. Tap it to click (can be turned off in Preferences).</li>
              <li><b>Extend screen</b> — use the device as a second monitor you can arrange like in Windows display settings.</li>
              <li><b>Trackpad</b> — relative, like a laptop. Pointer speed, acceleration and natural scrolling are in Preferences.</li>
              <li><b>Keyboard</b> — on-screen keyboard with sticky modifiers, F-keys and arrows, plus a text field that uses the phone’s own keyboard (voice, emoji, other languages). A Bluetooth keyboard works too when <i>Send my hardware keyboard</i> is on.</li>
              <li><b>Pen pad</b> — absolute drawing surface for stylus or finger, like a graphics tablet.</li>
            </ul>
          </Sec>

          <Sec id="gestures" title="Gesture cheat sheet (trackpad)">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Gesture</th><th>Action</th></tr></thead>
                <tbody>
                  <tr><td>Tap</td><td>Left click</td></tr>
                  <tr><td>Two-finger tap</td><td>Right click</td></tr>
                  <tr><td>Three-finger tap</td><td>Middle click</td></tr>
                  <tr><td>Double-tap, hold on the second tap, drag</td><td>Drag and drop</td></tr>
                  <tr><td>Two fingers, move together</td><td>Scroll (vertical and horizontal)</td></tr>
                  <tr><td>Two fingers, pinch</td><td>Zoom (Ctrl + wheel)</td></tr>
                  <tr><td>Three-finger swipe left / right</td><td>Switch virtual desktop (Windows, macOS, Linux)</td></tr>
                  <tr><td>Three-finger swipe up / down</td><td>Task view or Mission Control / show desktop (the exact shortcut depends on the host OS)</td></tr>
                </tbody>
              </table>
            </div>
          </Sec>

          <Sec id="mirror" title="Mirror a display">
            <p>Mirror shows one of the host’s existing displays on the other device. It works everywhere with no extra software. With several monitors, choose which one to mirror in the session’s display picker.</p>
          </Sec>

          <Sec id="extend" title="Extend: add a new screen">
            <p>Extend makes the computer believe a new monitor has been plugged in, then shows that monitor on your device. An operating system only creates a monitor through a display driver, so what you need depends on the host:</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Host OS</th><th>What to do</th></tr></thead>
                <tbody>
                  <tr><td>Linux (X11)</td><td>Built in (experimental). CastDesk creates a virtual monitor with <code>xrandr</code>. Install <code>x11-xserver-utils</code> if missing.</td></tr>
                  <tr><td>Windows</td><td>Install a virtual-display driver once — for example the open-source <b>Virtual Display Driver</b> (IddSampleDriver-based) — then add its create/remove command under <i>Settings → Virtual display</i>. CastDesk handles position, reconnection and cleanup.</td></tr>
                  <tr><td>macOS</td><td>Install a virtual-display tool (for example <b>BetterDisplay</b> or <b>displayplacer</b> with a virtual screen), then set its create/remove commands the same way. Mirroring needs nothing extra.</td></tr>
                </tbody>
              </table>
            </div>
            <p>Commands support the placeholders <code>{'{w}'}</code>, <code>{'{h}'}</code>, <code>{'{x}'}</code>, <code>{'{y}'}</code> and <code>{'{name}'}</code>:</p>
            <CodeBlock label="Example (shape of a command — use your driver’s real CLI)">{`my-vdisplay create --width {w} --height {h} --name "{name}"\nmy-vdisplay remove --name "{name}"`}</CodeBlock>
            <Callout tone="warn" title="Honest note">Virtual-display drivers differ by version and vendor, so CastDesk can’t ship one for you. Until one is configured, Extend falls back to Mirror and tells you why.</Callout>
          </Sec>

          <Sec id="layout" title="Arrange displays like Windows">
            <p>Open <b>Display layout</b> on the host. Every display — real and extended — is a draggable tile. Drag a tile and it <b>snaps edge to edge</b> against its neighbours; tiles can’t overlap, and every screen must touch another so the pointer can travel between them, just like Windows’ Display settings. Press <b>Apply</b> to move the screens.</p>
            <div className="doc-fig"><DeviceFrame kind="desktop" src="/screens/desktop-layout.webp" alt="Display layout editor" /></div>
            <p>CastDesk remembers each device’s position. The next time a paired device connects, its extended screen returns to the same place automatically.</p>
          </Sec>

          <Sec id="pc2pc" title="PC to PC (mirror or extend)">
            <p>Install the desktop app on both computers. Computer A shares; computer B opens CastDesk, picks A from <b>Nearby</b> (or <b>My devices</b>), pairs once, and chooses <b>Mirror</b> or <b>Extend</b>. Each computer can be a host and a viewer at the same time. Use Ethernet or a USB/Thunderbolt network link for the best frame rate.</p>
            <p>On the viewing computer, the session opens full-screen. You can move the session window to another monitor from the display panel (“Show this window on my other monitor”), and leave it with the ✕ in the toolbar.</p>
          </Sec>

          <Sec id="autostart" title="Autostart">
            <p>On first run CastDesk turns on <b>Start when I sign in</b> and <b>Start minimized to tray</b> and tells you with a notification. Change it any time in <Link to="/preferences">Preferences → Startup</Link>.</p>
            <ul>
              <li><b>Windows</b> — a standard login item (and a registry fallback).</li>
              <li><b>macOS</b> — a login item / LaunchAgent for your user.</li>
              <li><b>Linux</b> — an XDG autostart <code>.desktop</code> entry in <code>~/.config/autostart</code>.</li>
            </ul>
            <p>No background service, no administrator rights and nothing that runs when you’re signed out.</p>
          </Sec>

          <Sec id="permissions" title="Permissions">
            <p>The <b>Permissions</b> screen in the app checks every permission and gives a one-click <b>Fix</b> button that opens the right system page.</p>
            <div className="doc-fig"><DeviceFrame kind="desktop" src="/screens/desktop-permissions.webp" alt="Permissions screen" /></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>OS</th><th>Permission</th><th>Why</th></tr></thead>
                <tbody>
                  <tr><td>macOS</td><td>Screen Recording</td><td>Capture the display to send it.</td></tr>
                  <tr><td>macOS</td><td>Accessibility</td><td>Let a paired device move the mouse and type.</td></tr>
                  <tr><td>macOS</td><td>Local Network</td><td>Find and talk to devices on your network.</td></tr>
                  <tr><td>Windows</td><td>Firewall rule (private networks)</td><td>Let other devices reach CastDesk. Added by the installer.</td></tr>
                  <tr><td>Windows</td><td>Run as administrator <i>(only to control elevated windows)</i></td><td>Windows blocks input into admin windows from normal apps.</td></tr>
                  <tr><td>Linux</td><td>X11 session</td><td>Wayland does not allow synthetic input.</td></tr>
                  <tr><td>Android</td><td>Network, Wi-Fi state, multicast</td><td>Connect and find the computer.</td></tr>
                  <tr><td>Android</td><td>Camera <i>(optional)</i></td><td>Only to scan the pairing QR code.</td></tr>
                  <tr><td>Android 13+</td><td>Nearby Wi-Fi devices <i>(optional)</i></td><td>Local discovery without location access.</td></tr>
                  <tr><td>iOS</td><td>Local Network</td><td>Find the computer (the web app asks via Safari).</td></tr>
                </tbody>
              </table>
            </div>
            <p>CastDesk never asks for location, contacts, microphone, storage or accounts.</p>
          </Sec>

          <Sec id="firewall" title="Firewall and ports">
            <ul>
              <li><b>TCP {SITE.port}</b> — web app and connection (HTTP + WebSocket on one port). You can change it in Preferences.</li>
              <li><b>UDP 7421</b> — local broadcast discovery.</li>
              <li><b>UDP 5353</b> — Bonjour/mDNS discovery.</li>
            </ul>
            <CodeBlock label="Linux (ufw)">{`sudo ufw allow from 192.168.0.0/16 to any port ${SITE.port} proto tcp`}</CodeBlock>
          </Sec>

          <Sec id="trouble" title="Troubleshooting">
            <details className="faq"><summary>The computer doesn’t appear under Nearby</summary><p>Check both devices are on the same network and that guest-Wi-Fi “client isolation” is off. Check the firewall allows TCP {SITE.port} and UDP 5353/7421. Meanwhile connect by address or QR code, or use USB.</p></details>
            <details className="faq"><summary>The picture is laggy</summary><p>Prefer a cable or 5 GHz Wi-Fi. Lower <i>Max resolution</i> to 1280 or <i>Frame rate</i> to 20, or lower <i>Image quality</i>. Turn on <i>Show connection stats</i> to see the live frame rate.</p></details>
            <details className="faq"><summary>Black screen on macOS</summary><p>Grant Screen Recording to CastDesk in System Settings → Privacy &amp; Security, then quit and reopen CastDesk and reconnect.</p></details>
            <details className="faq"><summary>Taps move the pointer but nothing clicks (macOS)</summary><p>Grant Accessibility in System Settings → Privacy &amp; Security.</p></details>
            <details className="faq"><summary>Can’t control some windows on Windows</summary><p>Windows blocks input into windows that run as administrator. Run CastDesk as administrator for those sessions.</p></details>
            <details className="faq"><summary>USB doesn’t connect on Android</summary><p>Confirm USB debugging is on, accept the prompt on the phone, and that <code>adb devices</code> lists it as “device” (not “unauthorized”). Install Android platform-tools if <code>adb</code> is missing.</p></details>
            <details className="faq"><summary>It keeps asking for a PIN</summary><p>The saved key is missing on one side — for example after removing the device on the host or clearing the app’s data. Pair once more and it will be remembered.</p></details>
            <details className="faq"><summary>Linux: pointer doesn’t move</summary><p>Log in with an X11 session instead of Wayland and make sure the optional input module is installed.</p></details>
          </Sec>
        </article>
      </div>
    </>
  );
}
