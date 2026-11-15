import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { Select } from './src/components/Select.tsx';
      function Probe() {
        const [value, setValue] = useState('one');
        const options = Array.from({ length: 10 }, (_, i) => ({ v: String(i + 1), label: 'Choice ' + (i + 1) }));
        return <><button id="before">Before</button><Select label="Choice" value={value} options={window.longList ? options : options.slice(0, 3)} onChange={setValue} /><button id="after">After</button></>;
      }
      createRoot(document.getElementById('root')).render(<Probe />);
    `,
    loader: 'tsx',
    sourcefile: 'select-portal-probe.tsx',
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  write: false,
});
const script = fixture.outputFiles[0].text;
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('single-select Tab moves beside its trigger, not through its portal', async () => {
  const browser = await chromium.launch({ executablePath: process.env.SMOKE_BROWSER_PATH || undefined });
  try {
    for (const width of [1280, 390]) {
      for (const longList of [false, true]) {
        const page = await browser.newPage({ viewport: { width, height: 700 } });
        await page.setContent(`<html data-theme="dark"><body><dialog open><div id="root"></div></dialog></body></html>`);
        await page.addStyleTag({ content: styles });
        await page.addScriptTag({ content: `window.longList = ${longList};\n${script}` });
        await page.locator('.sel').click();
        if (!longList) await page.keyboard.press('ArrowDown');
        else await page.locator('.sel-q').fill('Choice');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'after', `${width}px ${longList ? 'searchable' : 'short'} menu forward Tab`);
        assert.equal(await page.locator('.sel-list').count(), 0);

        await page.locator('.sel').click();
        if (!longList) await page.keyboard.press('ArrowDown');
        else await page.locator('.sel-q').fill('Choice');
        await page.keyboard.press('Shift+Tab');
        assert.equal(await page.evaluate(() => document.activeElement?.id), 'before', `${width}px ${longList ? 'searchable' : 'short'} menu backward Tab`);
        assert.equal(await page.locator('.sel-list').count(), 0);
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
