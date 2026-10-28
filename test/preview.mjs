// Screenshots of the app with stand-ins for Firebase, for checking a change by eye before it goes
// live. Runs the steps in test/preview-steps.mjs and writes the pictures and a log to preview-out/.
// Run with: node test/preview.mjs  (the "Preview" workflow runs it on preview/* branches).
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://localhost:5184';
const OUT = 'preview-out';
mkdirSync(OUT, { recursive: true });
const log = [];
const say = (...a) => (console.log(...a), log.push(a.join(' ')));

const vite = spawn('npx', ['vite', '--config', 'test/vite.config.ts'], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let vlog = '';
vite.stdout.on('data', (d) => (vlog += d));
vite.stderr.on('data', (d) => (vlog += d));
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await fetch(BASE).then((r) => r.ok, () => false);
  if (!ok) await new Promise((r) => setTimeout(r, 500));
}
if (!ok) {
  writeFileSync(`${OUT}/log.txt`, 'The test server did not start:\n' + vlog);
  process.exit(1);
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, acceptDownloads: true });
const p = await ctx.newPage();
p.on('pageerror', (e) => say('CRASH', e.message));
p.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::|DevTools|Future Flag/.test(m.text()) && say('CONSOLE', m.text().slice(0, 300)));
await p.goto(`${BASE}/dev.html?seed&as=teacher`);
await p.waitForFunction(() => !!localStorage.getItem('mockdemo'), null, { timeout: 30000 });
const demo = await p.evaluate(() => JSON.parse(localStorage.getItem('mockdemo')));
let n = 0;
const shot = async (name, target) => {
  const file = `${OUT}/${String(++n).padStart(2, '0')}-${name}.png`;
  if (target) await target.screenshot({ path: file });
  else await p.screenshot({ path: file });
  say('shot', file);
};
try {
  const { default: steps } = await import('./preview-steps.mjs');
  await steps({ p, ctx, shot, say, demo, BASE });
} catch (e) {
  say('STEP FAILED', e.message);
  await p.screenshot({ path: `${OUT}/zz-failed.png` }).catch(() => {});
}
writeFileSync(`${OUT}/log.txt`, log.join('\n'));
await browser.close();
process.kill(-vite.pid);
process.exit(0);
