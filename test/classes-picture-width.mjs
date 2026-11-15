import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const picture = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600"><rect width="1200" height="600" fill="#73adae"/></svg>')}`;

test('resized Classes pictures fill their selected frame at laptop and phone widths', async () => {
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
  try {
    for (const viewportWidth of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width: viewportWidth, height: 900 } });
      await page.setContent(`<div class="doc"><div class="ProseMirror" style="width:min(100%,1100px)">
        <p><span class="pic-node"><span class="pic pic-full"><img src="${picture}" alt="Full map"></span></span></p>
        <p><span class="pic-node"><span class="pic pic-w" style="width:650px"><img src="${picture}" alt="Resized map"></span></span></p>
        <p><img src="${picture}" alt="Loose image"></p>
      </div></div>`);
      await page.addStyleTag({ content: css });
      await page.locator('img').first().evaluate(image => image.decode());
      const widths = await page.evaluate(() => {
        const frame = (alt) => document.querySelector(`img[alt="${alt}"]`).closest('.pic').getBoundingClientRect().width;
        const image = (alt) => document.querySelector(`img[alt="${alt}"]`).getBoundingClientRect().width;
        return { fullFrame: frame('Full map'), fullImage: image('Full map'), resizedFrame: frame('Resized map'), resizedImage: image('Resized map'), looseImage: image('Loose image') };
      });
      assert.ok(widths.fullFrame > 0 && widths.resizedFrame > 0, `frames should render at ${viewportWidth}px`);
      assert.ok(Math.abs(widths.fullImage - widths.fullFrame) < 1, `full-width map should fill its frame at ${viewportWidth}px: ${JSON.stringify(widths)}`);
      assert.ok(Math.abs(widths.resizedImage - widths.resizedFrame) < 1, `custom-width map should fill its frame at ${viewportWidth}px: ${JSON.stringify(widths)}`);
      assert.ok(widths.looseImage <= 420, `loose images should retain the original size limit at ${viewportWidth}px`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
