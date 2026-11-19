import { Link } from 'react-router-dom';
import Icon from '../components/Icons.jsx';
import { Callout, CodeBlock, PageHero } from '../components/Layout.jsx';
import { DOWNLOADS, SITE, detectOS } from '../data/site.js';

const href = (file) => `${SITE.base}/${file}`;

function Recommended({ item }) {
  const main = item.files.find((f) => f.primary);
  return (
    <section className="recommended card">
      <div>
        <span className="eyebrow">Recommended for your device</span>
        <h2><Icon name={item.icon} size={26} /> CastDesk for {item.os}</h2>
        <p className="muted">Version {SITE.version} · {item.requires}</p>
      </div>
      {main ? (
        <a className="btn btn-primary btn-lg" href={href(main.file)}>
          <Icon name="download" size={18} /> Download {main.ext}
        </a>
      ) : (
        <a className="btn btn-primary btn-lg" href={`#${item.id}`}>How to use it →</a>
      )}
    </section>
  );
}

function Card({ item }) {
  return (
    <article className="card dl-card" id={item.id}>
      <header>
        <span className="feature-icon"><Icon name={item.icon} size={22} /></span>
        <div>
          <h3>{item.os}</h3>
          <small className="muted">{item.requires}</small>
        </div>
      </header>
      <p>{item.note}</p>
      {item.files.length > 0 && (
        <ul className="files">
          {item.files.map((f) => (
            <li key={f.file}>
              <div>
                <b>{f.label}</b> <code>{f.ext}</code>
                <small>{f.detail}</small>
              </div>
              <a className={`btn btn-sm ${f.primary ? 'btn-primary' : 'btn-ghost'}`} href={href(f.file)}>
                <Icon name="download" size={15} /> Get
              </a>
            </li>
          ))}
        </ul>
      )}
      {item.id === 'ios' && (
        <ol className="mini-steps">
          <li>Install CastDesk on your PC or Mac and open it.</li>
          <li>On the iPhone/iPad, join the same Wi-Fi (or plug in and turn on Personal Hotspot).</li>
          <li>In Safari, open <code>http://&lt;your-PC-address&gt;:{SITE.port}</code> — the address is shown in the app.</li>
          <li>Tap Share → <b>Add to Home Screen</b>. Enter the PIN once.</li>
        </ol>
      )}
      {item.id === 'web' && (
        <ol className="mini-steps">
          <li>Open CastDesk on the computer you want to share.</li>
          <li>On any other device, open <code>http://&lt;address&gt;:{SITE.port}</code> in a browser.</li>
          <li>Pick your computer, enter the PIN once, and you are in.</li>
        </ol>
      )}
      {item.id === 'android' && (
        <ol className="mini-steps">
          <li>Download the APK on the phone (or copy it over USB).</li>
          <li>Open it and allow “Install unknown apps” for that app when asked.</li>
          <li>Open CastDesk. For USB: enable <b>USB debugging</b> and plug into the PC.</li>
        </ol>
      )}
    </article>
  );
}

export default function Download() {
  const os = detectOS();
  const rec = DOWNLOADS.find((d) => d.id === os) || DOWNLOADS[0];
  return (
    <>
      <PageHero eyebrow={`Version ${SITE.version}`} title="Download CastDesk">
        Free for every platform. Install it on the computer you want to share, and on the devices you want to use with it.
      </PageHero>
      <div className="container page-body">
        <Recommended item={rec} />

        <div className="grid grid-2 dl-grid">
          {DOWNLOADS.map((d) => <Card key={d.id} item={d} />)}
        </div>

        <section className="card" id="verify">
          <h2>Verify your download</h2>
          <p>Every release ships a <code>SHA256SUMS.txt</code> file. Compare it with your download:</p>
          <CodeBlock label="Windows (PowerShell)">{`Get-FileHash .\\CastDesk-Setup-${SITE.version}-x64.exe -Algorithm SHA256`}</CodeBlock>
          <CodeBlock label="macOS / Linux">{`shasum -a 256 CastDesk-${SITE.version}-universal.dmg`}</CodeBlock>
          <p className="muted">All releases and checksums: <a href={SITE.releases} target="_blank" rel="noreferrer">GitHub Releases</a>.</p>
        </section>

        <div className="grid grid-2">
          <Callout tone="warn" title="Windows SmartScreen or macOS Gatekeeper warning?">
            Unsigned builds show a warning on first launch. On Windows choose <b>More info → Run anyway</b>. On macOS right-click the app and choose <b>Open</b>. Signed builds are produced when you add your certificates to the release workflow.
          </Callout>
          <Callout tone="info" title="Prefer to build it yourself?">
            Everything is open source. See <Link to="/source">Source &amp; build</Link> for one-command builds of every installer and the Android APK.
          </Callout>
        </div>
      </div>
    </>
  );
}
