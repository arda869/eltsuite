// Comments pinned to a spot on a PDF page: place, reply, mark as done, see in the panel.
// Needs the dev server on 5197, as the other browser tests.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import fs from 'node:fs';
mkdirSync('outputs/pdf', { recursive: true });
const out = 'outputs/pdf/comments.png';
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
await p.getByRole('button', { name: 'Comment on the page' }).click();
await p.mouse.click(pgbox.x + pgbox.width * 0.55, pgbox.y + pgbox.height * 0.205);
await p.waitForTimeout(400);
await p.keyboard.type('Ask learners where Lisbon is first.'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
console.log('pins:', await p.locator('.pcm-dot').count(), '| thread:', (await p.locator('.pcm-pop').innerText().catch(() => '-')).replace(/\s+/g, ' ').slice(0, 120));
await p.locator('.pcm-pop textarea').fill('Good idea. Use the map on page 2.'); await p.keyboard.press('Enter'); await p.waitForTimeout(1000);
assert.equal(await p.locator('.pcm-msg').count(), 2, 'a comment and its reply');
await p.screenshot({ path: out.replace('.png', '-comment.png') });
await p.getByRole('button', { name: 'Mark as done' }).click(); await p.waitForTimeout(800);
console.log('pins after done:', await p.locator('.pcm-dot').count());
await p.locator('.fcm-toggle').click(); await p.waitForTimeout(500); console.log('panel:', (await p.locator('.fcm').innerText()).replace(/\s+/g, ' ').slice(0, 160));
const dl = p.waitForEvent('download'); await p.getByRole('button', { name: /Download PDF/ }).click(); const f = await dl; const path = out.replace('.png', '.pdf'); await f.saveAs(path);
console.log('PASS comments pinned to a PDF page');
await b.close();
