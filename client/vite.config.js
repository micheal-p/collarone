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

    // Split the vendor libraries out of the app chunk.
    //
    // Everything used to land in one 1.45MB index chunk, which is the whole
    // download before a Nigerian SME on mobile data sees anything. Two
    // separate problems in that number: the app code (fixed by lazy routes in
    // App.jsx) and the libraries, fixed here.
    //
    // Libraries change on the order of once a quarter; app code changes
    // several times a day. Bundled together, every deploy invalidates the
    // React runtime as well, so a returning visitor re-downloads ~200KB of
    // framework that has not changed. Split, those chunks stay in the browser
    // cache across deploys.
    //
    // framer-motion and supabase are separated for a second reason: the
    // published tenant sites and the public invoice page need neither, so on
    // those routes they are never requested at all.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
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
