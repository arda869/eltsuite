// Screenshots of the young learners' gallery. Start Vite with test/vite.config.ts first.
// YL_OUT chooses the folder, YL_STYLE the lesson style (young by default).
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
const BASE = process.env.STYLE_BASE || 'http://localhost:5184';
const OUT = process.env.YL_OUT || 'work/young-shots';
const STYLE = process.env.YL_STYLE || 'young';
const SIZES = { 'ipad-landscape': [1180, 820], 'ipad-portrait': [820, 1180], phone: [390, 844], desktop: [1440, 900] };
await mkdir(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
const errors = [];
for (const [name, [width, height]] of Object.entries(SIZES)) {
  if (process.env.YL_SIZES && !process.env.YL_SIZES.split(',').includes(name)) continue;
  const p = await b.newPage({ viewport: { width, height }, deviceScaleFactor: name === 'phone' ? 2 : 1, hasTouch: name !== 'desktop' });
  p.on('pageerror', (e) => errors.push(e.message));
  for (const checked of [false, true]) {
    await p.goto(`${BASE}/test/young-gallery.html?style=${STYLE}${checked ? '&checked=1' : ''}`);
    await p.waitForSelector('[data-gallery]');
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(900);
    const n = await p.locator('[data-gallery]').count();
    for (let i = 0; i < n; i++) await p.locator('[data-gallery]').nth(i).screenshot({ path: `${OUT}/${name}-${checked ? 'checked' : 'open'}-${i + 1}.png`, animations: 'disabled' });
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) errors.push(`${name}${checked ? ' checked' : ''}: page scrolls sideways`);
    // Tap targets under 44 × 44 px, other than words inside running text.
    const small = await p.evaluate(() => [...document.querySelectorAll('.task-body :is(.opt, .slash-opt, .bank-word, .match-item, .drop-slot, .gap-input, .lg-slot), .frame-foot .btn')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.height < 44 || r.width < 44); }).map((el) => el.className + ' ' + el.textContent.trim().slice(0, 20)));
    if (small.length) errors.push(`${name}${checked ? ' checked' : ''}: small targets: ${small.join(', ')}`);
    if (name === 'ipad-landscape') {
      await p.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      const v = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.length} (${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')})`));
      if (v.length) errors.push(`axe ${checked ? 'checked' : 'open'}: ${v.join('; ')}`);
      else console.log(`axe ${checked ? 'checked' : 'open'}: no WCAG 2.2 AA violations`);
    }
  }
  await p.close();
}
await b.close();
console.log(errors.length ? errors.join('\n') : 'No page errors or sideways scrolling');
// The adult style keeps its original sizes, so only the young style has to pass.
if (errors.length && STYLE === 'young') process.exitCode = 1;
