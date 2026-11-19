import { Link } from 'react-router-dom';
import Icon from '../components/Icons.jsx';
import { Callout, CodeBlock, PageHero } from '../components/Layout.jsx';
import { SITE } from '../data/site.js';

const TREE = `castdesk/
├─ packages/
│  ├─ shared/   protocol, PIN pairing (SPEKE), gestures, display-layout maths
│  └─ host/     host service: WebSocket server, trust store, input, displays, USB, discovery
├─ apps/
│  ├─ desktop/  Electron shell: tray, permissions, autostart, installers
│  ├─ client/   React + Vite + Capacitor app (phone, tablet, web)
│  └─ site/     this website (React + Vite + plain CSS)
├─ scripts/     icon generation, end-to-end test, screenshots
├─ docs/        architecture, protocol, permissions, build, security
└─ .github/     release workflow (Windows, macOS, Linux, Android)`;

export default function Source() {
  return (
    <>
      <PageHero eyebrow="Open source" title="Source &amp; build">
        MIT licensed. One repository holds the desktop app, the mobile app, the protocol and this site.
      </PageHero>
      <div className="container page-body narrow">
        <p className="cta-row">
          <a className="btn btn-primary" href={SITE.repo} target="_blank" rel="noreferrer"><Icon name="github" size={16} /> Repository</a>
          <a className="btn btn-ghost" href={`${SITE.repo}/issues`} target="_blank" rel="noreferrer">Issues</a>
          <a className="btn btn-ghost" href={SITE.releases} target="_blank" rel="noreferrer">Releases</a>
        </p>

        <h2>Layout</h2>
        <CodeBlock label="Repository">{TREE}</CodeBlock>

        <h2>Get it running</h2>
        <p>You need Node.js 20 or newer (22 recommended).</p>
        <CodeBlock label="Clone and test">{`git clone ${SITE.repo}.git\ncd castdesk\nnpm install\nnpm test`}</CodeBlock>
        <CodeBlock label="Run the desktop app in development">{`npm run build:client     # builds the phone/web app the desktop serves\nnpm run dev:desktop`}</CodeBlock>
        <CodeBlock label="Run the host without a window (servers, tests)">{`npm run host:headless`}</CodeBlock>

        <h2>Build installers</h2>
        <CodeBlock label="Desktop (run on the target OS)">{`npm run build:desktop    # Windows: nsis + msi + portable · macOS: dmg + zip · Linux: AppImage + deb + rpm`}</CodeBlock>
        <CodeBlock label="Android APK (needs JDK 21 + Android SDK)">{`npm run build:client\ncd apps/client\nnpx cap sync android\ncd android && ./gradlew assembleDebug\n# → app/build/outputs/apk/debug/app-debug.apk`}</CodeBlock>
        <CodeBlock label="This website">{`npm run build -w @castdesk/site   # → apps/site/dist (static files, host anywhere)`}</CodeBlock>
        <Callout tone="info" title="Automated releases">
          Pushing a tag like <code>v{SITE.version}</code> runs <code>.github/workflows/release.yml</code>, which builds every installer and the APK on GitHub-hosted machines and attaches them, with checksums, to a release. Add signing certificates as repository secrets to produce signed builds.
        </Callout>

        <h2>Tests</h2>
        <ul>
          <li><b>Unit tests</b> — protocol, pairing cryptography (checked against published test vectors), gestures, layout maths.</li>
          <li><b>Host tests</b> — real WebSocket sessions: pairing, wrong PIN lock-out, trusted reconnect, revoke, input whitelist, extend.</li>
          <li><b>End-to-end</b> — <code>node scripts/e2e-electron.mjs</code> launches the real Electron app under a virtual display and drives it from a phone-sized browser (pairs, streams frames, moves the real cursor, reconnects, revokes).</li>
        </ul>

        <h2>Extending CastDesk</h2>
        <ul>
          <li><b>Virtual-display drivers</b> — implement a provider in <code>packages/host/src/displays/providers.js</code>, or just set create/remove commands in Settings.</li>
          <li><b>Input backends</b> — <code>packages/host/src/input/injector.js</code> is pluggable (nut-js by default).</li>
          <li><b>Protocol</b> — see <code>docs/PROTOCOL.md</code>. Pull requests that add encryption or new codecs are especially welcome.</li>
        </ul>
        <p className="muted">License: <Link to="/about">MIT</Link>. Third-party components keep their own licenses.</p>
      </div>
    </>
  );
}
