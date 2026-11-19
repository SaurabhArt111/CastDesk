import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/session.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable PWA when served by a host over http(s)
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !import.meta.env.DEV && location.hostname !== 'localhost') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
