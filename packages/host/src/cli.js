#!/usr/bin/env node
/**
 * Headless host: pairing, trusted devices, discovery, input injection and USB
 * forwarding without the Electron UI. Screen capture needs the desktop app,
 * which runs this same HostService and adds the capture source.
 *
 *   node packages/host/src/cli.js [--port 7420] [--name "My PC"] [--data ./data] [--web ../client/dist]
 */
import os from 'node:os';
import path from 'node:path';
import { HostService } from './host.js';
import { AdbForwarder } from './usb/adb.js';
import { getLocalAddresses } from './net-info.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? true : all[i + 1]]] : acc), []),
);

const host = new HostService({
  dataDir: path.resolve(args.data || path.join(os.homedir(), '.paneo')),
  name: args.name === true ? undefined : args.name,
  port: args.port ? Number(args.port) : undefined,
  webRoot: args.web && args.web !== true ? path.resolve(args.web) : undefined,
});

host.on('log', (lvl, msg) => console.log(`[${lvl}]`, msg));
host.on('pin', (s, why) => console.log(`\n  PIN: ${s.pin.slice(0, 3)} ${s.pin.slice(3)}   (${why})`));
host.on('client', (c) => console.log(`+ ${c.device.name} (${c.device.platform}) from ${c.ip} ${c.trusted ? '[trusted]' : '[newly paired]'}`));
host.on('client-left', (c) => console.log(`- ${c.device?.name} disconnected`));
host.on('peers', (p) => console.log(`~ nearby: ${p.map((x) => `${x.name}@${x.addresses[0]}`).join(', ') || 'none'}`));

const port = await host.start();
console.log(`Paneo host "${host.name}" listening on port ${port}`);
for (const a of getLocalAddresses()) console.log(`  ${a.usb ? 'USB ' : 'LAN '} ${a.address}:${port}  (${a.iface})`);
console.log(`  input injection: ${host.input.available ? 'ready' : 'unavailable'}`);

const adb = new AdbForwarder();
if (await adb.available()) {
  adb.on('device', (d) => console.log(`USB: Android device ${d.model} forwarded on tcp:${port}`));
  adb.start(port);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    adb.stop();
    await host.stop();
    process.exit(0);
  });
}
