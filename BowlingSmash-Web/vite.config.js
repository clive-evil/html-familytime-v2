import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // fully static, relative paths (CrazyGames / any static host)
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 4000, target: 'es2020' },
  server: { host: true },
});
