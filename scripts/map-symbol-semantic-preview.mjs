import { mkdir } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Review the ten revised pictograms at roughly the size teachers see in the picker.
const result = await build({ entryPoints: ['src/design/mapSymbols.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { MAP_SYMBOLS } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const keys = ['barbecue', 'stadium', 'courtyard', 'helpdesk', 'tourism', 'farmshop', 'ambulance', 'golf', 'coffee', 'notice'];
const output = process.argv[2] || 'docs/map-symbol-semantic-preview.png';
const icons = keys.map(key => {
  const symbol = MAP_SYMBOLS.find(item => item.key === key);
  if (!symbol) throw new Error(`Missing ${key}`);
  const { glyph } = symbol;
  const svg = `<svg width="52" height="52" viewBox="0 0 ${glyph.viewBox} ${glyph.viewBox}" fill="none" stroke="currentColor" stroke-width="${glyph.viewBox === 24 ? 2 : 2.5}" stroke-linecap="round" stroke-linejoin="round">${glyph.paths.map(d => `<path d="${d}"/>`).join('')}</svg>`;
  return `<article><div class="pair"><div class="art plain">${svg}</div><div class="art shaded">${svg}</div></div><strong>${symbol.name}</strong><small>${symbol.key}</small></article>`;
}).join('');
const html = `<!doctype html><html><head><style>
*{box-sizing:border-box}body{margin:0;padding:28px;background:#f7f4f2;color:#302e31;font:14px Arial,sans-serif}
h1{margin:0 0 4px;font:700 25px Georgia,serif}p{margin:0 0 22px;color:#706a70}
main{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
article{height:166px;padding:15px 10px;border:1px solid #ddd5ce;border-radius:14px;background:white;text-align:center;box-shadow:0 2px 8px #0000000b}
.pair{display:flex;justify-content:center;gap:12px;height:79px;align-items:start;color:#73578f}
.art{display:grid;place-items:center;width:62px;height:62px;border-radius:13px}
.shaded{background:#73578f33;border:1px solid #73578f60}
strong,small{display:block}strong{font-size:13px;margin-top:8px}small{font-size:10px;color:#8b8589;margin-top:4px}
</style></head><body><h1>Map symbol review</h1><p>Ten corrected symbols · left plain, right shaded · teacher colour: violet</p><main>${icons}</main></body></html>`;
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1150, height: 470 }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await mkdir(output.slice(0, output.lastIndexOf('/')) || '.', { recursive: true });
  await page.screenshot({ path: output, fullPage: true });
  console.log(output);
} finally { await browser.close(); }
