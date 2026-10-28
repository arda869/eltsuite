// What test/preview.mjs does, step by step: a teacher working on a lesson in Worksheet view.
export default async function steps({ p, shot, say, demo, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.locator('.ProseMirror').first().waitFor({ timeout: 20000 });
  await wait(800);
  await p.getByRole('radio', { name: 'Worksheet' }).click();
  await p.locator('.sh-split').waitFor({ timeout: 10000 });
  await wait(2000);
  await shot('split-fit-width');
  await p.getByRole('radio', { name: 'Whole page' }).click();
  await wait(800);
  await shot('split-whole-page');
  await p.getByRole('radio', { name: 'Fit width' }).click();
  await wait(500);

  // click a task on the page
  const picks = p.locator('.sh-block.pick');
  say('pickable', await picks.count());
  await picks.nth(3).click();
  await wait(1800);
  await shot('clicked-task');

  // type in the editor on the right and watch the page follow
  const ed = p.locator('.sh-right .task-editor .ProseMirror').first();
  await ed.click();
  await p.keyboard.press('Control+End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('She has lived here for ten years.', { delay: 20 });
  await wait(900);
  await shot('typed-page-follows');
  await p.keyboard.press('Enter');
  await p.keyboard.type('/gap', { delay: 40 });
  await wait(900);
  await shot('slash');
  await p.keyboard.press('Enter');
  await wait(1200);
  await shot('gap-added');

  // pick a task from the list on the left of the screen
  await p.locator('.task-row').nth(1).click().catch((e) => say('list click', e.message));
  await wait(1500);
  await shot('from-list');

  // drag the divider
  const d = await p.locator('.sh-divider').boundingBox();
  await p.mouse.move(d.x + 5, d.y + 200);
  await p.mouse.down();
  await p.mouse.move(d.x + 200, d.y + 200, { steps: 8 });
  await p.mouse.up();
  await wait(800);
  await shot('wider-page');

  await p.setViewportSize({ width: 1280, height: 800 });
  await wait(800);
  await shot('laptop');
}
