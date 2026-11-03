// The public homepage, desktop and phone, top and whole page.
export default async function steps({ ctx, shot, say, BASE }) {
  const guest = await ctx.browser().newContext({ viewport: { width: 1440, height: 900 } });
  const g = await guest.newPage();
  g.on('pageerror', (e) => say('CRASH', e.message));
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    await g.setViewportSize({ width: w, height: h });
    await g.goto(BASE + '/'); await g.waitForTimeout(3000);
    say(tag, 'overflow', await g.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await shot('home-' + tag, g);
    await g.evaluate(() => document.querySelector('.pub-speaks')?.scrollIntoView()); await g.waitForTimeout(800);
    await shot('speaks-' + tag, g);
  }
  await guest.close();
}
