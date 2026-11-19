import { FRAME, VIDEO_CODEC_STRING, VIDEO_CODECS } from '@castdesk/shared';

const ID_TO_NAME = { 1: 'h264', 2: 'vp8' };
let supportPromise = null;

/** Which video codecs this device can decode (cached). JPEG always works, so [] is fine. */
export function detectDecoders() {
  if (!supportPromise) {
    supportPromise = (async () => {
      if (typeof VideoDecoder === 'undefined' || typeof EncodedVideoChunk === 'undefined') return [];
      const found = [];
      for (const name of VIDEO_CODECS) {
        const id = name === 'h264' ? 1 : 2;
        try {
          const r = await VideoDecoder.isConfigSupported({ codec: VIDEO_CODEC_STRING[id], optimizeForLatency: true });
          if (r.supported) found.push(name);
        } catch {
          /* unsupported */
        }
      }
      return found;
    })();
  }
  return supportPromise;
}

/**
 * Turns the frame stream from the host into pixels on a canvas.
 *  - JPEG frames: decoded off-thread with createImageBitmap, newest wins.
 *  - Video frames: WebCodecs VideoDecoder (hardware where available). Only the newest decoded
 *    picture is painted, once per display refresh, so a slow device skips frames instead of lagging.
 * If the decoder falls behind or errors, `onNeedKey` asks the host for a fresh key frame.
 */
export class FrameSink {
  constructor(canvas, { onSize, onNeedKey } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.onSize = onSize || (() => {});
    this.onNeedKey = onNeedKey || (() => {});
    this.decoder = null;
    this.codecId = 0;
    this.waitKey = true;
    this.pending = null; // newest decoded VideoFrame or ImageBitmap
    this.jpegLatest = null;
    this.jpegBusy = false;
    this.painted = 0;
    this.raf = 0;
    this.closed = false;
    this.#loop();
  }

  /** Frames painted since the last call (for the fps readout). */
  takePainted() {
    const n = this.painted;
    this.painted = 0;
    return n;
  }

  push(f) {
    if (this.closed) return;
    if (f.type === FRAME.VIDEO_JPEG) return this.#jpeg(f);
    if (f.type === FRAME.VIDEO_KEY || f.type === FRAME.VIDEO_DELTA) return this.#video(f);
    return undefined;
  }

  /* ---------------------------------- JPEG ---------------------------------- */

  async #jpeg(f) {
    this.jpegLatest = f;
    if (this.jpegBusy) return;
    this.jpegBusy = true;
    while (this.jpegLatest && !this.closed) {
      const cur = this.jpegLatest;
      this.jpegLatest = null;
      try {
        const bmp = await createImageBitmap(new Blob([cur.data], { type: 'image/jpeg' }));
        this.#setPending(bmp);
      } catch {
        /* corrupt frame: skip */
      }
    }
    this.jpegBusy = false;
  }

  /* ---------------------------------- video --------------------------------- */

  #video(f) {
    const isKey = f.type === FRAME.VIDEO_KEY;
    if (isKey) {
      const id = f.data[0];
      if (!ID_TO_NAME[id]) return;
      if (!this.decoder || this.decoder.state === 'closed' || this.codecId !== id || this.width !== f.width || this.height !== f.height) this.#configure(id, f.width, f.height);
      this.waitKey = false;
    } else if (this.waitKey || !this.decoder || this.decoder.state !== 'configured') {
      return;
    }
    if (this.decoder.decodeQueueSize > 6) {
      // decoder is behind: resync instead of drifting further into the past
      this.waitKey = true;
      this.onNeedKey();
      return;
    }
    try {
      this.decoder.decode(new EncodedVideoChunk({ type: isKey ? 'key' : 'delta', timestamp: f.seq * 1000, data: isKey ? f.data.subarray(1) : f.data }));
    } catch {
      this.waitKey = true;
      this.onNeedKey();
    }
  }

  #configure(id, w, h) {
    try {
      this.decoder?.close();
    } catch {
      /* ignore */
    }
    this.codecId = id;
    this.width = w;
    this.height = h;
    this.decoder = new VideoDecoder({
      output: (frame) => this.#setPending(frame),
      error: () => {
        this.waitKey = true;
        this.onNeedKey();
      },
    });
    this.decoder.configure({ codec: VIDEO_CODEC_STRING[id], codedWidth: w, codedHeight: h, optimizeForLatency: true, hardwareAcceleration: 'no-preference' });
  }

  /* --------------------------------- painting -------------------------------- */

  #setPending(img) {
    this.pending?.close?.();
    this.pending = img;
  }

  #loop() {
    const tick = () => {
      if (this.closed) return;
      const img = this.pending;
      if (img) {
        this.pending = null;
        const w = img.displayWidth || img.width;
        const h = img.displayHeight || img.height;
        if (this.canvas.width !== w || this.canvas.height !== h) {
          this.canvas.width = w;
          this.canvas.height = h;
          this.onSize(w, h);
        }
        this.ctx.drawImage(img, 0, 0);
        img.close?.();
        this.painted++;
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  close() {
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.pending?.close?.();
    this.pending = null;
    try {
      this.decoder?.close();
    } catch {
      /* ignore */
    }
  }
}
