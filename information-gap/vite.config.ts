import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  build: { outDir: resolve(__dirname, '../dist-information-gap'), emptyOutDir: true },
  server: { port: 5198, strictPort: true },
});
