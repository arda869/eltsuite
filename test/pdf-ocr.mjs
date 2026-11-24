// A scanned PDF: Read the text (OCR, in the browser) gives it selectable words, and the download
// keeps the highlights and can be searched. Needs the dev server on 5197, as the other browser tests.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
mkdirSync('outputs/pdf', { recursive: true });
const out = 'outputs/pdf/ocr.png';
const base = process.env.TEST_BASE_URL || 'http://localhost:5197';
const vite = process.env.TEST_BASE_URL ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', '5197', '--strictPort'], { stdio: 'ignore', detached: true });
let b;
try {
if (vite) {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await fetch(base).then((response) => response.ok, () => false)) { ready = true; break; }
    if (vite.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error('The PDF test server did not start.');
}
b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
p.on('console', m => m.type()==='error' && console.log('CONSOLE', m.text().slice(0,200)));
await p.goto(`${base}/dev.html?seed&as=teacher`);
await p.waitForFunction(async () => { if (!window.__mockReady) return false; await window.__mockReady; return !!localStorage.getItem('mockdemo'); }, null, { timeout: 180000 });
await p.waitForLoadState('networkidle');
const jpg = await p.evaluate(() => {
  // A scan: a picture of a page of text, with no text of its own.
  const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d');
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#222'; g.font = 'bold 54px Georgia'; g.fillText('Unit 4: Travel stories', 110, 190);
  g.font = '34px Georgia'; ['Read the text. Then answer the questions.', 'Last summer Maria went to Lisbon with her sister.', 'They took the train from Madrid and stayed', 'in a small hotel near the river. Every morning', 'they walked to a cafe and had coffee and cakes.', '1  Where did Maria go last summer?', '2  How did they travel there?'].forEach((t, i) => g.fillText(t, 110, 300 + i * 70));
  return c.toDataURL('image/jpeg', 0.92).split(',')[1];
});
const { PDFDocument } = await import('pdf-lib');
const doc = await PDFDocument.create(); const img = await doc.embedJpg(Buffer.from(jpg, 'base64')); const pg = doc.addPage([595.28, 841.89]); pg.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
const textPage = doc.addPage([595.28, 841.89]); textPage.drawText('A second page also mentions Lisbon.', { x: 72, y: 720, size: 20 });
textPage.drawText('Lisbon appears again in this paragraph.', { x: 72, y: 680, size: 20 });
const b64 = Buffer.from(await doc.save()).toString('base64');
const id = await p.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const { openPdf, pageSizes, saveFilePdf } = await import('/src/pdf/pdfData.ts'); const { newSharedDoc } = await import('/src/lib/sharedDocs.ts');
  const pages = await pageSizes(await openPdf(bytes)); const id = await newSharedDoc({ uid: 'teacher1', name: 'Arda' }, 'pdf', 'Travel stories (scan)'); await saveFilePdf(id, bytes, pages); return id;
}, b64);
await p.evaluate(id => { history.pushState({}, '', '/doc/' + id); dispatchEvent(new PopStateEvent('popstate')); }, id);
await p.waitForTimeout(5000);
await p.screenshot({ path: out.replace('.png', '-before.png') });
const btn = p.getByRole('button', { name: 'Read the text' }); assert.equal(await btn.count(), 1, 'a scanned PDF offers to read its text');
const t0 = Date.now(); await btn.click();
await p.waitForTimeout(1500); await p.screenshot({ path: out.replace('.png', '-running.png') });
await p.waitForFunction(() => /Done\.|couldn’t/.test(document.querySelector('.pdff-ocr')?.textContent || ''), null, { timeout: 120000 });
console.log('ocr secs', ((Date.now() - t0) / 1000).toFixed(1), await p.locator('.pdff-ocr').innerText());
await p.waitForTimeout(1500);
assert.ok(await p.locator('.ocr-word').count() > 40, 'the words are on the page');
assert.match(await p.locator('.textLayer').first().innerText(), /Lisbon/);
await p.getByRole('button', { name: 'Search the PDF' }).click();
const find = p.getByRole('searchbox', { name: 'Search the PDF' });
await find.fill('lisbon');
await p.locator('.pdff-find-n').filter({ hasText: '1 of 3' }).waitFor();
await p.locator('.pdf-hit-on').first().waitFor();
await find.press('Enter');
await find.press('Enter');
await p.locator('.pdff-find-n').filter({ hasText: '2 of 3' }).waitFor();
await p.locator('.pdf-pagewrap').nth(1).locator('.pdf-hit-on').waitFor();
const firstSecondPageMatch = await p.locator('.pdf-pagewrap').nth(1).locator('.pdf-hit-on').first().innerText();
await find.press('Enter');
await p.locator('.pdff-find-n').filter({ hasText: '3 of 3' }).waitFor();
await p.waitForFunction((previous) => { const selected = document.querySelector('.pdf-pagewrap:nth-child(2) .pdf-hit-on'); return !!selected && selected.textContent !== previous; }, firstSecondPageMatch);
assert.notEqual(await p.locator('.pdf-pagewrap').nth(1).locator('.pdf-hit-on').first().innerText(), firstSecondPageMatch, 'Next selects the later match on the same page');
await find.press('Shift+Enter');
await p.locator('.pdff-find-n').filter({ hasText: '2 of 3' }).waitFor();
await find.press('Shift+Enter');
await p.locator('.pdff-find-n').filter({ hasText: '1 of 3' }).waitFor();
await p.locator('.pdf-pagewrap').first().locator('.pdf-hit-on').waitFor();
await find.fill('Lisbon Madrid');
await p.locator('.pdff-find-n').filter({ hasText: 'No matches' }).waitFor();
assert.equal(await p.locator('.pdf-hit, .pdf-hit-on').count(), 0, 'unmatched phrases do not highlight unrelated words');
await find.press('Escape');
assert.equal(await p.getByRole('searchbox', { name: 'Search the PDF' }).count(), 0, 'Escape closes search');
await p.keyboard.press('ControlOrMeta+f');
await p.getByRole('searchbox', { name: 'Search the PDF' }).waitFor();
await p.getByRole('searchbox', { name: 'Search the PDF' }).press('Escape');
console.log('PASS PDF search across OCR and selectable text pages, with next and previous matches');
await p.getByRole('radio', { name: /Highlight/ }).first().click().catch(async () => p.getByRole('button', { name: /Highlight/ }).first().click()); const pgbox = await p.locator('.pdf-pagewrap').first().boundingBox(); await p.mouse.move(pgbox.x + pgbox.width*0.09, pgbox.y + pgbox.height*0.205); await p.mouse.down(); await p.mouse.move(pgbox.x + pgbox.width*0.72, pgbox.y + pgbox.height*0.225, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(800);
await p.screenshot({ path: out });
const dl = p.waitForEvent('download'); await p.getByRole('button', { name: /Download PDF/ }).click(); const f = await dl; const path = out.replace('.png', '.pdf'); await f.saveAs(path);
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const saved = await getDocument({ data: new Uint8Array(fs.readFileSync(path)) }).promise;
const text = (await (await saved.getPage(1)).getTextContent()).items.map((i) => i.str).join(' ');
assert.match(text, /Lisbon/, 'the downloaded PDF can be searched');
console.log('PASS OCR on a scanned PDF, its text layer, and a searchable download with highlights');
} finally {
  await b?.close();
  if (vite) { try { process.kill(-vite.pid); } catch { vite.kill(); } }
}
