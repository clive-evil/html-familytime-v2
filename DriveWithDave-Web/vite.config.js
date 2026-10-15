import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` → dist/index.html, a single self-contained file (works from file://)
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 2000, assetsInlineLimit: 100000000 },
  server: { host: true, port: 5173 },
});
