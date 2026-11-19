import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/pages.css';

try {
  document.documentElement.dataset.theme = localStorage.getItem('bd-theme') || 'dark';
} catch {
  document.documentElement.dataset.theme = 'dark';
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
