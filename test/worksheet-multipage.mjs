import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const base = process.env.STYLE_BASE || 'http://localhost:5184';
const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/test/lesson-style-check.html`);
  await page.waitForFunction(() => !!window.worksheetPdf && !!window.exportFixture);
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
} finally { await browser.close(); }
