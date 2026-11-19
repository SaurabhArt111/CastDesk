import { useEffect, useState } from 'react';
import { PageHero, Callout } from '../components/Layout.jsx';

const SHOTS = [
  { src: 'desktop-home', kind: 'desktop', title: 'Home', text: 'PIN and QR code to pair, nearby devices, and paired devices that reconnect by themselves.', sample: true },
  { src: 'desktop-layout', kind: 'desktop', title: 'Display layout', text: 'Drag screens into place. They snap to each other like in Windows’ Display settings.', sample: true },
  { src: 'desktop-permissions', kind: 'desktop', title: 'Permissions', text: 'Every permission checked in one place, with a button that opens the right system page.', sample: true },
  { src: 'desktop-settings', kind: 'desktop', title: 'Settings', text: 'Autostart, sharing, video and input — all in plain language.', sample: true },
  { src: 'mobile-home', kind: 'phone', title: 'Phone: home', text: 'Computers nearby and paired ones, one tap to connect.' },
  { src: 'mobile-pin', kind: 'phone', title: 'Phone: pairing', text: 'Enter the PIN once. That’s the last time.' },
  { src: 'mobile-trackpad', kind: 'phone', title: 'Phone: trackpad', text: 'Relative pointer with tap, scroll, pinch and swipe gestures.' },
  { src: 'mobile-keyboard', kind: 'phone', title: 'Phone: keys', text: 'Full keyboard with sticky modifiers and shortcuts.' },
  { src: 'mobile-pen', kind: 'phone', title: 'Phone: pen', text: 'Absolute drawing surface mapped to the whole screen.' },
];

export default function Gallery() {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const desktop = SHOTS.filter((s) => s.kind === 'desktop');
  const phone = SHOTS.filter((s) => s.kind === 'phone');
  const Item = ({ s }) => (
    <figure className={`shot shot-${s.kind}`}>
      <button onClick={() => setOpen(s)} aria-label={`Enlarge: ${s.title}`}>
        <img src={`/screens/${s.src}.webp`} alt={s.title} loading="lazy" />
      </button>
      <figcaption><b>{s.title}</b><span>{s.text}</span></figcaption>
    </figure>
  );
  return (
    <>
      <PageHero eyebrow="Screenshots" title="See the interface">
        Dark theme shown; every screen also has a light theme that follows your system.
      </PageHero>
      <div className="container page-body">
        <Callout tone="info" title="About these images">
          Phone screens and the pairing flow were captured from the running app against a real host. The four desktop screens use sample data (invented device names) so we could show a populated list and a three-display layout.
        </Callout>
        <h2 className="gal-h">On the computer</h2>
        <div className="gal gal-desktop">{desktop.map((s) => <Item key={s.src} s={s} />)}</div>
        <h2 className="gal-h">On a phone or tablet</h2>
        <div className="gal gal-phone">{phone.map((s) => <Item key={s.src} s={s} />)}</div>
      </div>
      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" onClick={() => setOpen(null)}>
          <img src={`/screens/${open.src}.webp`} alt={open.title} />
          <p>{open.title} — {open.text}</p>
        </div>
      )}
    </>
  );
}
