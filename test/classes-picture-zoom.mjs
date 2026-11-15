import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { chromium } from 'playwright';

const port = 5394;
const base = `http://127.0.0.1:${port}`;
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="white"/><path d="M40 110h1120M40 700h1120" stroke="#344" stroke-width="4"/><text x="60" y="80" font-family="Arial" font-size="48">Map of the park</text><text x="60" y="660" font-family="Arial" font-size="32">Legend: A · café  B · bridge  C · river</text></svg>')}`;

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    if (await fetch(base).then(response => response.ok, () => false)) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('The picture test page did not start');
}

test('Classes pictures open at a readable size without widening the phone page', async () => {
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--config', 'test/vite.config.ts', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' });
  let browser;
  try {
    await waitForServer();
    browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
    for (const width of [390, 1280]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}/test/lesson-style-check.html`);
      await page.waitForFunction(() => typeof window.setFixture === 'function');
      await page.evaluate(src => window.setFixture({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'picture', attrs: { src, alt: 'Map of the park', size: 'full', w: 560 } }] }] }), image);
      const opener = page.getByRole('button', { name: 'View Map of the park larger' });
      await opener.waitFor();
      assert.equal(await page.locator('.pic-enlarge-cue').count(), 1, 'the picture has a visible enlargement cue');
      await opener.click();
      const dialog = page.getByRole('dialog', { name: 'Enlarged picture: Map of the park' });
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('img', { name: 'Map of the park' }).count(), 1);
      assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
      assert.equal(await dialog.getByLabel('Close enlarged picture').evaluate(element => element === document.activeElement), true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await dialog.locator('.picture-viewer-stage').evaluate(element => element === document.activeElement), true, 'focus stays inside the viewer');
      await page.keyboard.press('Tab');
      assert.equal(await dialog.getByLabel('Close enlarged picture').evaluate(element => element === document.activeElement), true);
      assert.equal((await dialog.locator('.picture-viewer-percent').innerText()).trim(), width === 390 ? '300%' : '100%');
      if (width === 390) {
        const dimensions = await dialog.locator('.picture-viewer-stage').evaluate(element => ({ scroll: element.scrollWidth, frame: element.clientWidth }));
        assert.ok(dimensions.scroll > dimensions.frame * 2, `the image must enlarge inside its own scroll area: ${JSON.stringify(dimensions)}`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'the overall page must not scroll sideways');
        await dialog.getByRole('button', { name: 'Fit picture' }).click();
        assert.equal((await dialog.locator('.picture-viewer-percent').innerText()).trim(), '100%');
        await dialog.getByRole('button', { name: 'Zoom in' }).click();
        assert.equal((await dialog.locator('.picture-viewer-percent').innerText()).trim(), '150%');
      } else {
        await dialog.getByRole('button', { name: 'Zoom in' }).click();
        assert.equal((await dialog.locator('.picture-viewer-percent').innerText()).trim(), '150%');
      }
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0, 'Escape closes the viewer');
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'View Map of the park larger');
      await opener.press('Enter');
      await dialog.waitFor();
      await dialog.getByRole('button', { name: 'Close enlarged picture' }).click();
      assert.equal(await dialog.count(), 0, 'the Close button works');
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; window.setTestTeacher(false); });
      await opener.click();
      await dialog.waitFor();
      assert.equal(await dialog.getByRole('img', { name: 'Map of the park' }).count(), 1, 'the learner also sees the enlarged map');
      assert.ok(await dialog.evaluate(element => getComputedStyle(element).backgroundColor !== 'rgb(255, 255, 255)'), 'viewer follows dark mode');
      await dialog.getByRole('button', { name: 'Close enlarged picture' }).click();
      assert.equal(await dialog.count(), 0);
      await page.evaluate(src => window.setFixture({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'picture', attrs: { src, alt: 'Hidden park map', size: 'full', w: 560, cover: 'tap', pid: 'hidden-map' } }] }] }), image);
      await page.locator('.pic.has-cover').waitFor();
      assert.equal(await page.getByRole('button', { name: 'View Hidden park map larger' }).count(), 0, 'covered pictures cannot bypass the cover through the viewer');
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    server.kill();
  }
});
