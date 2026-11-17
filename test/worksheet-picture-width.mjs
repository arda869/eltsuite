import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { unzipSync, strFromU8 } from 'fflate';

const port = 5299;
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
let browser;
try {
  for (let i = 0; i < 80; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${base}/test/worksheet-picture-width.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('main[data-ready="true"]').waitFor({ timeout: 30000 });
  const results = await page.evaluate(async () => {
    const { flattenTask, lessonDocx } = await import('/src/lib/worksheet.ts');
    const { inlineWorksheetHtml } = await import('/src/lib/worksheetHtml.ts');
    const src = 'media:designer-map-or-chart';
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zt0cAAAAASUVORK5CYII=';
    const check = async (width, size, columns, imageHeight = 800, paper = 'A4') => {
      const media = { [src]: { data: png, w: 1200, h: imageHeight } };
      // Designer's rasterised map/chart enters Classes as an ordinary picture node.
      const task = flattenTask({ title: 'Designer figure', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'picture', attrs: { src, alt: 'Designer map or chart', size, w: width } }] }] } });
      const picture = task.blocks.flatMap((block) => block.kind === 'p' ? block.runs : []).find((run) => run.pic)?.pic;
      const html = inlineWorksheetHtml(task, media);
      const word = await lessonDocx('Figure worksheet', [{ kind: 'task', task }], { header: false, key: width === 450, columns, paper, media });
      return { width: picture?.w ?? null, html, wordBytes: Array.from(new Uint8Array(await word.arrayBuffer())) };
    };
    return { map: await check(450, 'm', 1), chart: await check(600, 'm', 1), columns: await check(600, 'm', 2), preset: await check(0, 'm', 1), tall: await check(900, 'full', 1, 1800, 'Letter') };
  });
  const wordXml = (result) => strFromU8(unzipSync(Uint8Array.from(result.wordBytes))['word/document.xml']);
  const wordWidth = (result) => {
    const xml = wordXml(result);
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml);
    return extent ? Math.round(Number(extent[1]) / 9525) : null;
  };
  const wordHeight = (result) => {
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(wordXml(result));
    return extent ? Math.round(Number(extent[2]) / 9525) : null;
  };
  assert.equal(results.map.width, 450, 'The teacher’s dragged width must reach the worksheet model');
  assert.match(results.map.html, /class="ws-picture pic-m" style="width:min\(100%,69mm\)"/, 'A map dragged to 450 px should print at the corresponding width');
  assert.equal(wordWidth(results.map), 300, 'Word keeps the 450 px map at the matching print size');
  assert.doesNotMatch(wordXml(results.map), /Answer key|FOR THE TEACHER/, 'A visual-only task should not add an empty teacher page when answer key is selected');
  assert.match(results.chart.html, /style="width:min\(100%,92mm\)"/, 'A chart dragged to 600 px should retain its print width');
  assert.equal(wordWidth(results.chart), 400, 'Word keeps the 600 px chart at the matching print size');
  assert.equal(wordWidth(results.columns), 300, 'A wide picture must fit a two-column Word worksheet');
  assert.equal(results.preset.width, null, 'Preset pictures have no custom width');
  assert.doesNotMatch(results.preset.html, /style="width:min\(/, 'Unresized pictures keep the original print preset');
  assert.equal(wordWidth(results.preset), 200, 'Unresized pictures keep the original Word preset');
  assert.equal(wordWidth(results.tall), 480, 'A tall Letter map shrinks proportionally to fit below the worksheet heading');
  assert.equal(wordHeight(results.tall), 720, 'A tall Letter map leaves space for its heading on the first page');
  console.log('PASS: Designer map/chart custom width reaches worksheet HTML and Word; presets and two-column fit remain intact');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}
