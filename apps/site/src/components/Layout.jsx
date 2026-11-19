import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Icon from './Icons.jsx';
import { NAV, SITE } from '../data/site.js';

export function Brand({ size = 30 }) {
  return (
    <Link to="/" className="brand" aria-label="Paneo home">
      <img src="/favicon.svg" width={size} height={size} alt="" />
      <span>Paneo</span>
    </Link>
  );
}

function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem('bd-theme') || 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('bd-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export function Header() {
  const [open, setOpen] = useState(false);
  const [theme, toggle] = useTheme();
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav className={`nav ${open ? 'open' : ''}`} aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          <button className="icon-btn" onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
          </button>
          <Link to="/download" className="btn btn-primary btn-sm">
            <Icon name="download" size={16} /> Download
          </Link>
          <button className="icon-btn menu-btn" onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}>
            <Icon name={open ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div className="footer-brand">
          <Brand />
          <p>Mirror, extend and control any screen over USB or your own network. No internet. No account. Free and open source.</p>
          <a className="btn btn-ghost btn-sm" href={SITE.repo} target="_blank" rel="noreferrer">
            <Icon name="github" size={16} /> Star on GitHub
          </a>
        </div>
        <div>
          <h4>Product</h4>
          <Link to="/download">Download</Link>
          <Link to="/gallery">Screenshots</Link>
          <Link to="/preferences">Preferences</Link>
          <Link to="/changelog">Changelog</Link>
        </div>
        <div>
          <h4>Learn</h4>
          <Link to="/guide">Complete guide</Link>
          <Link to="/guide#usb">Connect over USB</Link>
          <Link to="/guide#permissions">Permissions</Link>
          <Link to="/faq">FAQ</Link>
        </div>
        <div>
          <h4>Project</h4>
          <Link to="/about">About</Link>
          <Link to="/source">Source &amp; build</Link>
          <Link to="/security">Security &amp; privacy</Link>
          <a href={`${SITE.repo}/issues`} target="_blank" rel="noreferrer">Report an issue</a>
        </div>
        <div>
          <h4>Platforms</h4>
          <Link to="/download#windows">Windows</Link>
          <Link to="/download#macos">macOS</Link>
          <Link to="/download#linux">Linux</Link>
          <Link to="/download#android">Android</Link>
          <Link to="/download#ios">iPhone &amp; iPad</Link>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Paneo contributors · MIT License</span>
        <span>Works offline. Collects nothing. Made for the desk in front of you.</span>
      </div>
    </footer>
  );
}

/** Scroll to top on route change, or to the #hash target. */
export function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export function PageHero({ eyebrow, title, children }) {
  return (
    <section className="page-hero">
      <div className="container">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {children && <p className="lead">{children}</p>}
      </div>
    </section>
  );
}

export function CodeBlock({ children, label }) {
  const [copied, setCopied] = useState(false);
  const text = typeof children === 'string' ? children : '';
  return (
    <div className="code">
      {label && <span className="code-label">{label}</span>}
      <pre><code>{children}</code></pre>
      <button
        className="code-copy"
        onClick={() => {
          navigator.clipboard?.writeText(text.trim()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function Callout({ tone = 'info', title, children }) {
  return (
    <aside className={`callout callout-${tone}`}>
      <Icon name={tone === 'warn' ? 'warn' : tone === 'ok' ? 'check' : 'info'} size={20} />
      <div>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </aside>
  );
}

export function DeviceFrame({ kind = 'phone', src, alt, className = '' }) {
  return (
    <figure className={`frame frame-${kind} ${className}`}>
      {kind === 'desktop' && (
        <div className="frame-bar"><i /><i /><i /><span>Paneo</span></div>
      )}
      <img src={src} alt={alt} loading="lazy" />
    </figure>
  );
}
