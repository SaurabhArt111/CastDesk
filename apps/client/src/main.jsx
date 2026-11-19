const params = new URLSearchParams(location.search);

if (params.get('capture') === '1') {
  // Hidden capture window (desktop app): no UI, just capture + encode, so it cannot slow the UI down.
  import('./lib/capturer.js').then(({ Capturer }) => {
    new Capturer({ port: Number(params.get('port')), token: params.get('token') }).start();
  });
} else {
  Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./App.jsx'),
    import('./styles/tokens.css'),
    import('./styles/base.css'),
    import('./styles/components.css'),
    import('./styles/session.css'),
    import('./styles/shell.css'),
  ]).then(([{ StrictMode, createElement }, { createRoot }, { default: App }]) => {
    createRoot(document.getElementById('root')).render(createElement(StrictMode, null, createElement(App)));
  });
}

// Installable PWA when served by a host over http(s)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !import.meta.env.DEV && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
