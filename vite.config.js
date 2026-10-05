import { defineConfig } from 'vite';

// base './' so the production build works from any static host or sub-path.
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
