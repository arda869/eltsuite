// PDF shapes and stamps, then page tools (add a blank page, turn, delete) keeping the notes with
// their page, and a download. Needs the dev server on 5197, as the other browser tests.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import fs from 'node:fs';
mkdirSync('outputs/pdf', { recursive: true });
const out = 'outputs/pdf/tools.png';
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage();
p.on('pageerror', e => console.log('PAGEERROR', e.message.slice(0,300)));
p.on('console', m => m.type()==='error' && console.log('CONSOLE', m.text().slice(0,200)));
await p.goto('http://localhost:5197/dev.html?seed&as=teacher');
await p.waitForFunction(async () => { if (!window.__mockReady) return false; await window.__mockReady; return !!localStorage.getItem('mockdemo'); }, null, { timeout: 180000 });
const jpg = await p.evaluate(() => {
  // A scan: a picture of a page of text, with no text of its own.
  const c = document.createElement('canvas'); c.width = 1240; c.height = 1754; const g = c.getContext('2d');
  g.fillStyle = '#fbfaf6'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#222'; g.font = 'bold 54px Georgia'; g.fillText('Unit 4: Travel stories', 110, 190);
  g.font = '34px Georgia'; ['Read the text. Then answer the questions.', 'Last summer Maria went to Lisbon with her sister.', 'They took the train from Madrid and stayed', 'in a small hotel near the river. Every morning', 'they walked to a cafe and had coffee and cakes.', '1  Where did Maria go last summer?', '2  How did they travel there?'].forEach((t, i) => g.fillText(t, 110, 300 + i * 70));
  return c.toDataURL('image/jpeg', 0.92).split(',')[1];
});
const { PDFDocument } = await import('pdf-lib');
const doc = await PDFDocument.create(); const img = await doc.embedJpg(Buffer.from(jpg, 'base64')); const pg = doc.addPage([595.28, 841.89]); pg.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
const b64 = Buffer.from(await doc.save()).toString('base64');
const id = await p.evaluate(async (b64) => {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const { openPdf, pageSizes, saveFilePdf } = await import('/src/pdf/pdfData.ts'); const { newSharedDoc } = await import('/src/lib/sharedDocs.ts');
  const pages = await pageSizes(await openPdf(bytes)); const id = await newSharedDoc({ uid: 'teacher1', name: 'Arda' }, 'pdf', 'Travel stories (scan)'); await saveFilePdf(id, bytes, pages); return id;
}, b64);
await p.evaluate(id => { history.pushState({}, '', '/doc/' + id); dispatchEvent(new PopStateEvent('popstate')); }, id);
await p.waitForTimeout(5000);
await p.screenshot({ path: out.replace('.png', '-before.png') });
const btn = p.getByRole('button', { name: 'Read the text' }); console.log('offered:', await btn.count());
const t0 = Date.now(); await btn.click();
await p.waitForTimeout(1500); await p.screenshot({ path: out.replace('.png', '-running.png') });
await p.waitForFunction(() => /Done\.|couldn’t/.test(document.querySelector('.pdff-ocr')?.textContent || ''), null, { timeout: 120000 });
console.log('ocr secs', ((Date.now() - t0) / 1000).toFixed(1), await p.locator('.pdff-ocr').innerText());
await p.waitForTimeout(1500);
console.log('words on page:', await p.locator('.ocr-word').count(), (await p.locator('.textLayer').first().innerText()).slice(0, 120).replace(/\s+/g, ' '));
await p.getByRole('radio', { name: 'Shapes' }).click(); const pgbox = await p.locator('.pdf-pagewrap').first().boundingBox();
const P = (fx, fy) => [pgbox.x + pgbox.width * fx, pgbox.y + pgbox.height * fy];
const drag = async (a, b) => { await p.mouse.move(...P(...a)); await p.mouse.down(); await p.mouse.move(...P(...b), { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(300); };
await drag([0.72, 0.27], [0.55, 0.16]);
await p.getByRole('radio', { name: 'Box' }).click(); await drag([0.08, 0.205], [0.66, 0.24]);
await p.getByRole('radio', { name: 'Tick' }).click(); await p.mouse.click(...P(0.68, 0.22)); await p.waitForTimeout(300);
await p.getByRole('radio', { name: 'Learner A sign' }).click(); await p.mouse.click(...P(0.05, 0.222)); await p.waitForTimeout(300);
await p.getByRole('radio', { name: 'Blue' }).click(); await p.getByRole('radio', { name: 'Circle' }).click(); await drag([0.39, 0.16], [0.49, 0.19]);
console.log('shapes:', await p.locator('.pdf-shape').count());
await p.keyboard.press('Escape');
const more = async (n, item) => { await p.locator('.pdff-rail-i').nth(n).hover(); await p.getByRole('button', { name: `Page ${n + 1}: more` }).click(); await p.getByRole('menuitem', { name: item }).click(); };
await more(0, 'Add a blank page after'); await p.waitForFunction(() => document.querySelectorAll('.pdff-th').length === 2, null, { timeout: 20000 }); console.log('pages after add:', await p.locator('.pdff-th').count());
await more(0, 'Turn right'); await p.waitForTimeout(3000); console.log('page 1 aspect after turn:', await p.locator('.pdf-pagewrap').first().evaluate((e) => (e.clientWidth / e.clientHeight).toFixed(2)));
await more(1, 'Delete page'); await p.getByRole('button', { name: 'Delete page' }).last().click(); await p.waitForFunction(() => document.querySelectorAll('.pdf-pagewrap').length === 1, null, { timeout: 20000 }); assert.equal(await p.locator('.pdf-shape').count(), 5, 'shapes stay with their page'); console.log('pages after delete:', await p.locator('.pdf-pagewrap').count());
await p.waitForTimeout(2500);
await p.screenshot({ path: out });
const dl = p.waitForEvent('download'); await p.getByRole('button', { name: /Download PDF/ }).click(); const f = await dl; const path = out.replace('.png', '.pdf'); await f.saveAs(path);
assert.ok(fs.statSync(path).size > 1000); console.log('PASS PDF shapes and page tools');
await b.close();
