import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /api to the Express server so refresh cookies stay same-origin in dev.
export default defineConfig({
  plugins: [react()],
  build: {
    // Keep the PREVIOUS build's chunks on disk. Assets are content-hashed and
    // served immutable, so old files are harmless — but emptying the directory
    // on every build is what makes a deploy break tabs that are already open:
    // they ask for assets/index-<oldhash>.js, nginx has nothing, returns its
    // 404 HTML page, and the browser tries to parse `<html>` as JavaScript.
    // That was "Unexpected token '<'" ×160 in one night.
    // deploy/deploy.sh prunes anything older than 7 days so this can't grow
    // without limit.
    emptyOutDir: false,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
