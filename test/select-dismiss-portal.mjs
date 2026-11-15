import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const fixture = `
  import React, { useState } from 'react';
  import { createRoot } from 'react-dom/client';
  import { NSelect } from './src/components/Select.tsx';
  import { useDismiss } from './src/lib/useDismiss.ts';

  function Settings() {
    const [open, setOpen] = useState(false);
    const [after, setAfter] = useState(60);
    const ref = useDismiss(open, () => setOpen(false));
    return <>
      <span ref={ref} className="msg-set">
        <button onClick={() => setOpen(!open)}>Message settings</button>
        {open && <span className="menu msg-set-menu" role="menu">
          <label className="field">When they stay unread for
            <NSelect aria-label="When they stay unread for" value={after} onChange={event => setAfter(Number(event.target.value))}>
              <option value={15}>15 minutes</option>
              <option value={60}>1 hour</option>
              <option value={240}>4 hours</option>
            </NSelect>
          </label>
        </span>}
      </span>
      <button id="outside">Outside</button>
    </>;
  }
  createRoot(document.getElementById('root')).render(<Settings />);
`;

test('a portaled Select choice remains clickable inside a dismissable phone menu', async () => {
  const bundle = await build({
    stdin: { contents: fixture, sourcefile: 'select-dismiss-fixture.tsx', resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 320, height: 720 }, colorScheme: 'dark' });
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Message settings' }).click();
    const menu = page.getByRole('menu');
    const delay = page.getByRole('button', { name: 'When they stay unread for' });
    await delay.click();
    await page.getByRole('option', { name: '15 minutes' }).click();
    assert.equal(await delay.innerText(), '15 minutes');
    assert.equal(await menu.isVisible(), true, 'the parent menu must remain open after choosing');
    await page.locator('#outside').click();
    assert.equal(await menu.count(), 0, 'clicking outside still dismisses the menu');
  } finally {
    await browser.close();
  }
});
