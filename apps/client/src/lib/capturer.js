import { encodeFrame, MSG, parseMessage } from '@paneo/shared';
import { bridge } from './platform.js';

/**
 * Screen capture source (desktop app only).
 *
 * Connects to the local host service on loopback, waits for `demand` messages
 * (which displays viewers want, at which fps / width / quality), captures
 * exactly those displays with the browser's screen-capture API, encodes JPEG
 * frames and pushes them to the host, which fans them out. When nobody is
 * watching, nothing is captured and CPU use is ~0.
 */
export class Capturer {
  constructor({ port, token, onStatus }) {
    this.port = port;
    this.token = token;
    this.onStatus = onStatus || (() => {});
    this.streams = new Map(); // displayId -> stream state
    this.demand = [];
    this.layout = [];
    this.seq = 0;
    this.stopped = false;
    this.queue = Promise.resolve();
  }

  start() {
    this.#connect();
  }

  #connect() {
    if (this.stopped) return;
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/source?token=${this.token}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => this.onStatus({ connected: true });
    ws.onmessage = (ev) => {
      const m = typeof ev.data === 'string' ? parseMessage(ev.data) : null;
      if (m?.t === MSG.DEMAND) {
        this.layout = m.layout || [];
        this.demand = m.displays || [];
        this.queue = this.queue.then(() => this.#reconcile()).catch((e) => this.#error(e));
      }
    };
    ws.onclose = () => {
      this.onStatus({ connected: false });
      this.#stopAll();
      if (!this.stopped) setTimeout(() => this.#connect(), 1500);
    };
  }

  #error(e) {
    this.onStatus({ error: e.message });
    try {
      this.ws?.send(JSON.stringify({ t: 'source-error', message: e.message }));
    } catch {
      /* ignore */
    }
  }

  async #reconcile() {
    const want = new Map(this.demand.map((d) => [d.id, d]));
    for (const id of [...this.streams.keys()]) if (!want.has(id)) this.#stop(id);
    for (const [id, d] of want) {
      const s = this.streams.get(id);
      if (s) {
        Object.assign(s.opts, { fps: d.fps, maxWidth: d.maxWidth, quality: d.quality });
      } else {
        await this.#begin(id, d);
      }
    }
    this.onStatus({ capturing: [...this.streams.keys()] });
  }

  async #begin(id, d) {
    const display = this.layout.find((x) => x.id === id);
    if (!display) return;
    // Tell the main process which screen the next getDisplayMedia() call must return.
    const target = await bridge.prepareCapture(id);
    if (!target?.ok) throw new Error(target?.error || 'Screen capture permission is missing');
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 }, width: { max: 7680 }, height: { max: 4320 }, cursor: 'always' },
      audio: false,
    });
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { alpha: false });
    const state = { id, stream, video, canvas, ctx, opts: { fps: d.fps, maxWidth: d.maxWidth, quality: d.quality }, last: 0, busy: false, crop: target.crop || null };
    this.streams.set(id, state);
    stream.getVideoTracks()[0].addEventListener('ended', () => this.#stop(id));
    this.#loop(state);
  }

  #loop(s) {
    const tick = (now) => {
      if (this.streams.get(s.id) !== s) return;
      const interval = 1000 / s.opts.fps;
      if (!s.busy && now - s.last >= interval - 2 && this.ws?.readyState === 1 && this.ws.bufferedAmount < 2_000_000) {
        s.last = now;
        this.#grab(s);
      }
      if ('requestVideoFrameCallback' in s.video) s.video.requestVideoFrameCallback(tick);
      else requestAnimationFrame(tick);
    };
    if ('requestVideoFrameCallback' in s.video) s.video.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
    // keep-alive so a viewer that joins a static screen still gets a picture
    s.keepAlive = setInterval(() => {
      if (!s.busy && performance.now() - s.last > 1000) this.#grab(s);
    }, 1000);
  }

  #grab(s) {
    const { video, canvas, ctx } = s;
    const sw = s.crop?.w || video.videoWidth;
    const sh = s.crop?.h || video.videoHeight;
    if (!sw || !sh) return;
    const scale = Math.min(1, s.opts.maxWidth / sw);
    const w = Math.max(2, Math.round(sw * scale));
    const h = Math.max(2, Math.round(sh * scale));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    if (s.crop) ctx.drawImage(video, s.crop.x, s.crop.y, sw, sh, 0, 0, w, h);
    else ctx.drawImage(video, 0, 0, w, h);
    s.busy = true;
    canvas.toBlob(
      async (blob) => {
        try {
          if (blob && this.ws?.readyState === 1 && this.streams.get(s.id) === s) {
            const data = new Uint8Array(await blob.arrayBuffer());
            this.ws.send(encodeFrame({ displayId: s.id, width: w, height: h, seq: this.seq++, data }));
          }
        } finally {
          s.busy = false;
        }
      },
      'image/jpeg',
      s.opts.quality,
    );
  }

  #stop(id) {
    const s = this.streams.get(id);
    if (!s) return;
    clearInterval(s.keepAlive);
    s.stream.getTracks().forEach((t) => t.stop());
    s.video.srcObject = null;
    this.streams.delete(id);
    this.onStatus({ capturing: [...this.streams.keys()] });
  }

  #stopAll() {
    for (const id of [...this.streams.keys()]) this.#stop(id);
  }

  stop() {
    this.stopped = true;
    this.#stopAll();
    this.ws?.close();
  }
}
