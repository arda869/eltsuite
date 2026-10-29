// What test/preview.mjs does, step by step: moving and deleting tasks in the worksheet view.
export default async function steps({ p, shot, say, demo, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  p.on('pageerror', (e) => say('CRASH', e.message));
  await p.goto(`${BASE}/class/${demo.classId}/lesson/${demo.itemId}`);
  await p.locator('.ProseMirror').first().waitFor({ timeout: 20000 });
  await wait(800);
  await p.getByRole('radio', { name: /Worksheet/ }).click();
  await p.locator('.sh-block').first().waitFor({ timeout: 15000 });
  await wait(2500);
  const order = async () => (await p.locator('.task-row').allInnerTexts()).map((t) => t.split('\n').find((x) => x.trim()) ?? '').join(' | ');
  say('order before', await order());
  const second = p.locator('.sh-block').nth(1);
  await second.hover();
  await wait(400);
  await shot('01-hover');
  // drag the second block above the first
  const g = await second.locator('.sh-grip').boundingBox();
  const first = await p.locator('.sh-block').first().boundingBox();
  await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await p.mouse.down();
  await p.mouse.move(first.x + 100, first.y + 10, { steps: 12 });
  await wait(300);
  await shot('02-dragging');
  await p.mouse.up();
  await wait(2000);
  say('order after drag', await order());
  await shot('03-moved');
  // the keyboard: move the first block down one
  await p.locator('.sh-block').first().locator('.sh-grip').focus();
  await p.keyboard.press('ArrowDown');
  await wait(2000);
  say('order after ArrowDown', await order());
  // delete the third block
  const n0 = await p.locator('.sh-block').count();
  const third = p.locator('.sh-block').nth(2);
  await third.hover();
  await third.locator('.sh-del').click();
  await wait(500);
  await shot('04-ask');
  await p.locator('.ask-dialog button, [role=dialog] button, [role=alertdialog] button').filter({ hasText: /Delete|Remove|Yes/ }).first().click();
  await wait(2000);
  say('blocks', n0, '->', await p.locator('.sh-block').count());
  say('order after delete', await order());
  await shot('05-deleted');
}
