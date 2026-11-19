import { AppProvider, useApp } from './state/AppContext.jsx';
import { Toasts } from './components/common.jsx';
import Home from './views/Home.jsx';
import Session from './views/Session.jsx';
import Settings from './views/Settings.jsx';
import Permissions from './views/Permissions.jsx';
import DisplayLayout from './views/DisplayLayout.jsx';

function Router() {
  const { view, session } = useApp();
  if (session?.status === 'live' && view === 'session') return <Session />;
  switch (view) {
    case 'settings': return <Settings />;
    case 'permissions': return <Permissions />;
    case 'layout': return <DisplayLayout />;
    default: return <Home />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <Router />
      <Toasts />
    </AppProvider>
  );
}
