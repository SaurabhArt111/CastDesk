import { exec, execFile } from 'node:child_process';

const sh = (cmd, timeout = 15000) =>
  new Promise((resolve, reject) => exec(cmd, { timeout, windowsHide: true }, (e, out, err) => (e ? reject(new Error(err || e.message)) : resolve(out))));
const run = (bin, args, timeout = 15000) =>
  new Promise((resolve, reject) => execFile(bin, args, { timeout, windowsHide: true }, (e, out, err) => (e ? reject(new Error(err || e.message)) : resolve(out))));

export { sh as runShell };

/**
 * A DisplayProvider talks to the operating system about monitors:
 *   list()                        -> [{nativeId,name,x,y,w,h,primary}]
 *   arrange([{nativeId,x,y,from}])  move monitors (Windows-style arrangement)
 *   createVirtual({w,h,x,y,name}) -> nativeId   add a virtual monitor
 *   removeVirtual(nativeId)
 * `caps` says what this OS/session can really do, so the UI never promises
 * more than the platform allows.
 */

/* ------------------------------- Linux (X11) ------------------------------- */

const linuxXrandr = {
  name: 'xrandr',
  caps: { list: true, arrange: true, virtual: true, note: 'X11 only. Virtual monitors use xrandr logical monitors (experimental).' },
  async list() {
    const out = await run('xrandr', ['--listmonitors']);
    const res = [];
    for (const line of out.split('\n')) {
      const m = /^\s*\d+:\s+([+*]*)(\S+)\s+(\d+)\/\d+x(\d+)\/\d+\+(-?\d+)\+(-?\d+)\s+(\S+)/.exec(line);
      if (m) res.push({ nativeId: m[7], name: m[2], w: +m[3], h: +m[4], x: +m[5], y: +m[6], primary: m[1].includes('*'), virtual: m[2].startsWith('Paneo') });
    }
    return res;
  },
  async arrange(items) {
    for (const it of items) {
      if (it.nativeId.startsWith('Paneo')) {
        await run('xrandr', ['--delmonitor', it.nativeId]);
        await run('xrandr', ['--setmonitor', it.nativeId, `${it.from.w}/${mm(it.from.w)}x${it.from.h}/${mm(it.from.h)}+${it.x}+${it.y}`, 'none']);
      } else {
        await run('xrandr', ['--output', it.nativeId, '--pos', `${it.x}x${it.y}`]);
      }
    }
  },
  async createVirtual({ w, h, x, y, name }) {
    const id = `Paneo-${name.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || 'Device'}`;
    const cur = await this.list();
    const needW = Math.max(x + w, ...cur.map((d) => d.x + d.w));
    const needH = Math.max(y + h, ...cur.map((d) => d.y + d.h));
    await run('xrandr', ['--fb', `${needW}x${needH}`]);
    await run('xrandr', ['--setmonitor', id, `${w}/${mm(w)}x${h}/${mm(h)}+${x}+${y}`, 'none']);
    return id;
  },
  async removeVirtual(nativeId) {
    await run('xrandr', ['--delmonitor', nativeId]);
  },
};
const mm = (px) => Math.round(px * 0.2646);

/* -------------------------------- Windows -------------------------------- */

const PS_TYPES = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices;
public class BD {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public struct DEVMODE {
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmDeviceName;
    public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra;
    public int dmFields; public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
    public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst=32)] public string dmFormName;
    public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight; public int dmDisplayFlags;
    public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent; public int dmMediaType; public int dmDitherType;
    public int dmReserved1; public int dmReserved2; public int dmPanningWidth; public int dmPanningHeight;
  }
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern bool EnumDisplaySettings(string dev, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern int ChangeDisplaySettingsEx(string dev, ref DEVMODE dm, IntPtr hwnd, int flags, IntPtr lp);
  [DllImport("user32.dll", CharSet=CharSet.Ansi)] public static extern int ChangeDisplaySettingsEx(string dev, IntPtr dm, IntPtr hwnd, int flags, IntPtr lp);
}
"@
[void][BD]::SetProcessDPIAware()
`;

const windows = {
  name: 'win32-displaysettings',
  caps: {
    list: true, arrange: true, virtual: false,
    note: 'Repositioning uses ChangeDisplaySettingsEx. A virtual monitor needs an installed Indirect Display Driver; set it up under Preferences > Virtual display.',
  },
  async list() {
    const out = await run('powershell', ['-NoProfile', '-Command', `${PS_TYPES}; [System.Windows.Forms.Screen]::AllScreens | % { "$($_.DeviceName)|$($_.Bounds.X)|$($_.Bounds.Y)|$($_.Bounds.Width)|$($_.Bounds.Height)|$($_.Primary)" }`]);
    return out.trim().split(/\r?\n/).filter(Boolean).map((l, i) => {
      const [dev, x, y, w, h, p] = l.split('|');
      return { nativeId: dev, name: `Display ${i + 1}`, x: +x, y: +y, w: +w, h: +h, primary: p.trim() === 'True' };
    });
  },
  async arrange(items) {
    const rows = items.map((it) => `@{fx=${it.from.x};fy=${it.from.y};fw=${it.from.w};fh=${it.from.h};x=${it.x};y=${it.y}}`).join(',');
    const script = `${PS_TYPES}
$items = @(${rows})
foreach ($it in $items) {
  $scr = [System.Windows.Forms.Screen]::AllScreens | ? { $_.Bounds.X -eq $it.fx -and $_.Bounds.Y -eq $it.fy -and $_.Bounds.Width -eq $it.fw -and $_.Bounds.Height -eq $it.fh } | Select -First 1
  if (-not $scr) { throw "Display at $($it.fx),$($it.fy) not found" }
  $dm = New-Object BD+DEVMODE
  $dm.dmSize = [System.Runtime.InteropServices.Marshal]::SizeOf($dm)
  [void][BD]::EnumDisplaySettings($scr.DeviceName, -1, [ref]$dm)
  $dm.dmPositionX = $it.x; $dm.dmPositionY = $it.y; $dm.dmFields = 0x20
  $r = [BD]::ChangeDisplaySettingsEx($scr.DeviceName, [ref]$dm, [IntPtr]::Zero, 0x10000001, [IntPtr]::Zero)
  if ($r -ne 0) { throw "ChangeDisplaySettingsEx failed ($r)" }
}
[void][BD]::ChangeDisplaySettingsEx($null, [IntPtr]::Zero, [IntPtr]::Zero, 0, [IntPtr]::Zero)`;
    await run('powershell', ['-NoProfile', '-Command', script], 30000);
  },
  async createVirtual() {
    throw new Error('No virtual display driver configured');
  },
  async removeVirtual() {},
};

/* --------------------------------- macOS --------------------------------- */

const macos = {
  name: 'displayplacer',
  caps: {
    list: false, arrange: true, virtual: false,
    note: 'Repositioning needs the free `displayplacer` tool (brew install displayplacer). A virtual monitor needs a tool such as BetterDisplay; set it up under Preferences > Virtual display.',
  },
  async list() {
    return [];
  },
  async arrange(items) {
    const out = await run('displayplacer', ['list']);
    const blocks = out.split(/Persistent screen id:/).slice(1).map((b) => {
      const id = b.trim().split(/\s/)[0];
      const res = /Resolution:\s*(\d+)x(\d+)/.exec(b);
      const org = /Origin:\s*\((-?\d+),(-?\d+)\)/.exec(b);
      return { id, w: +res?.[1], h: +res?.[2], x: +org?.[1], y: +org?.[2] };
    });
    const args = items.map((it) => {
      const b = blocks.find((k) => k.x === it.from.x && k.y === it.from.y && k.w === it.from.w && k.h === it.from.h);
      if (!b) throw new Error('Display not matched to a displayplacer id');
      return `id:${b.id} origin:(${it.x},${it.y})`;
    });
    await run('displayplacer', args);
  },
  async createVirtual() {
    throw new Error('No virtual display tool configured');
  },
  async removeVirtual() {},
};

/* --------------------------------- none --------------------------------- */

const none = {
  name: 'none',
  caps: { list: false, arrange: false, virtual: false, note: 'This session type cannot reposition or create displays (for example Wayland).' },
  async list() {
    return [];
  },
  async arrange() {
    throw new Error('This session cannot reposition displays automatically. Use your system display settings.');
  },
  async createVirtual() {
    throw new Error('Virtual displays are not supported in this session');
  },
  async removeVirtual() {},
};

export function createProvider(platform = process.platform, env = process.env) {
  if (platform === 'win32') return windows;
  if (platform === 'darwin') return macos;
  if (platform === 'linux' && env.DISPLAY && env.XDG_SESSION_TYPE !== 'wayland') return linuxXrandr;
  return none;
}

export const providers = { linuxXrandr, windows, macos, none };
