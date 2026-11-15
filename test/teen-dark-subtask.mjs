import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/lessons/themeLayers.css', import.meta.url), 'utf8');

test('Teenagers sub-task instructions stay readable in dark mode at laptop and phone widths', async () => {
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1 });
      await page.setContent(`<!doctype html><html data-theme="dark"><body>
        <main class="task-frame" data-lesson-style="teen" style="max-width:100%;padding:16px">
          <div class="frame-head"><h1 class="task-title">What does the guest order?</h1></div>
          <div class="frame-body"><div class="task-body"><section class="subtask">
            <div class="st-band"><b class="st-l">a</b><p class="task-instr">Listen to the conversation. Choose the best summary.</p></div>
            <p>What happens in the conversation?</p>
          </section></div></div>
        </main></body></html>`);
      await page.addStyleTag({ content: styles });
      await page.addStyleTag({ content: theme });
      await page.addScriptTag({ content: readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8') });

      const band = await page.locator('.st-band').evaluate((el) => {
        const bandStyle = getComputedStyle(el);
        const instruction = getComputedStyle(el.querySelector('.task-instr'));
        return { background: bandStyle.backgroundImage, text: instruction.color, scrollWidth: document.documentElement.scrollWidth };
      });
      assert.match(band.background, /rgb\(243, 239, 230\)/, `${width}px instruction band should start with warm paper`);
      assert.equal(band.text, 'rgb(93, 88, 82)', `${width}px instruction text should retain the Teenagers ink colour`);
      assert.ok(band.scrollWidth <= width, `${width}px task should fit the viewport`);
      const accessibility = await page.evaluate(async () => {
        const result = await window.axe.run(document.querySelector('.task-frame'), { runOnly: ['color-contrast'] });
        return result.violations.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) }));
      });
      assert.deepEqual(accessibility, [], `${width}px task should have no colour-contrast violations`);
      if (process.env.TEEN_DARK_SCREENSHOTS_DIR) {
        await page.locator('.task-frame').screenshot({ path: `${process.env.TEEN_DARK_SCREENSHOTS_DIR}/teen-dark-subtask-${width}.png` });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
