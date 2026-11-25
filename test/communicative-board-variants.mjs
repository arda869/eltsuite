import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.BASE_URL ?? 'http://localhost:5197';
const browser = await chromium.launch({headless: true, ...(process.platform === 'darwin' ? {channel: 'chrome'} : {})});
mkdirSync('outputs/communicative', {recursive: true});
try {
  const source = await browser.newPage();
  await source.goto(base + '/dev.html?seed&as=teacher');
  await source.waitForFunction(async () => {
    if (!window.__mockReady) return false;
    await window.__mockReady;
    return !!localStorage.getItem('mockdemo');
  }, null, {timeout: 180000});
  for (const style of ['snake', 'spiral', 'ladders']) {
    for (const mono of [false, true]) {
      const html = await source.evaluate(async ({style, mono}) => {
        const {communicativeFixture} = await import('/test/communicative-fixtures.ts');
        const {flattenTask} = await import('/src/lib/worksheet.ts');
        const {worksheetHtml} = await import('/src/lib/worksheetHtml.ts');
        const node = communicativeFixture('board');
        node.attrs.settings = {...node.attrs.settings, boardStyle: style};
        if (style === 'ladders') {
          const originals = node.content;
          node.content = Array.from({length: 24}, (_, index) => {
            const item = structuredClone(originals[index % originals.length]);
            item.attrs.activityItemId = `preview-${index}`;
            item.attrs.special = index === 0 ? 'start' : index === 23 ? 'finish' : null;
            item.attrs.title = index === 0 ? 'Start' : index === 23 ? 'Finish' : `Describe place ${index}`;
            return item;
          });
        }
        return worksheetHtml('Synthetic communicative activity checks', [{kind: 'task', task: flattenTask({
          title: 'Describe places', instructions: 'Play with a partner.', content: {type: 'doc', content: [node]},
        })}], {header: true, key: false, paper: 'A4', columns: 1, mono, accent: '#5b8881', className: 'Synthetic test class', level: 'B1'});
      }, {style, mono});
      const page = await browser.newPage();
      await page.setContent(html, {waitUntil: 'domcontentloaded'});
      await page.waitForFunction(() => window.__laidOut, {timeout: 30000});
      const board = page.locator('.page .pa-board');
      if (await board.count() !== 1) throw new Error(`Expected one ${style} board`);
      const filename = `outputs/communicative/board-${style}-${mono ? 'bw' : 'colour'}.png`;
      await page.locator('.page').first().screenshot({path: filename});
      console.log(filename);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
