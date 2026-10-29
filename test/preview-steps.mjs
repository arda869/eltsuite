// What test/preview.mjs does, step by step: an audit of Design. Every drawer, button and setting, on a
// computer and on a phone, with every error written down.
import { writeFileSync } from 'node:fs';
export default async function steps({ p, ctx, say, BASE }) {
  const mk = await ctx.newPage();
  await mk.setViewportSize({ width: 900, height: 600 });
  await mk.setContent(`<body style="margin:0"><div style="width:900px;height:600px;background:#fff;position:relative"><div style="position:absolute;left:250px;top:100px;width:400px;height:400px;border-radius:50%;background:#3667a6"></div></div></body>`);
  writeFileSync('preview-out/ball.png', await mk.screenshot());
  await mk.close();

  let fails = 0;
  const step = async (name, f) => {
    try {
      await f();
      say('ok', name);
    } catch (e) {
      fails++;
      say('FAIL', name, '—', String(e.message).split('\n')[0].slice(0, 240));
    }
  };
  const [tab] = await Promise.all([ctx.waitForEvent('page'), (async () => { await p.goto(`${BASE}/design`); await p.getByRole('button', { name: 'New design' }).first().click(); })()]);
  tab.on('pageerror', (e) => say('CRASH', e.message.slice(0, 300)));
  tab.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::|DevTools/.test(m.text()) && say('CONSOLE', m.text().slice(0, 300)));
  tab.on('dialog', (d) => (say('DIALOG', d.message()), d.dismiss()));
  await tab.setViewportSize({ width: 1440, height: 900 });
  const s = async (n) => (await tab.screenshot({ path: `preview-out/${n}.png` }), say('shot', n));
  const asks = async () => {
    // A message from the app (tell/ask): note it, close it.
    const sc = tab.locator('.ask-scrim');
    if (await sc.count()) {
      say('MESSAGE', (await sc.innerText()).replace(/\s+/g, ' ').slice(0, 200));
      await tab.keyboard.press('Escape');
      await tab.waitForTimeout(200);
      if (await sc.count()) await sc.locator('button').last().click().catch(() => {});
    }
  };
  const rail = async (n) => {
    const b = tab.locator('.dz-railb', { hasText: n });
    if ((await b.getAttribute('aria-pressed')) !== 'true') await b.click();
    await tab.waitForTimeout(250);
  };
  const none = async () => (await tab.keyboard.press('Escape'), await tab.waitForTimeout(150));
  const els = () => tab.evaluate(() => document.querySelectorAll('.dz-layers li').length);
  await tab.locator('.dz-start').waitFor({ timeout: 30000 });
  await step('start: blank A4', async () => tab.locator('.dz-start-sizes button', { hasText: 'A4 worksheet' }).click());
  await tab.locator('.dz-paper canvas').waitFor({ timeout: 20000 });
  await tab.waitForTimeout(1500);
  await s('a01-blank');
  const paper = async () => tab.locator('.dz-paper').boundingBox();
  const at = async (x, y) => { const b = await paper(); const z = b.width / 794; return [b.x + x * z, b.y + y * z]; };

  // Every element in the Elements drawer.
  await rail('Elements');
  const tiles = await tab.locator('.dz-drawer .dz-tile, .dz-drawer .dz-list button').all();
  say('elements', tiles.length);
  for (let i = 0; i < tiles.length; i++) {
    const name = (await tiles[i].getAttribute('aria-label')) ?? (await tiles[i].innerText()).split('\n')[0];
    await step('element: ' + name, async () => {
      await tiles[i].click();
      await tab.waitForTimeout(150);
      await none();
      await asks();
    });
  }
  await s('a02-elements');
  // Text styles and phonemic symbols.
  await rail('Text');
  const ts = await tab.locator('.dz-textstyles button').all();
  for (const b of ts) await step('text style: ' + (await b.innerText({ timeout: 2000 }).catch(() => '?')), async () => (await b.click(), await tab.keyboard.type(' ok'), await none()));
  await step('ipa', async () => { for (const b of (await tab.locator('.dz-ipa button').all()).slice(0, 4)) await b.click(); });
  await s('a03-text');
  // People and things.
  await rail('People');
  await step('person', async () => { await tab.locator('.dz-chips button', { hasText: 'Leo' }).click(); await tab.locator('.dz-two select').first().selectOption({ index: 2 }); await tab.getByRole('button', { name: /^Add Leo/ }).click(); });
  await step('things', async () => { for (const b of (await tab.locator('.dz-drawer .dz-tile').all()).slice(0, 3)) await b.click(); });
  await tab.waitForTimeout(800);
  await s('a04-people');
  // Pictures: upload, files, free.
  await rail('Pictures');
  await step('upload picture', async () => { await none(); await tab.setInputFiles('.dz-drawer input[type=file]', 'preview-out/ball.png'); await tab.waitForTimeout(2500); await asks(); });
  await step('free pictures tab', async () => { await tab.getByRole('tab', { name: 'Free pictures' }).click(); await tab.getByRole('button', { name: 'Drawings' }).click(); });
  await step('your files tab', async () => tab.getByRole('tab', { name: 'Your files' }).click());
  await s('a05-pictures');
  // Teaching tools, every button.
  await rail('Teaching');
  const tb = await tab.locator('.dz-teach button:not([disabled])').count();
  for (let i = 0; i < tb; i++) {
    const b = tab.locator('.dz-teach button:not([disabled])').nth(i);
    const n = ((await b.innerText({ timeout: 2000 }).catch(() => '?')) || '?').split('\n')[0];
    if (n === '?') continue;
    await step('teach: ' + n, async () => {
      await b.click();
      await tab.waitForTimeout(200);
      await asks();
      if (/Add labels/.test(n)) {
        await tab.mouse.click(...(await at(300, 500)));
        await tab.keyboard.type('ball');
        await tab.keyboard.press('Enter');
      }
      if (/Stop|Take away/.test(n)) await tab.locator('.dz-toolnote button').click().catch(() => {});
      await none();
    });
  }
  await s('a06-teach');
  // Draw tools.
  await rail('Draw');
  for (const n of ['Pen', 'Marker', 'Highlighter']) {
    await step('draw: ' + n, async () => {
      await tab.locator('.dz-tool', { hasText: n }).click();
      const [x, y] = await at(100, 900 + ['Pen', 'Marker', 'Highlighter'].indexOf(n) * 40);
      await tab.mouse.move(x, y);
      await tab.mouse.down();
      await tab.mouse.move(x + 200, y + 10, { steps: 6 });
      await tab.mouse.up();
    });
  }
  await step('draw: rubber', async () => { await tab.locator('.dz-tool', { hasText: 'Rubber' }).click(); const [x, y] = await at(150, 900); await tab.mouse.click(x, y + 3); });
  await step('draw: done', async () => tab.locator('.dz-toolnote button').click());
  await s('a07-draw');
  // Layers: hide, lock, rename, drag.
  await rail('Layers');
  const n0 = await els();
  say('things on the page', n0);
  await step('layer hide', async () => tab.locator('.dz-layers li').first().getByRole('button', { name: 'Hide' }).click());
  await step('layer lock', async () => tab.locator('.dz-layers li').nth(1).getByRole('button', { name: 'Lock' }).click());
  await step('layer rename', async () => { await tab.locator('.dz-layers .dz-lname').nth(2).dblclick(); await tab.keyboard.type('Renamed'); await tab.keyboard.press('Enter'); });
  await step('layer select', async () => tab.locator('.dz-layers .dz-lname').nth(3).click());
  await s('a08-layers');
  // Each kind selected: its settings, every control touched.
  const kinds = ['Picture', 'Text', 'Shape', 'Drawing', 'Person', 'Label', 'Cover', 'Word bank', 'QR code', 'Writing lines', 'Empty frame'];
  for (const k of kinds) {
    await step('props: ' + k, async () => {
      await rail('Layers');
      const li = tab.locator('.dz-layers li').filter({ has: tab.locator(`.dz-lk`) }).filter({ hasText: k === 'Person' ? 'Leo' : '' });
      let target = null;
      for (const l of await tab.locator('.dz-layers li').all()) {
        const t = await l.innerText();
        const kind = await l.locator('.dz-lk').getAttribute('class');
        if (k === 'Person' ? t.includes('Leo') : k === 'Picture' ? kind.includes('t-image') && !t.includes('Empty') : k === 'Empty frame' ? t.includes('Empty frame') : k === 'Shape' ? kind.includes('t-shape') : k === 'Text' ? kind.includes('t-text') : t.includes(k)) { target = l; break; }
      }
      if (!target) throw new Error('no ' + k + ' on the page');
      await target.locator('.dz-lname').click();
      await tab.waitForTimeout(200);
      await tab.screenshot({ path: `preview-out/p-${k.replace(/\s/g, '')}.png` });
      // Every slider, segment, checkbox and colour button in the settings.
      const props = tab.locator('.dz-props');
      for (const r of await props.locator('input[type=range]').all()) await r.fill(String(Math.round((Number(await r.getAttribute('min')) + Number(await r.getAttribute('max'))) / 3)));
      for (const b of await props.locator('.dz-seg button').all()) await b.click();
      for (const c of await props.locator('input[type=checkbox]').all()) await c.click();
      const cols = await props.locator('.dz-col-b').all();
      for (const c of cols.slice(0, 2)) { await c.click(); await props.locator('.dz-col-pop .dz-sw button').nth(3).click(); await c.click(); }
      for (const n of await props.locator('.dz-num input').all()) { await n.fill(String(Number(await n.inputValue()) + 5)); await n.press('Enter'); }
      const font = props.locator('.dz-font');
      if (await font.count()) { await font.first().click(); await tab.locator('[role=menuitem]', { hasText: 'Andika' }).first().click(); }
      for (const f of await props.locator('.dz-flips button, .dz-btns button').all()) await f.click();
      await tab.waitForTimeout(300);
      await asks();
    });
  }
  await s('a09-after-props');
  // Arrange: every align button, order menu, duplicate, lock, delete from the floating bar.
  await step('align all', async () => { await tab.keyboard.press('Control+a'); for (const b of await tab.locator('.dz-align button').all()) await b.click(); });
  await s('a10-aligned');
  await step('undo many', async () => { for (let i = 0; i < 12; i++) await tab.keyboard.press('Control+z'); });
  await step('redo some', async () => { for (let i = 0; i < 4; i++) await tab.keyboard.press('Control+Shift+z'); });
  await step('float bar', async () => {
    await none();
    await rail('Layers');
    await tab.locator('.dz-layers .dz-lname').first().click();
    const bar = tab.locator('.dz-float');
    await bar.getByRole('button', { name: 'Duplicate' }).click();
    await bar.getByRole('button', { name: 'Order' }).click();
    await tab.locator('[role=menuitem]', { hasText: 'Send to back' }).click();
    await bar.getByRole('button', { name: 'Lock' }).click();
    await bar.getByRole('button', { name: 'Unlock' }).click();
    await bar.getByRole('button', { name: 'Delete' }).click();
  });
  await step('keys', async () => {
    await tab.locator('.dz-layers .dz-lname').first().click();
    for (const k of ['ArrowRight', 'Shift+ArrowDown', ']', '[', 'Control+d', 'Delete', 'Control+c', 'Control+v', 'Control+0', 'Control+=', 'Control+-']) await tab.keyboard.press(k);
  });
  await step('zoom buttons', async () => { await tab.getByRole('button', { name: 'Zoom in' }).click(); await tab.getByRole('button', { name: 'Zoom out' }).click(); await tab.locator('.dz-zv').click(); });
  // Pages: add, duplicate, spot the difference, move, delete; templates added after.
  await step('page add', async () => tab.getByRole('button', { name: 'Add a page' }).click());
  await step('page menu: every item', async () => {
    for (const n of ['Duplicate the page', 'Make a spot-the-difference copy', 'Move up', 'Move down']) {
      await tab.locator('.dz-pg.on .dz-pg-more').click();
      await tab.locator('[role=menuitem]', { hasText: n }).click();
      await tab.waitForTimeout(500);
    }
    await tab.locator('.dz-pg.on .dz-pg-more').click();
    await tab.locator('[role=menuitem]', { hasText: 'Delete the page' }).click();
    await tab.waitForTimeout(300);
    await tab.locator('.ask-scrim button', { hasText: 'Delete the page' }).click();
  });
  say('pages', await tab.locator('.dz-pg:not(.add)').count());
  await rail('Templates');
  for (const t of await tab.locator('.dz-tpl').all()) await step('template: ' + (await t.locator('strong').innerText({ timeout: 2000 }).catch(() => '?')), async () => (await t.click(), await tab.waitForTimeout(400)));
  await step('blank sizes', async () => { for (const b of (await tab.locator('.dz-sizes button').all()).slice(5)) await b.click(); });
  say('pages', await tab.locator('.dz-pg:not(.add)').count());
  await s('a11-many-pages');
  // The page settings.
  await step('page props', async () => {
    await none();
    await tab.mouse.click(10, 500);
    const props = tab.locator('.dz-props');
    await props.locator('select').selectOption({ index: 3 });
    await props.locator('.dz-col-b').first().click();
    await props.locator('.dz-col-pop .dz-sw button').nth(14).click();
    await props.locator('.dz-sec-h', { hasText: 'Shortcuts' }).click();
  });
  await s('a12-page-props');
  // Learner views.
  for (const v of ['Learner A', 'Learner B', 'Everything']) await step('view ' + v, async () => tab.getByRole('radio', { name: v, exact: true }).click());
  await step('learners copy', async () => { await tab.getByRole('checkbox', { name: /Learners’ copy/ }).check(); await tab.getByRole('checkbox', { name: /Learners’ copy/ }).uncheck(); });
  // Every download.
  for (const n of ['Picture (PNG)', 'Picture (JPG)', 'PDF', 'Save as a picture in Files']) {
    await step('download ' + n, async () => {
      await tab.getByRole('button', { name: 'Download' }).click();
      const item = tab.getByRole('menuitem', { name: new RegExp('^' + n.replace(/[()]/g, '\\$&')) });
      if (n.startsWith('Save')) { await item.click(); await tab.waitForTimeout(3000); await asks(); return; }
      const [dl] = await Promise.all([tab.waitForEvent('download', { timeout: 60000 }), item.click()]);
      say('  file', dl.suggestedFilename());
    });
  }
  await step('download cards', async () => {
    await tab.getByRole('button', { name: 'Download' }).click();
    await tab.getByRole('menuitem', { name: /Cut into cards/ }).click();
    const [dl] = await Promise.all([tab.waitForEvent('download', { timeout: 60000 }), tab.getByRole('button', { name: 'Download the cards' }).click()]);
    say('  file', dl.suggestedFilename());
  });
  say('FAILS on a computer', fails);

  // ------------------------------------------------------------------ a phone
  fails = 0;
  await tab.setViewportSize({ width: 390, height: 844 });
  await tab.waitForTimeout(1200);
  await s('m01-phone');
  for (const n of ['Elements', 'Text', 'Pictures', 'Teaching', 'Layers']) {
    await step('phone drawer ' + n, async () => {
      const b = tab.locator('.dz-railb', { hasText: n });
      await b.click({ timeout: 4000 });
      await tab.waitForTimeout(400);
      await tab.screenshot({ path: `preview-out/m-${n}.png` });
    });
  }
  await step('phone: add text and see its settings', async () => {
    await tab.locator('.dz-railb', { hasText: 'Text' }).click();
    await tab.locator('.dz-textstyles button').first().click({ timeout: 4000 });
    await tab.waitForTimeout(500);
    await tab.screenshot({ path: 'preview-out/m-selected.png' });
  });
  say('FAILS on a phone', fails);
}
