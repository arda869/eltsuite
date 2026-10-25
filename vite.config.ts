import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Each build gets an id; the app checks /version.json to offer a refresh after a deploy.
const BUILD = String(Date.now());
const versionFile = (): Plugin => ({
  name: 'version-file',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
  },
});

export default defineConfig({ plugins: [react(), versionFile()], define: { __BUILD__: JSON.stringify(BUILD) } });
