import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import downloadsManifest from './vite-plugins/downloads.js';

export default defineConfig({
  plugins: [react(), downloadsManifest()],
  server: { port: 5180 },
  build: { outDir: 'dist', chunkSizeWarningLimit: 800 },
});
