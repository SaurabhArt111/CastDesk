const P = {
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  laptop: 'M5 6h14v9H5zM2 19h20',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  tablet: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  usb: 'M12 3v14M12 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 11l4-3v-2M12 13l-4-3V8M8 8h0M16 6h0',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  close: 'M6 6l12 12M18 6L6 18',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h10',
  trackpad: 'M4 4h16v16H4zM4 15h16M12 15v5',
  pen: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16zM14 7l3 3',
  touch: 'M9 11V5a2 2 0 1 1 4 0v5l5 1a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a1.6 1.6 0 0 1 2.6-1.8L9 14',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  power: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
  layout: 'M3 6h10v9H3zM15 9h6v9h-6z',
  signal: 'M4 20v-4M9 20v-8M14 20V8M19 20V4',
  back: 'M15 5l-7 7 7 7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  info: 'M12 11v6M12 7.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  extend: 'M3 5h12v10H3zM17 8h4v10h-4zM7 19h4',
  mirror: 'M3 5h8v10H3zM13 5h8v10h-8zM7 19h10',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  cursor: 'M5 3l14 7-6 2-2 6z',
  copy: 'M9 9h11v11H9zM5 15V5h10',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  help: 'M9.5 9a2.5 2.5 0 1 1 3.5 2.300c-.700.400-1 1-1 1.700M12 17h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
};

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.8 }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={P[name] || P.info} />
    </svg>
  );
}

export function DeviceIcon({ platform, size = 22 }) {
  const name = platform === 'android' || platform === 'ios' ? 'phone' : platform === 'web' ? 'tablet' : 'monitor';
  return <Icon name={name} size={size} />;
}
