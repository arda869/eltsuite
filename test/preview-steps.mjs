// The polished homepage: close-ups with soft edges, the enlarged picture and the invitation form's
// dropdown, on desktop and phone.
export default async function steps({ ctx, shot, say, BASE }) {
  const guest = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
  const g = await guest.newPage();
  g.on('pageerror', (e) => say('CRASH', e.message));
  await g.goto(BASE + '/'); await g.waitForTimeout(3000);
  await shot('hero', g);
  for (let y = 0; y < 9000; y += 600) { await g.evaluate((y) => scrollTo(0, y), y); await g.waitForTimeout(80); }
  for (const sel of ['.pub-all', '#plan', '#understand', '#audio', '.pub-care']) {
    await g.locator(sel).first().scrollIntoViewIfNeeded(); await g.waitForTimeout(900);
    await g.locator(sel).first().screenshot({ path: `preview-out/${sel.replace(/\W/g, '')}.png` });
  }
  await g.locator('#plan .pub-frame').first().click(); await g.waitForTimeout(800);
  await shot('lightbox', g);
  await g.keyboard.press('Escape'); await g.waitForTimeout(400);
  await g.locator('#audio .pub-frame-crop').first().click(); await g.waitForTimeout(800);
  await shot('lightbox-closeup', g);
  await g.getByRole('button', { name: 'Close' }).click();
  await g.locator('#invite').scrollIntoViewIfNeeded();
  await g.getByRole('button', { name: /Who you teach/ }).click(); await g.waitForTimeout(500);
  await shot('invite-dropdown', g);
  await g.setViewportSize({ width: 390, height: 844 });
  await g.goto(BASE + '/'); await g.waitForTimeout(2500);
  say('phone overflow', await g.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await g.screenshot({ path: 'preview-out/30-phone-full.png', fullPage: true });
  await guest.close();
}
