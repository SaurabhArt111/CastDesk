import { Link } from 'react-router-dom';
import { PageHero } from '../components/Layout.jsx';
import { FAQ, SITE } from '../data/site.js';

export function FaqPage() {
  return (
    <>
      <PageHero eyebrow="FAQ" title="Frequently asked questions" />
      <div className="container page-body narrow">
        {FAQ.map((f) => (
          <details className="faq" key={f.q}>
            <summary>{f.q}</summary>
            <p>{f.a}</p>
          </details>
        ))}
        <p className="muted">Something missing? Read the <Link to="/guide">guide</Link> or <a href={`${SITE.repo}/issues`} target="_blank" rel="noreferrer">ask on GitHub</a>.</p>
      </div>
    </>
  );
}

const CHANGES = [
  {
    v: SITE.version,
    date: 'First release',
    items: [
      'Mirror or extend displays to phones, tablets, other computers and any browser.',
      'USB (Android adb tunnel, USB tethering, iPhone Personal Hotspot, USB/Thunderbolt networking) and local-network connection with no internet.',
      'One-time PIN pairing (SPEKE), then automatic reconnect with no PIN.',
      'Touch, trackpad, pen and keyboard input, with multi-touch gestures.',
      'Drag-and-drop display arrangement with Windows-style snapping; per-device layout memory.',
      'Autostart in the tray on Windows, macOS and Linux.',
      'Permission checker with one-click fixes for macOS, Windows, Linux and Android.',
      'Installers for Windows (exe, msi, portable), macOS (dmg, zip), Linux (AppImage, deb, rpm) and an Android APK.',
    ],
  },
  {
    v: 'Planned',
    date: 'Roadmap',
    items: [
      'Encrypted session transport using the pairing key.',
      'Native pen-pressure injection (Windows Ink, virtual tablet on Linux/macOS).',
      'Audio forwarding and clipboard sync.',
      'Hardware-accelerated video (H.264) for higher frame rates.',
      'App Store build for iPhone and iPad.',
    ],
  },
];

export function Changelog() {
  return (
    <>
      <PageHero eyebrow="Changelog" title="What’s new" />
      <div className="container page-body narrow">
        {CHANGES.map((c) => (
          <section key={c.v} className="change">
            <h2>{c.v} <small>{c.date}</small></h2>
            <ul>{c.items.map((i) => <li key={i}>{i}</li>)}</ul>
          </section>
        ))}
      </div>
    </>
  );
}

export function NotFound() {
  return (
    <>
      <PageHero eyebrow="404" title="That page isn’t here" />
      <div className="container page-body narrow">
        <p><Link className="btn btn-primary" to="/">Back to the home page</Link></p>
      </div>
    </>
  );
}
