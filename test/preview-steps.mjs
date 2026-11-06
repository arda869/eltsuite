// The simpler public homepage: the full-screen hero, what a screen does on hover, and the
// "How it works" tabs, on desktop and phone.
export default async function steps({ ctx, shot, say, BASE }) {
  const guest = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
  const g = await guest.newPage();
  g.on('pageerror', (e) => say('CRASH', e.message));
  await g.goto(BASE + '/'); await g.waitForTimeout(3000);
  await shot('hero', g);
  await g.locator('.pub-pop-coach').hover(); await g.waitForTimeout(900);
  await shot('hero-hover', g);
  await g.locator('.pub-cycle').getByRole('link', { name: 'Teach' }).click(); await g.waitForTimeout(1500);
  await shot('how-teach', g);
  await g.getByRole('button', { name: 'See answers arrive live' }).click(); await g.waitForTimeout(4000);
  await g.locator('#how').screenshot({ path: 'preview-out/04-how-teach-live.png' });
  await g.getByRole('tab', { name: /See results/ }).click(); await g.waitForTimeout(1200);
  await shot('how-results', g);
  await g.setViewportSize({ width: 390, height: 844 });
  await g.goto(BASE + '/'); await g.waitForTimeout(2500);
  say('phone overflow', await g.evaluate(() => document.documentElement.scrollWidth - innerWidth));
  await shot('phone-hero', g);
  await g.screenshot({ path: 'preview-out/20-phone-full.png', fullPage: true });
  await g.setViewportSize({ width: 1440, height: 900 });
  await g.goto(BASE + '/'); await g.waitForTimeout(2500);
  for (let y = 0; y < 6000; y += 600) { await g.evaluate((y) => scrollTo(0, y), y); await g.waitForTimeout(80); }
  await g.screenshot({ path: 'preview-out/21-desktop-full.png', fullPage: true });
  await guest.close();
}
