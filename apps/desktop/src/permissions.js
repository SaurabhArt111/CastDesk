import { systemPreferences, shell } from 'electron';
import { execFile } from 'node:child_process';

const run = (bin, args) => new Promise((resolve) => execFile(bin, args, { windowsHide: true }, (err, stdout) => resolve({ err, stdout: String(stdout || '') })));

/**
 * Everything the desktop app needs from the OS, whether it is granted, and a
 * one-click fix. The UI renders this list on the Permissions screen.
 */
export async function getPermissions({ host, settings, app }) {
  const items = [];
  const p = process.platform;

  if (p === 'darwin') {
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    items.push({
      id: 'screen',
      title: 'Screen Recording',
      description: 'Lets Paneo send this Mac’s screen to your other devices. The picture only leaves this Mac when a paired device is watching.',
      status: screenStatus === 'granted' ? 'granted' : 'missing',
      action: screenStatus === 'granted' ? null : { label: 'Open Screen Recording settings' },
    });
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    items.push({
      id: 'accessibility',
      title: 'Accessibility (remote control)',
      description: 'Lets paired devices move the pointer and type on this Mac. Optional if you only want to mirror.',
      status: trusted ? 'granted' : 'missing',
      action: trusted ? null : { label: 'Allow control' },
    });
    items.push({
      id: 'localnetwork',
      title: 'Local Network',
      description: 'macOS asks the first time Paneo looks for nearby devices. Choose Allow. If you chose Don’t Allow: System Settings → Privacy & Security → Local Network.',
      status: 'info',
      action: null,
    });
  }

  if (p === 'win32') {
    const { stdout } = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', 'name=Paneo']);
    const has = /Paneo/i.test(stdout) && !/No rules match/i.test(stdout);
    items.push({
      id: 'firewall',
      title: 'Windows Firewall',
      description: `Other devices connect to this PC on TCP ${host.port} and find it with mDNS (UDP 5353) and UDP 7421. The installer adds the rule; if you used the portable version, add it here.`,
      status: has ? 'granted' : 'missing',
      action: has ? null : { label: 'Add firewall rule (asks for admin)' },
    });
    items.push({
      id: 'uac',
      title: 'Controlling elevated windows',
      description: 'Windows blocks input into apps running as Administrator (and the UAC prompt) unless Paneo is also run as administrator. Mirroring always works.',
      status: 'info',
      action: null,
    });
  }

  if (p === 'linux') {
    const wayland = process.env.XDG_SESSION_TYPE === 'wayland';
    items.push({
      id: 'session',
      title: 'Display server',
      description: wayland
        ? 'You are on Wayland. Screen sharing works through the system portal, but injecting mouse/keyboard input and moving displays is limited. For full remote control, log in with “Xorg / X11” at the sign-in screen.'
        : 'You are on X11. Capture, remote control and display arrangement are fully supported.',
      status: wayland ? 'missing' : 'granted',
      action: null,
    });
    items.push({
      id: 'firewall-linux',
      title: 'Firewall',
      description: `If you use ufw, run: sudo ufw allow ${host.port}/tcp && sudo ufw allow 5353/udp && sudo ufw allow 7421/udp`,
      status: 'info',
      action: null,
    });
  }

  items.push({
    id: 'input',
    title: 'Remote input',
    description: host.input.available ? 'Mouse, keyboard, touch and pen input from paired devices can be injected on this computer.' : `Input injection is unavailable (${host.input.error || 'backend missing'}). Mirroring still works.`,
    status: host.input.available ? 'granted' : 'missing',
    action: null,
  });
  items.push({
    id: 'autostart',
    title: 'Start with this computer',
    description: 'Paneo runs quietly in the tray after you sign in so devices reconnect automatically.',
    status: settings.autostart ? 'granted' : 'info',
    action: settings.autostart ? null : { label: 'Turn on autostart' },
  });
  return items;
}

export async function fixPermission(id, { host }) {
  try {
    if (id === 'screen') {
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
      return { ok: true, message: 'Enable Paneo in the list, then restart the app.' };
    }
    if (id === 'accessibility') {
      systemPreferences.isTrustedAccessibilityClient(true);
      await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
      return { ok: true, message: 'Enable Paneo in the list, then restart the app.' };
    }
    if (id === 'firewall') {
      const port = host.port;
      const ps = `Start-Process -Verb RunAs -WindowStyle Hidden powershell -ArgumentList '-NoProfile','-Command','netsh advfirewall firewall add rule name=Paneo dir=in action=allow protocol=TCP localport=${port} profile=private,domain; netsh advfirewall firewall add rule name=Paneo-discovery dir=in action=allow protocol=UDP localport=5353,7421 profile=private,domain'`;
      await run('powershell', ['-NoProfile', '-Command', ps]);
      return { ok: true, message: 'Firewall rule requested. Accept the Windows prompt.' };
    }
    if (id === 'autostart') {
      return { ok: true, message: 'Open Preferences → Startup to turn this on.' };
    }
  } catch (err) {
    return { ok: false, message: err.message };
  }
  return { ok: false, message: 'Nothing to fix here.' };
}
