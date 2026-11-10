import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  // This app has its own Vite dependency graph. Keep its prebundled React away
  // from the main ELT Suite test server, which starts later in the same job.
  cacheDir: resolve(__dirname, '../node_modules/.vite-information-gap'),
  plugins: [react()],
  build: { outDir: resolve(__dirname, '../dist-information-gap'), emptyOutDir: true },
  server: { port: 5198, strictPort: true },
});
