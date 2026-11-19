import { Link } from 'react-router-dom';
import Icon from '../components/Icons.jsx';
import { DeviceFrame } from '../components/Layout.jsx';
import { DOWNLOADS, FAQ, detectOS } from '../data/site.js';

const FEATURES = [
  { icon: 'mirror', title: 'Mirror or extend', text: 'Show an existing display on another device, or add a brand-new virtual monitor and drag windows onto it like a real second screen.' },
  { icon: 'usb', title: 'USB, Wi-Fi or Ethernet', text: 'Plug in a cable for the lowest latency, or join the same network. Works with no internet at all — even with the router’s WAN unplugged.' },
  { icon: 'trackpad', title: 'A trackpad in your pocket', text: 'Tap to click, two fingers to scroll, pinch to zoom, tap-and-drag, three-finger swipes. Pointer speed and natural scrolling are yours to tune.' },
  { icon: 'pen', title: 'Pen tablet mode', text: 'Turn a tablet into a graphics pad. The whole surface maps to the screen, with pressure, tilt and eraser data sent along.' },
  { icon: 'keyboard', title: 'Full on-screen keyboard', text: 'Sticky Ctrl, Alt, Shift and Win/Cmd for real shortcuts, plus a text box that uses your phone’s own keyboard, voice typing and emoji.' },
  { icon: 'lock', title: 'PIN once, then automatic', text: 'Pair with a one-time 6-digit PIN or QR code. After that devices recognise each other and reconnect by themselves, with no PIN.' },
  { icon: 'layout', title: 'Arrange displays like Windows', text: 'Drag screens into place and they snap edge to edge. CastDesk remembers the position of each device for next time.' },
  { icon: 'power', title: 'Starts with your computer', text: 'Lives quietly in the tray after login so your devices connect the moment you sit down. One switch to turn it off.' },
];

const STEPS = [
  { n: 1, title: 'Install on your computer', text: 'Download CastDesk for Windows, macOS or Linux. The installer opens the firewall for your private network.' },
  { n: 2, title: 'Pair with a PIN — once', text: 'Open CastDesk on your phone, tablet or second PC. Pick your computer, type the 6-digit PIN (or scan the QR code).' },
  { n: 3, title: 'It just connects', text: 'Next time the devices see each other — on the cable or the network — they connect on their own and put the screen right where you left it.' },
];

const MODES = [
  { icon: 'touch', title: 'Touch', text: 'Tap exactly where you touch the picture. Long-press to right-click, drag to drag, two fingers to scroll.' },
  { icon: 'trackpad', title: 'Trackpad', text: 'Relative movement, tap-to-click, two-finger scroll and right-click, pinch-zoom, tap-and-drag, three-finger swipes.' },
  { icon: 'pen', title: 'Pen', text: 'Absolute drawing surface for stylus or finger, mapped to the whole screen, with pressure and tilt.' },
  { icon: 'keyboard', title: 'Keys', text: 'Full keyboard with sticky modifiers and F-keys, plus voice, emoji and IME text input.' },
];

function Hero() {
  const os = detectOS();
  const dl = DOWNLOADS.find((d) => d.id === os) || DOWNLOADS[0];
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="eyebrow pill"><Icon name="cloudoff" size={14} /> Local-first · works with no internet</span>
          <h1>
            Every screen.<br />
            <span className="grad">One desk.</span>
          </h1>
          <p className="lead">
            Turn phones, tablets and other computers into extra screens, trackpads, keyboards and pen tablets for your PC or Mac — over a USB cable or your own network. Pair once with a PIN. After that, it just connects.
          </p>
          <div className="cta-row">
            <Link to={`/download#${dl.id}`} className="btn btn-primary btn-lg">
              <Icon name="download" size={18} /> Download for {dl.os}
            </Link>
            <Link to="/guide" className="btn btn-ghost btn-lg">Read the guide</Link>
          </div>
          <ul className="hero-meta">
            <li><Icon name="check" size={16} /> Free &amp; open source</li>
            <li><Icon name="check" size={16} /> No account</li>
            <li><Icon name="check" size={16} /> No telemetry</li>
          </ul>
        </div>
        <div className="hero-art" aria-hidden="false">
          <DeviceFrame kind="desktop" src="/screens/desktop-home.webp" alt="CastDesk on a PC: one-time PIN, QR code, nearby devices and paired computers" className="hero-desktop" />
          <DeviceFrame kind="phone" src="/screens/mobile-trackpad.webp" alt="CastDesk on a phone in trackpad mode controlling a PC" className="hero-phone" />
        </div>
      </div>
    </section>
  );
}

function Platforms() {
  return (
    <section className="strip">
      <div className="container strip-inner">
        <span className="muted">Share from</span>
        <b>Windows</b><b>macOS</b><b>Linux</b>
        <span className="muted">Use on</span>
        <b>Windows</b><b>macOS</b><b>Linux</b><b>Android</b><b>iPhone &amp; iPad</b><b>Any browser</b>
      </div>
    </section>
  );
}

function ConnectionDiagram() {
  return (
    <svg className="diagram" viewBox="0 0 760 250" role="img" aria-label="Your devices connect to each other directly over USB or the local network. Nothing goes to the internet.">
      <defs>
        <linearGradient id="dg" x1="0" x2="1"><stop offset="0" stopColor="#c7f23b" /><stop offset="1" stopColor="#62c686" /></linearGradient>
      </defs>
      <rect x="20" y="70" width="170" height="110" rx="16" className="d-box" />
      <text x="105" y="118" textAnchor="middle" className="d-title">Your PC</text>
      <text x="105" y="142" textAnchor="middle" className="d-sub">CastDesk host</text>
      <rect x="570" y="20" width="170" height="64" rx="14" className="d-box" />
      <text x="655" y="58" textAnchor="middle" className="d-title">Phone / tablet</text>
      <rect x="570" y="93" width="170" height="64" rx="14" className="d-box" />
      <text x="655" y="131" textAnchor="middle" className="d-title">Second PC / Mac</text>
      <rect x="570" y="166" width="170" height="64" rx="14" className="d-box" />
      <text x="655" y="204" textAnchor="middle" className="d-title">Any browser</text>
      <path d="M190 100 C 300 60, 450 40, 570 52" className="d-line" />
      <path d="M190 125 C 320 125, 450 125, 570 125" className="d-line" />
      <path d="M190 150 C 300 190, 450 210, 570 198" className="d-line" />
      <rect x="305" y="26" width="110" height="26" rx="13" className="d-chip" /><text x="360" y="44" textAnchor="middle" className="d-chip-t">USB cable</text>
      <rect x="305" y="112" width="110" height="26" rx="13" className="d-chip" /><text x="360" y="130" textAnchor="middle" className="d-chip-t">Wi-Fi / LAN</text>
      <rect x="295" y="196" width="130" height="26" rx="13" className="d-chip" /><text x="360" y="214" textAnchor="middle" className="d-chip-t">USB tethering</text>
      <g className="d-cloud"><path d="M330 236 h60" /><text x="360" y="249" textAnchor="middle">no internet needed</text></g>
    </svg>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Platforms />

      <section className="section" id="features">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Everything on one page</span>
            <h2>The desk setup you wanted, without the cables and the cloud</h2>
          </div>
          <div className="grid grid-4">
            {FEATURES.map((f) => (
              <article className="card feature" key={f.title}>
                <span className="feature-icon"><Icon name={f.icon} size={22} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt" id="how">
        <div className="container two-col">
          <div>
            <span className="eyebrow">How it works</span>
            <h2>Three steps. The third one never repeats.</h2>
            <ol className="steps">
              {STEPS.map((s) => (
                <li key={s.n}>
                  <span className="step-n">{s.n}</span>
                  <div><h3>{s.title}</h3><p>{s.text}</p></div>
                </li>
              ))}
            </ol>
          </div>
          <div><ConnectionDiagram /></div>
        </div>
      </section>

      <section className="section" id="input">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">Input, your way</span>
            <h2>Touch it, trackpad it, draw on it, type on it</h2>
            <p className="lead">Switch modes in one tap, mid-session.</p>
          </div>
          <div className="two-col modes">
            <div className="grid grid-2">
              {MODES.map((m) => (
                <article className="card feature" key={m.title}>
                  <span className="feature-icon"><Icon name={m.icon} size={22} /></span>
                  <h3>{m.title}</h3>
                  <p>{m.text}</p>
                </article>
              ))}
            </div>
            <div className="phones">
              <DeviceFrame kind="phone" src="/screens/mobile-keyboard.webp" alt="On-screen keyboard mode with sticky modifier keys" />
              <DeviceFrame kind="phone" src="/screens/mobile-pen.webp" alt="Pen mode: the phone surface acts as a drawing tablet" className="offset" />
            </div>
          </div>
        </div>
      </section>

      <section className="section alt" id="continuity">
        <div className="container two-col reverse">
          <div className="phones one">
            <DeviceFrame kind="phone" src="/screens/mobile-pin.webp" alt="Pairing dialog asking for the one-time PIN" />
          </div>
          <div>
            <span className="eyebrow">Continuity, without the ecosystem</span>
            <h2>Pair once. Connect forever.</h2>
            <p className="lead">Your devices should find each other the way a pair of AirPods does — not make you set it up again every morning.</p>
            <ul className="ticks">
              <li><Icon name="check" size={18} /> <span><b>One-time PIN</b> — 6 digits, single-use, expires in 5 minutes, locks after 5 wrong tries.</span></li>
              <li><Icon name="check" size={18} /> <span><b>Zero-config discovery</b> — Bonjour/mDNS plus a local broadcast fallback, over Wi-Fi, Ethernet and USB links.</span></li>
              <li><Icon name="check" size={18} /> <span><b>Auto-connect</b> — paired devices reconnect with a silent mutual proof. No PIN, no taps.</span></li>
              <li><Icon name="check" size={18} /> <span><b>Remembers the layout</b> — an extended screen returns exactly where you dragged it.</span></li>
              <li><Icon name="check" size={18} /> <span><b>You stay in control</b> — approve control per device, switch off remote control, or remove a device instantly.</span></li>
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="screens">
        <div className="container">
          <div className="section-head">
            <span className="eyebrow">The app</span>
            <h2>Designed to be obvious</h2>
          </div>
          <div className="grid grid-2">
            <DeviceFrame kind="desktop" src="/screens/desktop-layout.webp" alt="Drag-and-drop display layout with snapping, including an extended iPad" />
            <DeviceFrame kind="desktop" src="/screens/desktop-permissions.webp" alt="Permissions screen showing what CastDesk needs and a one-click fix" />
          </div>
          <p className="center"><Link to="/gallery" className="btn btn-ghost">See all screenshots <Icon name="arrow" size={16} /></Link></p>
        </div>
      </section>

      <section className="section alt" id="honest">
        <div className="container narrow">
          <div className="section-head left">
            <span className="eyebrow">Good to know</span>
            <h2>What works out of the box — and what needs one extra step</h2>
          </div>
          <div className="grid grid-2">
            <div className="card">
              <h3><Icon name="check" size={18} /> Works immediately</h3>
              <p>Mirroring any display, touch / trackpad / pen / keyboard control, PIN pairing, auto-reconnect, USB (adb or tethering), discovery, display arrangement, autostart.</p>
            </div>
            <div className="card">
              <h3><Icon name="warn" size={18} /> Needs a one-time setup</h3>
              <p><b>Extend</b> adds a new monitor to your computer, which an operating system only allows with a virtual-display driver. Linux/X11 can do it natively (experimental); Windows and macOS need a free driver. <Link to="/guide#extend">Step-by-step guide →</Link></p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="faq">
        <div className="container narrow">
          <div className="section-head left">
            <span className="eyebrow">Questions</span>
            <h2>Quick answers</h2>
          </div>
          {FAQ.slice(0, 5).map((f) => (
            <details className="faq" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
          <p><Link to="/faq">All questions →</Link></p>
        </div>
      </section>

      <section className="cta-band">
        <div className="container">
          <h2>Put your other screens to work.</h2>
          <p>Free, open source, and private by design.</p>
          <div className="cta-row center">
            <Link to="/download" className="btn btn-light btn-lg"><Icon name="download" size={18} /> Download CastDesk</Link>
            <Link to="/guide" className="btn btn-outline btn-lg">Read the guide</Link>
          </div>
        </div>
      </section>
    </>
  );
}
