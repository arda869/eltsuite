import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({ entryPoints: ['src/design/mapSymbols.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { MAP_SYMBOLS } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const revised = {
  barbecue: 'bespoke:barbecue', stadium: 'bespoke:stadium', courtyard: 'bespoke:courtyard',
  helpdesk: 'bespoke:helpdesk', tourism: 'bespoke:visitorcentre', farmshop: 'bespoke:farmshop',
  ambulance: 'bespoke:ambulancebay', golf: 'bespoke:golfcourse',
  coffee: 'bespoke:coffeehouse', notice: 'bespoke:notice',
};
const comparisons = [
  ['barbecue', 'camping'], ['stadium', 'football'], ['courtyard', 'office'],
  ['helpdesk', 'reception'], ['tourism', 'information'], ['farmshop', 'shop'],
  ['ambulance', 'hospital'], ['golf', 'field'], ['coffee', 'café'], ['notice', 'information'],
];

test('the ten revised symbols keep their reviewed, place-specific vector artwork', () => {
  for (const [key, source] of Object.entries(revised)) {
    const symbol = MAP_SYMBOLS.find(item => item.key === key);
    assert.ok(symbol, `${key} missing from catalogue`);
    assert.equal(symbol.glyph.source, source);
    assert.ok(symbol.glyph.paths.length >= 2, `${key} has lost pictogram detail`);
  }
});

test('revised symbol previews remain visible, uncropped, and distinct from similar places at picker size', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const keys = new Set(comparisons.flat());
    const artwork = [...keys].map(key => {
      const symbol = MAP_SYMBOLS.find(item => item.key === key);
      const glyph = symbol.glyph;
      return `<svg data-key="${key}" viewBox="0 0 ${glyph.viewBox} ${glyph.viewBox}" width="48" height="48" fill="none" stroke="black" stroke-width="${glyph.viewBox === 24 ? 2 : 2.5}" stroke-linecap="round" stroke-linejoin="round">${glyph.paths.map(path => `<path d="${path}"/>`).join('')}${glyph.text ? `<text x="24" y="25" fill="black" stroke="none" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="800">${glyph.text}</text>` : ''}</svg>`;
    }).join('');
    await page.setContent(`<!doctype html><html><body>${artwork}<canvas width="48" height="48"></canvas></body></html>`);
    const results = await page.evaluate(() => {
      const ctx = document.querySelector('canvas').getContext('2d');
      return [...document.querySelectorAll('svg')].map(svg => {
        const size = svg.viewBox.baseVal.width;
        const bounds = svg.getBBox();
        ctx.clearRect(0, 0, 48, 48);
        ctx.save(); ctx.scale(48 / size, 48 / size); ctx.lineWidth = size === 24 ? 2 : 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        for (const path of svg.querySelectorAll('path')) ctx.stroke(new Path2D(path.getAttribute('d')));
        const text = svg.querySelector('text');
        if (text) { ctx.font = '800 11px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text.textContent, 24, 25); }
        ctx.restore();
        const pixels = ctx.getImageData(0, 0, 48, 48).data;
        const mask = Array.from({ length: 48 * 48 }, (_, i) => Number(pixels[i * 4 + 3] > 100));
        return { key: svg.dataset.key, size, bounds: { x: bounds.x, y: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height }, mask, ink: mask.reduce((a, b) => a + b, 0) };
      });
    });
    const byKey = new Map(results.map(result => [result.key, result]));
    for (const key of Object.keys(revised)) {
      const { size, bounds, ink } = byKey.get(key);
      assert.ok(ink >= 45, `${key} preview is too faint at picker size`);
      assert.ok(bounds.x >= 1 && bounds.y >= 1 && bounds.right <= size - 1 && bounds.bottom <= size - 1, `${key} is cropped: ${JSON.stringify(bounds)}`);
    }
    for (const [a, b] of comparisons) {
      const first = byKey.get(a).mask, second = byKey.get(b).mask;
      let common = 0, union = 0;
      for (let i = 0; i < first.length; i++) { if (first[i] && second[i]) common++; if (first[i] || second[i]) union++; }
      assert.ok(common / union < .8, `${a} resembles ${b} too closely at picker size`);
    }
  } finally { await browser.close(); }
});
