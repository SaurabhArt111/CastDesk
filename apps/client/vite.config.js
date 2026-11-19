import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the same build loads from file:// (Electron), capacitor://localhost (mobile)
// and from the host's own web server (PWA).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  server: { port: 5173 },
});
