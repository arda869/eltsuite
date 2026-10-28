// What test/preview.mjs does, step by step: a teacher working on a lesson in Worksheet view.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.locator('.ProseMirror').first().waitFor({ timeout: 20000 });
  await wait(800);
  await shot('digital');

  // 1. Worksheet view
  await p.getByRole('radio', { name: 'Worksheet' }).click();
  await p.locator('.sh-desk').waitFor({ timeout: 10000 });
  await wait(1500);
  await shot('worksheet');
  await shot('worksheet-page', p.locator('.sh-paper'));
  say('blocks', await p.locator('.sh-block').count(), 'pages', await p.locator('.sh-sheet').count());

  // 2. Click the second task on the page
  const picks = p.locator('.sh-block.pick');
  say('pickable', await picks.count());
  if ((await picks.count()) > 1) {
    const before = await picks.nth(1).boundingBox();
    await picks.nth(1).click();
    await wait(300);
    await shot('after-click-300ms');
    await wait(1500);
    const after = await p.locator('.sh-block.on').first().boundingBox();
    say('clicked block moved from y', Math.round(before?.y ?? -1), 'to', Math.round(after?.y ?? -1));
    await shot('after-click');
  }

  // 3. Type in the task being edited
  const ed = p.locator('.sh-edit .ProseMirror').first();
  if (await ed.count()) {
    await ed.click();
    await p.keyboard.press('End');
    await p.keyboard.type(' I have lived here for ten years.', { delay: 15 });
    await wait(400);
    await shot('typing');
    await wait(2500);
    await shot('typed-after-save');
  } else say('no editor on the page');

  // 4. Click back to the first task: what happens to the text just typed
  if ((await picks.count()) > 0) {
    await p.locator('.sh-block.pick').first().click();
    await wait(400);
    await shot('back-to-first-400ms');
    await wait(2000);
    await shot('back-to-first');
  }

  // 5. Add a task
  const add = p.locator('.sh-add');
  if (await add.count()) {
    await add.click();
    await wait(2000);
    await shot('added-task');
  }

  // 6. Narrower window (a laptop with the task list open)
  await p.setViewportSize({ width: 1280, height: 800 });
  await wait(800);
  await shot('laptop-1280');

  // 7. Print or PDF
  const btn = p.getByRole('button', { name: 'Print or PDF' });
  if (await btn.count()) {
    await btn.click();
    await wait(2500);
    await shot('print-dialog');
    const [win] = await Promise.all([ctx.waitForEvent('page', { timeout: 15000 }).catch(() => null), p.getByRole('button', { name: 'Print', exact: true }).click()]);
    if (win) {
      await win.waitForTimeout(4000);
      await win.setViewportSize({ width: 1000, height: 1200 });
      await win.screenshot({ path: 'preview-out/90-print-window.png', fullPage: false });
      say('shot print window');
      await win.close();
    }
    await p.getByRole('button', { name: 'PDF', exact: true }).click();
    await wait(9000);
    await shot('pdf-preview');
  }
}
