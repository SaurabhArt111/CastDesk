import os from 'node:os';

const USB_IFACE = /rndis|usb|ipheth|enx|remote ndis|android/i;

/**
 * Local IPv4 addresses a phone / other PC could reach us on.
 * `usb` is true for USB-tethering / USB-Ethernet style interfaces so the UI
 * can label the connection "USB" and prefer it.
 */
export function getLocalAddresses() {
  const out = [];
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      out.push({
        iface,
        address: a.address,
        netmask: a.netmask,
        linkLocal: a.address.startsWith('169.254.'),
        usb: USB_IFACE.test(iface),
        broadcast: broadcastOf(a.address, a.netmask),
      });
    }
  }
  return out.sort((a, b) => Number(b.usb) - Number(a.usb));
}

function broadcastOf(ip, mask) {
  const i = ip.split('.').map(Number);
  const m = mask.split('.').map(Number);
  return i.map((o, n) => (o & m[n]) | (~m[n] & 255)).join('.');
}
