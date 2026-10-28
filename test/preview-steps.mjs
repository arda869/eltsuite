// What test/preview.mjs does, step by step: a teacher working on a lesson in Worksheet view.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  const scroller = async () =>
    p.evaluate(() => {
      let el = document.querySelector('.sh-paper');
      while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
      return el ? el.className : 'window';
    });
  const blocks = async (tag) =>
    say(tag, JSON.stringify(await p.$$eval('.sh-block', (bs) => bs.map((b) => ({ id: b.dataset.b, on: b.classList.contains('on'), top: Math.round(b.offsetTop), h: b.offsetHeight, mt: b.style.marginTop })))));
  const pageShots = async (name) => {
    // the whole worksheet, a screen at a time, by scrolling its scroller
    const total = await p.evaluate(() => document.querySelector('.sh-paper')?.offsetHeight ?? 0);
    for (let y = 0, k = 0; y < total && k < 6; y += 760, k++) {
      await p.evaluate((y) => {
        let el = document.querySelector('.sh-paper');
        while (el && !(el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
        (el ?? document.scrollingElement).scrollTop = y;
      }, y);
      await wait(250);
      await shot(`${name}-${k}`);
    }
  };
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.locator('.ProseMirror').first().waitFor({ timeout: 20000 });
  await wait(800);
  await shot('digital');

  await p.getByRole('radio', { name: 'Worksheet' }).click();
  await p.locator('.sh-desk').waitFor({ timeout: 10000 });
  await wait(2000);
  say('scroller', await scroller());
  await blocks('blocks at start');
  await pageShots('start');

  // Click the third task on the page, by its own position (no automatic scrolling)
  const picks = p.locator('.sh-block.pick');
  say('pickable', await picks.count());
  await p.evaluate(() => (document.querySelector('.sh-paper').parentElement.parentElement.scrollTop = 0));
  const target = picks.nth(2);
  await target.scrollIntoViewIfNeeded();
  await wait(300);
  const box = await target.boundingBox();
  say('clicking at', Math.round(box.x + 40), Math.round(box.y + 20));
  await shot('before-click');
  await p.mouse.click(box.x + 40, box.y + 20);
  await wait(250);
  await shot('click-250ms');
  await wait(2000);
  await shot('click-2s');
  await blocks('blocks after click');

  const ed = p.locator('.sh-edit .ProseMirror').first();
  if (await ed.count()) {
    await ed.click();
    await p.keyboard.press('Control+End');
    await p.keyboard.press('Enter');
    await p.keyboard.type('She has lived here for ten years.', { delay: 15 });
    await wait(300);
    await shot('typing');
    await p.keyboard.type('/gap', { delay: 40 });
    await wait(900);
    await shot('slash-menu');
    await p.keyboard.press('Escape');
    await wait(2500);
    await shot('typed-2s');
  } else say('NO EDITOR on the page');

  // Over to another task and back
  const other = p.locator('.sh-block.pick').first();
  await other.scrollIntoViewIfNeeded();
  const ob = await other.boundingBox();
  await p.mouse.click(ob.x + 40, ob.y + 20);
  await wait(300);
  await shot('switch-300ms');
  await wait(2000);
  await shot('switch-2s');
  await blocks('blocks after switch');

  await p.setViewportSize({ width: 1280, height: 800 });
  await wait(800);
  await shot('laptop-1280');

  const btn = p.getByRole('button', { name: 'Print or PDF' });
  if (await btn.count()) {
    await btn.click();
    await wait(2500);
    await shot('print-dialog');
    await p.getByRole('button', { name: 'PDF', exact: true }).click();
    await wait(12000);
    await shot('pdf-preview');
  }
}
