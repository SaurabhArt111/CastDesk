import dgram from 'node:dgram';
import { EventEmitter } from 'node:events';
import { Bonjour } from 'bonjour-service';
import { MDNS_TYPE, BEACON_PORT, PROTOCOL_VERSION } from '@paneo/shared';
import { getLocalAddresses } from './net-info.js';

const BEACON_INTERVAL = 3000;
const BEACON_TTL = 10000;

/**
 * Finds other Paneo devices with zero configuration and no internet:
 *  1. mDNS / Bonjour  (_paneo._tcp)         - what Apple "Continuity" style discovery uses
 *  2. UDP broadcast beacon on port 7421         - fallback for networks that block multicast
 * Works over Wi-Fi, Ethernet and USB-tethering / USB-Ethernet links alike.
 */
export class Discovery extends EventEmitter {
  constructor() {
    super();
    this.peersById = new Map();
    this.self = null;
    this.timers = [];
  }

  start({ id, name, platform, port, advertise = true }) {
    this.stop();
    this.self = { id, name, platform, port };
    try {
      this.bonjour = new Bonjour();
      if (advertise) {
        this.service = this.bonjour.publish({
          name: `${name}-${id.slice(0, 4)}`,
          type: MDNS_TYPE,
          port,
          txt: { id, name, platform, v: String(PROTOCOL_VERSION) },
        });
      }
      this.browser = this.bonjour.find({ type: MDNS_TYPE });
      this.browser.on('up', (svc) => this.#fromMdns(svc));
      this.browser.on('down', (svc) => {
        const id2 = svc.txt?.id;
        if (id2 && this.peersById.delete(id2)) this.#emit();
      });
    } catch (err) {
      this.emit('error', err);
    }
    this.#startBeacon(advertise);
    this.timers.push(setInterval(() => this.#expire(), 2000).unref?.() ?? undefined);
  }

  #fromMdns(svc) {
    const t = svc.txt || {};
    if (!t.id || t.id === this.self?.id) return;
    const addresses = (svc.addresses || []).filter((a) => /^\d+\.\d+\.\d+\.\d+$/.test(a));
    if (!addresses.length) return;
    this.#upsert({ id: t.id, name: t.name || svc.name, platform: t.platform || 'unknown', port: svc.port, addresses, via: 'mdns' });
  }

  #startBeacon(advertise) {
    try {
      const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      sock.on('error', (e) => this.emit('error', e));
      sock.on('message', (msg, rinfo) => {
        try {
          const m = JSON.parse(msg.toString());
          if (m.app !== 'paneo' || !m.id || m.id === this.self?.id) return;
          this.#upsert({ id: m.id, name: m.name, platform: m.platform, port: m.port, addresses: [rinfo.address], via: 'beacon' });
        } catch {
          /* ignore junk */
        }
      });
      sock.bind(BEACON_PORT, () => {
        try {
          sock.setBroadcast(true);
        } catch {
          /* ignore */
        }
        if (!advertise) return;
        const send = () => {
          const payload = Buffer.from(JSON.stringify({ app: 'paneo', v: PROTOCOL_VERSION, ...this.self }));
          const targets = new Set(['255.255.255.255', ...getLocalAddresses().map((a) => a.broadcast)]);
          for (const t of targets) sock.send(payload, BEACON_PORT, t, () => {});
        };
        this.sendBeacon = send;
        send();
        this.timers.push(setInterval(send, BEACON_INTERVAL));
      });
      this.sock = sock;
    } catch (e) {
      this.emit('error', e);
    }
  }

  /** Ask the network again right now (mDNS query + immediate beacon). Used by the Refresh button. */
  refresh() {
    try {
      this.browser?.update?.();
    } catch {
      /* ignore */
    }
    try {
      this.sendBeacon?.();
    } catch {
      /* ignore */
    }
  }

  #upsert(peer) {
    const prev = this.peersById.get(peer.id);
    const merged = {
      ...peer,
      addresses: [...new Set([...(prev?.addresses || []), ...peer.addresses])],
      seen: Date.now(),
    };
    this.peersById.set(peer.id, merged);
    if (!prev || prev.addresses.length !== merged.addresses.length || prev.name !== merged.name) this.#emit();
  }

  #expire() {
    let changed = false;
    for (const [id, p] of this.peersById) {
      // mDNS entries are removed by the 'down' event; beacon-only entries age out.
      if (p.via === 'beacon' && Date.now() - p.seen > BEACON_TTL) {
        this.peersById.delete(id);
        changed = true;
      }
    }
    if (changed) this.#emit();
  }

  #emit() {
    this.emit('peers', this.peers());
  }

  peers() {
    return [...this.peersById.values()].map(({ seen, ...p }) => p);
  }

  stop() {
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    try {
      this.browser?.stop();
      this.service?.stop?.();
      this.bonjour?.unpublishAll?.(() => this.bonjour?.destroy());
    } catch {
      /* ignore */
    }
    try {
      this.sock?.close();
    } catch {
      /* ignore */
    }
    this.bonjour = this.browser = this.service = this.sock = null;
    this.peersById.clear();
  }
}
