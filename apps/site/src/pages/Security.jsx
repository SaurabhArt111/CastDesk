import { Callout, PageHero } from '../components/Layout.jsx';

export default function Security() {
  return (
    <>
      <PageHero eyebrow="Trust" title="Security &amp; privacy">
        What CastDesk protects, how, and — just as important — what it does not protect yet.
      </PageHero>
      <div className="container page-body narrow">
        <h2>Privacy</h2>
        <ul>
          <li>No accounts, no sign-in, no analytics, no crash reporting, no ads.</li>
          <li>The app makes no connection to any server. Screens and input go directly between your devices.</li>
          <li>Pairing keys and the list of paired devices are stored only on your devices (on desktop, encrypted with the OS keychain when available, and readable only by your user).</li>
        </ul>

        <h2>How pairing works</h2>
        <p>The first connection uses the 6-digit PIN with a <b>password-authenticated key exchange (SPEKE)</b>. Both sides derive the same session key from the PIN without ever sending the PIN, or anything an eavesdropper could use to test guesses offline. They then confirm the key with HMAC proofs and the host hands over a random 256-bit <b>device secret</b>, sealed with the session key.</p>
        <p>Later connections skip the PIN: each side proves it holds the device secret by answering a fresh random challenge (mutual HMAC). The secret itself is never sent.</p>
        <h3>Guard rails</h3>
        <ul>
          <li>PINs are single-use, expire after 5 minutes, and are replaced after 5 failed attempts or after a successful pairing.</li>
          <li>Repeated failures from one address are throttled.</li>
          <li>You choose, per device, whether it may only view or also control; and a master switch turns all remote control off.</li>
          <li>The host can prompt before a new device may control.</li>
          <li>Input from a device is whitelisted and range-checked before it touches the operating system. Held keys and buttons are released when a device disconnects.</li>
          <li>Removing a device from the host deletes its secret immediately.</li>
        </ul>

        <h2>What is not protected yet</h2>
        <Callout tone="warn" title="Version 1.0 does not encrypt the screen stream or input">
          Pairing and reconnect are authenticated, but after that the video frames and control messages travel as ordinary unencrypted WebSocket data. Someone who can observe your network traffic could watch the screen or read keystrokes, and someone on a hostile network could in principle hijack an existing session. Use CastDesk on networks you trust (your home, a private office network) or over a USB cable. Do not expose port 7420 to the internet.
        </Callout>
        <p>Encrypting the session with the key already established during pairing is the highest-priority item on the roadmap.</p>

        <h2>Other limitations</h2>
        <ul>
          <li>The viewer web app is served over plain HTTP on your local network; browsers treat it as an insecure origin, which limits some browser features (such as the camera for QR scanning in a plain browser).</li>
          <li>Pen pressure and tilt are transmitted but injected as a plain pointer for now.</li>
          <li>Anyone physically at the host can read the current PIN — that is by design; it proves you are present.</li>
        </ul>

        <h2>Report a vulnerability</h2>
        <p>Please report security issues privately through the repository’s “Report a vulnerability” form rather than in a public issue. We’ll acknowledge reports and credit you if you wish.</p>
      </div>
    </>
  );
}
