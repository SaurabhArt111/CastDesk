import { PageHero, DeviceFrame, Callout } from '../components/Layout.jsx';

const GROUPS = [
  {
    title: 'This device',
    rows: [
      ['Device name', 'Text', 'This computer’s name', 'How other devices see you in Nearby and My devices.'],
      ['Theme', 'System / Light / Dark', 'System', 'Follows your OS unless you pick one.'],
    ],
  },
  {
    title: 'Startup (computer)',
    rows: [
      ['Start Paneo when I sign in', 'On / Off', 'On', 'Autostart through the OS login-item mechanism.'],
      ['Start minimized to tray', 'On / Off', 'On', 'Run quietly in the background; open from the tray icon.'],
    ],
  },
  {
    title: 'Sharing this computer',
    rows: [
      ['Allow other devices to connect', 'On / Off', 'On', 'Master switch for incoming connections.'],
      ['Allow remote control', 'On / Off', 'On', 'Master switch for keyboard, mouse, touch and pen input. Off = view only.'],
      ['New devices may control by default', 'On / Off', 'On', 'Control permission given to a freshly paired device. You can change it per device afterwards.'],
      ['Ask me before a new device can control', 'On / Off', 'On', 'Shows a prompt on this computer when a device pairs.'],
      ['Be discoverable on the network', 'On / Off', 'On', 'Announce with Bonjour and a local broadcast. Off = connect by address, QR or USB only.'],
      ['Automatically connect Android over USB', 'On / Off', 'On', 'Set up an adb tunnel when a phone with USB debugging is plugged in.'],
      ['Port', '1024–65535', '7420', 'TCP port for the app and connections. Restart to apply; update your firewall rule.'],
    ],
  },
  {
    title: 'Virtual display (for Extend)',
    rows: [
      ['Create command', 'Text', 'empty', 'Command that creates a virtual monitor. Placeholders {w} {h} {x} {y} {name}.'],
      ['Remove command', 'Text', 'empty', 'Command that removes it again.'],
    ],
  },
  {
    title: 'Connecting',
    rows: [
      ['Reconnect to paired devices automatically', 'On / Off', 'On', 'The Continuity-style behaviour: connect without a PIN when a paired device is nearby.'],
      ['Keep this screen awake', 'On / Off', 'On', 'Prevents the phone or tablet from sleeping during a session.'],
    ],
  },
  {
    title: 'Video',
    rows: [
      ['Frame rate', '10–60 fps', '30', 'Upper limit. The host sends fewer when the link can’t keep up.'],
      ['Max resolution', '720p / 1080p / 1440p / 4K', '1080p', 'Lower is smoother on weak Wi-Fi.'],
      ['Image quality', '30–95 %', '70 %', 'JPEG quality. Higher looks sharper but uses more bandwidth.'],
      ['Show connection stats', 'On / Off', 'Off', 'Overlay with frame rate and latency.'],
    ],
  },
  {
    title: 'Touch, trackpad & keyboard',
    rows: [
      ['Pointer speed', '0.5×–3×', '1.0×', 'How far the pointer moves per finger movement.'],
      ['Scroll speed', '0.3×–3×', '1.0×', 'Scroll distance per two-finger movement.'],
      ['Pointer acceleration', 'On / Off', 'On', 'Fast swipes travel farther.'],
      ['Natural scrolling', 'On / Off', 'On', 'Content follows your fingers.'],
      ['Send my hardware keyboard', 'On / Off', 'On', 'Forward a Bluetooth/USB keyboard’s keys to the remote computer.'],
      ['Haptic feedback', 'On / Off', 'On', 'Short vibration on taps (where supported).'],
    ],
  },
];

export default function Preferences() {
  return (
    <>
      <PageHero eyebrow="Reference" title="Preferences">
        Every setting in Paneo, what it does and its default. Settings live in the app under <b>Settings</b>; this page is a reference.
      </PageHero>
      <div className="container page-body">
        <div className="two-col pref-top">
          <div>
            <Callout tone="ok" title="Sensible defaults">
              Paneo is meant to work without touching any setting. Change things only when you want a different trade-off, for example lowering quality on slow Wi-Fi.
            </Callout>
            <p className="muted small">Defaults shown are for version 1.0. Some settings apply only to the computer that shares its screen (“host”), others only to the viewing device.</p>
          </div>
          <DeviceFrame kind="desktop" src="/screens/desktop-settings.webp" alt="The Paneo Settings screen on a computer" />
        </div>

        {GROUPS.map((g) => (
          <section key={g.title} className="pref-group">
            <h2>{g.title}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Setting</th><th>Values</th><th>Default</th><th>What it does</th></tr></thead>
                <tbody>
                  {g.rows.map((r) => (
                    <tr key={r[0]}>
                      <td><b>{r[0]}</b></td><td>{r[1]}</td><td><code>{r[2]}</code></td><td>{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
