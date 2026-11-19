import { encodeFrame, MSG, parseMessage, FRAME, VIDEO_CODEC_ID, VIDEO_CODECS } from '@castdesk/shared';
import { bridge } from './platform.js';

/**
 * Screen capture source (desktop app only). It runs in a hidden window of its own so that
 * encoding never competes with the UI for the renderer's main thread.
 *
 * It connects to the host service over loopback and waits for `demand` messages (which displays
 * viewers want, at which fps / width / quality, as JPEG and/or encoded video). It captures exactly
 * those displays and encodes:
 *   - video: H.264 or VP8 with WebCodecs (hardware accelerated where the OS offers it). A few
 *     Mbit/s instead of the tens of Mbit/s JPEG needs - this is what makes Wi-Fi casting smooth.
 *   - JPEG:  fallback for viewers that cannot decode video (older browsers / iOS Safari).
 * When nobody is watching nothing is captured and CPU use is ~0.
 */

const BITS_PER_PIXEL = { low: 0.045, balanced: 0.075, high: 0.12 };
const H264_MAX_WIDTH = 1920; // level 4.2 ceiling; larger sizes fall back to VP8/JPEG scaling

function encoderConfig(codec, w, h, fps, bitrate) {
  const base = { width: w, height: h, bitrate, framerate: fps, latencyMode: 'realtime' };
  if (codec === 'h264') return { ...base, codec: 'avc1.42002A', avc: { format: 'annexb' }, hardwareAcceleration: 'no-preference' };
  return { ...base, codec: 'vp8' };
}

async function probeCodecs() {
  if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return [];
  const found = [];
  for (const codec of VIDEO_CODECS) {
    try {
      const r = await VideoEncoder.isConfigSupported(encoderConfig(codec, 1280, 720, 30, 3_000_000));
      if (r.supported) found.push(codec);
    } catch {
      /* unsupported */
    }
  }
  return found;
}

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
    this.videoCodecs = null; // detected lazily
    this.badCodecs = new Set();
  }

  start() {
    this.#connect();
  }

  #connect() {
    if (this.stopped) return;
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/source?token=${this.token}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = async () => {
      this.onStatus({ connected: true });
      if (!this.videoCodecs) this.videoCodecs = await probeCodecs();
      this.#sendCaps();
    };
    ws.onmessage = (ev) => {
      const m = typeof ev.data === 'string' ? parseMessage(ev.data) : null;
      if (!m) return;
      if (m.t === MSG.DEMAND) {
        this.layout = m.layout || [];
        this.demand = m.displays || [];
        this.queue = this.queue.then(() => this.#reconcile()).catch((e) => this.#error(e));
      } else if (m.t === MSG.KEYFRAME) {
        const s = this.streams.get(m.display);
        if (s) {
          s.forceKey = true;
          this.#process(s, performance.now(), true);
        }
      }
    };
    ws.onclose = () => {
      this.onStatus({ connected: false });
      this.#stopAll();
      if (!this.stopped) setTimeout(() => this.#connect(), 1500);
    };
  }

  #send(obj) {
    try {
      if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
    } catch {
      /* ignore */
    }
  }

  #sendCaps() {
    this.#send({ t: 'source-caps', video: (this.videoCodecs || []).filter((c) => !this.badCodecs.has(c)) });
  }

  #status(extra = {}) {
    const capturing = [...this.streams.keys()];
    this.onStatus({ capturing, ...extra });
    this.#send({ t: 'source-status', capturing, error: extra.error || null });
  }

  #error(e) {
    this.onStatus({ error: e.message });
    this.#send({ t: 'source-error', message: e.message });
  }

  async #reconcile() {
    const want = new Map(this.demand.map((d) => [d.id, d]));
    for (const id of [...this.streams.keys()]) if (!want.has(id)) this.#stop(id);
    for (const [id, d] of want) {
      const s = this.streams.get(id);
      if (s) {
        const codecChanged = s.want.codec !== d.codec || s.want.video !== d.video;
        s.want = d;
        if (codecChanged && d.video) s.forceKey = true;
        if (!d.video) this.#closeEncoder(s);
      } else {
        await this.#begin(id, d);
      }
    }
    this.#status();
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
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    const state = {
      id, stream, video, canvas, ctx, want: d, last: 0, jpegBusy: false, crop: target.crop || null,
      enc: null, encKey: '', forceKey: true, lastKey: 0,
    };
    this.streams.set(id, state);
    stream.getVideoTracks()[0].addEventListener('ended', () => this.#stop(id));
    this.#loop(state);
  }

  #loop(s) {
    const tick = (now) => {
      if (this.streams.get(s.id) !== s) return;
      this.#process(s, now, false);
      if ('requestVideoFrameCallback' in s.video) s.video.requestVideoFrameCallback(tick);
      else requestAnimationFrame(tick);
    };
    if ('requestVideoFrameCallback' in s.video) s.video.requestVideoFrameCallback(tick);
    else requestAnimationFrame(tick);
    // keep-alive so a viewer that joins a static screen still gets a picture
    s.keepAlive = setInterval(() => {
      if (performance.now() - s.last > 1000) this.#process(s, performance.now(), true);
    }, 1000);
  }

  /** Draw the current screen frame at the target size and hand it to the encoder(s). */
  #process(s, now, force) {
    if (this.ws?.readyState !== 1) return;
    const { want } = s;
    const interval = 1000 / want.fps;
    if (!force && now - s.last < interval - 2) return;
    const { video, canvas, ctx } = s;
    const sw = s.crop?.w || video.videoWidth;
    const sh = s.crop?.h || video.videoHeight;
    if (!sw || !sh) return;
    const useVideo = want.video && want.codec && !this.badCodecs.has(want.codec);
    const cap = useVideo && want.codec === 'h264' ? Math.min(want.maxWidth, H264_MAX_WIDTH) : want.maxWidth;
    const scale = Math.min(1, cap / sw);
    const w = Math.max(2, Math.round((sw * scale) / 2) * 2);
    const h = Math.max(2, Math.round((sh * scale) / 2) * 2);
    // Back-pressure: do not encode a frame the host socket could not take anyway.
    if (this.ws.bufferedAmount > 2_000_000) return;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    if (s.crop) ctx.drawImage(video, s.crop.x, s.crop.y, sw, sh, 0, 0, w, h);
    else ctx.drawImage(video, 0, 0, w, h);
    s.last = now;
    if (useVideo) this.#encodeVideo(s, w, h);
    if (want.jpeg && !s.jpegBusy) this.#encodeJpeg(s, w, h);
  }

  /* ------------------------------- video ------------------------------- */

  #encodeVideo(s, w, h) {
    const { want } = s;
    const q = want.quality >= 0.8 ? 'high' : want.quality >= 0.6 ? 'balanced' : 'low';
    const bitrate = Math.round(Math.min(24_000_000, Math.max(800_000, w * h * want.fps * BITS_PER_PIXEL[q])));
    const key = `${want.codec}|${w}x${h}|${want.fps}|${bitrate}`;
    try {
      if (!s.enc || s.encKey !== key) {
        this.#closeEncoder(s);
        const codec = want.codec;
        s.enc = new VideoEncoder({
          output: (chunk) => this.#onChunk(s, codec, w, h, chunk),
          error: (e) => this.#encoderFailed(s, codec, e),
        });
        s.enc.configure(encoderConfig(codec, w, h, want.fps, bitrate));
        s.encKey = key;
        s.forceKey = true;
      }
      if (s.enc.encodeQueueSize > 3) return; // encoder is behind: drop this frame, stay real-time
      const frame = new VideoFrame(s.canvas, { timestamp: Math.round(performance.now() * 1000) });
      const keyFrame = s.forceKey || performance.now() - s.lastKey > 4000;
      s.enc.encode(frame, { keyFrame });
      frame.close();
      if (keyFrame) {
        s.forceKey = false;
        s.lastKey = performance.now();
      }
    } catch (e) {
      this.#encoderFailed(s, want.codec, e);
    }
  }

  #onChunk(s, codec, w, h, chunk) {
    if (this.ws?.readyState !== 1 || this.streams.get(s.id) !== s) return;
    const isKey = chunk.type === 'key';
    const body = new Uint8Array(chunk.byteLength + (isKey ? 1 : 0));
    chunk.copyTo(isKey ? body.subarray(1) : body);
    if (isKey) body[0] = VIDEO_CODEC_ID[codec];
    this.ws.send(encodeFrame({ type: isKey ? FRAME.VIDEO_KEY : FRAME.VIDEO_DELTA, displayId: s.id, width: w, height: h, seq: this.seq++, data: body }));
  }

  #encoderFailed(s, codec, e) {
    console.warn('video encoder failed, falling back', codec, e);
    this.badCodecs.add(codec);
    this.#closeEncoder(s);
    this.#sendCaps(); // the host re-plans: viewers get the next codec or JPEG
  }

  #closeEncoder(s) {
    try {
      if (s.enc && s.enc.state !== 'closed') s.enc.close();
    } catch {
      /* ignore */
    }
    s.enc = null;
    s.encKey = '';
  }

  /* -------------------------------- JPEG -------------------------------- */

  #encodeJpeg(s, w, h) {
    s.jpegBusy = true;
    s.canvas.toBlob(
      async (blob) => {
        try {
          if (blob && this.ws?.readyState === 1 && this.streams.get(s.id) === s) {
            const data = new Uint8Array(await blob.arrayBuffer());
            this.ws.send(encodeFrame({ displayId: s.id, width: w, height: h, seq: this.seq++, data }));
          }
        } finally {
          s.jpegBusy = false;
        }
      },
      'image/jpeg',
      s.want.quality,
    );
  }

  #stop(id) {
    const s = this.streams.get(id);
    if (!s) return;
    clearInterval(s.keepAlive);
    this.#closeEncoder(s);
    s.stream.getTracks().forEach((t) => t.stop());
    s.video.srcObject = null;
    this.streams.delete(id);
    this.#status();
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
