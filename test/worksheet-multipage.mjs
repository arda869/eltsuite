import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const base = process.env.STYLE_BASE || 'http://127.0.0.1:5280';
const server = process.env.STYLE_BASE ? null : spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', '5280', '--strictPort', '--host', '127.0.0.1'], { stdio: 'inherit' });
let browser;
try {
  if (server) {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (await fetch(base).then((r) => r.ok, () => false)) { ready = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert(ready, 'The worksheet test page did not start');
  }
  browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
  const page = await browser.newPage();
  await page.goto(`${base}/test/lesson-style-check.html`);
  await page.waitForFunction(() => !!window.worksheetPdf && !!window.exportFixture);
  // Pictures trigger a preliminary layout to start loading, then a final layout that replaces
  // every page node. PDF capture must never see the preliminary nodes as printable pages.
  const picture = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="680" height="460"><rect width="680" height="460" fill="#eeeeee"/><path d="M30 40h600v350H30z" stroke="#222" stroke-width="8" fill="none"/></svg>').toString('base64');
  const delayedHtml = await page.evaluate((src) => {
    const tasks = Array.from({ length: 4 }, (_, i) => {
      const task = window.flattenTask(window.exportFixture, 'exam');
      return { kind: 'task', task: { ...task, title: `Picture exercise ${i + 1}`, blocks: i === 0 ? [...task.blocks, { kind: 'p', runs: [{ pic: { src, size: 'large', label: '', alt: 'Test map' } }] }] : task.blocks } };
    });
    return window.worksheetHtml('Picture worksheet', tasks, {
      lessonStyle: 'exam', header: true, key: false, notes: false, paper: 'Letter',
      columns: 1, accent: '#13579b', className: 'Exam class', origin: location.origin,
    }).replace('<script>\n(function ()', '<script>window.pictureDecodePromise = new Promise(resolve => { window.releasePictureDecode = resolve; }); HTMLImageElement.prototype.decode = function () { return window.pictureDecodePromise; };</script><script>\n(function ()');
  }, picture);
  const delayedPage = await browser.newPage();
  await delayedPage.goto(`${base}/test/lesson-style-check.html`);
  await delayedPage.setContent(delayedHtml);
  await delayedPage.waitForFunction(() => document.querySelectorAll('#pages > .page').length >= 2 && !!window.releasePictureDecode);
  assert.equal(await delayedPage.evaluate(() => window.__laidOut === true), false, 'Preliminary pages were incorrectly marked ready for PDF capture');
  await delayedPage.evaluate(() => window.releasePictureDecode());
  await delayedPage.waitForFunction(() => window.__laidOut === true);
  assert(await delayedPage.locator('#pages > .page').count() >= 2, 'Final worksheet lost its second page');
  await delayedPage.close();
  const { data, html, forcedFailures } = await page.evaluate(async () => {
    const tasks = Array.from({ length: 4 }, (_, i) => ({
      kind: 'task',
      task: { ...window.flattenTask(window.exportFixture, 'exam'), title: `Exercise ${i + 1}` },
    }));
    const html = window.worksheetHtml('Multi-page worksheet', tasks, {
      lessonStyle: 'exam', header: true, key: false, notes: false, paper: 'A4',
      columns: 1, accent: '#13579b', className: 'Exam class', level: 'B1', origin: location.origin,
    });
    const original = HTMLCanvasElement.prototype.toDataURL;
    let jpegCalls = 0;
    let forcedFailures = 0;
    HTMLCanvasElement.prototype.toDataURL = function (type, ...args) {
      if (type === 'image/jpeg' && [2, 3].includes(++jpegCalls)) {
        forcedFailures++;
        return 'data:,';
      }
      return original.call(this, type, ...args);
    };
    try { return { data: Array.from(await window.worksheetPdf(html, 'A4')), html, forcedFailures }; }
    finally { HTMLCanvasElement.prototype.toDataURL = original; }
  });
  const htmlPage = await browser.newPage();
  await htmlPage.setContent(html);
  await htmlPage.waitForFunction(() => window.__laidOut === true);
  const htmlBodies = await htmlPage.locator('.page').evaluateAll(pages => pages.map(p => ({ kind: p.className, body: p.querySelector('.cols')?.textContent?.trim().length ?? 0, cards: p.querySelector('.cut-grid')?.textContent?.trim().length ?? 0, all: p.textContent?.trim().length ?? 0 })));
  assert.equal(forcedFailures, 2, 'The failed page capture path was not exercised');
  await htmlPage.close();
  const pdf = await getDocument({ data: new Uint8Array(data), useSystemFonts: true }).promise;
  try {
    assert(pdf.numPages >= 3, `Expected multiple worksheet pages; got ${pdf.numPages}`);
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const ops = await page.getOperatorList();
      const images = ops.fnArray.filter(op => op === OPS.paintImageXObject || op === OPS.paintInlineImageXObject).length;
      assert(images > 0, `PDF page ${n} is blank`);
      const viewport = page.getViewport({ scale: 0.28 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const width = canvas.width, height = canvas.height;
      const pixels = ctx.getImageData(0, 0, width, height).data;
      let ink = 0;
      for (let y = Math.floor(height * 0.23); y < Math.floor(height * 0.85); y++) {
        for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x++) {
          const at = (y * width + x) * 4;
          if (pixels[at] < 190 && pixels[at + 1] < 190 && pixels[at + 2] < 190) ink++;
        }
      }
      if (!htmlBodies[n - 1]?.kind.includes('cut-page')) assert(ink > 20, `PDF page ${n} has no visible content in the body (${ink} ink pixels)`);
    }
    console.log(`PASS: all ${pdf.numPages} PDF pages contain the worksheet image`);
  } finally { await pdf.destroy(); }
} finally { await browser?.close(); server?.kill('SIGTERM'); }
