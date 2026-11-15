import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { createServer } from 'vite';

test('Designer Download menu supports arrows, Escape and natural Tab order', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  // Keep the keyboard check isolated from sign-in and file-export services.
  const stubs = {
    '../lib/firebase': 'export const auth = { currentUser: null };',
    '../lib/ask': 'export const tell = async () => {};',
    '../editor/PackNode': 'export const uploadPicture = async () => {};',
    './tools': 'export const downloadImage = async () => {}; export const downloadPdf = async () => {}; export const pageBlob = async () => new Blob();',
  };
  const server = await createServer({
    root, configFile: false, logLevel: 'error', server: { host: '127.0.0.1', port: 0 },
    optimizeDeps: { noDiscovery: true, include: ['react', 'react-dom/client', 'react/jsx-dev-runtime'] },
    plugins: [{
      name: 'stub-download-services',
      enforce: 'pre',
      resolveId(source, importer) {
        if (importer?.endsWith('/src/design/Download.tsx') && source in stubs) return `\0download-stub:${source}`;
      },
      load(id) { if (id.startsWith('\0download-stub:')) return stubs[id.slice('\0download-stub:'.length)]; },
    }],
  });
  await server.listen();
  const browser = await chromium.launch({ headless: true });
  try {
    const url = server.resolvedUrls.local[0] + 'test/fixtures/designer-download-menu.html';
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(url);
    const trigger = page.locator('.dz-dl');
    const options = page.locator('.dz-dl-pop [role="menuitem"]');
    await page.waitForTimeout(1000);
    assert.ok(await trigger.count(), `Designer test component mounted: ${errors.join(' | ')}`);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await options.first().waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
    assert.equal(await options.count(), 3);
    assert.equal(await options.first().evaluate(e => e === document.activeElement), true);

    await page.keyboard.press('ArrowDown');
    assert.equal(await options.nth(1).evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('ArrowUp');
    assert.equal(await options.first().evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('End');
    assert.equal(await options.last().evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Home');
    assert.equal(await options.first().evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Escape');
    assert.equal(await options.count(), 0);
    assert.equal(await trigger.evaluate(e => e === document.activeElement), true);

    await page.keyboard.press('Enter');
    await options.first().waitFor();
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'menuitem');
    await page.keyboard.press('Tab');
    assert.equal(await options.nth(1).evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await options.first().evaluate(e => e === document.activeElement), true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await trigger.evaluate(e => e === document.activeElement), true);
    assert.equal(await options.count(), 0);
    await page.keyboard.press('Enter');
    await options.first().waitFor();
    await options.last().focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#after-download').evaluate(e => e === document.activeElement), true);
    assert.equal(await options.count(), 0);
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser.close();
    await server.close();
  }
});
