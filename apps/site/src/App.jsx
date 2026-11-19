import { Route, Routes } from 'react-router-dom';
import { Footer, Header, ScrollManager } from './components/Layout.jsx';
import Home from './pages/Home.jsx';
import Download from './pages/Download.jsx';
import Guide from './pages/Guide.jsx';
import Preferences from './pages/Preferences.jsx';
import Gallery from './pages/Gallery.jsx';
import About from './pages/About.jsx';
import Source from './pages/Source.jsx';
import Security from './pages/Security.jsx';
import { Changelog, FaqPage, NotFound } from './pages/Misc.jsx';

export default function App() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <ScrollManager />
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/download" element={<Download />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/about" element={<About />} />
          <Route path="/source" element={<Source />} />
          <Route path="/security" element={<Security />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/changelog" element={<Changelog />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}
