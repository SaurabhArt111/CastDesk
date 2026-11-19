/** Protocol + product constants shared by every Paneo component. */

export const PROTOCOL_VERSION = 1;
export const APP_NAME = 'Paneo';

/** Default TCP port the host listens on (HTTP + WebSocket share it). */
export const DEFAULT_PORT = 7420;
/** UDP port used for the LAN beacon fallback when mDNS is blocked. */
export const BEACON_PORT = 7421;
/** mDNS service type (without the leading underscore / trailing protocol). */
export const MDNS_TYPE = 'paneo';

export const PIN_LENGTH = 6;
export const PIN_TTL_MS = 5 * 60 * 1000;
export const PIN_MAX_ATTEMPTS = 5;

/** Binary frame types (first byte of a binary WebSocket message). */
export const FRAME = Object.freeze({
  VIDEO_JPEG: 0x01,
});

/** Size of the binary video-frame header, in bytes. */
export const FRAME_HEADER_BYTES = 10;

/** Permission flags stored per trusted device. */
export const PERMISSIONS = Object.freeze({
  VIEW: 'view',
  CONTROL: 'control',
});

/** Input modes the client can use to control a host. */
export const INPUT_MODES = Object.freeze({
  DIRECT: 'direct', // touch / mouse acts at the exact point touched
  TRACKPAD: 'trackpad', // relative movement like a laptop trackpad
  PEN: 'pen', // absolute graphics-tablet style with pressure
  KEYBOARD: 'keyboard',
});

export const DEFAULT_SETTINGS = Object.freeze({
  deviceName: '',
  autostart: true,
  startMinimized: true,
  autoConnectTrusted: true,
  advertiseOnNetwork: true,
  allowIncoming: true,
  requireApprovalForControl: true,
  defaultAllowControl: true,
  usbAutoForward: true,
  port: DEFAULT_PORT,
  maxFps: 30,
  maxWidth: 1920,
  quality: 0.7,
  theme: 'system',
  showCursor: true,
  keepAwake: true,
});
