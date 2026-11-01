import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// The app with stand-ins for Firebase (test/mock), for the smoke tests and for screenshots.
// Data lives in the browser's localStorage; ?seed makes a demo class, ?as=teacher signs in.
const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '..');
const m = (f: string) => path.join(here, 'mock', f);
const FONTS = fs.readdirSync(path.join(here, 'fonts')).filter((f) => f.endsWith('.woff2'));
const harness = (): Plugin => ({
  name: 'harness',
  configureServer(s) {
    s.middlewares.use('/_fonts', (req, res) => {
      const f = path.join(here, 'fonts', path.basename(req.url ?? ''));
      if (fs.existsSync(f)) {
        res.setHeader('content-type', 'font/woff2');
        res.end(fs.readFileSync(f));
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
  },
  transformIndexHtml: {
    order: 'pre',
    handler(html: string) {
      const faces = FONTS.map((f) => {
        const [fam, , w] = f.replace('.woff2', '').split('-');
        const name = fam === 'noto' ? 'Noto Sans' : fam[0].toUpperCase() + fam.slice(1);
        return `@font-face{font-family:"${name}";font-weight:${/^\d+$/.test(w) ? w : 400};src:url(/_fonts/${f})}`;
      }).join('');
      return html
        .replace(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/, `<style>${faces}</style>`)
        .replace('<script type="module" src="/src/main.tsx"></script>', `<script type="module">await import("/@fs${m('seed.ts')}"); await window.__mockReady; await import("/src/main.tsx");</script>`);
    },
  },
});
export default defineConfig({
  cacheDir: process.env.ELT_TEST_CACHE_DIR || path.join(root, '.vite-test'),
  root,
  plugins: [react(), harness()],
  define: { __BUILD__: '"dev"', 'import.meta.env.VITE_ELT_AI_PILOT': '"true"' },
  resolve: { alias: { 'firebase/functions': m('functions.ts'), 'firebase/app': m('app.ts'), 'firebase/auth': m('auth.ts'), 'firebase/database': m('database.ts'), 'firebase/firestore': m('firestore.ts') } },
  // Every page's packages are found at the start, so the app never reloads itself in the middle of a test.
  optimizeDeps: { entries: ['index.html', 'src/**/*.tsx'] },
  server: { port: 5184, strictPort: true, fs: { allow: [root] } },
});
