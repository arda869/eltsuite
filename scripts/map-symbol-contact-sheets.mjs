import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const result = await build({ entryPoints: ['src/design/mapSymbols.ts'], bundle: true, write: false, platform: 'node', format: 'esm' });
const { MAP_SYMBOLS, MAP_SYMBOL_CATEGORIES } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const output = process.argv[2] || 'outputs/map-symbols-2026';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1060, height: 300 }, deviceScaleFactor: 1.5 });
  const cards = (symbols) => symbols.map(s => {
    const glyph = s.glyph;
    return `<div class="card"><div class="art"><svg width="66" height="66" viewBox="0 0 ${glyph.viewBox} ${glyph.viewBox}" fill="none" stroke="currentColor" stroke-width="${glyph.viewBox === 24 ? 2 : 2.5}" stroke-linecap="round" stroke-linejoin="round">${glyph.paths.map(d => `<path d="${d.replaceAll('"', '&quot;')}"/>`).join('')}${glyph.text ? `<text x="24" y="25" fill="currentColor" stroke="none" text-anchor="middle" dominant-baseline="middle" font-size="${glyph.text.length > 1 ? 11 : 25}" font-weight="800">${glyph.text}</text>` : ''}</svg></div><div class="name">${s.name}</div><div class="key">${s.key} · ${glyph.source}</div></div>`;
  }).join('');
  const styles = `<style>*{box-sizing:border-box}body{margin:0;padding:30px;background:#f6f3ee;color:#302e31;font:14px Arial,sans-serif}h1{margin:0 0 7px;font:700 28px Georgia,serif}p{margin:0 0 22px;color:#6f6a70}.grid{display:grid;grid-template-columns:repeat(5,1fr);gap:13px}.card{min-height:139px;padding:12px;border:1px solid #ddd5ce;border-radius:13px;background:white;box-shadow:0 2px 8px #0000000b;text-align:center}.art{display:grid;place-items:center;height:77px;color:#7c668d}.name{font-weight:700;font-size:13px}.key{margin-top:4px;color:#8b8589;font-size:10px;overflow-wrap:anywhere}</style>`;
  const index = [];
  for (const category of MAP_SYMBOL_CATEGORIES) {
    const symbols = MAP_SYMBOLS.filter(s => s.category === category.key);
    const html = `<!doctype html><html><head>${styles}</head><body><h1>${category.name}</h1><p>${symbols.length} symbols · ${category.key}</p><div class="grid">${cards(symbols)}</div></body></html>`;
    await page.setContent(html);
    await page.screenshot({ path: `${output}/${category.key}.png`, fullPage: true });
    await writeFile(`${output}/${category.key}.html`, html);
    index.push(`${category.key}: ${symbols.length}`);
  }
  console.log(index.join('\n'));
} finally { await browser.close(); }
