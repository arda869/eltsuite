// What test/preview.mjs does, step by step: a storyboard made in Files, then put into a lesson.
export default async function steps({ p, ctx, shot, say, demo, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  p.on('pageerror', (e) => say('CRASH', e.message));
  // 1. a storyboard with two scenes
  await p.goto(`${BASE}/archive`);
  await p.locator('text=+ New').first().waitFor({ timeout: 20000 });
  await p.click('text=+ New');
  await wait(400);
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.click('[role=menuitem]:has-text("Storyboard")')]);
  await tab.waitForLoadState();
  tab.on('pageerror', (e) => say('CRASH tab', e.message));
  await tab.setViewportSize({ width: 1440, height: 900 });
  await tab.locator('.sbf').waitFor({ timeout: 15000 });
  await tab.waitForTimeout(1200);
  await tab.locator('.sbf-li').nth(1).click(); // Maya waving
  await tab.waitForTimeout(400);
  await tab.getByRole('tab', { name: 'Bubbles' }).click();
  await tab.locator('.sbf-li').first().click();
  await tab.waitForTimeout(500);
  await tab.locator('.sbf-stagebox .sb-item.on .sb-text').click();
  await tab.keyboard.press('Control+A');
  await tab.keyboard.type('Hi! I’m Maya.');
  await tab.locator('.sbf-caption').click();
  await tab.keyboard.type('Maya arrives at the party.');
  await tab.locator('.sbf-main').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await tab.click('text=+ Scene');
  await tab.waitForTimeout(1000);
  await tab.getByRole('tab', { name: 'People' }).click();
  await tab.locator('.sbf-who button').nth(1).click();
  await tab.locator('.sbf-li').nth(7).click(); // Leo talking
  await tab.waitForTimeout(400);
  await tab.locator('.sbf-caption').click();
  await tab.keyboard.type('Leo says hello.');
  await tab.locator('.sbf-scenes').click({ position: { x: 5, y: 600 } }).catch(() => {});
  await tab.waitForTimeout(800);
  await tab.close();

  // 2. into a lesson
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.locator('.ProseMirror').first().waitFor({ timeout: 20000 });
  await wait(800);
  const dig = p.getByRole('radio', { name: /Digital/ });
  if (await dig.count()) await dig.click();
  await p.locator('.task-row').nth(4).click();
  await wait(1500);
  const ed = p.locator('.frame-body .task-editor .ProseMirror').first();
  await ed.click();
  await p.keyboard.press('Control+End');
  await p.keyboard.press('Enter');
  await p.keyboard.type('/storyboard', { delay: 40 });
  await wait(900);
  await p.keyboard.press('Enter');
  await wait(1200);
  await shot('chooser');
  await p.locator('.sbn-item').first().click();
  await wait(2500);
  say('scenes in the lesson', await p.locator('.sbn .sbw-s').count());
  await p.locator('.sbn').scrollIntoViewIfNeeded();
  await shot('in-lesson-editor');

  // 3. what learners see
  await p.getByRole('button', { name: /Editing/ }).first().click();
  await wait(400);
  await p.getByRole('menuitemradio', { name: /Learner view/ }).click().catch((e) => say('learner view', e.message));
  await wait(1500);
  await p.locator('.sbn-read').scrollIntoViewIfNeeded().catch(() => {});
  await shot('learner-view');
  say('scenes for learners', await p.locator('.sbn-read .sbw-s').count());

  // 4. on paper
  await p.getByRole('button', { name: /Learner view/ }).first().click().catch(() => {});
  await wait(300);
  await p.getByRole('menuitemradio', { name: /Editing/ }).click().catch((e) => say('editing', e.message));
  await wait(1000);
  await p.getByRole('radio', { name: /Worksheet/ }).click();
  await p.locator('.sh-split').waitFor({ timeout: 10000 });
  await wait(3000);
  await shot('worksheet');
}
