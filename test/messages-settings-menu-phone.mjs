import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const css = (await Promise.all(
  ['styles.css', 'friday-ui.css', 'cohesion.css', 'visual-system.css', 'ui-polish.css']
    .map(name => readFile(new URL(`../src/${name}`, import.meta.url), 'utf8')),
)).join('\n');

test('Messages settings menu stays inside narrow phone viewports', async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 720 } });
      await page.setContent(`
        <div class="msg">
          <aside class="msg-side">
            <div class="msg-side-top">
              <h1 class="sr-only">Messages</h1>
              <span style="display:flex;gap:6px">
                <span class="msg-set">
                  <button type="button" class="cd-icon" aria-label="Message settings">Settings</button>
                  <span class="menu msg-set-menu" role="menu">
                    <label class="switch-row"><span>Email me about unread messages</span><input type="checkbox"></label>
                  </span>
                </span>
                <button type="button" class="btn small-btn">+ Group</button>
                <button type="button" class="btn primary small-btn">+ New</button>
              </span>
            </div>
          </aside>
        </div>`);
      await page.addStyleTag({ content: css });
      const bounds = await page.locator('.msg-set-menu').boundingBox();
      assert.ok(bounds, `menu visible at ${width}px`);
      assert.ok(bounds.x >= 0, `menu left edge at ${width}px: ${bounds.x}`);
      assert.ok(bounds.x + bounds.width <= width, `menu right edge at ${width}px: ${bounds.x + bounds.width}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
