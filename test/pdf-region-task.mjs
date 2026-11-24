// Part of a scanned PDF page as a task: OCR, drag a region, choose a lesson, open the task.
// Needs the dev server on 5197, as the other browser tests.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import fs from 'node:fs';
mkdirSync('outputs/pdf', { recursive: true });
const out = 'outputs/pdf/region.png';
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
const pgbox = await p.locator('.pdf-pagewrap').first().boundingBox();
await p.getByRole('button', { name: 'Make a task from part of a page' }).click(); await p.waitForSelector('.rtt-catch');
await p.mouse.move(pgbox.x + pgbox.width * 0.07, pgbox.y + pgbox.height * 0.16); await p.mouse.down(); await p.mouse.move(pgbox.x + pgbox.width * 0.80, pgbox.y + pgbox.height * 0.27, { steps: 8 }); await p.mouse.up();
await p.waitForSelector('.rtt-pic img', { timeout: 20000 }); await p.waitForTimeout(800);
const d0 = JSON.parse(await p.evaluate(() => localStorage.getItem('mockdemo')));
await p.getByLabel('Class').selectOption({ index: 1 }).catch(async () => { await p.getByRole('button', { name: 'Class' }).click(); await p.getByRole('option').nth(1).click(); });
await p.waitForTimeout(800);
await p.getByLabel('Lesson').selectOption({ index: 1 }).catch(async () => { await p.getByRole('button', { name: 'Lesson' }).click(); await p.getByRole('option').nth(1).click(); });
await p.screenshot({ path: out.replace('.png', '-rtt.png') });
await p.getByRole('button', { name: 'Add the task' }).click();
await p.waitForSelector('text=Open the task', { timeout: 20000 });
const href = await p.getByRole('link', { name: 'Open the task' }).getAttribute('href'); console.log('task link:', href);
await p.goto('http://localhost:5197/dev.html?as=teacher'); await p.waitForTimeout(1500);
await p.evaluate(u => { history.pushState({}, '', u); dispatchEvent(new PopStateEvent('popstate')); }, href); await p.waitForTimeout(5000);
console.log('task text:', (await p.locator('.frame-inner').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200));
await p.screenshot({ path: out.replace('.png', '-task.png') });
await b.close(); process.exit(0);
const dl = p.waitForEvent('download'); await p.getByRole('button', { name: /Download PDF/ }).click(); const f = await dl; const path = out.replace('.png', '.pdf'); await f.saveAs(path);
console.log('pdf bytes', fs.statSync(path).size);
await b.close();
