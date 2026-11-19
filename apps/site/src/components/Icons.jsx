const P = {
  window: 'M3 5.5l8-1.2v7H3zM12 4.1l9-1.4v8.6h-9zM3 12.7h8v7l-8-1.2zM12 12.7h9v8.6l-9-1.4z',
  laptop: 'M5 6h14v9H5zM2 19h20',
  terminal: 'M3 5h18v14H3zM7 10l3 2.5L7 15M12 15h5',
  phone: 'M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  tablet: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  monitor: 'M3 5h18v11H3zM8 20h8M12 16v4',
  usb: 'M12 3v14M12 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 11l4-3v-2M12 13l-4-3V8',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M18 10h.01M7 14h10',
  trackpad: 'M4 4h16v16H4zM4 15h16M12 15v5',
  pen: 'M4 20l4-1 11-11a2.1 2.1 0 0 0-3-3L5 16zM14 7l3 3',
  touch: 'M9 11V5a2 2 0 1 1 4 0v5l5 1a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-5-3l-3-5a1.6 1.6 0 0 1 2.6-1.8L9 14',
  layout: 'M3 6h10v9H3zM15 9h6v9h-6z',
  extend: 'M3 5h12v10H3zM17 8h4v10h-4zM7 19h4',
  mirror: 'M3 5h8v10H3zM13 5h8v10h-8zM7 19h10',
  power: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  github: 'M9 19c-4 1.3-4-2-6-2m12 4v-3.5c0-1 .1-1.4-.5-2 2.800-.3 5.500-1.400 5.500-6a4.600 4.600 0 0 0-1.300-3.200 4.200 4.200 0 0 0-.1-3.200s-1.100-.3-3.500 1.300a12.300 12.300 0 0 0-6.200 0C6.500 2.800 5.400 3.100 5.400 3.100a4.200 4.200 0 0 0-.1 3.200A4.600 4.600 0 0 0 4 9.500c0 4.600 2.700 5.700 5.500 6-.6.600-.6 1.200-.5 2V21',
  menu: 'M4 7h16M4 12h16M4 17h16',
  close: 'M6 6l12 12M18 6L6 18',
  moon: 'M20 14a8 8 0 1 1-10-10 7 7 0 0 0 10 10z',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  copy: 'M9 9h11v11H9zM5 15V5h10',
  info: 'M12 11v6M12 7.5h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  warn: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  cable: 'M7 3v5M17 3v5M5 8h4v4a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V8h4M12 15v6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cloudoff: 'M3 3l18 18M7 18a5 5 0 0 1-1-9.800A7 7 0 0 1 12 5c1 0 2 .2 2.900.600M17 9a4 4 0 0 1 3 6.500',
};

export default function Icon({ name, size = 22, className = '', stroke = 1.7 }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.info} />
    </svg>
  );
}
