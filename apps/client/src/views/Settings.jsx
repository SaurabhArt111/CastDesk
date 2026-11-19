import { useState } from 'react';
import { useApp } from '../state/AppContext.jsx';
import Icon from '../components/Icon.jsx';
import { Segmented, Slider, Switch } from '../components/common.jsx';
import PurposePicker from '../components/PurposePicker.jsx';
import { canHost, bridge, platformLabel, osName } from '../lib/platform.js';

function Section({ title, children, hint }) {
  return (
    <section className="card">
      <div className="card-head"><h2>{title}</h2></div>
      {hint && <p className="muted small">{hint}</p>}
      <div className="rows">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { identity, renameDevice, prefs, setPrefs, hostState, toast } = useApp();
  const hs = hostState?.settings;
  const [name, setName] = useState(identity.name);
  const [port, setPort] = useState(hs?.port ?? 7420);
  const host = (patch) => bridge.setSettings(patch);

  return (
    <div className="page">
      <header className="topbar">
        <h1>Preferences</h1>
      </header>
      <main className="page-body">
        <Section title="This device">
          <div className="row">
            <span className="row-text"><span className="row-title">Device name</span><span className="row-hint">How other devices see you. Running on {platformLabel(osName)}.</span></span>
            <span className="inline-form tight">
              <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
              <button className="btn" disabled={name === identity.name || !name.trim()} onClick={() => { renameDevice(name); canHost && host({ deviceName: name.trim() }); toast('Name updated', 'ok'); }}>Save</button>
            </span>
          </div>
          <div className="row">
            <span className="row-text"><span className="row-title">Theme</span></span>
            <Segmented label="Theme" value={prefs.theme} onChange={(v) => setPrefs({ theme: v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
        </Section>

        <Section title="When I connect, use this device as" hint="Choose what a connection does. Nothing is mixed: a trackpad is only a trackpad, a mirror is only a screen.">
          <PurposePicker value={prefs.purpose} onChange={(v) => setPrefs({ purpose: v })} />
          <Switch checked={prefs.touchControl} onChange={(v) => setPrefs({ touchControl: v })} label="Touch the screen to click" hint="Mirror and Extend: tapping the picture clicks on the computer." />
          <Switch checked={prefs.penPreview} onChange={(v) => setPrefs({ penPreview: v })} label="Show the screen under the pen pad" hint="Off keeps the pen pad blank, like a graphics tablet." />
        </Section>

        {canHost && hs && (
          <>
            <Section title="Startup" hint="CastDesk can run quietly in the tray so your devices connect the moment you sit down.">
              <Switch checked={hs.autostart} onChange={(v) => host({ autostart: v })} label="Start CastDesk when I sign in" hint="Autostart on this computer." />
              <Switch checked={hs.startMinimized} onChange={(v) => host({ startMinimized: v })} label="Start minimized to tray" hint="Runs in the background without opening a window." disabled={!hs.autostart} />
            </Section>

            <Section title="Sharing this computer">
              <Switch checked={hs.allowIncoming} onChange={(v) => host({ allowIncoming: v })} label="Allow other devices to connect" />
              <Switch checked={hs.allowControl} onChange={(v) => host({ allowControl: v })} label="Allow remote control" hint="Master switch for keyboard, mouse, touch and pen input." />
              <Switch checked={hs.defaultAllowControl} onChange={(v) => host({ defaultAllowControl: v })} label="New devices may control by default" />
              <Switch checked={hs.requireApprovalForControl} onChange={(v) => host({ requireApprovalForControl: v })} label="Ask me before a new device can control" hint="Shows a prompt on this computer when pairing." disabled={!hs.defaultAllowControl} />
              <Switch checked={hs.advertise} onChange={(v) => host({ advertise: v })} label="Be discoverable on the network" hint="Uses Bonjour/mDNS and a local broadcast. Turn off to connect by IP, QR or USB only." />
              <Switch checked={hs.usbAutoForward} onChange={(v) => host({ usbAutoForward: v })} label="Automatically connect Android phones over USB" hint="Uses adb reverse when a phone with USB debugging is plugged in." />
              <div className="row">
                <span className="row-text"><span className="row-title">Port</span><span className="row-hint">Allow this TCP port through your firewall. Restart to apply.</span></span>
                <span className="inline-form tight">
                  <input className="input narrow" type="number" min="1024" max="65535" value={port} onChange={(e) => setPort(Number(e.target.value))} />
                  <button className="btn" disabled={port === hs.port || port < 1024 || port > 65535} onClick={() => { host({ port }); toast('Port saved. Restart CastDesk to apply.', 'ok'); }}>Save</button>
                </span>
              </div>
            </Section>

            <Section title="Virtual display (for “Extend”)" hint={`Extending needs a virtual monitor driver on this computer. ${hostState.caps?.note || ''}`}>
              <div className="row stack-row">
                <span className="row-text"><span className="row-title">Create command</span><span className="row-hint">Placeholders: {'{w} {h} {x} {y} {name}'}. Leave empty if your platform is built in.</span></span>
                <input className="input wide" defaultValue={hs.virtualCommands?.create || ''} placeholder="e.g. my-vdd-cli add {w}x{h}" onBlur={(e) => host({ virtualCommands: { ...hs.virtualCommands, create: e.target.value.trim() } })} />
              </div>
              <div className="row stack-row">
                <span className="row-text"><span className="row-title">Remove command</span></span>
                <input className="input wide" defaultValue={hs.virtualCommands?.remove || ''} placeholder="e.g. my-vdd-cli remove {name}" onBlur={(e) => host({ virtualCommands: { ...hs.virtualCommands, remove: e.target.value.trim() } })} />
              </div>
            </Section>
          </>
        )}

        <Section title="Connecting">
          <Switch checked={prefs.autoConnectTrusted} onChange={(v) => setPrefs({ autoConnectTrusted: v })} label="Reconnect to paired devices automatically" hint="Like Continuity: when a paired device shows up nearby, connect without a PIN." />
          <Switch checked={prefs.keepAwake} onChange={(v) => setPrefs({ keepAwake: v })} label="Keep this screen awake during a session" />
        </Section>

        <Section title="Video">
          <Slider label="Frame rate" value={prefs.maxFps} min={10} max={60} step={5} onChange={(v) => setPrefs({ maxFps: v })} format={(v) => `${v} fps`} />
          <div className="row">
            <span className="row-text"><span className="row-title">Max resolution</span><span className="row-hint">Lower is smoother on weak Wi-Fi.</span></span>
            <select className="select" value={prefs.maxWidth} onChange={(e) => setPrefs({ maxWidth: Number(e.target.value) })}>
              {[[1280, '720p'], [1920, '1080p'], [2560, '1440p'], [3840, '4K']].map(([w, l]) => <option key={w} value={w}>{l}</option>)}
            </select>
          </div>
          <Slider label="Image quality" value={prefs.quality} min={0.3} max={0.95} step={0.05} onChange={(v) => setPrefs({ quality: v })} format={(v) => `${Math.round(v * 100)}%`} />
          <Switch checked={prefs.showStats} onChange={(v) => setPrefs({ showStats: v })} label="Show connection stats" />
        </Section>

        <Section title="Touch, trackpad & keyboard">
          <Slider label="Pointer speed" value={prefs.sensitivity} min={0.5} max={3} step={0.1} onChange={(v) => setPrefs({ sensitivity: v })} format={(v) => `${v.toFixed(1)}×`} />
          <Slider label="Scroll speed" value={prefs.scrollSpeed} min={0.3} max={3} step={0.1} onChange={(v) => setPrefs({ scrollSpeed: v })} format={(v) => `${v.toFixed(1)}×`} />
          <Switch checked={prefs.acceleration} onChange={(v) => setPrefs({ acceleration: v })} label="Pointer acceleration" />
          <Switch checked={prefs.naturalScroll} onChange={(v) => setPrefs({ naturalScroll: v })} label="Natural scrolling" hint="Content follows your fingers." />
          <Switch checked={prefs.captureKeyboard} onChange={(v) => setPrefs({ captureKeyboard: v })} label="Send my hardware keyboard to the remote computer" />
          <Switch checked={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} label="Haptic feedback on taps" />
        </Section>

        <Section title="About">
          <div className="row"><span className="row-text"><span className="row-title">CastDesk {hostState?.version || '1.0.0'}</span><span className="row-hint">Everything stays on your network or USB cable. No account, no cloud, no telemetry.</span></span></div>
        </Section>
      </main>
    </div>
  );
}
