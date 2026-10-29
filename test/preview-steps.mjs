// What test/preview.mjs does, step by step: a teacher makes a storyboard.
export default async function steps({ p, ctx, shot, say, BASE }) {
  const wait = (ms) => p.waitForTimeout(ms);
  await p.goto(`${BASE}/archive`);
  await p.locator('text=+ New').first().waitFor({ timeout: 20000 });
  await p.click('text=+ New');
  await wait(400);
  const [tab] = await Promise.all([ctx.waitForEvent('page'), p.click('[role=menuitem]:has-text("Storyboard")')]);
  await tab.waitForLoadState();
  tab.on('pageerror', (e) => say('CRASH', e.message));
  await tab.setViewportSize({ width: 1440, height: 900 });
  await tab.locator('.sbf').waitFor({ timeout: 15000 });
  await tab.waitForTimeout(1500);
  const s = async (name) => {
    await tab.screenshot({ path: `preview-out/${name}.png` });
    say('shot', name);
  };
  await s('01-empty');
  // two people, a table and a speech bubble
  await tab.locator('.sbf-li').nth(1).click(); // Maya waving
  await tab.waitForTimeout(500);
  await tab.locator('.sbf-who button').nth(1).click(); // Leo
  await tab.locator('.sbf-li').nth(7).click(); // Leo talking
  await tab.waitForTimeout(500);
  await tab.getByRole('tab', { name: 'Things' }).click();
  await tab.locator('.sbf-li').first().click(); // table
  await tab.waitForTimeout(500);
  await tab.getByRole('tab', { name: 'Bubbles' }).click();
  await tab.locator('.sbf-li').first().click(); // speech
  await tab.waitForTimeout(800);
  await s('02-added');
  // type in the bubble
  const t = tab.locator('.sbf-stagebox .sb-item.on .sb-text');
  await t.click();
  await tab.keyboard.press('Control+A');
  await tab.keyboard.type('Have you ever been to Lisbon?');
  await tab.locator('.sbf-caption').click();
  await tab.waitForTimeout(600);
  // drag the bubble
  const b = await tab.locator('.sbf-stagebox .sb-item.t-bubble').first().boundingBox();
  await tab.mouse.move(b.x + 6, b.y + b.height - 8);
  await tab.mouse.down();
  await tab.mouse.move(b.x + 260, b.y + 30, { steps: 8 });
  await tab.mouse.up();
  await tab.waitForTimeout(800);
  // select Leo and turn him
  const leo = tab.locator('.sbf-stagebox .sb-item.t-person').nth(1);
  const lb = await leo.boundingBox();
  await tab.mouse.click(lb.x + lb.width / 2, lb.y + lb.height * 0.6);
  await tab.waitForTimeout(400);
  say('selected', await tab.locator('.sb-item.on').count(), 'toolbar:', (await tab.locator('.sbf-bar').innerText()).replace(/\s+/g, ' ').slice(0, 160));
  await tab.locator('.sbf-bar button:has-text("Flip")').click();
  await tab.locator('.sbf-bar select').nth(2).selectOption('surprised');
  await tab.waitForTimeout(800);
  await s('03-edited');
  // a second scene
  await tab.click('text=+ Scene');
  await tab.waitForTimeout(1200);
  await s('04-second-scene');
  // back to scene 1 and reload: is everything saved?
  await tab.locator('.sbf-thumb > button').first().click();
  await tab.reload();
  await tab.locator('.sbf').waitFor({ timeout: 15000 });
  await tab.waitForTimeout(1500);
  await s('05-after-reload');
  say('items after reload', await tab.locator('.sbf-stagebox .sb-item').count());
}
