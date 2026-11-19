import { Link } from 'react-router-dom';
import Icon from '../components/Icons.jsx';
import { PageHero } from '../components/Layout.jsx';
import { SITE } from '../data/site.js';

const PRINCIPLES = [
  { icon: 'cloudoff', title: 'Local first', text: 'Your screen goes from your computer to your device, never through a server. The app works with the internet unplugged.' },
  { icon: 'lock', title: 'Private by design', text: 'No account, no analytics, no ads. Pairing keys stay on the devices that made them.' },
  { icon: 'bolt', title: 'Effortless', text: 'The first connection takes a PIN. Every one after that takes nothing at all.' },
  { icon: 'eye', title: 'Honest', text: 'We say what works, what needs a driver and what isn’t finished yet. The docs list every limitation.' },
];

const STACK = [
  ['Desktop app', 'Electron + a small Node.js host service'],
  ['Mobile & web app', 'React + Vite, plain CSS, packaged with Capacitor'],
  ['Protocol', 'WebSocket (JSON control + binary JPEG frames) on one TCP port'],
  ['Pairing', 'SPEKE password-authenticated key exchange, HMAC proofs'],
  ['Discovery', 'Bonjour/mDNS, UDP broadcast, QR, deep links, USB tunnel'],
  ['Input', 'Native input injection with a strict whitelist and clamping'],
  ['This website', 'React + Vite + plain CSS'],
];

export default function About() {
  return (
    <>
      <PageHero eyebrow="About" title="A calmer way to use more screens">
        CastDesk exists because the tablet in your drawer and the laptop on your sofa should be able to help your main computer without accounts, clouds or subscriptions.
      </PageHero>
      <div className="container page-body narrow">
        <section>
          <h2>Why we built it</h2>
          <p>Second-screen and remote-input tools are usually either tied to one ecosystem, or designed for reaching a machine across the internet. We wanted what a good desk setup feels like: plug in or walk up, and your devices already know each other.</p>
          <p>So CastDesk pairs once with a PIN, then remembers. It works over a cable or any local network, treats the connection as private, and keeps the interface out of the way.</p>
        </section>

        <div className="grid grid-2 principles">
          {PRINCIPLES.map((p) => (
            <article key={p.title} className="card feature">
              <span className="feature-icon"><Icon name={p.icon} size={22} /></span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </article>
          ))}
        </div>

        <section>
          <h2>What’s inside</h2>
          <div className="table-wrap">
            <table><tbody>{STACK.map(([a, b]) => <tr key={a}><th>{a}</th><td>{b}</td></tr>)}</tbody></table>
          </div>
        </section>

        <section>
          <h2>Where it is today</h2>
          <p>Version {SITE.version} is the first public release. Mirroring, touch/trackpad/pen/keyboard input, PIN pairing, automatic reconnect, USB, discovery, display arrangement and autostart are implemented and covered by automated tests, including an end-to-end test that drives a real desktop app and a real phone-sized browser.</p>
          <p>Still ahead: encrypted transport, native pen-pressure injection, audio, clipboard sharing and an App Store build. The full list is on the <Link to="/security">Security</Link> and <Link to="/changelog">Changelog</Link> pages.</p>
        </section>

        <section>
          <h2>Get involved</h2>
          <p>CastDesk is MIT licensed. Bug reports, translations, driver recipes for virtual displays and pull requests are welcome.</p>
          <p className="cta-row">
            <a className="btn btn-primary" href={SITE.repo} target="_blank" rel="noreferrer"><Icon name="github" size={16} /> View on GitHub</a>
            <Link className="btn btn-ghost" to="/source">Build from source</Link>
          </p>
        </section>
      </div>
    </>
  );
}
