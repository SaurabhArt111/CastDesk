import { EventEmitter } from 'node:events';
import { snapDisplay, hasOverlap, isConnected, desktopBounds } from '@castdesk/shared';
import { createProvider, runShell } from './providers.js';

const FALLBACK = [{ nativeId: '0', name: 'Display 1', x: 0, y: 0, w: 1920, h: 1080, scale: 1, primary: true }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safeName = (s) => String(s || 'Device').replace(/[^A-Za-z0-9 _-]/g, '').slice(0, 24) || 'Device';
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/**
 * Owns the host's list of displays, hands stable small integer ids to the
 * protocol, and implements "extend" (virtual monitor per paired device) and
 * Windows-style arrangement. Each device's chosen position is remembered in
 * the trust store, so the next automatic connection restores it.
 */
export class DisplayManager extends EventEmitter {
  /**
   * @param {object} [o]
   * @param {object} [o.store]        TrustStore (to remember arrangements)
   * @param {object} [o.provider]     DisplayProvider (defaults to the OS one)
   * @param {()=>Promise<object[]>} [o.nativeList]  e.g. Electron `screen` (preferred when given)
   * @param {{create?:string, remove?:string}} [o.virtualCommands]  user-configured driver CLI
   */
  constructor({ store = null, provider = null, nativeList = null, virtualCommands = null } = {}) {
    super();
    this.store = store;
    this.provider = provider || createProvider();
    this.nativeList = nativeList;
    this.virtualCommands = virtualCommands;
    this.ids = new Map();
    this.owners = new Map(); // nativeId -> deviceId
    this.items = [];
  }

  #idFor(nativeId) {
    if (!this.ids.has(nativeId)) this.ids.set(nativeId, this.ids.size % 256);
    return this.ids.get(nativeId);
  }

  capabilities() {
    const virtual = this.provider.caps.virtual || Boolean(this.virtualCommands?.create);
    return { ...this.provider.caps, virtual, provider: this.provider.name };
  }

  setVirtualCommands(cmds) {
    this.virtualCommands = cmds;
  }

  watch(ms = 4000) {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh().catch(() => {}), ms);
    this.timer.unref?.();
  }

  stopWatching() {
    clearInterval(this.timer);
  }

  async #read() {
    let raw = [];
    try {
      raw = this.nativeList ? await this.nativeList() : await this.provider.list();
    } catch {
      raw = [];
    }
    if (!raw.length) raw = FALLBACK;
    const next = raw.map((d) => ({
      id: this.#idFor(d.nativeId),
      nativeId: d.nativeId,
      name: d.name,
      x: d.x, y: d.y, w: d.w, h: d.h,
      scale: d.scale || 1,
      primary: Boolean(d.primary),
      virtual: this.owners.has(d.nativeId) || Boolean(d.virtual),
      owner: this.owners.get(d.nativeId) || null,
    }));
    return next;
  }

  async refresh() {
    const next = await this.#read();
    const changed = JSON.stringify(next) !== JSON.stringify(this.items);
    this.items = next;
    if (changed) this.emit('change', this.current());
    return this.current();
  }

  /** Public view (no native ids). */
  current() {
    return this.items.map(({ nativeId, ...d }) => d);
  }

  has(id) {
    return this.items.some((d) => d.id === id);
  }

  /* --------------------------------- extend --------------------------------- */

  async createVirtual(deviceId, { w = 1280, h = 720, x, y, name } = {}) {
    const caps = this.capabilities();
    if (!caps.virtual) {
      throw new Error(`Extending needs a virtual display driver on this computer. ${caps.note || ''}`.trim());
    }
    await this.removeVirtual(deviceId).catch(() => {});
    const before = new Set(this.items.map((d) => d.nativeId));
    const saved = this.store?.get(deviceId)?.arrangement;
    const b = desktopBounds(this.items);
    const pos = { x: x ?? saved?.x ?? b.x + b.w, y: y ?? saved?.y ?? b.y };
    const label = `CastDesk ${safeName(name)}`;

    let created = null;
    if (this.provider.caps.virtual) {
      created = await this.provider.createVirtual({ w, h, x: pos.x, y: pos.y, name: label });
    } else {
      await runShell(fill(this.virtualCommands.create, { w, h, x: pos.x, y: pos.y, name: label }));
    }

    // Look for the new monitor without publishing a half-labelled list; the owner is set before the first broadcast.
    let found = null;
    for (let i = 0; i < 12 && !found; i++) {
      await sleep(i ? 500 : 0);
      found = (await this.#read()).find((d) => (created ? d.nativeId === created : !before.has(d.nativeId)));
    }
    if (!found) throw new Error('The virtual display did not appear. Check the driver is installed and running.');
    this.owners.set(found.nativeId, deviceId);
    this.store?.update(deviceId, { arrangement: { extend: true, w, h, x: found.x, y: found.y } });
    await this.refresh();
    return found.id;
  }

  async removeVirtual(deviceId, { remember = false } = {}) {
    const d = this.items.find((i) => i.owner === deviceId);
    if (!d) return;
    if (this.provider.caps.virtual) await this.provider.removeVirtual(d.nativeId);
    else if (this.virtualCommands?.remove) await runShell(fill(this.virtualCommands.remove, { name: `CastDesk ${safeName(this.store?.get(deviceId)?.name)}`, id: d.nativeId }));
    this.owners.delete(d.nativeId);
    const rec = this.store?.get(deviceId);
    if (rec) this.store.update(deviceId, { arrangement: { ...(rec.arrangement || {}), extend: remember, x: d.x, y: d.y } });
    await this.refresh();
  }

  /** Recreate a device's virtual display where the user left it (called on trusted reconnect). */
  async restoreFor(deviceId) {
    const a = this.store?.get(deviceId)?.arrangement;
    if (!a?.extend || this.items.some((d) => d.owner === deviceId)) return null;
    return this.createVirtual(deviceId, a);
  }

  /* ------------------------------- arrangement ------------------------------- */

  /** A device moves its own virtual display (drag in the viewer's arrangement editor). */
  async arrangeOwned(deviceId, { x, y }) {
    const d = this.items.find((i) => i.owner === deviceId);
    if (!d) throw new Error('This device has no extended display to move');
    const others = this.items.filter((i) => i !== d);
    const snapped = snapDisplay({ ...d, x, y }, others);
    await this.#apply([{ nativeId: d.nativeId, x: snapped.x, y: snapped.y, from: { x: d.x, y: d.y, w: d.w, h: d.h } }]);
    const rec = this.store?.get(deviceId);
    if (rec) this.store.update(deviceId, { arrangement: { ...(rec.arrangement || {}), x: snapped.x, y: snapped.y } });
    await this.refresh();
  }

  /** The host's own Display Layout editor: reposition any/all displays. */
  async applyLayout(items) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const next = this.items.map((d) => ({ ...d, ...(byId.get(d.id) ? { x: byId.get(d.id).x, y: byId.get(d.id).y } : {}) }));
    if (hasOverlap(next)) throw new Error('Displays cannot overlap');
    if (!isConnected(next)) throw new Error('Displays must touch each other, like in Windows display settings');
    const moves = this.items
      .filter((d) => byId.has(d.id) && (byId.get(d.id).x !== d.x || byId.get(d.id).y !== d.y))
      .map((d) => ({ nativeId: d.nativeId, x: byId.get(d.id).x, y: byId.get(d.id).y, from: { x: d.x, y: d.y, w: d.w, h: d.h } }));
    if (moves.length) await this.#apply(moves);
    await this.refresh();
  }

  async #apply(moves) {
    if (!this.provider.caps.arrange) throw new Error(this.provider.caps.note || 'Arranging is not supported here');
    await this.provider.arrange(moves);
  }
}
