import { useApp } from '../state/AppContext.jsx';
import Icon from './Icon.jsx';
import { Logo } from './common.jsx';
import { canHost } from '../lib/platform.js';

const ITEMS = [
  { view: 'home', icon: 'monitor', label: 'Home' },
  { view: 'layout', icon: 'layout', label: 'Displays', hostOnly: true },
  { view: 'permissions', icon: 'shield', label: 'Permissions' },
  { view: 'settings', icon: 'settings', label: 'Settings' },
];

/** Sidebar on wide windows, bottom tab bar on phones: the same navigation a native app has. */
export default function Shell({ children }) {
  const { view, setView, session } = useApp();
  const items = ITEMS.filter((i) => !i.hostOnly || canHost);
  return (
    <div className="shell">
      <aside className="side">
        <Logo size={30} />
        <nav aria-label="Main">
          {items.map((i) => (
            <button key={i.view} className={`nav-item ${view === i.view ? 'on' : ''}`} onClick={() => setView(i.view)} aria-current={view === i.view ? 'page' : undefined}>
              <Icon name={i.icon} size={20} />
              <span>{i.label}</span>
            </button>
          ))}
        </nav>
        <div className="side-foot">{session?.status === 'connecting' ? 'Connecting…' : 'Works offline · no account'}</div>
      </aside>
      <div className="shell-main">{children}</div>
    </div>
  );
}
